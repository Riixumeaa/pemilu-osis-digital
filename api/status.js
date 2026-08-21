const { getSupabase } = require('../lib/supabase');

let localStatus = 'RUNNING';
let localTitle = process.env.ELECTION_TITLE || 'PEMILU OSIS DIGITAL';

module.exports = async (req, res) => {
  const supabase = getSupabase();

  if (req.method === 'GET') {
    if (supabase) {
      const { data } = await supabase.from('settings').select('*');
      if (data) {
        const statusItem = data.find(s => s.key === 'ELECTION_STATUS');
        const titleItem = data.find(s => s.key === 'ELECTION_TITLE');
        if (statusItem) localStatus = statusItem.value;
        if (titleItem) localTitle = titleItem.value;
      }
    }
    return res.status(200).json({
      status: localStatus,
      title: localTitle
    });
  }

  if (req.method === 'POST') {
    const { action, value, title } = req.body || {};

    if (action === 'setTitle' && title) {
      localTitle = title;
      if (supabase) {
        await supabase.from('settings').upsert({ key: 'ELECTION_TITLE', value: title });
      }
      return res.status(200).json({ success: true, message: 'Judul disimpan!' });
    }

    if (action === 'setStatus' && value) {
      localStatus = value;
      if (supabase) {
        await supabase.from('settings').upsert({ key: 'ELECTION_STATUS', value });
      }
      return res.status(200).json({ success: true, message: `Status pemilu diubah ke ${value}!` });
    }

    if (action === 'schedule') {
      const { startTime, endTime } = req.body || {};
      if (supabase) {
        await supabase.from('settings').upsert({ key: 'START_TIME', value: startTime });
        await supabase.from('settings').upsert({ key: 'END_TIME', value: endTime });
        await supabase.from('settings').upsert({ key: 'ELECTION_STATUS', value: 'SCHEDULED' });
      }
      return res.status(200).json({ success: true, message: 'Jadwal pemilu disimpan!' });
    }

    if (action === 'resetAll') {
      localStatus = 'NOT_STARTED';
      if (supabase) {
        await supabase.from('votes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('sessions').delete().neq('station_id', '');
        await supabase.from('settings').upsert({ key: 'ELECTION_STATUS', value: 'NOT_STARTED' });
      }
      return res.status(200).json({ success: true, message: 'Data pemilu & suara di-reset!' });
    }
  }

  res.status(400).json({ success: false, message: 'Invalid request' });
};
