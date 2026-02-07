
import { createClient } from '@supabase/supabase-js';

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    const { id, stream_url, img } = body;

    if (!id || !stream_url) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check Env Vars
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase Environment Variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
    }

    // Initialize Supabase client
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // Update the record
    const { data, error } = await supabase
      .from('xnxxvideos')
      .update({ 
        stream_url: stream_url,
        img: img, // Update image as well if provided (user logic: fix img based on stream)
        post_date_raw: new Date().toISOString() // Optional: touch the record
      })
      .eq('id', id)
      .select();

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
