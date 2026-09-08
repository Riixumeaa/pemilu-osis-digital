// api/logs.js — Admin Audit Log viewer
import { getSupabaseAdmin } from '../lib/supabase.js';

export default async function handler(req, res) {
    const supabase = getSupabaseAdmin();
    try {
        const limit = parseInt(req.query.limit || '100');
        const { data: logs, error } = await supabase
            .from('logs')
            .select('id, timestamp, type, message, data')
            .order('timestamp', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return res.status(200).json({ success: true, logs: logs || [] });
    } catch (err) {
        console.error('Logs API Error:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
}
