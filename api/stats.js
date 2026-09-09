// api/stats.js — Aggregated Statistics with vote_weight SUM (Low Egress)
import { getSupabaseAdmin } from '../lib/supabase.js';

function parsePingMs(lastPing) {
  if (!lastPing) return 0;
  let str = String(lastPing).trim();
  if (str === '1970-01-01T00:00:00Z' || str.startsWith('1970')) return 0;
  str = str.replace(' ', 'T');
  if (!str.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(str)) {
    str += 'Z';
  }
  const ms = new Date(str).getTime();
  return isNaN(ms) ? 0 : ms;
}

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
    const { data: settings } = await supabase.from('settings').select('key, value, updated_at');
    const settingsMap = {};
    const pingMap = {};
    (settings || []).forEach(s => {
      settingsMap[s.key] = s.value;
      if (s.key.startsWith('ping_')) {
        pingMap[s.key] = s;
      }
    });

    // Fetch sessions (latest per station)
    const { data: sessions } = await supabase
      .from('sessions')
      .select('session_id, station_id, status, role, vote_multiplier, created_at')
      .order('created_at', { ascending: false });

    const stationMap = {};
    const nowMs = Date.now();
    (sessions || []).forEach(s => {
      if (!stationMap[s.station_id]) {
        const pingObj = pingMap[`ping_${s.station_id}`];
        const lastPingMs = pingObj ? parsePingMs(pingObj.updated_at) : 0;
        const diffMs = Math.abs(nowMs - lastPingMs);
        const isOnline = pingObj?.value === 'ONLINE' && lastPingMs > 0 && diffMs < 15000;
        const displayStatus = (s.status === 'COMPLETED') ? 'WAITING' : s.status;
        stationMap[s.station_id] = {
          sessionId: s.session_id,
          stationId: s.station_id,
          status: displayStatus,
          role: s.role || 'peserta',
          voteMultiplier: s.vote_multiplier || 1,
          isOnline: isOnline
        };
      }
    });

    // Filter stations: only include stations that are ONLINE or have an ACTIVE/VOTED session (disconnected/offline stations vanish from Kontrol Bilik)
    const finalStations = Object.values(stationMap).filter(st => {
      if (st.isOnline) return true;
      if (st.status === 'ACTIVE' || st.status === 'VOTED') return true;
      return false;
    }).sort((a, b) => a.stationId.localeCompare(b.stationId));

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
      stations: finalStations
    });
  } catch (err) {
    console.error('Stats API Error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
}
