
/**
 * Detailed XnxxVideos formatting test
 */
const BASE_URL = 'https://xnxxvideos.in/wp-json/wp/v2';

function buildPath(dateStr, title) {
    const dateObj = new Date(dateStr);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    
    let slug = title
        .replace(/&#8211;/g, '-')
        .replace(/&#8217;/g, '')
        .replace(/&amp;/g, 'and')
        .replace(/&nbsp;/g, ' ')
        .replace(/['']/g, '')
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .trim();
    
    return `/${year}/${month}/${slug}`;
}

async function test() {
    console.log("🔍 Fetching a sample post from xnxxvideos.in...");
    try {
        const res = await fetch(`${BASE_URL}/posts?per_page=1`);
        const posts = await res.json();
        
        if (posts.length > 0) {
            const p = posts[0];
            const rawTitle = p.title.rendered.replace(/&#\d+;/g, '').trim();
            const basePath = buildPath(p.date, rawTitle);
            
            console.log("\n✅ Test Successful!");
            console.log("------------------------------------------");
            console.log("Original Title:", rawTitle);
            console.log("Post Date:     ", p.date);
            console.log("------------------------------------------");
            console.log("Stream Path (Wanted: /date/title.mp4):");
            console.log("👉", `${basePath}.mp4`);
            console.log("\nImg URL (Wanted: https://cdn.xnxxvideos.in/date/title.jpg):");
            console.log("👉", `https://cdn.xnxxvideos.in${basePath}.jpg`);
            console.log("------------------------------------------");
        }
    } catch (e) {
        console.error("❌ Fetch failed:", e.message);
    }
}

test();
