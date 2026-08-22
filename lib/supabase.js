// lib/supabase.js — Server-Side Supabase Admin Client
import { createClient } from '@supabase/supabase-js';

let _adminClient = null;

export function getSupabaseAdmin() {
  if (!_adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY or URL not configured');
    _adminClient = createClient(url, key, {
      auth: { persistSession: false }
    });
  }
  return _adminClient;
}
