const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// Environment Variables (Inject from GitHub Secrets)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY; // Service Role Key

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
 * Standardize RSS Parsing for Desi Tales / ISS3
 */
/**
 * KPM URL Generator with Ultra-Advanced Title Case Normalization
 * Handles: small words, special chars, Roman numerals, colons, apostrophes, HTML entities
 */
function kpmUrl(t) {
    if (!t) return '';
    
    // STEP 1: Decode ALL common HTML/WP entities
    t = t.replace(/&#8211;/g, '-')      // en dash
         .replace(/&#8212;/g, '-')      // em dash
         .replace(/&#8217;/g, "'")      // right single quote
         .replace(/&#8216;/g, "'")      // left single quote
         .replace(/&#8220;/g, '"')      // left double quote
         .replace(/&#8221;/g, '"')      // right double quote
         .replace(/&amp;/g, '&')
         .replace(/&quot;/g, '"')
         .replace(/&apos;/g, "'")
         .replace(/&lt;/g, '<')
         .replace(/&gt;/g, '>')
         .replace(/&nbsp;/g, ' ')
         .replace(/&#39;/g, "'")
         .replace(/&#x27;/g, "'");
    
    // STEP 2: Clean up special characters that cause URL issues
    t = t.replace(/[""]/g, '"')         // Smart quotes to regular
         .replace(/['']/g, "'")          // Smart apostrophes to regular
         .replace(/…/g, '...')           // Ellipsis
         .replace(/–/g, '-')             // En dash
         .replace(/—/g, '-')             // Em dash
         .replace(/[:\\/]/g, ' ')        // Colons and slashes to space
         .replace(/[?!]/g, '');          // Remove ? and !
    
    // STEP 3: Small words that should stay lowercase (unless first word or after colon)
    const smallWords = new Set(['to', 'a', 'an', 'the', 'in', 'on', 'at', 'for', 'of', 'and', 'but', 'or', 'by', 'with', 'from', 'as', 'is', 'it', 'vs', 'vs.']);
    
    // Roman numerals that should stay uppercase
    const romanNumerals = /^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XX|XXX)$/;
    
    // STEP 4: Apply proper title case with smart word handling
    t = t.split(/\s+/).map((word, index, arr) => {
        if (!word) return '';
        
        // Preserve parenthetical content like (2025) as-is
        if (word.startsWith('(') && word.endsWith(')')) {
            return word;
        }
        
        // Handle words with parentheses at start like "(2025"
        if (word.startsWith('(')) {
            return word; // Keep as-is
        }
        
        // Keep Roman numerals uppercase
        if (romanNumerals.test(word.toUpperCase())) {
            return word.toUpperCase();
        }
        
        // Keep pure numbers as-is (like 200%, 1080p, etc.)
        if (/^\d/.test(word)) {
            return word;
        }
        
        // Always capitalize first word
        if (index === 0) {
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }
        
        // Check if previous word ended with colon (capitalize after colon)
        const prevWord = arr[index - 1] || '';
        if (prevWord.endsWith(':')) {
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }
        
        // Small words stay lowercase
        if (smallWords.has(word.toLowerCase())) {
            return word.toLowerCase();
        }
        
        // Default: capitalize first letter, lowercase rest
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
    
    // STEP 5: Handle number+symbol spacing (e.g., 200%)
    t = t.replace(/([0-9]+%)(?![ ]|$)/g, '$1 ');
    
    // STEP 6: Handle (Year) spacing
    t = t.replace(/(?<! )(\([0-9]{4}\))/g, ' $1');  // space before
    t = t.replace(/(\([0-9]{4}\))(?![ ]|$)/g, '$1 '); // space after
    
    // STEP 7: Clean up multiple spaces and trim
    t = t.replace(/\s+/g, ' ').trim();
    
    // STEP 8: URL encode (but use %20 for spaces)
    const res = encodeURIComponent(t).replace(/%20/g, '%20');
    
    return `https://koreanporn.stream/${res}.mp4`;
}

/**
 * Standardize RSS Parsing for Desi Tales / ISS3
 */
function parseRSS(xml, source = 'desi') {
    const items = [];
    // Split by <item> to handle cases where </item> might appear inside CDATA (common in DesiTales)
    const itemChunks = xml.split(/<item>/gi).slice(1);

    for (const itemXml of itemChunks) {
        try {
            // Title - Use [\s\S] for multi-line match support
            let title = itemXml.match(/<title>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/title>/i)?.[1] || 
                        itemXml.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "No Title";
            title = title.replace(/<!\[CDATA\[|\]\]>/g, '').trim();

            // Image (Extract from description CDATA)
            const description = itemXml.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "";
            let img = description.match(/src=["']([^"']+)["']/i)?.[1] || "";
            if (!img) {
                 // Try scraping from raw description if CDATA structure differs
                 const rawSrc = description.match(/(http.*?\.jpg)/i);
                 if (rawSrc) img = rawSrc[1];
            }

            // Stream URL (Derived from Image Source as requested)
            // Example Img: https://cdn.desitales2.com/contents/videos_screenshots/24000/24366/preview.jpg
            // Target Video: https://cdn.desitales2.com/24000/24366/24366.mp4 (NO /contents/videos/)
            let stream_url = "";
            if (img && img.includes('videos_screenshots/')) {
                const parts = img.match(/videos_screenshots\/(\d+)\/(\d+)\//);
                if (parts) {
                    const cdnBase = source === 'iss3' ? 'https://cdn2.indiansexstories3.com' : 'https://cdn.desitales2.com';
                    stream_url = `${cdnBase}/${parts[1]}/${parts[2]}/${parts[2]}.mp4`;
                }
            }
            
            // Allow fallback to Link tag if derivation fails
            if (!stream_url) {
                stream_url = itemXml.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "";
            }

            // Date & Time
            const pubDate = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || "";
            let xml_date = "", xml_time = "";
            if (pubDate) {
                // Format: Sat, 10 Jan 2026 16:00:21 +0200
                // Handle non-standard timezones like IST
                const normalizedDate = pubDate.replace(/\bIST\b/g, '+0530');
                const d = new Date(normalizedDate);
                if (!isNaN(d.getTime())) {
                    const day = String(d.getDate()).padStart(2, '0');
                    const month = d.toLocaleString('default', { month: 'short' });
                    const year = d.getFullYear();
                    xml_date = `${day} ${month} ${year}`;
                    xml_time = d.toTimeString().split(' ')[0]; // HH:MM:SS
                }
            }

            // Categories & Tags
            const categories = [];
            // Method 1: CDATA match (Multiline compatible)
            const cdataCats = [...itemXml.matchAll(/<category>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/category>/gi)].map(m => m[1]);
            categories.push(...cdataCats);
            
            // Method 2: Standard match (if CDATA fails)
            if (categories.length === 0) {
                 const simpleCats = [...itemXml.matchAll(/<category>([\s\S]*?)<\/category>/gi)].map(m => m[1]);
                 const cleanCats = simpleCats.map(c => c.replace(/<!\[CDATA\[|\]\]>/g, '').trim());
                 categories.push(...cleanCats);
            }

            const uniqueCats = [...new Set(categories.filter(c => c))];

            items.push({
                title,
                img,
                stream_url,
                xml_date,
                xml_time,
                categories: uniqueCats, 
                tags: []
            });
        } catch (e) {
            console.error("Error parsing item:", e.message);
        }
    }
    return items;
}

/**
 * Sync 4-Table Architecture (Desi Tales / ISS3)
 * tableType: 'categories' or 'tags' - determines which tables to write to
 */
async function syncMultiTable(sourcePrefix, rssUrl, defaultCategory = null, tableType = 'categories') {
    try {
        // Retry logic for transient errors
        let xml = null;
        let lastError = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const res = await fetch(rssUrl);
                if (res.ok) {
                    xml = await res.text();
                    break;
                } else if (res.status >= 500 && res.status < 600) {
                    // Server error - retry
                    lastError = `HTTP ${res.status}`;
                    console.log(`[Retry ${attempt}/3] ${rssUrl} - ${lastError}`);
                    await new Promise(r => setTimeout(r, 1000 * attempt)); // Exponential backoff
                } else {
                    throw new Error(`HTTP ${res.status}`);
                }
            } catch (fetchErr) {
                lastError = fetchErr.message;
                console.log(`[Retry ${attempt}/3] ${rssUrl} - ${lastError}`);
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
        
        if (!xml) throw new Error(lastError || "Failed after 3 retries");
        
        const videos = parseRSS(xml, sourcePrefix);
        
        if (videos.length === 0) throw new Error("No videos found");

        // Table names based on tableType
        const metaTable = `${sourcePrefix}_${tableType}`;           // desi_categories or desi_tags
        const singularType = tableType === 'categories' ? 'category' : 'tag';
        const videosTable = `${sourcePrefix}_${singularType}_videos`; // desi_category_videos or desi_tag_videos

        // STEP 1: Collect all unique categories/tags
        const allCats = new Set();
        if (defaultCategory) allCats.add(defaultCategory);
        for (const v of videos) {
            v.categories.forEach(c => allCats.add(c));
        }

        // STEP 2: Batch upsert all categories/tags at once
        const catArray = [...allCats].map(name => ({
            name,
            slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        }));
        
        let catMap = {}; // slug -> id
        if (catArray.length > 0) {
            const { data: catData, error: catError } = await supabase
                .from(metaTable)
                .upsert(catArray, { onConflict: 'slug' })
                .select();
            
            if (catError) {
                console.error(`[DB Error] ${metaTable} batch:`, catError.message);
            } else if (catData) {
                catData.forEach(c => catMap[c.slug] = c.id);
            }
        }

        // STEP 3: Prepare video batch
        const videoBatch = [];
        const idField = tableType === 'tags' ? 'tag_id' : 'category_id';
        
        for (const video of videos) {
            const catsSet = new Set(video.categories);
            if (defaultCategory) catsSet.add(defaultCategory);
            const catsToUse = [...catsSet];

            if (catsToUse.length === 0) {
                // Store with null category/tag
                videoBatch.push({
                    [idField]: null,
                    title: video.title,
                    img: video.img,
                    stream_url: video.stream_url,
                    xml_date: video.xml_date,
                    xml_time: video.xml_time
                });
            } else {
                for (const catName of catsToUse) {
                    const slug = catName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                    const catId = catMap[slug];
                    if (catId) {
                        videoBatch.push({
                            [idField]: catId,
                            title: video.title,
                            img: video.img,
                            stream_url: video.stream_url,
                            xml_date: video.xml_date,
                            xml_time: video.xml_time
                        });
                    }
                }
            }
        }

        // STEP 4: Batch upsert all videos at once
        const conflictField = tableType === 'tags' ? 'title,tag_id' : 'title,category_id';
        if (videoBatch.length > 0) {
            const { error } = await supabase
                .from(videosTable)
                .upsert(videoBatch, { onConflict: conflictField });
            
            if (error) {
                console.error(`[DB Error] ${videosTable} batch:`, error.message);
                await logSync(sourcePrefix.toUpperCase(), 'error', error.message);
            } else {
                await logSync(sourcePrefix.toUpperCase(), 'success', `Synced ${tableType} feed`, videoBatch.length);
            }
        }
    } catch (e) {
        await logSync(sourcePrefix.toUpperCase(), 'error', e.message);
    }
}

/**
 * Helper to build MaalCDN URLs for Zmaal/XMazaa
 */
function buildMaalUrl(p, defaultSource = 'Zmaal') {
    let category = defaultSource;
    if (p.class_list && Array.isArray(p.class_list)) {
        const catClass = p.class_list.find(c => c.startsWith('category-') && c !== 'category-uncategorized');
        if (catClass) {
            category = catClass.replace('category-', '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
    }
    const title = (p.title?.rendered || '').replace(/&#8211;/g, '-').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#8217;/g, "'");
    let series = title.replace(/\s*(Episode|Ep\.?)\s*\d+.*/i, '').trim();
    series = series.replace(/\s*\(\d{4}\)\s*/g, '').trim();
    const fullTitle = title.replace(/\s+/g, ' ').trim();
    const categoryPath = category.trim().replace(/\s/g, '%20');
    const seriesPath = series.trim().replace(/\s/g, '%20');
    const titlePath = fullTitle.trim().replace(/\s/g, '%20');
    return `https://video.maalcdn.com/${categoryPath}/${seriesPath}/${titlePath}.mp4`;
}

/**
 * Sync Simplified Tables (Zmaal, XMazaa, KPM)
 */
async function syncSimplified(table, url, type = 'wp', sourceName = 'Zmaal') {
    try {
        const fetchUrl = url.includes('_embed') ? url : (url.includes('?') ? `${url}&_embed` : `${url}?_embed`);
        const res = await fetch(fetchUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        
        const videos = data.map(p => {
            if (type === 'wp') {
                let stream_url = p.link || "";
                if (table === 'zmaal' || table === 'xmazza') {
                    stream_url = buildMaalUrl(p, sourceName);
                } else if (table === 'koreanpornmovie') {
                    // Use User's KPM Logic based on Title
                    stream_url = kpmUrl(p.title?.rendered || "");
                }
                
                // KPM Image Logic: Use source_url directly if available (from /media endpoint)
                // Zmaal/XMazaa Image Logic: Use _embedded featuredMedia
                let img = "";
                if (table === 'koreanpornmovie') {
                     // Check direct source_url first (specific to KPM /media endpoint)
                     img = p.source_url || p.guid?.rendered || "";
                     // If empty and _embedded exists (fallback if endpoint changes)
                     if (!img) img = p.yoast_head_json?.og_image?.[0]?.url || p._embedded?.['wp:featuredmedia']?.[0]?.source_url || "";
                } else {
                     img = p.yoast_head_json?.og_image?.[0]?.url || p._embedded?.['wp:featuredmedia']?.[0]?.source_url || "";
                }

                return {
                    title: p.title?.rendered || "Untitled",
                    img: img,
                    stream_url: stream_url
                };
            }
            return p;
        });

        // DEDUPLICATE: Remove items with duplicate titles in this batch
        const uniqueVideos = [];
        const seenTitles = new Set();
        for (const v of videos) {
            if (!seenTitles.has(v.title)) {
                seenTitles.add(v.title);
                uniqueVideos.push(v);
            }
        }

        const { error } = await supabase.from(table).upsert(uniqueVideos, { onConflict: 'title' });
        if (error) {
            // If batch fails, try one by one to save the good ones
             console.error(`[Batch Error] ${table}: ${error.message}. Retrying individually...`);
             for (const v of uniqueVideos) {
                 const { error: singleErr } = await supabase.from(table).upsert(v, { onConflict: 'title' });
                 if (singleErr) console.error(`[Item Error] ${v.title}:`, singleErr.message);
             }
        } else {
             await logSync(table, 'success', 'Synced API data', uniqueVideos.length);
        }

    } catch (e) {
        await logSync(table, 'error', e.message);
    }
}

/**
 * Main Sync Loop
 */
async function main() {
    console.log("=== Nova TV 24/7 Global Sync Starting ===");
    
    // 1. Desi Tales (4-Table) - Deep Sync
    console.log("Fetching Desi Tales Categories & Tags...");
    const dtCats = await fetch('https://www.desitales2.com/wp-json/wp/v2/video_category?per_page=100').then(r => r.json()).catch(() => []);
    const dtTags = await fetch('https://www.desitales2.com/wp-json/wp/v2/video_tag?per_page=100').then(r => r.json()).catch(() => []);
    
    console.log(`Starting Desi Tales Deep Sync (${dtCats.length} cats, ${dtTags.length} tags)...`);
    await syncMultiTable('desi', 'https://www.desitales2.com/videos/rss/', null, 'categories'); // Latest

    for (const c of dtCats) {
        await syncMultiTable('desi', `https://www.desitales2.com/videos/rss/categories/${c.slug}/`, c.name, 'categories');
    }
    for (const t of dtTags) {
        await syncMultiTable('desi', `https://www.desitales2.com/videos/rss/tags/${t.slug}/`, t.name, 'tags');
    }

    // 2. ISS3 (4-Table) - Sync Specific Categories & Tags (User Provided)
    const iss3Tags = [
        "indian-nude-mms", "big-cock-videos", "desi-gaand-videos", "bhabhi-xxx-videos", 
        "village-xxx-videos", "cheating-bhabhi-videos", "indian-fucking-videos", "hairy-pussy-videos", 
        "indian-wife-porn", "hot-indian-videos", "saree-porn-videos", "indian-chudai-videos", 
        "desi-x-clips", "desi-lund-videos", "hot-xxx-videos", "indian-blowjob-videos", "sexy-girls-video", 
        "indian-randi-videos", "indian-xvideos", "indian-sexy-xxx", "indian-blue-films", "kamababa", 
        "indian-pussy-videos", "indian-housewife-porn", "sexy-desi-videos", "desi-mms-videos", 
        "hardcore-porn", "indian-milf-videos", "nude-desi-girls", "desivdo", "indian-xxx-porn", 
        "indian-chut", "indian-aunty-bf", "indian-bbw-porn", "indian-family-sex-video", 
        "indian-boobs-videos", "desi-scandal-videos", "big-ass", "south-indian-porn", 
        "indian-boobs-pressing", "indian-leaked-sex", "indian-sucking-videos", "fsiblog", 
        "xxx-reels", "muslim-sex-video", "xxx-mms-videos", "desi-porn-videos", 
        "college-girls-porn", "desibaba", "desi-xxx-videos"
    ];
    const iss3Cats = [
        "indian-hd-porn", "lesbian-porn-videos", "big-boobs", "pakistani-sex-videos", 
        "oriya-sex-videos", "marathi-sex-videos", "desi-aunty", "punjabi-sex-videos", 
        "nepali-sex-videos", "indian-xxx-mms", "hindi-sex-videos", "tamil-sex-videos", 
        "kannada-sex-videos", "viral-sex-videos", "desi-x-videos", "desi-bhabhi-videos", 
        "naked-indian-girls", "bengali-sex-videos", "assamese-sex-video", "hot-sex-videos"
    ];

    console.log(`Starting ISS3 Deep Sync (${iss3Cats.length} cats, ${iss3Tags.length} tags)...`);
    
    // Sync General Feed
    await syncMultiTable('iss3', 'https://www.indiansexstories3.com/videos/rss/', null, 'categories');
    
    // Sync Categories
    for (const slug of iss3Cats) {
        await syncMultiTable('iss3', `https://www.indiansexstories3.com/videos/rss/categories/${slug}/`, slug.replace(/-/g, ' '), 'categories');
    }
    
    // Sync Tags
    for (const slug of iss3Tags) {
        await syncMultiTable('iss3', `https://www.indiansexstories3.com/videos/rss/tags/${slug}/`, slug.replace(/-/g, ' '), 'tags');
    }
    
    // 3. Zmaal (10 Pages)
    console.log("Syncing Zmaal: 2 Pages...");
    for (let i = 1; i <= 2; i++) {
        await syncSimplified('zmaal', `https://zmaal.net/wp-json/wp/v2/posts?per_page=100&page=${i}`, 'wp', 'Zmaal');
    }
    
    // 4. XMazaa (10 Pages)
    console.log("Syncing XMazaa: 2 Pages...");
    for (let i = 1; i <= 2; i++) {
        await syncSimplified('xmazza', `https://xmaza.ac/wp-json/wp/v2/posts?per_page=100&page=${i}`, 'wp', 'XMazaa');
    }
    
    // 5. KPM (Deep Sync)
    console.log("Fetching KPM Categories...");
    const kpmCats = await fetch('https://koreanpornmovie.com/wp-json/wp/v2/categories?per_page=100').then(r => r.json()).catch(() => []);
    console.log(`Starting KPM Deep Sync (${kpmCats.length} cats)...`);
    
    // Sync General Feed (40 Pages)
    console.log("Syncing KPM: 2 Pages of Latest...");
    for (let i = 1; i <= 2; i++) {
        await syncSimplified('koreanpornmovie', `https://koreanpornmovie.com/wp-json/wp/v2/media?per_page=100&page=${i}`);
    }

    // Sync specific categories
    for (const c of kpmCats) {
        // Fetch media for this category
        // Note: KPM uses 'media' endpoint, standard WP allows filtering by 'categories' on posts, but media might fail if attached.
        // Trying 'posts' endpoint first as it holds better info for KPM usually
        await syncSimplified('koreanpornmovie', `https://koreanpornmovie.com/wp-json/wp/v2/media?categories=${c.id}&per_page=100`);
    }

    console.log("=== Sync Complete ===");
}

main().catch(err => console.error("Fatal Sync Error:", err));

