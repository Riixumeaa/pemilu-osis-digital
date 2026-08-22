// api/stations.js — Multi-Station Session & Auth Request Controller
import { getSupabaseAdmin } from '../lib/supabase.js';
import { randomUUID } from 'crypto';

async function getVoteMultiplier(role, supabase) {
  const key = `votes_${role || 'peserta'}`;
  const { data } = await supabase.from('settings').select('value').eq('key', key).single();
  return parseInt(data?.value || '1') || 1;
}

async function insertSession(supabase, payload) {
  const uuid = randomUUID();

  // Attempt 1: try with session_id
  let res = await supabase.from('sessions')
    .insert({ ...payload, session_id: uuid })
    .select('*');

  if (!res.error && res.data?.[0]) return res;

  // Attempt 2: try with id
  res = await supabase.from('sessions')
    .insert({ ...payload, id: uuid })
    .select('*');

  if (!res.error && res.data?.[0]) return res;

  // Attempt 3: try with both session_id and id
  res = await supabase.from('sessions')
    .insert({ ...payload, session_id: uuid, id: uuid })
    .select('*');

  return res;
}

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();
  const action = req.query.action || (req.body && req.body.action) || 'get';
  const stationId = req.query.stationId || (req.body && req.body.stationId) || 'STATION-01';

  try {
    // GET: current session for this station
    if (action === 'get') {
      const { data: sessions } = await supabase
        .from('sessions')
        .select('*')
        .eq('station_id', stationId)
        .order('created_at', { ascending: false })
        .limit(1);

      const latest = sessions?.[0] || null;
      return res.status(200).json({
        success: true,
        stationId,
        sessionId: latest ? (latest.session_id || latest.id) : null,
        status: latest?.status || 'WAITING',
        role: latest?.role || 'peserta',
        voteMultiplier: latest?.vote_multiplier || 1
      });
    }

    // POST action: request_auth — station requests panitia authentication
    if (action === 'request_auth') {
      // Cancel any previous PENDING requests for this station
      await supabase.from('auth_requests')
        .update({ status: 'REJECTED', updated_at: new Date().toISOString() })
        .eq('station_id', stationId).eq('status', 'PENDING');

      const { data: req_rows, error } = await supabase.from('auth_requests')
        .insert({ station_id: stationId, status: 'PENDING', role: 'peserta' })
        .select('id, station_id, status, role');

      if (error || !req_rows?.[0]) {
        console.error('Auth request insert error:', error);
        return res.status(500).json({ success: false, message: error?.message || 'Gagal membuat permintaan autentikasi.' });
      }

      return res.status(200).json({ success: true, requestId: req_rows[0].id, stationId, message: 'Permintaan autentikasi dikirim.' });
    }

    // GET: all pending auth requests (for dashboard)
    if (action === 'get_auth_requests') {
      const { data: requests } = await supabase
        .from('auth_requests')
        .select('id, station_id, status, role, created_at')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: true });
      return res.status(200).json({ success: true, requests: requests || [] });
    }

    // POST: approve_auth — panitia approves a request with a role
    if (action === 'approve_auth') {
      const { requestId, role } = req.body || {};
      if (!requestId) return res.status(400).json({ success: false, message: 'requestId required' });

      const { data: authReqs, error: fetchErr } = await supabase
        .from('auth_requests').select('station_id').eq('id', requestId);

      if (fetchErr || !authReqs?.[0]) {
        console.error('Auth request fetch error:', fetchErr);
        return res.status(404).json({ success: false, message: 'Permintaan autentikasi tidak ditemukan.' });
      }

      const targetStation = authReqs[0].station_id;
      const approvedRole = role || 'peserta';
      const multiplier = await getVoteMultiplier(approvedRole, supabase);

      // Mark auth request approved
      await supabase.from('auth_requests')
        .update({ status: 'APPROVED', role: approvedRole, updated_at: new Date().toISOString() })
        .eq('id', requestId);

      // Create an ACTIVE session for the station using adaptive helper
      const { data: newSessions, error: sessErr } = await insertSession(supabase, {
        station_id: targetStation, status: 'ACTIVE', role: approvedRole, vote_multiplier: multiplier
      });

      if (sessErr || !newSessions?.[0]) {
        console.error('Session insert error during approve:', sessErr);
        return res.status(500).json({ success: false, message: sessErr?.message || 'Gagal membuat sesi voting baru untuk station ini.' });
      }

      const newSession = newSessions[0];
      const actualSessionId = newSession.session_id || newSession.id;

      return res.status(200).json({
        success: true,
        stationId: targetStation,
        sessionId: actualSessionId,
        role: approvedRole,
        voteMultiplier: multiplier,
        message: `${targetStation} disetujui sebagai ${approvedRole}`
      });
    }

    // POST: reject_auth — panitia rejects/disconnects
    if (action === 'reject_auth') {
      const { requestId } = req.body || {};
      await supabase.from('auth_requests')
        .update({ status: 'REJECTED', updated_at: new Date().toISOString() })
        .eq('id', requestId);
      return res.status(200).json({ success: true, message: 'Permintaan ditolak.' });
    }

    // POST: disconnect — panitia disconnects a station (marks any active session COMPLETED)
    if (action === 'disconnect') {
      await supabase.from('sessions')
        .update({ status: 'COMPLETED' })
        .eq('station_id', stationId).eq('status', 'ACTIVE');
      await supabase.from('auth_requests')
        .update({ status: 'REJECTED', updated_at: new Date().toISOString() })
        .eq('station_id', stationId).eq('status', 'PENDING');
      return res.status(200).json({ success: true, message: `${stationId} telah di-disconnect.` });
    }

    // POST: next — "Peserta berikutnya" — after VOTED, create new ACTIVE session with same role
    if (action === 'next' || action === 'create') {
      const { role } = req.body || {};
      const targetRole = role || 'peserta';
      const multiplier = await getVoteMultiplier(targetRole, supabase);

      const { data: newSessions, error: sessErr } = await insertSession(supabase, {
        station_id: stationId, status: 'ACTIVE', role: targetRole, vote_multiplier: multiplier
      });

      if (sessErr || !newSessions?.[0]) {
        console.error('Session insert error during next:', sessErr);
        return res.status(500).json({ success: false, message: sessErr?.message || 'Gagal membuat sesi voting baru.' });
      }

      const newSession = newSessions[0];
      const actualSessionId = newSession.session_id || newSession.id;

      return res.status(200).json({
        success: true,
        stationId,
        sessionId: actualSessionId,
        role: targetRole,
        voteMultiplier: multiplier,
        message: `${stationId} siap untuk peserta berikutnya!`
      });
    }

    // POST: change_role — Change all or specific station sessions to a new role
    if (action === 'change_role') {
      const { role, targetStations } = req.body || {};
      const targetRole = role || 'peserta';
      const multiplier = await getVoteMultiplier(targetRole, supabase);
      const stations = targetStations?.length ? targetStations : ['STATION-01', 'STATION-02', 'STATION-03'];

      for (const st of stations) {
        // Terminate current active session
        await supabase.from('sessions').update({ status: 'COMPLETED' }).eq('station_id', st).eq('status', 'ACTIVE');
        // Create new active session with new role
        await insertSession(supabase, { station_id: st, status: 'ACTIVE', role: targetRole, vote_multiplier: multiplier });
      }
      return res.status(200).json({ success: true, message: `Semua station diubah ke sesi: ${targetRole}` });
    }

    // POST: resetAll
    if (action === 'resetAll') {
      await supabase.from('sessions').delete().neq('station_id', 'NON_EXISTENT');
      await supabase.from('auth_requests').delete().neq('station_id', 'NON_EXISTENT');
      return res.status(200).json({ success: true, message: 'Semua sesi station di-reset.' });
    }

    // GET: all station statuses (for dashboard)
    if (action === 'all') {
      const { data: sessions } = await supabase
        .from('sessions')
        .select('session_id, station_id, status, role, vote_multiplier, created_at, voted_at')
        .order('created_at', { ascending: false });

      const stationMap = {};
      (sessions || []).forEach(s => {
        if (!stationMap[s.station_id]) stationMap[s.station_id] = s;
      });

      return res.status(200).json({ success: true, stations: Object.values(stationMap).sort((a, b) => a.station_id.localeCompare(b.station_id)) });
    }

    return res.status(400).json({ success: false, message: 'Action tidak valid.' });
  } catch (err) {
    console.error('Stations API Error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
}
