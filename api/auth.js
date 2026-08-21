const crypto = require('crypto');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'siriyadh2026';
const sessions = new Set();

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
  const query = getParams(req);
  const action = query.action || (req.body && req.body.action);

  if (action === 'verify') {
    const token = query.token || (req.body && req.body.token);
    const valid = sessions.has(token);
    return res.status(200).json({ valid });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) {
    return res.status(200).json({ success: false, message: 'Password admin salah!' });
  }

  const token = crypto.randomUUID();
  sessions.add(token);
  return res.status(200).json({ success: true, token });
};
