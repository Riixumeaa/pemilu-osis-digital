// api/stations.js — Multi-Station Session Controller Endpoint
import { getSupabaseAdmin } from '../lib/supabase.js';

export default async function handler(req, res) {
  const { action, stationId } = req.query;
  const targetStation = stationId || (req.body && req.body.stationId) || 'STATION-01';
  const supabase = getSupabaseAdmin();

  try {
    // 1. Get current active session for station (Session recovery on browser refresh)
    if (action === 'get' || !action) {
      const { data: sessions, error } = await supabase
        .from('sessions')
        .select('session_id, station_id, status, created_at, voted_at')
        .eq('station_id', targetStation)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      const latest = sessions && sessions.length > 0 ? sessions[0] : null;
      return res.status(200).json({
        success: true,
        stationId: targetStation,
        sessionId: latest ? latest.session_id : null,
        status: latest ? latest.status : 'WAITING'
      });
    }

    // 2. Panitia creates new session for station ("PESERTA BERIKUTNYA")
    if (action === 'next' || action === 'register' || action === 'create') {
      const { data: newSession, error } = await supabase
        .from('sessions')
        .insert({
          station_id: targetStation,
          status: 'ACTIVE'
        })
        .select('session_id, station_id, status')
        .single();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        stationId: targetStation,
        sessionId: newSession.session_id,
        status: 'ACTIVE',
        message: `${targetStation} siap untuk peserta berikutnya!`
      });
    }

    // 3. Reset all station sessions
    if (action === 'resetAll') {
      await supabase.from('sessions').delete().neq('station_id', 'NON_EXISTENT');
      return res.status(200).json({ success: true, message: 'Semua sesi station telah di-reset!' });
    }

    return res.status(400).json({ success: false, message: 'Action tidak valid.' });
  } catch (err) {
    console.error('Stations API Error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
}
