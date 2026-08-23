// api/stats.js — Aggregated Statistics with vote_weight SUM (Low Egress)
import { getSupabaseAdmin } from '../lib/supabase.js';

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();
  try {
    // Candidates list
    const { data: candidates, error: candError } = await supabase
      .from('candidates')
      .select('id, number, chairman, vice')
      .order('number', { ascending: true });
    if (candError) throw candError;

    // Votes — only fetch candidate_id and vote_weight (minimal egress!)
    const { data: votes, error: voteError } = await supabase
      .from('votes')
      .select('candidate_id, vote_weight');
    if (voteError) throw voteError;

    // Aggregate: SUM vote_weight per candidate
    const weightMap = {};
    (candidates || []).forEach(c => { weightMap[c.id] = 0; });
    let totalVoteWeight = 0;

    (votes || []).forEach(v => {
      const w = parseInt(v.vote_weight) || 1;
      if (weightMap[v.candidate_id] !== undefined) {
        weightMap[v.candidate_id] += w;
        totalVoteWeight += w;
      }
    });

    const totalVotesRaw = votes?.length || 0; // actual vote rows

    const breakdown = (candidates || []).map(c => {
      const count = weightMap[c.id] || 0;
      const pct = totalVoteWeight > 0 ? Math.round((count / totalVoteWeight) * 1000) / 10 : 0;
      return { id: c.id, number: c.number, chairman: c.chairman, vice: c.vice, votes: count, percentage: pct };
    });

    // Settings + stations
    const { data: settings } = await supabase.from('settings').select('key, value');
    const settingsMap = {};
    (settings || []).forEach(s => { settingsMap[s.key] = s.value; });

    // Only fetch non-COMPLETED sessions (latest per station)
    const { data: sessions } = await supabase
      .from('sessions')
      .select('session_id, station_id, status, role, vote_multiplier, created_at')
      .order('created_at', { ascending: false });

    const stationMap = {};
    (sessions || []).forEach(s => {
      if (!stationMap[s.station_id]) {
        stationMap[s.station_id] = {
          sessionId: s.session_id,
          stationId: s.station_id,
          status: s.status,
          role: s.role || 'peserta',
          voteMultiplier: s.vote_multiplier || 1
        };
      }
    });

    // Filter out stations whose latest session is COMPLETED
    const activeStations = Object.values(stationMap)
      .filter(s => s.status !== 'COMPLETED')
      .sort((a, b) => a.stationId.localeCompare(b.stationId));

    return res.status(200).json({
      success: true,
      totalVotes: totalVoteWeight,
      totalVotesRaw,
      breakdown,
      electionStatus: settingsMap['STATUS'] || 'NOT_STARTED',
      title: settingsMap['TITLE'] || 'PEMILU OSIS DIGITAL',
      startTime: settingsMap['START_TIME'] || '',
      endTime: settingsMap['END_TIME'] || '',
      candidateVersion: settingsMap['CANDIDATE_VERSION'] || '1',
      voteConfig: {
        peserta: parseInt(settingsMap['votes_peserta'] || '1'),
        panitia: parseInt(settingsMap['votes_panitia'] || '1'),
        guru: parseInt(settingsMap['votes_guru'] || '1')
      },
      stations: activeStations
    });
  } catch (err) {
    console.error('Stats API Error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
}
