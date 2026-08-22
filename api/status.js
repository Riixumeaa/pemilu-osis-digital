// api/status.js — Election Status + Vote Weight Config Controller
import { getSupabaseAdmin } from '../lib/supabase.js';

async function verifyAdmin(token, supabase) {
  if (!token) return false;
  const { data } = await supabase.from('settings').select('value').eq('key', 'admin_token_' + token).single();
  return data && new Date(data.value) >= new Date();
}

async function setSetting(key, value, supabase) {
  await supabase.from('settings').upsert({ key, value: String(value), updated_at: new Date().toISOString() });
}

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();

  // GET — Public election status + vote config
  if (req.method === 'GET') {
    const { data: rows } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['STATUS', 'TITLE', 'START_TIME', 'END_TIME', 'CANDIDATE_VERSION', 'votes_peserta', 'votes_panitia', 'votes_guru']);
    const m = {};
    (rows || []).forEach(r => { m[r.key] = r.value; });

    let status = m['STATUS'] || 'NOT_STARTED';
    const startTime = m['START_TIME'] || '';
    const endTime = m['END_TIME'] || '';

    if (status === 'SCHEDULED' && startTime && endTime) {
      const now = Date.now();
      const st = new Date(startTime).getTime();
      const et = new Date(endTime).getTime();
      if (now >= st && now < et) {
        status = 'RUNNING'; await setSetting('STATUS', status, supabase);
      } else if (now >= et) {
        status = 'FINISHED'; await setSetting('STATUS', status, supabase);
      }
    }

    return res.status(200).json({
      success: true, status,
      title: m['TITLE'] || 'PEMILU OSIS DIGITAL',
      startTime, endTime,
      candidateVersion: m['CANDIDATE_VERSION'] || '1',
      voteConfig: {
        peserta: parseInt(m['votes_peserta'] || '1'),
        panitia: parseInt(m['votes_panitia'] || '1'),
        guru: parseInt(m['votes_guru'] || '1')
      }
    });
  }

  // POST — Admin mutations
  if (req.method === 'POST') {
    const body = req.body || {};
    const { action, token } = body;
    const ok = await verifyAdmin(token, supabase);
    if (!ok) return res.status(401).json({ success: false, message: 'Sesi admin tidak valid.' });

    if (action === 'setStatus') {
      const { value } = body;
      await setSetting('STATUS', value, supabase);

      if (value === 'RUNNING') {
        // Auto-create ACTIVE sessions for 3 default stations if none
        const defaultStations = ['STATION-01', 'STATION-02', 'STATION-03'];
        const multP = parseInt((await supabase.from('settings').select('value').eq('key', 'votes_peserta').single()).data?.value || '1');
        for (const st of defaultStations) {
          const { data: ex } = await supabase.from('sessions').select('*').eq('station_id', st).eq('status', 'ACTIVE').limit(1);
          if (!ex || ex.length === 0) {
            await supabase.from('sessions').insert({ station_id: st, status: 'WAITING', role: 'peserta', vote_multiplier: multP });
          }
        }
      }
      return res.status(200).json({ success: true, message: 'Status diperbarui: ' + value });
    }

    if (action === 'setTitle') {
      await setSetting('TITLE', body.title, supabase);
      return res.status(200).json({ success: true, message: 'Judul disimpan!' });
    }

    if (action === 'schedule') {
      const { startTime, endTime } = body;
      if (!startTime || !endTime) return res.status(400).json({ success: false, message: 'startTime dan endTime wajib diisi.' });
      await setSetting('START_TIME', startTime, supabase);
      await setSetting('END_TIME', endTime, supabase);
      await setSetting('STATUS', 'SCHEDULED', supabase);
      return res.status(200).json({ success: true, message: 'Jadwal disimpan!' });
    }

    if (action === 'setVoteConfig') {
      const { peserta, panitia, guru } = body;
      if (peserta !== undefined) await setSetting('votes_peserta', parseInt(peserta) || 1, supabase);
      if (panitia !== undefined) await setSetting('votes_panitia', parseInt(panitia) || 1, supabase);
      if (guru !== undefined) await setSetting('votes_guru', parseInt(guru) || 1, supabase);
      return res.status(200).json({ success: true, message: 'Konfigurasi suara disimpan!' });
    }

    if (action === 'resetAll') {
      await supabase.from('votes').delete().neq('station_id', 'NON_EXISTENT');
      await supabase.from('sessions').delete().neq('station_id', 'NON_EXISTENT');
      await supabase.from('auth_requests').delete().neq('station_id', 'NON_EXISTENT');
      await setSetting('STATUS', 'NOT_STARTED', supabase);
      return res.status(200).json({ success: true, message: 'Pemilu berhasil di-reset!' });
    }

    return res.status(400).json({ success: false, message: 'Action tidak dikenal.' });
  }

  return res.status(405).json({ success: false, message: 'Method Not Allowed' });
}
