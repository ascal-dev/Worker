const fetch = require("node-fetch"); // node-fetch v2
const cheerio = require("cheerio");
const { createClient } = require("@supabase/supabase-js");

/* ============================
   SUPABASE SETUP
============================ */
const SUPABASE_URL = "https://ojcqoqegblymhmmimvqe.supabase.co";
const SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qY3FvcWVnYmx5bWhtbWltdnFlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTM0NDQyMywiZXhwIjoyMDg0OTIwNDIzfQ.E0DxiFfknL--AxQxkqTSjvNnmeJoizXPbFbw5miaU_Y";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY
);

console.log("✅ Supabase connected");

/* ============================
   HELPERS
============================ */
const clean = (text) =>
  text ? text.replace(/\s+/g, " ").trim() : null;

/* ============================
   BLOCKING CATEGORY FETCH
   (NO WAIT, INFINITE RETRY)
============================ */
const fetchCategoryHTMLBlocking = async (url) => {
  let attempt = 1;

  while (true) {
    try {
      console.log(`🌐 Fetching category (attempt ${attempt}): ${url}`);

      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
        timeout: 60000,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const html = await res.text();
      const $ = cheerio.load(html);

      const count = $(".main_page_category_music a").length;
      if (count > 0) {
        console.log(`✅ Category loaded (${count} items found)`);
        return html;
      }

      console.log("⚠️ Category HTML incomplete, retrying...");
    } catch (err) {
      console.log(`❌ Category fetch error: ${err.message}`);
    }

    attempt++;
  }
};

/* ============================
   FETCH SONG PAGE
============================ */
const fetchSongHTML = async (url) => {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
    timeout: 20000,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.text();
};

/* ============================
   SCRAPE ALBUM → SONG LINKS
============================ */
const scrapeAlbumSongs = async (albumUrl) => {
  console.log(`📀 Album: ${albumUrl}`);

  try {
    const res = await fetch(albumUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 30000,
    });

    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);

    const songLinks = [];

    $("a").each((_, el) => {
      const href = $(el).attr("href");
      if (href && href.includes("/songs/")) {
        songLinks.push(href);
      }
    });

    return [...new Set(songLinks)];
  } catch {
    return [];
  }
};

/* ============================
   SCRAPE SONG PAGE
============================ */
const scrapeSongPage = async (url, categoryId) => {
  try {
    console.log(`🎵 Song: ${url}`);

    const html = await fetchSongHTML(url);
    const $ = cheerio.load(html);

    /* ---------- TITLE ---------- */
    const h1Text = clean($("h1.main_page_category_div.up").text());
    if (!h1Text) return;

    let songName = null;
    let movieName = null;

    if (h1Text.includes(" Song - ")) {
      const parts = h1Text.split(" Song - ");
      songName = clean(parts[0]);
      movieName = clean(parts[1]);
    } else {
      songName = h1Text;
    }

    /* ---------- META ---------- */
    const extractAfterLabel = (label) => {
      const el = $(`b:contains('${label}')`);
      if (!el.length) return null;
      return clean(el[0].nextSibling?.nodeValue);
    };

    const singers = extractAfterLabel("Singer(s):");
    const leadStars = extractAfterLabel("Lead Star(s):");
    const composer = extractAfterLabel("Music Composer:");
    const releaseRaw = extractAfterLabel("Released On:");

    let releaseYear = null;
    if (releaseRaw) {
      const m = releaseRaw.match(/\b(19|20)\d{2}\b/);
      if (m) releaseYear = parseInt(m[0], 10);
    }

    const description = clean(
      $("p[align='center']").eq(1).text()
    );

    /* ---------- STRICT REAL POSTER ONLY ---------- */
    const posterImg = $("#main_page_middle left img").first();
    let coverImage = null;

    if (posterImg.length) {
      const dataSrc = posterImg.attr("data-src");
      const dataOriginal = posterImg.attr("data-original");
      const src = posterImg.attr("src");

      if (dataSrc && !dataSrc.includes("loading.svg")) {
        coverImage = dataSrc;
      } else if (
        dataOriginal &&
        !dataOriginal.includes("loading.svg")
      ) {
        coverImage = dataOriginal;
      } else if (
        src &&
        !src.includes("loading.svg")
      ) {
        coverImage = src;
      }
    }

    /* ---------- MEDIA ---------- */
    const streamUrl = $("audio").attr("src");
    const download128 = $("a:contains('128 KBPS')").attr("href");
    const download320 = $("a:contains('320 KBPS')").attr("href");

    /* ---------- DB UPSERT ---------- */
    const { error } = await supabase
      .from("songs")
      .upsert(
        {
          category_id: categoryId,
          song_name: songName,
          movie_name: movieName,
          post_url: url,
          singers,
          lead_stars: leadStars,
          music_composer: composer,
          release_date: releaseRaw
            ? new Date(releaseRaw)
            : null,
          release_year: releaseYear,
          description,
          cover_image: coverImage,
          stream_url: streamUrl,
          download_128: download128,
          download_320: download320,
        },
        {
          onConflict: "post_url",
          ignoreDuplicates: true,
        }
      );

    if (error) {
      console.log(`❌ DB error: ${error.message}`);
    } else {
      console.log(`✅ Saved: ${songName} (${releaseYear || "N/A"})`);
    }
  } catch (err) {
    console.log(`❌ Song scrape failed: ${err.message}`);
  }
};

/* ============================
   SCRAPE CATEGORY
============================ */
const scrapeCategory = async (category) => {
  console.log(`\n📂 CATEGORY: ${category.name}`);

  let page = 1;
  const seenSongs = new Set();
  const seenAlbums = new Set();

  while (true) {
    const pageUrl =
      page === 1
        ? category.source_url
        : `${category.source_url}/${page}`;

    console.log(`📄 Page ${page}`);

    const html = await fetchCategoryHTMLBlocking(pageUrl);
    const $ = cheerio.load(html);

    const newSongs = [];
    const newAlbums = [];

    $(".main_page_category_music a").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;

      if (
        (href.includes("/songs/") || href.includes("/song/")) &&
        !seenSongs.has(href)
      ) {
        seenSongs.add(href);
        newSongs.push(href);
      } else if (
        href.includes("/album/") &&
        !seenAlbums.has(href)
      ) {
        seenAlbums.add(href);
        newAlbums.push(href);
      }
    });

    console.log(
      `🎶 New songs: ${newSongs.length}, New albums: ${newAlbums.length}`
    );

    // ✅ STOP when nothing new is found
    if (newSongs.length === 0 && newAlbums.length === 0) {
      console.log("⛔ No new content — switching category");
      break;
    }

    for (const song of newSongs) {
      await scrapeSongPage(song, category.id);
    }

    for (const album of newAlbums) {
      const albumSongs = await scrapeAlbumSongs(album);
      for (const song of albumSongs) {
        await scrapeSongPage(song, category.id);
      }
    }

    page++;
  }
};


/* ============================
   MAIN
============================ */
const CATEGORY_START = 5; // start index (1-based)
const CATEGORY_END = 5;   // end index (inclusive)

const main = async () => {
  console.log("🚀 Scraper started");

  const { data: categories, error } = await supabase
    .from("categories")
    .select("*")
    .order("id", { ascending: true });

  if (error || !categories || categories.length === 0) {
    console.log("❌ No categories found");
    return;
  }

  console.log(`📂 Total categories: ${categories.length}`);

  const startIndex = CATEGORY_START - 1;
  const endIndex = Math.min(CATEGORY_END, categories.length);

  console.log(
    `🎯 Scraping categories ${CATEGORY_START} → ${endIndex}`
  );

  for (let i = startIndex; i < endIndex; i++) {
    const category = categories[i];
    console.log(
      `\n🚀 CATEGORY ${i + 1}/${categories.length}: ${category.name}`
    );
    await scrapeCategory(category);
  }

  console.log("\n✅ Scraping completed successfully");
};

main();