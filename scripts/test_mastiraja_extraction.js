/**
 * Mastiraja.com Scraper – FINAL VERSION
 * per_page=100
 * Stops category after 10 consecutive duplicates
 * Fully re-scrape safe
 */

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

/* ================= CONFIG ================= */
const SUPABASE_URL = 'https://jdrheygmqtnohloykrxs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcmhleWdtcXRub2hsb3lrcnhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU3OTk5OSwiZXhwIjoyMDg0MTU1OTk5fQ.PYO5Dl0Of8tiOBm7cbrqGUMklXh9jAj7OMridBdN8K8';
//const SUPABASE_URL = process.env.SUPABASE_URL;
//const SUPABASE_KEY = process.env.SUPABASE_KEY;
const BASE_URL = 'https://mastiraja.com/wp-json/wp/v2';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ================= UTILS ================= */
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJSON(url) {
    console.log(`🌐 JSON → ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function fetchHTML(url) {
    console.log(`🌐 HTML → ${url}`);
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) throw new Error(`HTML ${res.status}`);
    return res.text();
}

/* ================= EXTRACTORS ================= */
function extractMp4(html) {
    let m = html.match(
        /<meta[^>]+itemprop=["']contentURL["'][^>]+content=["']([^"']+\.mp4[^"']*)["']/i
    );
    if (m) return m[1];

    m = html.match(/<source[^>]+src=["']([^"']+\.mp4[^"']*)["']/i);
    return m ? m[1] : null;
}

function extractPoster(html) {
    const m = html.match(/<video[^>]*poster=["']([^"']+)["']/i);
    if (m) return m[1];

    const og = html.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);
    return og ? og[1] : null;
}

function cleanTitle(title) {
    return title
        .replace(/&#8211;/g, '-')
        .replace(/&#8217;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&#\d+;/g, '')
        .trim();
}

/* ================= CATEGORY SYNC ================= */
async function syncCategories() {
    console.log("📂 Fetching Categories...");

    const cats = await fetchJSON(`${BASE_URL}/categories?per_page=100`);

    const rows = cats.map(c => ({
        id: c.id,
        name: c.name,
        slug: c.slug
    }));

    await supabase
        .from('mastiraja_categories')
        .upsert(rows, { onConflict: 'id' });

    return rows;
}

/* ================= POST SYNC ================= */
async function syncCategory(category) {
    let page = 1;
    let stored = 0;
    let duplicateStreak = 0;

    while (true) {
        console.log(`📄 ${category.name} – Page ${page}`);

        let posts;
        try {
            posts = await fetchJSON(
                `${BASE_URL}/posts?categories=${category.id}&per_page=100&page=${page}`
            );
        } catch {
            break;
        }

        if (!posts.length) break;

        for (const p of posts) {
            console.log(`📝 ${p.title.rendered}`);

            /* 🔍 CHECK DUPLICATE (slug + category) */
            const { data: exists } = await supabase
                .from('mastiraja_videos')
                .select('id')
                .eq('slug', p.slug)
                .eq('category_id', category.id)
                .limit(1);

            if (exists.length) {
                duplicateStreak++;
                console.log(`⏭️ Duplicate (${duplicateStreak}/10)`);

                if (duplicateStreak >= 10) {
                    console.log(`🛑 10 duplicates in a row → skipping category`);
                    return stored;
                }

                continue;
            }

            duplicateStreak = 0; // reset streak

            try {
                const html = await fetchHTML(p.link);
                const stream_url = extractMp4(html);

                if (!stream_url) continue;

                const img = extractPoster(html);
                const date = new Date(p.date);

                const row = {
                    category_id: category.id,
                    slug: p.slug,
                    title: cleanTitle(p.title.rendered),
                    img: img || null,
                    stream_url,
                    post_date: date.toISOString().split('T')[0],
                    post_time: date.toTimeString().split(' ')[0]
                };

                const { error } = await supabase
                    .from('mastiraja_videos')
                    .insert(row);

                if (error) {
                    if (!error.message.includes('duplicate')) {
                        console.error('❌ DB ERROR:', error.message);
                    }
                } else {
                    console.log('✅ STORED');
                    stored++;
                }

            } catch (e) {
                console.error('❌ POST ERROR:', e.message);
            }

            await sleep(700);
        }

        if (posts.length < 100) break;
        page++;
    }

    return stored;
}

/* ================= MAIN ================= */
async function main() {
    console.log("═══════════════════════════════════════");
    console.log(" Mastiraja.com Scraper Starting ");
    console.log("═══════════════════════════════════════");

    const categories = await syncCategories();

    for (const cat of categories) {
        const count = await syncCategory(cat);
        console.log(`🎯 ${cat.name}: ${count} new videos`);
        await sleep(2000);
    }

    console.log("✅ SCRAPING COMPLETE");
}

main();
