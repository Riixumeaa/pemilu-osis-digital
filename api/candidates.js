// api/candidates.js — Candidate CRUD Endpoint with Versioning & Fast Add
import { getSupabaseAdmin } from '../lib/supabase.js';

export default async function handler(req, res) {
  const supabase = getSupabaseAdmin();

  try {
    // GET: Fetch candidates with CANDIDATE_VERSION
    if (req.method === 'GET') {
      const { data: candidates, error } = await supabase
        .from('candidates')
        .select('id, number, chairman, vice, pair_image_url, pair_image_file_id, active, created_at')
        .order('number', { ascending: true });

      if (error) throw error;

      // Get current candidate version from settings
      const { data: settingData } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'CANDIDATE_VERSION')
        .single();

      const version = settingData ? settingData.value : '1';

      const formatted = (candidates || []).map(c => ({
        id: c.id,
        number: c.number,
        chairman: c.chairman,
        vice: c.vice,
        pairImageUrl: c.pair_image_url || '',
        pairImageFileId: c.pair_image_file_id || '',
        active: c.active,
        createdAt: c.created_at
      }));

      return res.status(200).json({
        success: true,
        candidates: formatted,
        version: version
      });
    }

    // POST: Candidate CRUD mutations
    if (req.method === 'POST') {
      const { action, candidate } = req.body || {};

      // Function to increment candidate version in settings
      const bumpVersion = async () => {
        const { data: current } = await supabase.from('settings').select('value').eq('key', 'CANDIDATE_VERSION').single();
        const nextVer = String((parseInt(current ? current.value : '1') || 1) + 1);
        await supabase.from('settings').upsert({ key: 'CANDIDATE_VERSION', value: nextVer, updated_at: new Date().toISOString() });
        return nextVer;
      };

      if (action === 'add') {
        const { number, chairman, vice, pairImageUrl, pairImageFileId } = candidate || {};
        const { data: inserted, error } = await supabase
          .from('candidates')
          .insert({
            number: number,
            chairman: chairman,
            vice: vice,
            pair_image_url: pairImageUrl || '',
            pair_image_file_id: pairImageFileId || '',
            active: true
          })
          .select()
          .single();

        if (error) throw error;
        const newVer = await bumpVersion();

        // Return ONLY the new candidate object (FAST ADD payload!)
        return res.status(200).json({
          success: true,
          message: 'Pasangan calon berhasil ditambahkan!',
          candidate: {
            id: inserted.id,
            number: inserted.number,
            chairman: inserted.chairman,
            vice: inserted.vice,
            pairImageUrl: inserted.pair_image_url || '',
            active: inserted.active,
            createdAt: inserted.created_at
          },
          version: newVer
        });
      }

      if (action === 'update') {
        const { id, number, chairman, vice, pairImageUrl, pairImageFileId } = candidate || {};
        const { data: updated, error } = await supabase
          .from('candidates')
          .update({
            number: number,
            chairman: chairman,
            vice: vice,
            pair_image_url: pairImageUrl || '',
            pair_image_file_id: pairImageFileId || ''
          })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        const newVer = await bumpVersion();

        return res.status(200).json({
          success: true,
          message: 'Pasangan calon diperbarui!',
          candidate: updated,
          version: newVer
        });
      }

      if (action === 'toggle') {
        const { id, active } = candidate || {};
        const { data: updated, error } = await supabase
          .from('candidates')
          .update({ active: active })
          .eq('id', id)
          .select('id, active')
          .single();

        if (error) throw error;
        const newVer = await bumpVersion();

        return res.status(200).json({
          success: true,
          message: 'Status kandidat diubah!',
          candidate: updated,
          version: newVer
        });
      }

      if (action === 'delete') {
        const { id } = candidate || {};
        const { error } = await supabase.from('candidates').delete().eq('id', id);
        if (error) throw error;
        const newVer = await bumpVersion();

        return res.status(200).json({
          success: true,
          message: 'Pasangan calon dihapus!',
          id: id,
          version: newVer
        });
      }
    }

    return res.status(400).json({ success: false, message: 'Action tidak valid.' });
  } catch (err) {
    console.error('Candidates API Error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
}
