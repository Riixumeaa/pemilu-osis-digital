const { getSupabase } = require('../lib/supabase');
const { updateStationSessionSheet } = require('../lib/googleSheets');

// In-memory fallback
const localSessions = new Map();

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
  const action = query.action || (req.body && req.body.action) || 'register';
  const stationId = query.stationId || (req.body && req.body.stationId) || 'Station 1';

  if (action === 'register') {
    let status = 'READY';
    if (supabase) {
      const { data } = await supabase
        .from('sessions')
        .select('*')
        .eq('station_id', stationId)
        .single();

      if (data) {
        status = data.status;
      } else {
        await supabase
          .from('sessions')
          .insert([{ station_id: stationId, status: 'READY' }]);
      }
    } else {
      status = localSessions.get(stationId) || 'READY';
      if (!localSessions.has(stationId)) localSessions.set(stationId, 'READY');
    }

    return res.status(200).json({ success: true, stationId, status });
  }

  if (action === 'next') {
    if (supabase) {
      await supabase
        .from('sessions')
        .upsert({ station_id: stationId, status: 'READY', updated_at: new Date().toISOString() });
    } else {
      localSessions.set(stationId, 'READY');
    }
    updateStationSessionSheet(stationId, 'READY').catch(() => {});
    return res.status(200).json({ success: true, message: `${stationId} siap!` });
  }

  if (action === 'delete') {
    if (supabase) {
      await supabase.from('sessions').delete().eq('station_id', stationId);
    } else {
      localSessions.delete(stationId);
    }
    return res.status(200).json({ success: true, message: `${stationId} dihapus!` });
  }

  if (action === 'resetAll') {
    if (supabase) {
      await supabase
        .from('sessions')
        .update({ status: 'READY', updated_at: new Date().toISOString() })
        .neq('station_id', '');
    } else {
      for (const k of localSessions.keys()) localSessions.set(k, 'READY');
    }
    return res.status(200).json({ success: true, message: 'Semua bilik di-reset!' });
  }

  if (action === 'all') {
    let stations = [];
    if (supabase) {
      const { data } = await supabase.from('sessions').select('*');
      if (data) {
        stations = data.map(d => ({ stationId: d.station_id, status: d.status, updatedAt: d.updated_at }));
      }
    } else {
      for (const [k, v] of localSessions.entries()) {
        stations.push({ stationId: k, status: v });
      }
    }
    return res.status(200).json({ success: true, stations });
  }

  res.status(400).json({ success: false, message: 'Invalid action' });
};
