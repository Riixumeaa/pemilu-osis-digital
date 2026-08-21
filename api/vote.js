const { getSupabase } = require('../lib/supabase');
const { appendVoteToSheet, updateStationSessionSheet } = require('../lib/googleSheets');

// In-memory fallback
const localVotes = [];
const localSessions = new Map();

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { stationId, candidateId } = req.body || {};
  if (!candidateId) {
    return res.status(400).json({ success: false, message: 'Kandidat belum dipilih.' });
  }

  const st = stationId || 'Station 1';
  const supabase = getSupabase();
  const voteId = crypto.randomUUID();
  const now = new Date().toISOString();

  if (supabase) {
    // 1. Record Vote in Supabase
    await supabase.from('votes').insert([{
      id: voteId,
      candidate_id: String(candidateId),
      station_id: st,
      session_token: 'NO_TOKEN',
      voted_at: now
    }]);

    // 2. Mark Station Status as VOTED in Supabase (triggers WebSocket event < 10ms!)
    await supabase.from('sessions').upsert({
      station_id: st,
      status: 'VOTED',
      updated_at: now
    });
  } else {
    localVotes.push({ id: voteId, candidateId: String(candidateId), stationId: st, votedAt: now });
    localSessions.set(st, 'VOTED');
  }

  // 3. Asynchronously sync to Google Sheets API (background non-blocking)
  Promise.all([
    appendVoteToSheet({ id: voteId, candidateId: String(candidateId), stationId: st, votedAt: now }),
    updateStationSessionSheet(st, 'VOTED')
  ]).catch(err => console.error('Google Sheets async sync warning:', err.message));

  return res.status(200).json({
    success: true,
    message: 'Suara Anda berhasil dicatat!'
  });
};
