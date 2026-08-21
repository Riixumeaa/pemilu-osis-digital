const { getSupabase } = require('../lib/supabase');

// In-memory fallback if Supabase not configured yet
let localCandidates = [
  { id: '1', number: 1, chairman: 'Calon Ketua 1', vice: 'Calon Wakil 1', pairImageUrl: '', active: true },
  { id: '2', number: 2, chairman: 'Calon Ketua 2', vice: 'Calon Wakil 2', pairImageUrl: '', active: true }
];

module.exports = async (req, res) => {
  const supabase = getSupabase();

  if (req.method === 'GET') {
    if (supabase) {
      const { data, error } = await supabase
        .from('candidates')
        .select('*')
        .order('number', { ascending: true });

      if (!error && data) {
        const formatted = data.map(c => ({
          id: c.id,
          number: c.number,
          chairman: c.chairman,
          vice: c.vice,
          pairImageUrl: c.pair_image_url || '',
          active: c.active,
          createdAt: c.created_at
        }));
        return res.status(200).json({ success: true, candidates: formatted });
      }
    }
    return res.status(200).json({ success: true, candidates: localCandidates });
  }

  if (req.method === 'POST') {
    const { action, candidate } = req.body || {};

    if (action === 'add') {
      const newCand = {
        number: Number(candidate.number),
        chairman: candidate.chairman,
        vice: candidate.vice,
        pair_image_url: candidate.pairImageUrl || '',
        active: true
      };

      if (supabase) {
        const { error } = await supabase.from('candidates').insert([newCand]);
        if (error) return res.status(500).json({ success: false, message: error.message });
      } else {
        localCandidates.push({ id: String(Date.now()), ...newCand });
      }
      return res.status(200).json({ success: true, message: 'Pasangan calon ditambahkan!' });
    }

    if (action === 'update') {
      if (supabase) {
        await supabase
          .from('candidates')
          .update({
            number: Number(candidate.number),
            chairman: candidate.chairman,
            vice: candidate.vice,
            pair_image_url: candidate.pairImageUrl
          })
          .eq('id', candidate.id);
      }
      return res.status(200).json({ success: true, message: 'Data kandidat diperbarui!' });
    }

    if (action === 'toggle') {
      if (supabase) {
        await supabase.from('candidates').update({ active: candidate.active }).eq('id', candidate.id);
      } else {
        const found = localCandidates.find(c => String(c.id) === String(candidate.id));
        if (found) found.active = candidate.active;
      }
      return res.status(200).json({ success: true, message: 'Status kandidat diubah!' });
    }

    if (action === 'uploadPhoto') {
      // Return the base64 photo directly or store in bucket
      const base64Data = req.body.base64Data || '';
      return res.status(200).json({ success: true, url: base64Data });
    }

    if (action === 'delete') {
      if (supabase) {
        await supabase.from('candidates').delete().eq('id', candidate.id);
      } else {
        localCandidates = localCandidates.filter(c => String(c.id) !== String(candidate.id));
      }
      return res.status(200).json({ success: true, message: 'Pasangan calon dihapus!' });
    }
  }

  res.status(400).json({ success: false, message: 'Invalid request' });
};
