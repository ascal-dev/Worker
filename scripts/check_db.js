
const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://jdrheygmqtnohloykrxs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkcmhleWdtcXRub2hsb3lrcnhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU3OTk5OSwiZXhwIjoyMDg0MTU1OTk5fQ.PYO5Dl0Of8tiOBm7cbrqGUMklXh9jAj7OMridBdN8K8';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
    console.log("Checking for tables...");
    const { error: err1 } = await supabase.from('xnxxvideos').select('id').limit(1);
    if (err1) console.error("❌ xnxxvideos table missing or error:", err1.message);
    else console.log("✅ xnxxvideos table found!");

    const { error: err2 } = await supabase.from('sync_logs').select('id').limit(1);
    if (err2) console.error("❌ sync_logs table missing or error:", err2.message);
    else console.log("✅ sync_logs table found!");
}
check();
