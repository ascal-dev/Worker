// Proxy API for Cloudflare Pages Functions with Extreme Transparency
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range, Accept-Ranges, User-Agent, Referer, Origin, Accept-Language, Cookie',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Set-Cookie',
        'Access-Control-Allow-Credentials': 'true'
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const target = url.searchParams.get('url');
    if (!target) {
        return new Response('Missing url parameter', { status: 400, headers: corsHeaders });
    }

    let targetUrl;
    try {
        targetUrl = new URL(target);
    } catch (e) {
        return new Response('Invalid URL', { status: 400, headers: corsHeaders });
    }

    // Special handling for video extraction remains optimized
    const extractMode = url.searchParams.get('extract');
    const extractVideo = extractMode === 'true';
    const customReferer = url.searchParams.get('referer');
    const uaParam = url.searchParams.get('ua');
    const cookieParam = url.searchParams.get('cookie');

    // NEW: KPM Discovery Logic
    if (extractMode === 'kpm') {
        const title = url.searchParams.get('title');
        if (!title) return Response.json({ error: 'Missing title for KPM discovery' }, { status: 400, headers: corsHeaders });
        
        try {
            // Step 1: Search for the title
            const searchUrl = `https://koreanpornmovie.com/?s=${encodeURIComponent(title)}`;
            const searchRes = await fetch(searchUrl, {
                headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html' }
            });
            const searchHtml = await searchRes.text();
            
            // Step 2: Find the first post link
            const postMatch = searchHtml.match(/<h2 class="entry-title"><a href="([^"]+)"/i) || 
                             searchHtml.match(/<a class="item-link" href="([^"]+)"/i);
            
            if (!postMatch) return Response.json({ error: 'Post not found on KPM search' }, { status: 404, headers: corsHeaders });
            
            const postUrl = postMatch[1];
            
            // Step 3: Fetch the post page
            const postRes = await fetch(postUrl, {
                headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html' }
            });
            let html = await postRes.text();
            
            // Step 4: Check for iframes and extract video URL
            const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
            if (iframeMatch) {
                const iframeUrl = new URL(iframeMatch[1], postUrl).href;
                const iframeRes = await fetch(iframeUrl, {
                    headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html', 'Referer': postUrl }
                });
                html += await iframeRes.text();
            }

            const match = html.match(/video_url['":\s]+['"]([^'"]+\.(mp4|m3u8)[^'"]*)['"]/i) ||
                          html.match(/<source[^>]+src=['"]([^'"]+\.(mp4|m3u8)[^'"]*)['"]/i) ||
                          html.match(/file['":\s]+['"]([^'"]+\.(mp4|m3u8)[^'"]*)['"]/i) ||
                          html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i) ||
                          html.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i);
            
            if (match) {
                let v = match[1].replace(/\\u/g, '%u').replace(/\\\//g, '/');
                if (v.startsWith('/')) v = 'https://koreanpornmovie.com' + v; 
                return Response.json({ video: v, source: postUrl }, { headers: corsHeaders });
            }
            return Response.json({ error: 'Video URL not found in post' }, { status: 404, headers: corsHeaders });
        } catch (e) {
            return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
        }
    }

    if (extractVideo && (target.includes('noodlemagazine.com') || target.includes('xhamster.desi') || target.includes('eroticmv.com') || target.includes('fullxcinema.com') || target.includes('viralfap.com'))) {
        try {
            const res = await fetch(target, {
                headers: { 
                    'User-Agent': USER_AGENTS[0], 
                    'Accept': 'text/html', 
                    'Referer': customReferer || targetUrl.origin + '/' 
                }
            });
            let html = await res.text();
            
            // Check for iframes (often used in ViralFap)
            const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
            if (iframeMatch) {
                const iframeUrl = new URL(iframeMatch[1], targetUrl.href).href;
                const iframeRes = await fetch(iframeUrl, {
                    headers: { 'User-Agent': USER_AGENTS[0], 'Accept': 'text/html', 'Referer': target }
                });
                html += await iframeRes.text(); // Append iframe HTML for matching
            }

            const match = html.match(/video_url['":\s]+['"]([^'"]+\.(mp4|m3u8)[^'"]*)['"]/i) ||
                          html.match(/<source[^>]+src=['"]([^'"]+\.(mp4|m3u8)[^'"]*)['"]/i) ||
                          html.match(/file['":\s]+['"]([^'"]+\.(mp4|m3u8)[^'"]*)['"]/i) ||
                          html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i) ||
                          html.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i) ||
                          html.match(/["']\/wp-content\/[^"']+\.mp4[^"']*["']/i) ||
                          html.match(/"videoUrl"\s*:\s*"([^"]+)"/i) ||
                          html.match(/property="og:video"\s+content=["']([^"']+)["']/i);
            if (match) {
                let v = match[1].replace(/\\u/g, '%u').replace(/\\\//g, '/');
                if (v.startsWith('/')) v = targetUrl.origin + v; 
                if (v.includes('%u')) v = decodeURIComponent(v);
                return Response.json({ video: v }, { headers: corsHeaders });
            }
            return Response.json({ error: 'Video not found after scraping' }, { status: 404, headers: corsHeaders });
        } catch (e) {
            return Response.json({ error: e.message }, { status: 500, headers: corsHeaders });
        }
    }

    const range = request.headers.get('Range');
    const incomingHeaders = Object.fromEntries(request.headers.entries());
    
    // Header Spoofing for Extreme Transparency
    const headers = {
        'User-Agent': uaParam || incomingHeaders['user-agent'] || USER_AGENTS[0],
        'Referer': customReferer || targetUrl.origin + '/',
        'Origin': targetUrl.origin,
        'Accept': incomingHeaders['accept'] || '*/*',
        'Accept-Language': incomingHeaders['accept-language'] || 'en-US,en;q=0.9',
        'Cookie': cookieParam || incomingHeaders['cookie'] || ''
    };
    if (range) headers['Range'] = range;

    try {
        const response = await fetch(target, { 
            method: request.method,
            headers, 
            body: request.method === 'POST' ? await request.clone().arrayBuffer() : null,
            redirect: 'manual', // Handle redirects manually for cookie/url control
            cf: { cacheTtl: 0 }
        });
        
        return handleProxyResponse(response, target, corsHeaders);
    } catch (e) {
        return new Response('Proxy Error: ' + e.message, { status: 500, headers: corsHeaders });
    }
}

async function handleProxyResponse(upstream, target, cors) {
    const lowerTarget = target.toLowerCase();
    const targetUrl = new URL(target);
    const origin = targetUrl.origin;
    const basePath = target.substring(0, target.lastIndexOf('/') + 1);
    
    // Improved MIME type detection
    let contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const mimeMap = {
        'm3u8': 'application/vnd.apple.mpegurl',
        'm3u': 'application/vnd.apple.mpegurl',
        'ts': 'video/mp2t',
        'mp4': 'video/mp4',
        'mkv': 'video/x-matroska',
        'webm': 'video/webm',
        'avi': 'video/x-msvideo',
        'mov': 'video/quicktime',
        'mpd': 'application/dash+xml'
    };

    // If content-type is too generic, force it based on file extension
    if (contentType.includes('octet-stream') || !contentType.includes('/')) {
        const ext = lowerTarget.split('?')[0].split('.').pop();
        if (mimeMap[ext]) contentType = mimeMap[ext];
    }

    const respHeaders = { 
        ...cors, 
        'Content-Type': contentType, 
        'Cache-Control': 'no-cache, no-store',
        'X-Status': upstream.status.toString(),
        'X-Proxy-Target': target
    };
    
    const passAttrs = ['content-length', 'content-range', 'accept-ranges', 'content-encoding'];
    passAttrs.forEach(a => { if(upstream.headers.has(a)) respHeaders[a] = upstream.headers.get(a); });

    // Cookie Forwarding & Rewriting
    const setCookie = upstream.headers.get('Set-Cookie');
    if (setCookie) {
        respHeaders['Set-Cookie'] = setCookie.replace(/Domain=[^;]+/gi, '').replace(/Secure/gi, '');
    }

    // Handle Redirects
    if (upstream.status >= 300 && upstream.status < 400) {
        const location = upstream.headers.get('Location');
        if (location) {
            const redirUrl = new URL(location, target).href;
            respHeaders['Location'] = '/api/proxy?url=' + encodeURIComponent(redirUrl);
        }
        return new Response(null, { status: upstream.status, headers: respHeaders });
    }

    const pU = (u) => {
        if (!u || typeof u !== 'string' || u.startsWith('data:') || u.startsWith('javascript:') || u.startsWith('#') || u.includes('/api/proxy')) return u;
        let f = u.startsWith('http') ? u : (u.startsWith('//') ? 'https:' + u : (u.startsWith('/') ? origin + u : basePath + u));
        return '/api/proxy?url=' + encodeURIComponent(f);
    };

    // Text Content Rewriting (M3U8 / DASH)
    if (contentType.includes('mpegurl') || contentType.includes('dash+xml') || lowerTarget.includes('.m3u8') || lowerTarget.includes('.mpd')) {
        let text = await upstream.text();
        if (contentType.includes('mpegurl') || lowerTarget.includes('.m3u8')) {
            // More robust line-by-line manifest rewriting
            text = text.split('\n').map(l => {
                const tr = l.trim();
                if (!tr) return l;
                if (tr.startsWith('#')) {
                    // Rewrite URIs in tags like #EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA
                    return l.replace(/URI=["']?([^"']+)["']?/g, (m, u) => {
                        const quote = m.includes('"') ? '"' : (m.includes("'") ? "'" : "");
                        return `URI=${quote}${pU(u)}${quote}`;
                    });
                }
                return pU(tr); // Rewrite segment URLs
            }).join('\n');
        } else {
            text = text.replace(/(initialization|media|href|src|BaseURL)="([^"]+)"/gi, (m, a, v) => `${a}="${pU(v)}"`);
            text = text.replace(/>([^<]+)<\/BaseURL>/gi, (m, v) => `>${pU(v)}</BaseURL>`);
        }
        delete respHeaders['content-length'];
        return new Response(text, { status: upstream.status, headers: respHeaders });
    }

    if (contentType.includes('text/html')) {
        let html = await upstream.text();
        html = html.replace(/(href|src|action|poster|data-src|data-href|data-url|data-video|data-stream|data-file)=["']([^"']+)["']/gi, (m, a, u) => `${a}="${pU(u)}"`);
        html = html.replace(/srcset=["']([^"']+)["']/gi, (m, s) => 'srcset="' + s.split(',').map(x => {
            const [u, d] = x.trim().split(/\s+/);
            return pU(u) + (d ? ' ' + d : '');
        }).join(', ') + '"');
        html = html.replace(/style=["']([^"']*url\([^)]+\)[^"']*)["']/gi, (m, s) => 
            'style="' + s.replace(/url\(["']?([^"')]+)["']?\)/gi, (um, u) => 'url("' + pU(u.trim()) + '")') + '"'
        );

        const stealthScript = `
<script>
(function() {
    if (window._pxS) return; window._pxS = 1;
    const P_B = '/api/proxy?url=', T_O = '${origin}', T_H = '${targetUrl.hostname}', B_P = '${basePath}';
    const pU = (u) => {
        if (!u || typeof u !== 'string' || u.startsWith('data:') || u.startsWith('javascript:') || u.startsWith('#') || u.includes('/api/proxy')) return u;
        try {
            let f = u.startsWith('http') ? u : (u.startsWith('//') ? 'https:' + u : (u.startsWith('/') ? T_O + u : B_P + u));
            return P_B + encodeURIComponent(f);
        } catch(e) { return u; }
    };

    // 1. Safer Spoofing
    try { if (!document.domain.includes(T_H)) Object.defineProperty(document, 'domain', { get: () => T_H, configurable: true }); } catch(e) {}

    // 2. Service Worker & Beacon Neuter
    try {
        if (navigator.serviceWorker) {
            Object.defineProperty(navigator, 'serviceWorker', { get: () => ({ register: () => new Promise(() => {}), getRegistrations: () => Promise.resolve([]) }), configurable: true });
        }
        navigator.sendBeacon = () => true;
    } catch(e) {}

    // 3. Robust API Interception
    const oF = window.fetch; 
    window.fetch = function(u, o) {
        if (typeof u === 'string') u = pU(u);
        else if (u && u.url) u = new Request(pU(u.url), u);
        return oF.call(window, u, o);
    };
    const oO = XMLHttpRequest.prototype.open; 
    XMLHttpRequest.prototype.open = function(m, u, ...a) { return oO.call(this, m, pU(u), ...a); };

    // 4. Property Interceptor
    const types = ['HTMLMediaElement', 'HTMLSourceElement', 'HTMLImageElement', 'HTMLScriptElement', 'HTMLLinkElement', 'HTMLAnchorElement', 'HTMLIFrameElement', 'HTMLEmbedElement', 'HTMLFormElement'];
    const pMap = { src: 1, href: 1, poster: 1, action: 1, 'data-src': 1, 'data-href': 1, 'data-url': 1, 'data-video': 1, 'data-stream': 1, 'data-file': 1 };
    types.forEach(cls => {
        if (!window[cls]) return;
        const proto = window[cls].prototype;
        Object.keys(pMap).forEach(prop => {
            const desc = Object.getOwnPropertyDescriptor(proto, prop);
            if (!desc || !desc.set || desc._px) return;
            const oSet = desc.set;
            const nSet = function(v) { 
                const nV = pU(v);
                if (this.getAttribute(prop) === nV) return; // Prevent redundant load
                return oSet.call(this, nV); 
            };
            nSet._px = 1;
            Object.defineProperty(proto, prop, {
                get: desc.get,
                set: nSet,
                configurable: true, enumerable: true
            });
        });
    });

    const oSA = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(n, v) { 
        const ln = n.toLowerCase();
        if(pMap[ln] || ln === 'data-src') {
            const nV = pU(v);
            if (this.getAttribute(n) === nV) return; // Prevent redundant load
            v = nV;
        }
        return oSA.call(this, n, v); 
    };

    const fixH = (m) => {
        const oM = history[m];
        history[m] = function() {
            if (arguments[2]) arguments[2] = pU(arguments[2]);
            return oM.apply(history, arguments);
        };
    };
    fixH('pushState'); fixH('replaceState');

    // 5. Intercept window.open
    const oW = window.open;
    window.open = function(u, n, ...a) { return oW.call(window, pU(u), n, ...a); };

    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
        if (n.nodeType === 1) {
            Object.keys(pMap).forEach(a => { if(n.hasAttribute(a)) n.setAttribute(a, n.getAttribute(a)); });
            if (n.querySelectorAll) n.querySelectorAll('[src],[href],[poster],[action]').forEach(el => {
                Object.keys(pMap).forEach(a => { if(el.hasAttribute(a)) el.setAttribute(a, el.getAttribute(a)); });
            });
        }
    }))).observe(document.documentElement, {childList: true, subtree: true});
})();
</script>`;
        html = stealthScript + html;
        delete respHeaders['content-length'];
        respHeaders['X-Frame-Options'] = 'ALLOWALL';
        respHeaders['Content-Security-Policy'] = '';
        return new Response(html, { status: upstream.status, headers: respHeaders });
    }

    if (contentType.includes('text/css')) {
        let css = await upstream.text();
        css = css.replace(/url\(["']?([^"')]+)["']?\)/gi, (m, u) => 'url("' + pU(u.trim()) + '")');
        delete respHeaders['content-length'];
        return new Response(css, { status: upstream.status, headers: respHeaders });
    }

    if (contentType.includes('javascript')) {
        let js = await upstream.text();
        js = js.replace(/["'](https?:\/\/[^"']+|\/\/[^"']+)["']/gi, (m, u) => u.includes('/api/proxy') ? m : '"' + pU(u) + '"');
        delete respHeaders['content-length'];
        return new Response(js, { status: upstream.status, headers: respHeaders });
    }

    if (contentType.includes('json')) {
        let json = await upstream.text();
        json = json.replace(/["'](https?:\/\/[^"']+|\/\/[^"']+)["']/gi, (m, u) => u.includes('/api/proxy') ? m : '"' + pU(u) + '"');
        delete respHeaders['content-length'];
        return new Response(json, { status: upstream.status, headers: respHeaders });
    }

    return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
}
