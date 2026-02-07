/**
 * Mydesi.click Scraper
 * Fetches categories and posts, extracts video IDs, and syncs to Supabase.
 * Advanced logging and one-by-one sync procedure included.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Environment Variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Try to load cookie from file first, then fall back to env variable
const COOKIE_FILE = path.join(__dirname, 'cf_cookie.txt');
let CF_COOKIE = process.env.CF_COOKIE || process.env.MYDESI_CF_COOKIE || '';

if (fs.existsSync(COOKIE_FILE)) {
    CF_COOKIE = fs.readFileSync(COOKIE_FILE, 'utf-8').trim();
    console.log('📄 Loaded cf_clearance cookie from cf_cookie.txt');
}

if (!CF_COOKIE) {
    console.warn("⚠️ No Cloudflare cookie found! Script may fail if CF challenge is active.");
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing Supabase credentials!");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
 * Fetch with Cloudflare bypass headers
 */
async function fetchCF(url) {
    const res = await fetch(url, {
        headers: {
            'Cookie': CF_COOKIE,
            'User-Agent': USER_AGENT,
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://mydesi.click/'
        }
    });
    if (!res.ok) {
        const text = await res.text();
        if (text.includes('Just a moment')) {
            throw new Error('Cloudflare Blocked: Session expired or invalid clearance.');
        }
        throw new Error(`HTTP ${res.status}: ${text.substring(0, 100)}`);
    }
    return res.json();
}

/**
 * Extract Video ID
 */
function extractVideoId(content) {
    const patterns = [
        /dood(?:stream)?\.(?:com|so|la|ws|to|watch|cx|pm|sh|wf)\/(?:e|d)\/([a-z0-9]+)/i,
        /voe\.(?:sx|to)\/(?:e|d)\/([a-z0-9]+)/i,
        /streamtape\.com\/e\/([a-z0-9]+)/i,
        /upstream\.to\/([a-z0-9]+)/i,
        /mixdrop\.(?:co|to|ag)\/e\/([a-z0-9]+)/i
    ];

    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) return match[1];
    }
    return null;
}

/**
 * Sync Categories
 */
async function syncCategories() {
    try {
        console.log("Fetching Categories...");
        const categories = await fetchCF('https://mydesi.click/wp-json/wp/v2/categories?per_page=50');
        
        const catData = categories.map(c => ({
            id: c.id,
            name: c.name,
            slug: c.slug
        }));

        const { error } = await supabase.from('mydesi_categories').upsert(catData, { onConflict: 'slug' });
        if (error) {
            await logSync('MYDESI', 'error', `Category sync failed: ${error.message}`);
            return [];
        } else {
            await logSync('MYDESI', 'success', `Synced ${catData.length} categories`, catData.length);
            return catData;
        }
    } catch (e) {
        await logSync('MYDESI', 'error', `Category fetch failed: ${e.message}`);
        return [];
    }
}

/**
 * Sync Posts
 */
async function syncPosts(catId, catName, page = 1) {
    let totalSynced = 0;
    try {
        console.log(`Fetching ${catName} (Page ${page})...`);
        const posts = await fetchCF(`https://mydesi.click/wp-json/wp/v2/posts?categories=${catId}&per_page=100&page=${page}`);
        
        if (posts.length === 0) return 0;

        const videoData = posts.map(p => {
            const content = p.content?.rendered || "";
            const videoId = extractVideoId(content);
            let img = p.yoast_head_json?.og_image?.[0]?.url || "";
            
            const dateObj = new Date(p.date);
            const post_date = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const post_time = dateObj.toTimeString().split(' ')[0];

            return {
                category_id: catId,
                title: (p.title?.rendered || "Untitled").replace(/&#8211;/g, '-').replace(/&amp;/g, '&'),
                img: img,
                video_id: videoId,
                stream_url: videoId ? `https://doodstream.com/e/${videoId}` : null,
                post_date,
                post_time
            };
        });

        const { error } = await supabase.from('mydesi_videos').upsert(videoData, { onConflict: 'title,category_id' });
        if (error) {
            console.error(`  ❌ Batch failed, retrying one by one...`);
            for (const v of videoData) {
                const { error: singleErr } = await supabase.from('mydesi_videos').upsert(v, { onConflict: 'title,category_id' });
                if (!singleErr) totalSynced++;
            }
        } else {
            totalSynced += videoData.length;
        }
    } catch (e) {
        console.error(`  ❌ Fetch error for ${catName}:`, e.message);
    }
    return totalSynced;
}

async function main() {
    console.log("═══════════════════════════════════════");
    console.log("    Mydesi.click Sync Starting");
    console.log("═══════════════════════════════════════");
    
    try {
        const categories = await syncCategories();
        for (const cat of categories) {
            const count = await syncPosts(cat.id, cat.name, 1);
            await logSync('MYDESI', 'success', `Synced videos for category: ${cat.name}`, count);
        }
    } catch (e) {
        await logSync('MYDESI', 'error', `Fatal error: ${e.message}`);
    }
}

main();
