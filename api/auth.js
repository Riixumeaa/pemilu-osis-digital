// api/auth.js — Admin Authentication (Server-side only, no password to frontend)
import { getSupabaseAdmin } from '../lib/supabase.js';
import crypto from 'crypto';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'siriyadh2026';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();

  // POST /api/auth — Login
  if (req.method === 'POST') {
    const { password } = req.body || {};
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, message: 'Password salah.' });
    }
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    // Store token in Supabase settings as a simple key (fast, single-row read)
    await supabase.from('settings').upsert({ key: 'admin_token_' + token, value: expiresAt });
    return res.status(200).json({ success: true, token });
  }

  // GET /api/auth?action=verify&token=xxx — Verify token
  if (req.method === 'GET' && req.query.action === 'verify') {
    const token = req.query.token || '';
    const { data } = await supabase.from('settings').select('value').eq('key', 'admin_token_' + token).single();
    if (!data || new Date(data.value) < new Date()) {
      return res.status(200).json({ valid: false });
    }
    return res.status(200).json({ valid: true });
  }

  // DELETE /api/auth?token=xxx — Logout
  if (req.method === 'DELETE') {
    const token = req.query.token || '';
    await supabase.from('settings').delete().eq('key', 'admin_token_' + token);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, message: 'Method Not Allowed' });
}
