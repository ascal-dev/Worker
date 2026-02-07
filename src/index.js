/**
 * Nova IPTV Pro - Advanced Player Edition
 * Fast pre-loaded channels + Premium video player UI
 */

const APP_NAME = "Nova IPTV";
const M3U_SOURCES = [
  { name: "Noodle Magazine", url: "LOCAL:/m3u/noodle.txt" },
  { name: "tv.adult", url: "https://raw.githubusercontent.com/143maha/Sonuiptvnew/main/tv.adult.m3u" },
  { name: "Movies Private", url: "https://raw.githubusercontent.com/bugsfreeweb/LiveTVCollector/main/Movies/Private/Movies.m3u" },
  { name: "Movies Secret", url: "https://raw.githubusercontent.com/bugsfreeweb/LiveTVCollector/main/Movies/SecretWorld/Movies.m3u" },
  { name: "Adults Unknown", url: "https://raw.githubusercontent.com/bugsfreeweb/LiveTVCollector/main/SpecialLinks/ADULTS/Unknown/SpecialLinks.m3u" },
  { name: "Adult HD 4K", url: "https://raw.githubusercontent.com/bugsfreeweb/LiveTVCollector/main/SpecialLinks/XXX_ADULT_HD___4K_1/Unknown/SpecialLinks.m3u" },
  { name: "Adult Local", url: "https://raw.githubusercontent.com/bugsfreeweb/LiveTVCollector/main/SpecialLinks/XXX_ADULT_LOCAL/Unknown/SpecialLinks.m3u" },
  { name: "Adult TV HD", url: "https://raw.githubusercontent.com/bugsfreeweb/LiveTVCollector/main/SpecialLinks/XXX_ADULT_TV_HD___4K/Unknown/SpecialLinks.m3u" },
  { name: "XX Adult TV", url: "https://raw.githubusercontent.com/bugsfreeweb/LiveTVCollector/main/SpecialLinks/XX_ADULT_TV_HD___4K/Unknown/SpecialLinks.m3u" }
];

// Desi Tales helper functions
async function fetchDesitalesCategories() {
  try {
    const res = await fetch("https://www.desitales2.com/wp-json/wp/v2/video_category?per_page=100", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return [];
    const categories = await res.json();
    return categories.map(cat => ({ slug: cat.slug, name: cat.name, count: cat.count || 0, type: 'category' }));
  } catch (e) {
    return [];
  }
}

async function fetchDesitalesTags() {
  try {
    const res = await fetch("https://www.desitales2.com/wp-json/wp/v2/video_tag?per_page=100", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return [];
    const tags = await res.json();
    return tags.map(tag => ({ slug: tag.slug, name: tag.name, count: tag.count || 0, type: 'tag' }));
  } catch (e) {
    return [];
  }
}

// type: 'categories' or 'tags', page: page number for pagination
async function fetchDesitalesRSS(slug, type = 'categories', page = 1) {
  try {
    // RSS feed URL format: /videos/rss/categories/slug/ or /videos/rss/tags/slug/
    // For pagination, add page parameter: /videos/rss/categories/slug/page/2/
    let rssUrl = `https://www.desitales2.com/videos/rss/${type}/${slug}/`;
    if (page > 1) {
      rssUrl = `https://www.desitales2.com/videos/rss/${type}/${slug}/page/${page}/`;
    }
    
    const res = await fetch(rssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return { items: [], hasMore: false };
    const xml = await res.text();
    const items = parseDesitalesRSS(xml);
    // If we got items, there might be more pages
    const hasMore = items.length >= 10;
    return { items, hasMore };
  } catch (e) {
    return { items: [], hasMore: false };
  }
}

function parseDesitalesRSS(xml) {
  const items = [];
  // Match all <item> blocks
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];
  
  for (const itemXml of itemMatches) {
    // Extract title
    const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i) || itemXml.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "Unknown";
    
    // Extract description to find image URL
    const descMatch = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i) || itemXml.match(/<description>([\s\S]*?)<\/description>/i);
    const description = descMatch ? descMatch[1] : "";
    
    // Extract image URL from description - looking for pattern like:
    // https://www.desitales2.com/videos/contents/videos_screenshots/2000/2644/320x180/1.jpg
    const imgMatch = description.match(/https?:\/\/[^"'\s]*?\/videos\/contents\/videos_screenshots\/(\d+)\/(\d+)\/[^"'\s]*/i);
    
    if (imgMatch) {
      const part1 = imgMatch[1]; // e.g., "2000"
      const part2 = imgMatch[2]; // e.g., "2644"
      
      // Create the stream URL: https://cdn.desitales2.com/2000/2644/2644.mp4
      const streamUrl = `https://cdn.desitales2.com/${part1}/${part2}/${part2}.mp4`;
      const thumbnail = `https://cdn.desitales2.com/${part1}/${part2}/${part2}.jpg`;
      
      items.push({
        name: title,
        logo: thumbnail,
        url: streamUrl
      });
    }
  }
  
  return items;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cache = caches.default;
    const checkPw = (r) => (r.headers.get("X-App-Password") || new URL(r.url).searchParams.get("pw")) === env.APP_PASSWORD;

    if (url.pathname === "/api/auth") return Response.json({ ok: checkPw(request) });

    if (url.pathname === "/api/all") {
      if (!checkPw(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const cacheKey = new Request(url.origin + "/api/all-cached");
      let res = await cache.match(cacheKey);
      if (res) return res;
      const all = [];
      await Promise.all(M3U_SOURCES.map(async (src) => {
        try {
          let text;
          if (src.url.startsWith("LOCAL:")) {
            const localPath = src.url.replace("LOCAL:", "");
            const localRes = await fetch(url.origin + localPath);
            if (localRes.ok) text = await localRes.text();
          } else {
            const r = await fetch(src.url, { signal: AbortSignal.timeout(10000) });
            if (r.ok) text = await r.text();
          }
          if (text) all.push(...parseM3U(text, src.name));
        } catch (e) {}
      }));
      // Desi Tales dynamic integration - Categories and Tags
      try {
        const [desitalesCategories, desitalesTags] = await Promise.all([
          fetchDesitalesCategories(),
          fetchDesitalesTags()
        ]);
        
        // Add categories (with category type marker)
        const categoryItems = desitalesCategories.map(cat => ({
          name: "📁 " + cat.name,
          logo: "",
          group: cat.count + " Videos",
          source: "Desi Tales",
          url: `desitalescat:${cat.slug}`
        }));
        
        // Add tags (with tag type marker)
        const tagItems = desitalesTags.map(tag => ({
          name: "🏷️ " + tag.name,
          logo: "",
          group: tag.count + " Videos",
          source: "Desi Tales Tags",
          url: `desitalestag:${tag.slug}`
        }));
        
        all.unshift(...tagItems);
        all.unshift(...categoryItems);
      } catch (e) {}
      
      // Korean Porn Movie dynamic integration
      try {
        const catRes = await fetch("https://koreanpornmovie.com/wp-json/wp/v2/categories?per_page=100", { signal: AbortSignal.timeout(5000) });
        if (catRes.ok) {
          const categories = await catRes.json();
          // Sort "Korea" first
          categories.sort((a, b) => {
            const aK = a.name.toLowerCase().includes('korea');
            const bK = b.name.toLowerCase().includes('korea');
            return aK && !bK ? -1 : !aK && bK ? 1 : 0;
          });
          
          const kpmItems = [];
          categories.forEach(cat => {
            if (cat.count > 0) {
              kpmItems.push({
                name: cat.name,
                logo: "", 
                group: cat.count + " Videos",
                source: "Korean Porn Movie",
                url: `kpmcat:${cat.id}`
              });
            }
          });
          all.unshift(...kpmItems);
        }
      } catch (e) {}
      res = Response.json(all, { headers: { "Cache-Control": "public, s-maxage=3600" } });
      await cache.put(cacheKey, res.clone());
      return res;
    }
    
    // Desi Tales category/tag videos endpoint with pagination
    if (url.pathname === "/api/desitales") {
      if (!checkPw(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
      const slug = url.searchParams.get("slug");
      const type = url.searchParams.get("type") || "categories"; // 'categories' or 'tags'
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      
      if (!slug) return Response.json({ error: "Missing slug parameter" }, { status: 400 });
      
      // Don't cache paginated requests beyond page 1
      const cacheKey = new Request(url.origin + `/api/desitales-cached-${type}-${slug}-page${page}`);
      let res = await cache.match(cacheKey);
      if (res) return res;
      
      const { items: videos, hasMore } = await fetchDesitalesRSS(slug, type, page);
      const items = videos.map(v => ({
        ...v,
        group: type === 'tags' ? "Desi Tales Tags" : "Desi Tales",
        source: type === 'tags' ? "Desi Tales Tags" : "Desi Tales"
      }));
      
      // Return with pagination info
      res = Response.json({ 
        items, 
        hasMore, 
        page, 
        nextPage: hasMore ? page + 1 : null 
      }, { headers: { "Cache-Control": "public, s-maxage=1800" } });
      await cache.put(cacheKey, res.clone());
      return res;
    }

    // Handle CORS preflight - echo requested headers and origin for compatibility
    if (request.method === "OPTIONS") {
      const reqOrigin = request.headers.get('Origin') || '*';
      const reqHeaders = request.headers.get('Access-Control-Request-Headers');
      const allowHeaders = reqHeaders || 'Content-Type, Authorization, Range';
      const allowMethods = 'GET, HEAD, POST, OPTIONS';
      const allowCreds = request.headers.get('Access-Control-Request-Headers') && request.headers.get('Access-Control-Request-Headers').toLowerCase().includes('cookie') ? 'true' : 'false';

      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': reqOrigin,
          'Access-Control-Allow-Methods': allowMethods,
          'Access-Control-Allow-Headers': allowHeaders,
          'Access-Control-Max-Age': '86400',
          'Access-Control-Allow-Credentials': allowCreds
        }
      });
    }

    if (url.pathname === "/proxy" || url.pathname === "/api/proxy") {
      const target = url.searchParams.get("url");
      const userAgent = url.searchParams.get("ua") || "plaYtv/7.1.3 (Linux;Android 13) ygx/69.1 ExoPlayerLib/824.0";
      const cookieParam = url.searchParams.get("cookie");
      if (!target) return new Response("Missing url", { status: 400 });
      try {
        // Build headers to forward to upstream. Forward useful headers from the client
        const forwardHeaders = { 'User-Agent': userAgent };
        const toForward = ['Range', 'Accept', 'Accept-Language', 'Referer', 'Origin', 'Authorization', 'If-None-Match', 'If-Modified-Since', 'Cookie'];
        for (const h of toForward) {
          const v = request.headers.get(h);
          if (v) forwardHeaders[h] = v;
        }
        // If cookie provided via query param, ensure it's forwarded as Cookie header
        if (cookieParam) {
          try {
            forwardHeaders['Cookie'] = decodeURIComponent(cookieParam);
          } catch (e) {
            forwardHeaders['Cookie'] = cookieParam;
          }
        }

        const pr = await fetch(target, { headers: forwardHeaders });
        let ct = pr.headers.get("content-type") || "application/octet-stream";
        if (target.endsWith(".m3u8")) ct = "application/vnd.apple.mpegurl";
        if (target.endsWith(".ts")) ct = "video/mp2t";
        const resOrigin = request.headers.get('Origin') || '*';
        const corsHeaders = {
          'Content-Type': ct,
          'Access-Control-Allow-Origin': resOrigin,
          'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
          'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || 'Content-Type, Authorization, Range',
          'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges'
        };
        // If client asked for credentials, allow them (note: browser must set credentials mode)
        if (request.headers.get('Origin')) corsHeaders['Access-Control-Allow-Credentials'] = 'true';
        if (ct.includes("mpegurl") || target.endsWith(".m3u8")) {
          let txt = await pr.text();
          const base = target.substring(0, target.lastIndexOf('/') + 1);
          txt = txt.split('\n').map(l => {
            l = l.trim();
            if (l && !l.startsWith('#')) {
              const full = l.startsWith('http') ? l : base + l;
              let proxyLine = '/api/proxy?url=' + encodeURIComponent(full) + '&ua=' + encodeURIComponent(userAgent);
              if (cookieParam) proxyLine += '&cookie=' + encodeURIComponent(cookieParam);
              return proxyLine;
            }
            return l;
          }).join('\n');
          return new Response(txt, { headers: corsHeaders });
        }
        // Preserve upstream range headers when present
        const upstreamHeaders = {};
        const copyList = ['Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified'];
        for (const hn of copyList) {
          const hv = pr.headers.get(hn);
          if (hv) upstreamHeaders[hn] = hv;
        }
        return new Response(pr.body, { headers: Object.assign({}, corsHeaders, upstreamHeaders) });
      } catch (e) {
        return new Response("Proxy error", { status: 502 });
      }
    }

    return new Response(HTML, { headers: { "Content-Type": "text/html" } });
  }
};

function parseM3U(txt, src) {
  const lines = txt.split('\n'), out = [];
  let c = null;
  for (let l of lines) {
    l = l.trim();
    if (l.startsWith('#EXTINF:')) {
      const n = l.match(/,(.*)$/);
      const lg = l.match(/tvg-logo=["']([^"']+)["']/i);
      const g = l.match(/group-title=["']([^"']+)["']/i);
      c = { name: n?.[1]?.trim() || "?", logo: lg?.[1] || "", group: g?.[1] || src, source: src, url: "" };
    } else if (l.startsWith('http') && c) {
      c.url = l; out.push(c); c = null;
    }
  }
  return out;
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nova IPTV Pro</title>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<style>
:root{--bg:#0a0a0a;--surface:#141414;--accent:#e50914;--text:#fff;--dim:#666}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);height:100vh;display:flex;overflow:hidden}

/* Sidebar */
.sb{width:260px;background:var(--surface);display:flex;flex-direction:column;border-right:1px solid #222}
.sb-head{padding:20px;font-size:1.3rem;font-weight:700;color:var(--accent);display:flex;align-items:center;gap:10px}
.sb ul{list-style:none;flex:1;overflow-y:auto;padding:10px}
.sb li{padding:12px 16px;border-radius:8px;cursor:pointer;margin-bottom:4px;display:flex;align-items:center;gap:10px;color:var(--dim)}
.sb li:hover{background:#1a1a1a;color:var(--text)}
.sb li.on{background:var(--accent);color:#fff}
.sb li i{width:16px}

/* Main */
.main{flex:1;display:flex;flex-direction:column;min-width:0}
.top{padding:16px 24px;background:var(--surface);display:flex;align-items:center;gap:20px;border-bottom:1px solid #222}
.top h2{flex:1;font-size:1.1rem;font-weight:600}
.top input{background:#1a1a1a;border:1px solid #333;padding:10px 18px;border-radius:25px;color:#fff;width:280px;outline:none}
.top input:focus{border-color:var(--accent)}

/* Grid */
.grid-wrap{flex:1;overflow-y:auto;padding:24px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px}
.card{background:var(--surface);border-radius:12px;overflow:hidden;cursor:pointer;border:1px solid #222;transition:transform .2s,border-color .2s}
.card:hover{transform:translateY(-4px);border-color:var(--accent)}
.card img{width:100%;aspect-ratio:16/10;object-fit:cover;background:#1a1a1a}
.card-info{padding:14px}
.card-info h4{font-size:.9rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-info span{font-size:.75rem;color:var(--accent)}

/* Advanced Player */
#player{position:fixed;inset:0;background:#000;z-index:1000;display:none;flex-direction:column}
#player.on{display:flex}
.p-video{flex:1;position:relative;display:flex;align-items:center;justify-content:center;background:#000}
.p-video video{width:100%;height:100%;outline:none}

/* Loading Indicator */
.p-loader{position:absolute;display:flex;flex-direction:column;align-items:center;gap:15px;opacity:0;transition:opacity .3s}
.p-loader.show{opacity:1}
.spinner{width:50px;height:50px;border:3px solid #333;border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.p-loader span{font-size:.9rem;color:var(--dim)}

/* Player Controls Overlay */
.p-controls{position:absolute;bottom:0;left:0;right:0;padding:20px 30px;background:linear-gradient(transparent,rgba(0,0,0,.9));opacity:0;transition:opacity .3s}
.p-video:hover .p-controls{opacity:1}
.p-top{position:absolute;top:0;left:0;right:0;padding:20px 30px;background:linear-gradient(rgba(0,0,0,.8),transparent);display:flex;align-items:center;opacity:0;transition:opacity .3s}
.p-video:hover .p-top{opacity:1}
.p-title{flex:1;font-size:1.2rem;font-weight:600}
.p-close{background:none;border:none;color:#fff;font-size:1.5rem;cursor:pointer;opacity:.7}
.p-close:hover{opacity:1}

/* Progress Bar */
.progress-wrap{width:100%;margin-bottom:15px}
.progress{width:100%;height:5px;background:#333;border-radius:3px;cursor:pointer;position:relative}
.progress-bar{height:100%;background:var(--accent);border-radius:3px;width:0;transition:width .1s}
.progress-buffer{position:absolute;height:100%;background:#555;border-radius:3px;width:0}

/* Control Buttons */
.ctrl-row{display:flex;align-items:center;gap:20px}
.ctrl-btn{background:none;border:none;color:#fff;font-size:1.3rem;cursor:pointer;opacity:.8;transition:opacity .2s,transform .2s}
.ctrl-btn:hover{opacity:1;transform:scale(1.1)}
.ctrl-btn.play{font-size:1.8rem}
.time{font-size:.85rem;color:var(--dim);min-width:100px}
.spacer{flex:1}
.vol-wrap{display:flex;align-items:center;gap:10px}
.vol-slider{width:80px;height:4px;background:#333;border-radius:2px;cursor:pointer;position:relative}
.vol-bar{height:100%;background:#fff;border-radius:2px;width:100%}

/* Quality Badge */
.quality{background:var(--accent);padding:3px 8px;border-radius:4px;font-size:.7rem;font-weight:600}

/* Auth */
#auth{position:fixed;inset:0;background:var(--bg);z-index:2000;display:flex;align-items:center;justify-content:center}
.auth-box{text-align:center;width:320px}
.auth-box h1{color:var(--accent);font-size:2.5rem;margin-bottom:10px}
.auth-box p{color:var(--dim);margin-bottom:30px}
.auth-box input{width:100%;padding:14px;border-radius:10px;background:#1a1a1a;border:1px solid #333;color:#fff;text-align:center;font-size:1rem;margin-bottom:15px}
.auth-box button{width:100%;padding:14px;border-radius:10px;background:var(--accent);color:#fff;font-weight:600;border:none;cursor:pointer;font-size:1rem}
#auth-err{color:var(--accent);margin-top:15px;display:none}

/* Mobile */
@media(max-width:768px){
.sb{width:70px}
.sb-head span,.sb li span{display:none}
.top input{width:150px}
.grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
}
</style>
</head>
<body>

<div id="auth">
  <div class="auth-box">
    <h1><i class="fa fa-play-circle"></i></h1>
    <p>Enter your access password</p>
    <input type="password" id="pw" placeholder="••••••••" autofocus>
    <button onclick="login()">Unlock</button>
    <p id="auth-err">Invalid Password</p>
  </div>
</div>

<div class="sb">
  <div class="sb-head"><i class="fa fa-play-circle"></i><span>NOVA</span></div>
  <ul id="srcList"></ul>
</div>

<div class="main">
  <div class="top">
    <h2 id="title">All Channels</h2>
    <input id="q" placeholder="Search channels..." oninput="filter()">
  </div>
  <div class="grid-wrap">
    <div class="grid" id="grid"></div>
  </div>
</div>

<div id="player">
  <div class="p-video" id="pVideo">
    <video id="vid"></video>
    <div class="p-loader" id="loader">
      <div class="spinner"></div>
      <span id="loadText">Loading stream...</span>
    </div>
    <div class="p-top">
      <div class="p-title" id="pName">Now Playing</div>
      <span class="quality" id="qualBadge">LIVE</span>
      <button class="p-close" onclick="stop()"><i class="fa fa-times"></i></button>
    </div>
    <div class="p-controls">
      <div class="progress-wrap">
        <div class="progress" id="progWrap" onclick="seek(event)">
          <div class="progress-buffer" id="progBuf"></div>
          <div class="progress-bar" id="progBar"></div>
        </div>
      </div>
      <div class="ctrl-row">
        <button class="ctrl-btn play" id="playBtn" onclick="togglePlay()"><i class="fa fa-pause"></i></button>
        <span class="time" id="timeDisp">0:00 / LIVE</span>
        <div class="spacer"></div>
        <div class="vol-wrap">
          <button class="ctrl-btn" id="volBtn" onclick="toggleMute()"><i class="fa fa-volume-up"></i></button>
          <div class="vol-slider" onclick="setVol(event)"><div class="vol-bar" id="volBar"></div></div>
        </div>
        <button class="ctrl-btn" onclick="pip()"><i class="fa fa-clone"></i></button>
        <button class="ctrl-btn" onclick="fullscreen()"><i class="fa fa-expand"></i></button>
      </div>
    </div>
  </div>
</div>

<script>
let pw=localStorage.getItem('pw')||'',data=[],filt=[],src='all',hls,vid;
let currentDesitales = null; // { slug, type, page, name, hasMore }

async function login(){
  const v=document.getElementById('pw').value;
  const r=await fetch('/api/auth?pw='+encodeURIComponent(v));
  if((await r.json()).ok){localStorage.setItem('pw',v);pw=v;document.getElementById('auth').style.display='none';init();}
  else document.getElementById('auth-err').style.display='block';
}

async function init(){
  const r=await fetch('/api/all?pw='+encodeURIComponent(pw));
  data=await r.json();filt=[...data];
  const sources=[...new Set(data.map(c=>c.source))];
  document.getElementById('srcList').innerHTML='<li class="on" onclick="setSrc(\\'all\\')"><i class="fa fa-globe"></i><span>All</span></li>'+sources.map(s=>'<li onclick="setSrc(\\''+s+'\\')"><i class="fa fa-folder"></i><span>'+s+'</span></li>').join('');
  render();
}

function setSrc(s){
  src=s;
  document.querySelectorAll('.sb li').forEach((e,i)=>e.classList.toggle('on',(s==='all'&&i===0)||(e.querySelector('span')?.textContent===s)));
  document.getElementById('title').textContent=s==='all'?'All Channels ('+data.length+')':s;
  filter();
}

function filter(){
  const q=document.getElementById('q').value.toLowerCase();
  filt=data.filter(c=>(src==='all'||c.source===src)&&c.name.toLowerCase().includes(q));
  render();
}

function render(){
  const g=document.getElementById('grid');
  if(!filt.length){g.innerHTML='<p style="grid-column:1/-1;text-align:center;padding:80px;color:var(--dim)">No channels found</p>';return;}
  let html = filt.map((c,i)=>{
    const fb='https://ui-avatars.com/api/?name='+encodeURIComponent(c.name)+'&background=1a1a1a&color=fff&size=128';
    const logo=c.logo&&c.logo.startsWith('http')?c.logo:fb;
    return '<div class="card" onclick="play('+i+')"><img src="'+logo+'" onerror="this.src=\\''+fb+'\\'"><div class="card-info"><span>'+c.source+'</span><h4>'+c.name+'</h4></div></div>';
  }).join('');
  
  // Add Load More button if there's more content available
  if(currentDesitales && currentDesitales.hasMore){
    html += '<div style="grid-column:1/-1;text-align:center;padding:30px"><button onclick="loadMoreDesitales()" style="background:var(--accent);color:#fff;border:none;padding:15px 40px;border-radius:10px;font-size:1rem;cursor:pointer;font-weight:600"><i class="fa fa-plus"></i> Load More Videos</button></div>';
  }
  g.innerHTML = html;
}

async function loadDesitalesContent(isNewLoad = false){
  if(!currentDesitales) return;
  
  showLoader('Loading ' + currentDesitales.name + '...');
  try{
    const { slug, type, page } = currentDesitales;
    const r = await fetch('/api/desitales?slug='+encodeURIComponent(slug)+'&type='+type+'&page='+page+'&pw='+encodeURIComponent(pw));
    const response = await r.json();
    
    if(response.items && response.items.length){
      if(isNewLoad){
        // Clear categories/tags from data and set new videos
        data = data.filter(x => !x.url.startsWith('desitalescat:') && !x.url.startsWith('desitalestag:'));
        filt = [...response.items];
      } else {
        // Append to existing videos
        filt = [...filt, ...response.items];
      }
      
      currentDesitales.hasMore = response.hasMore;
      currentDesitales.page = response.page;
      
      document.getElementById('title').textContent = currentDesitales.name + ' (' + filt.length + ' videos)';
      render();
    } else if(isNewLoad){
      alert('No videos found');
    }
  }catch(e){
    console.error(e);
    alert('Failed to load content');
  }
  hideLoader();
}

async function loadMoreDesitales(){
  if(!currentDesitales || !currentDesitales.hasMore) return;
  currentDesitales.page++;
  await loadDesitalesContent(false);
}

async function play(i){
  const c=filt[i];
  
  // Handle Desi Tales category URL
  if(c.url.startsWith('desitalescat:')){
    const slug=c.url.replace('desitalescat:','');
    currentDesitales = { slug, type: 'categories', page: 1, name: c.name };
    await loadDesitalesContent(true);
    return;
  }
  
  // Handle Desi Tales tag URL
  if(c.url.startsWith('desitalestag:')){
    const slug=c.url.replace('desitalestag:','');
    currentDesitales = { slug, type: 'tags', page: 1, name: c.name };
    await loadDesitalesContent(true);
    return;
  }
  
  vid=document.getElementById('vid');
  document.getElementById('player').classList.add('on');
  document.getElementById('pName').textContent=c.name;
  showLoader('Connecting...');
  
  if(hls){hls.destroy();hls=null;}
  let u=c.url;
  if(u.startsWith('http://'))u='/proxy?url='+encodeURIComponent(u);

  if(Hls.isSupported()){
    hls=new Hls({enableWorker:true,lowLatencyMode:true});
    hls.loadSource(u);
    hls.attachMedia(vid);
    hls.on(Hls.Events.MANIFEST_PARSED,(e,d)=>{
      vid.play();
      document.getElementById('qualBadge').textContent=d.levels.length>1?'HD':'LIVE';
    });
    hls.on(Hls.Events.FRAG_BUFFERED,()=>hideLoader());
    hls.on(Hls.Events.ERROR,(_,d)=>{
      if(d.fatal){showLoader('Error - Trying fallback...');vid.src=u;vid.play();}
      else if(d.type==='networkError')showLoader('Buffering...');
    });
  }else{
    vid.src=u;
    vid.play();
  }

  vid.onwaiting=()=>showLoader('Buffering...');
  vid.onplaying=()=>hideLoader();
  vid.ontimeupdate=updateTime;
  vid.onvolumechange=updateVol;
}

function showLoader(t){document.getElementById('loader').classList.add('show');document.getElementById('loadText').textContent=t;}
function hideLoader(){document.getElementById('loader').classList.remove('show');}

function stop(){
  document.getElementById('player').classList.remove('on');
  vid.pause();vid.src='';
  if(hls){hls.destroy();hls=null;}
}

function togglePlay(){
  if(vid.paused)vid.play();else vid.pause();
  document.querySelector('#playBtn i').className='fa fa-'+(vid.paused?'play':'pause');
}

function updateTime(){
  const cur=formatTime(vid.currentTime);
  const dur=vid.duration&&isFinite(vid.duration)?formatTime(vid.duration):'LIVE';
  document.getElementById('timeDisp').textContent=cur+' / '+dur;
  if(isFinite(vid.duration))document.getElementById('progBar').style.width=(vid.currentTime/vid.duration*100)+'%';
}

function formatTime(s){const m=Math.floor(s/60),sec=Math.floor(s%60);return m+':'+(sec<10?'0':'')+sec;}

function seek(e){
  if(!isFinite(vid.duration))return;
  const rect=e.target.getBoundingClientRect();
  const pos=(e.clientX-rect.left)/rect.width;
  vid.currentTime=pos*vid.duration;
}

function toggleMute(){
  vid.muted=!vid.muted;
  document.querySelector('#volBtn i').className='fa fa-volume-'+(vid.muted?'mute':'up');
}

function setVol(e){
  const rect=e.target.getBoundingClientRect();
  const vol=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
  vid.volume=vol;
}

function updateVol(){
  document.getElementById('volBar').style.width=(vid.volume*100)+'%';
  document.querySelector('#volBtn i').className='fa fa-volume-'+(vid.muted||vid.volume===0?'mute':vid.volume<.5?'down':'up');
}

function pip(){if(document.pictureInPictureElement)document.exitPictureInPicture();else vid.requestPictureInPicture();}
function fullscreen(){if(document.fullscreenElement)document.exitFullscreen();else document.getElementById('pVideo').requestFullscreen();}

document.addEventListener('keydown',e=>{
  if(!document.getElementById('player').classList.contains('on'))return;
  if(e.code==='Space'){e.preventDefault();togglePlay();}
  if(e.key==='f')fullscreen();
  if(e.key==='m')toggleMute();
  if(e.key==='Escape')stop();
  if(e.key==='ArrowRight')vid.currentTime+=10;
  if(e.key==='ArrowLeft')vid.currentTime-=10;
  if(e.key==='ArrowUp'){vid.volume=Math.min(1,vid.volume+.1);}
  if(e.key==='ArrowDown'){vid.volume=Math.max(0,vid.volume-.1);}
});

if(pw)fetch('/api/auth?pw='+encodeURIComponent(pw)).then(r=>r.json()).then(j=>{if(j.ok){document.getElementById('auth').style.display='none';init();}});
</script>
</body>
</html>`;
