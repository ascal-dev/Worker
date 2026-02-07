/**
 * Cloudflare Cookie Extractor
 * 
 * This script opens a visible browser window to mydesi.click.
 * You manually solve the Cloudflare Turnstile challenge.
 * Once solved, it extracts the cf_clearance cookie and saves it.
 */

const { chromium } = require('playwright');
const fs = require('fs');

const TARGET_URL = 'https://mydesi.click/';
const COOKIE_FILE = 'cf_cookie.txt';

async function getCookie() {
    console.log('🚀 Launching browser (non-headless)...');
    
    const browser = await chromium.launch({ 
        headless: false,  // Visible browser!
        slowMo: 100       // Slow down for human interaction
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();
    
    console.log(`📄 Navigating to ${TARGET_URL}...`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👆 MANUAL ACTION REQUIRED:');
    console.log('   1. Solve the Cloudflare challenge in the browser.');
    console.log('   2. Wait for the page to fully load.');
    console.log('   3. Press ENTER here once done.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    
    // Wait for user input
    await new Promise(resolve => {
        process.stdin.once('data', resolve);
    });
    
    console.log('🔍 Extracting cookies...');
    const cookies = await context.cookies();
    const cfCookie = cookies.find(c => c.name === 'cf_clearance');
    
    if (cfCookie) {
        const cookieValue = cfCookie.value;
        fs.writeFileSync(COOKIE_FILE, cookieValue);
        console.log(`✅ Cookie saved to ${COOKIE_FILE}`);
        console.log('');
        console.log('Cookie value:');
        console.log(cookieValue);
        console.log('');
        console.log('You can now run the scraper with this cookie!');
    } else {
        console.log('❌ cf_clearance cookie not found. Did you solve the challenge?');
    }
    
    await browser.close();
}

getCookie().catch(console.error);
