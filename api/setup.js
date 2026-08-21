const { getSupabase } = require('../lib/supabase');
const { getGoogleSheets, getPrivateKeyPreview } = require('../lib/googleSheets');

module.exports = async (req, res) => {
  const supabase = getSupabase();
  const sheets = getGoogleSheets();

  const sqlSetup = `
-- PEMILU OSIS DIGITAL — SUPABASE SQL TABLE INITIALIZATION
-- Run this SQL in your Supabase SQL Editor (supabase.com -> SQL Editor):

CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INT NOT NULL,
  chairman TEXT NOT NULL,
  vice TEXT NOT NULL,
  pair_image_url TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  station_id TEXT PRIMARY KEY,
  status TEXT DEFAULT 'READY',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id TEXT NOT NULL,
  station_id TEXT NOT NULL,
  session_token TEXT DEFAULT 'NO_TOKEN',
  voted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Realtime Replication on sessions table:
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
  `.trim();

  let sheetsStatus = { connected: false, message: 'Google Sheets credentials or SPREADSHEET_ID missing' };

  if (sheets && process.env.SPREADSHEET_ID) {
    try {
      const spreadsheetId = process.env.SPREADSHEET_ID.trim().replace(/^"|"$/g, '');
      const meta = await sheets.spreadsheets.get({ spreadsheetId });
      sheetsStatus = {
        connected: true,
        title: meta.data.properties ? meta.data.properties.title : 'Connected',
        sheetsCount: meta.data.sheets ? meta.data.sheets.length : 0
      };
    } catch (err) {
      sheetsStatus = {
        connected: false,
        error: err.message,
        hint: 'Pastikan file Google Sheets sudah dibagikan (Share) ke email Service Account sebagai Editor!'
      };
    }
  }

  res.status(200).json({
    success: true,
    supabaseConnected: !!supabase,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    googleSheets: sheetsStatus,
    privateKeyPreview: getPrivateKeyPreview(process.env.GOOGLE_PRIVATE_KEY),
    sqlSetupInstructions: sqlSetup,
    envCheck: {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasGoogleEmail: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      hasGoogleKey: !!process.env.GOOGLE_PRIVATE_KEY,
      hasSpreadsheetId: !!process.env.SPREADSHEET_ID
    }
  });
};
