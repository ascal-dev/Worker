/**
 * Mastiraja.com Scraper
 * Fetches categories and posts, extracts video IDs, and syncs to Supabase.
 * Advanced logging and one-by-one sync procedure included.
 */

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const SUPABASE_URL = 'https://jdrheygmqtnohloykrxs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcmhleWdtcXRub2hsb3lrcnhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU3OTk5OSwiZXhwIjoyMDg0MTU1OTk5fQ.PYO5Dl0Of8tiOBm7cbrqGUMklXh9jAj7OMridBdN8K8';
// Environment Variables
//const SUPABASE_URL = process.env.SUPABASE_URL;
//const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ Missing Supabase credentials!");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BASE_URL = 'https://mastiraja.com/wp-json/wp/v2';

/**
 * Log sync activity to Supabase
 */
async function logSync(source, status, message, count = 0) {
    console.log(`[${status.toUpperCase()}] ${source}: ${message} (${count} items)`);
    try {
        await supabase.from('sync_logs').insert([{
            source,
            status,
            message,
            items_synced: count
        }]);
    } catch (e) {
        console.error("Failed to log to Supabase:", e.message);
    }
}

/**
 * Standard Fetch
 */
async function fetchStandard(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

/**
 * Extract Video ID from post content
 */
function extractVideoId(content) {
    const patterns = [
        /dood(?:stream)?\.(?:com|so|la|ws|to|watch|cx|pm|sh|wf)\/(?:e|d)\/([a-z0-9]+)/i,
        /dooood\.(?:com|co)\/(?:e|d)\/([a-z0-9]+)/i,
        /ds2play\.com\/(?:e|d)\/([a-z0-9]+)/i,
        /voe\.(?:sx|to)\/(?:e|d)\/([a-z0-9]+)/i,
        /streamtape\.(?:com|to)\/(?:e|v)\/([a-z0-9]+)/i,
        /mixdrop\.(?:co|to|ag|sx|bz)\/(?:e|f)\/([a-z0-9]+)/i,
        /upstream\.to\/(?:embed-)?([a-z0-9]+)/i,
        /vidhide(?:pro)?\.com\/(?:e|v)\/([a-z0-9]+)/i,
        /filemoon\.(?:sx|to)\/(?:e|d)\/([a-z0-9]+)/i,
        /streamwish\.(?:to|com)\/(?:e|d)\/([a-z0-9]+)/i,
        /iframe[^>]+src=["']([^"']+)["']/i
    ];

    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) return { id: match[1], full: match[0] };
    }
    return null;
}

/**
 * Sync Categories
 */
async function syncCategories() {
    try {
        console.log("📂 Fetching Mastiraja Categories...");
        const categories = await fetchStandard(`${BASE_URL}/categories?per_page=50`);
        
        const catData = categories.map(c => ({
            id: c.id,
            name: c.name,
            slug: c.slug
        }));

        const { error } = await supabase.from('mastiraja_categories').upsert(catData, { onConflict: 'slug' });
        if (error) {
            await logSync('MASTIRAJA', 'error', `Category sync failed: ${error.message}`);
            return [];
        } else {
            await logSync('MASTIRAJA', 'success', `Synced ${catData.length} categories`, catData.length);
            return catData;
        }
    } catch (e) {
        await logSync('MASTIRAJA', 'error', `Category fetch failed: ${e.message}`);
        return [];
    }
}

/**
 * Sync Posts for a category
 *
 * Safe for re-scraping:
 *  - Before looping pages we load all existing titles for this category
 *  - Each page we only insert rows whose cleaned title is NOT already in DB
 *  - We still keep the "page > 1" early‑stop check as an extra safety net
 */
async function syncPosts(catId, catName, maxPages = 40) {
    let totalSynced = 0;

    // Preload existing titles for this category so re-scraping doesn't reinsert
    const existingTitles = new Set();
    try {
        const { data: existingRows, error: existingErr } = await supabase
            .from('mastiraja_videos')
            .select('title')
            .eq('category_id', catId);
        if (!existingErr && Array.isArray(existingRows)) {
            existingRows.forEach(r => {
                if (r.title) existingTitles.add(r.title);
            });
        }
    } catch (e) {
        console.error(`  ⚠️ Failed to preload existing Mastiraja titles for cat ${catId}:`, e.message);
    }

    for (let page = 1; page <= maxPages; page++) {
        console.log(`  📄 Fetching ${catName} - Page ${page}...`);
        try {
            const posts = await fetchStandard(`${BASE_URL}/posts?categories=${catId}&per_page=100&page=${page}&_embed`);
            
            if (!posts || posts.length === 0) {
                console.log(`    ℹ️ No more posts found for ${catName}.`);
                break;
            }

            // DUPLICATE CHECK (For Page 2+): keep existing early‑stop optimisation
            if (page > 1) {
                const firstPost = posts[0];
                const cleanTitle = (firstPost.title?.rendered || "Untitled")
                    .replace(/&#8211;/g, '-')
                    .replace(/&amp;/g, '&')
                    .replace(/&#8217;/g, "'")
                    .replace(/&#\d+;/g, '')
                    .trim();

                const { data: existing } = await supabase
                    .from('mastiraja_videos')
                    .select('id')
                    .eq('title', cleanTitle)
                    .eq('category_id', catId)
                    .single();

                if (existing) {
                    console.log(`    ⏭️ Duplicate detected on p${page} ("${cleanTitle}"). Stopping category.`);
                    break;
                }
            }

            const videoData = posts.map(p => {
                const content = p.content?.rendered || "";
                const extracted = extractVideoId(content);
                let img = p._embedded?.['wp:featuredmedia']?.[0]?.source_url || 
                          p.yoast_head_json?.og_image?.[0]?.url || "";
                
                const dateObj = new Date(p.date);
                const post_date = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                const post_time = dateObj.toTimeString().split(' ')[0];

                const cleanTitle = (p.title?.rendered || "Untitled")
                    .replace(/&#8211;/g, '-')
                    .replace(/&amp;/g, '&')
                    .replace(/&#8217;/g, "'")
                    .replace(/&#\d+;/g, '')
                    .trim();

                // Skip if already in DB (safe re-scrape)
                if (existingTitles.has(cleanTitle)) {
                    return null;
                }

                // Mark as seen so later pages won't re-add the same title
                existingTitles.add(cleanTitle);

                return {
                    category_id: catId,
                    title: cleanTitle,
                    img: img,
                    video_id: extracted?.id || null,
                    stream_url: extracted?.full || null,
                    post_date,
                    post_time
                };
            }).filter(Boolean); // Remove nulls for already-existing rows

            const { error } = await supabase.from('mastiraja_videos').upsert(videoData, { onConflict: 'title,category_id' });
            if (error) {
                console.error(`  ❌ Batch failed, retrying one by one...`);
                let newSyncedCount = 0;
                for (const v of videoData) {
                    const { error: singleErr } = await supabase.from('mastiraja_videos').upsert(v, { onConflict: 'title,category_id' });
                    if (!singleErr) newSyncedCount++;
                    else console.error(`  ❌ Failed: ${v.title} - ${singleErr.message}`);
                }
                totalSynced += newSyncedCount;
            } else {
                totalSynced += videoData.length;
            }

            if (posts.length < 100) break;
            await new Promise(r => setTimeout(r, 1000));

        } catch (e) {
            if (e.message.includes('400')) break;
            console.error(`  ❌ Fetch error on p${page}:`, e.message);
            break;
        }
    }
    
    return totalSynced;
}

async function main() {
    console.log("═══════════════════════════════════════");
    console.log("    Mastiraja.com Scraper Starting");
    console.log("═══════════════════════════════════════");
    
    try {
        const categories = await syncCategories();
        
        for (const cat of categories) {
            const count = await syncPosts(cat.id, cat.name);
            await logSync('MASTIRAJA', 'success', `Synced videos for category: ${cat.name}`, count);
            await new Promise(r => setTimeout(r, 2000));
        }
        
    } catch (e) {
        await logSync('MASTIRAJA', 'error', `Fatal error: ${e.message}`);
    }
}

main();
