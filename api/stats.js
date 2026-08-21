const { getSupabase } = require('../lib/supabase');

function getParams(req) {
  try {
    const u = new URL(req.url, 'http://localhost');
    const p = {};
    u.searchParams.forEach((v, k) => { p[k] = v; });
    return Object.assign({}, p, req.query || {});
  } catch(e) {
    return req.query || {};
  }
}

module.exports = async (req, res) => {
  const supabase = getSupabase();
  const query = getParams(req);
  const type = query.type;

  let candidates = [
    { id: '1', number: 1, chairman: 'Calon Ketua 1', vice: 'Calon Wakil 1' },
    { id: '2', number: 2, chairman: 'Calon Ketua 2', vice: 'Calon Wakil 2' }
  ];
  let votes = [];
  let stations = [];
  let electionStatus = 'RUNNING';
  let electionTitle = process.env.ELECTION_TITLE || 'PEMILU OSIS DIGITAL';
  let startTime = '';
  let endTime = '';

  if (supabase) {
    const [candsRes, votesRes, stationsRes, settingsRes] = await Promise.all([
      supabase.from('candidates').select('*').order('number', { ascending: true }),
      supabase.from('votes').select('*'),
      supabase.from('sessions').select('*'),
      supabase.from('settings').select('*')
    ]);

    if (candsRes.data) {
      candidates = candsRes.data.map(c => ({
        id: c.id,
        number: c.number,
        chairman: c.chairman,
        vice: c.vice
      }));
    }
    if (votesRes.data) votes = votesRes.data;
    if (stationsRes.data) {
      stations = stationsRes.data.map(s => ({
        stationId: s.station_id,
        status: s.status,
        updatedAt: s.updated_at
      }));
    }
    if (settingsRes.data) {
      const st = settingsRes.data.find(s => s.key === 'ELECTION_STATUS');
      const tt = settingsRes.data.find(s => s.key === 'ELECTION_TITLE');
      const stt = settingsRes.data.find(s => s.key === 'START_TIME');
      const et = settingsRes.data.find(s => s.key === 'END_TIME');
      if (st) electionStatus = st.value;
      if (tt) electionTitle = tt.value;
      if (stt) startTime = stt.value;
      if (et) endTime = et.value;
    }
  }

  const counts = {};
  let totalVotes = votes.length;
  candidates.forEach(c => { counts[c.id] = 0; });

  votes.forEach(v => {
    const cid = String(v.candidate_id);
    if (counts[cid] !== undefined) counts[cid]++;
  });

  const breakdown = candidates.map(cand => {
    const count = counts[cand.id] || 0;
    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 1000) / 10 : 0;
    return {
      id: cand.id,
      number: cand.number,
      chairman: cand.chairman,
      vice: cand.vice,
      votes: count,
      percentage: pct
    };
  });

  if (type === 'admin') {
    return res.status(200).json({
      success: true,
      totalVotes,
      totalSessions: stations.length,
      totalCandidates: candidates.length,
      electionStatus,
      title: electionTitle,
      startTime,
      endTime
    });
  }

  if (type === 'logs') {
    let logs = [
      { timestamp: new Date().toISOString(), type: 'SYSTEM', message: 'Sistem Vercel & Supabase berjalan', data: '' }
    ];
    if (supabase) {
      const { data } = await supabase.from('logs').select('*').order('timestamp', { ascending: false }).limit(100);
      if (data && data.length) {
        logs = data.map(l => ({ timestamp: l.timestamp, type: l.type, message: l.message, data: l.data }));
      }
    }
    return res.status(200).json({ success: true, logs });
  }

  return res.status(200).json({
    success: true,
    totalVotes,
    breakdown,
    electionStatus,
    title: electionTitle,
    stations
  });
};

