// api/status.js — Election Status Controller
import { getSupabaseAdmin } from '../lib/supabase.js';

async function verifyAdmin(token, supabase) {
  if (!token) return false;
  const { data } = await supabase.from('settings').select('value').eq('key', 'admin_token_' + token).single();
  return data && new Date(data.value) >= new Date();
}

async function setSetting(key, value, supabase) {
  await supabase.from('settings').upsert({ key, value, updated_at: new Date().toISOString() });
}

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();

  // GET — public election status
  if (req.method === 'GET') {
    const { data: rows } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['STATUS', 'TITLE', 'START_TIME', 'END_TIME', 'CANDIDATE_VERSION']);
    const m = {};
    (rows || []).forEach(r => { m[r.key] = r.value; });

    let status = m['STATUS'] || 'NOT_STARTED';
    const startTime = m['START_TIME'] || '';
    const endTime = m['END_TIME'] || '';
    // Auto-start / auto-end based on schedule
    if (status === 'SCHEDULED' && startTime && endTime) {
      const now = Date.now();
      if (now >= new Date(startTime).getTime() && now < new Date(endTime).getTime()) {
        status = 'RUNNING';
        await setSetting('STATUS', status, supabase);
      } else if (now >= new Date(endTime).getTime()) {
        status = 'FINISHED';
        await setSetting('STATUS', status, supabase);
      }
    }

    return res.status(200).json({
      success: true,
      status,
      title: m['TITLE'] || 'PEMILU OSIS DIGITAL',
      startTime,
      endTime,
      candidateVersion: m['CANDIDATE_VERSION'] || '1'
    });
  }

  // POST — admin mutations
  if (req.method === 'POST') {
    const { action, token, title, startTime, endTime, value } = req.body || {};
    const ok = await verifyAdmin(token, supabase);
    if (!ok) return res.status(401).json({ success: false, message: 'Sesi admin tidak valid.' });

    if (action === 'setStatus') {
      await setSetting('STATUS', value, supabase);
      return res.status(200).json({ success: true, message: 'Status diperbarui: ' + value });
    }
    if (action === 'setTitle') {
      await setSetting('TITLE', title, supabase);
      return res.status(200).json({ success: true, message: 'Judul disimpan!' });
    }
    if (action === 'schedule') {
      await setSetting('START_TIME', startTime, supabase);
      await setSetting('END_TIME', endTime, supabase);
      await setSetting('STATUS', 'SCHEDULED', supabase);
      return res.status(200).json({ success: true, message: 'Jadwal disimpan!' });
    }
    if (action === 'resetAll') {
      // Delete votes and sessions
      await supabase.from('votes').delete().gt('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('sessions').delete().gt('session_id', '00000000-0000-0000-0000-000000000000');
      await setSetting('STATUS', 'NOT_STARTED', supabase);
      return res.status(200).json({ success: true, message: 'Pemilu berhasil di-reset!' });
    }
    return res.status(400).json({ success: false, message: 'Action tidak dikenal.' });
  }

  return res.status(405).json({ success: false, message: 'Method Not Allowed' });
}
