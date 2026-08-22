// api/vote.js — Low-Egress Submit Vote API Endpoint
import { getSupabaseAdmin } from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const { sessionId, stationId, candidateId } = req.body || {};

  if (!sessionId || !candidateId) {
    return res.status(400).json({ success: false, message: 'sessionId dan candidateId wajib diisi.' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Execute atomic RPC function submit_vote in PostgreSQL
    const { data, error } = await supabase.rpc('submit_vote', {
      p_session_id: sessionId,
      p_station_id: stationId || 'STATION-01',
      p_candidate_id: candidateId
    });

    if (error) {
      console.error('Supabase RPC Vote Error:', error);
      return res.status(500).json({ success: false, message: 'Gagal mencatat suara: ' + error.message });
    }

    // Return minimal response payload (low egress!)
    return res.status(200).json(data);
  } catch (err) {
    console.error('Vote Handler Exception:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server vote error' });
  }
}
