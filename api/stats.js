// api/stats.js — Aggregated Statistics API Endpoint (Low Egress!)
import { getSupabaseAdmin } from '../lib/supabase.js';

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();

  try {
    // 1. Fetch Candidates List
    const { data: candidates, error: candError } = await supabase
      .from('candidates')
      .select('id, number, chairman, vice')
      .order('number', { ascending: true });

    if (candError) throw candError;

    // 2. Aggregate Votes per Candidate (No SELECT * FROM votes!)
    const { data: votesData, error: voteError } = await supabase
      .from('votes')
      .select('candidate_id');

    if (voteError) throw voteError;

    const totalVotes = votesData ? votesData.length : 0;
    const counts = {};

    (candidates || []).forEach(c => { counts[c.id] = 0; });
    (votesData || []).forEach(v => {
      if (counts[v.candidate_id] !== undefined) {
        counts[v.candidate_id]++;
      }
    });

    const breakdown = (candidates || []).map(c => {
      const count = counts[c.id] || 0;
      const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 1000) / 10 : 0;
      return {
        id: c.id,
        number: c.number,
        chairman: c.chairman,
        vice: c.vice,
        votes: count,
        percentage: pct
      };
    });

    // 3. Fetch Election Settings & Station Statuses
    const { data: settings } = await supabase.from('settings').select('key, value');
    const settingsMap = {};
    (settings || []).forEach(s => { settingsMap[s.key] = s.value; });

    // Fetch latest sessions per station
    const { data: sessions } = await supabase
      .from('sessions')
      .select('session_id, station_id, status, created_at, voted_at')
      .order('created_at', { ascending: false });

    const stationMap = {};
    (sessions || []).forEach(s => {
      if (!stationMap[s.station_id]) {
        stationMap[s.station_id] = {
          sessionId: s.session_id,
          stationId: s.station_id,
          status: s.status,
          createdAt: s.created_at,
          votedAt: s.voted_at
        };
      }
    });

    const stations = Object.keys(stationMap).sort().map(k => stationMap[k]);

    return res.status(200).json({
      success: true,
      totalVotes: totalVotes,
      breakdown: breakdown,
      electionStatus: settingsMap['STATUS'] || 'NOT_STARTED',
      title: settingsMap['TITLE'] || 'PEMILU OSIS DIGITAL',
      candidateVersion: settingsMap['CANDIDATE_VERSION'] || '1',
      stations: stations
    });
  } catch (err) {
    console.error('Stats API Error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
}
