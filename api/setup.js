const { getSupabase } = require('../lib/supabase');
const { getGoogleSheets } = require('../lib/googleSheets');

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

  res.status(200).json({
    success: true,
    supabaseConnected: !!supabase,
    googleSheetsConnected: !!sheets,
    sqlSetupInstructions: sqlSetup,
    env: {
      supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      googleEmail: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      spreadsheetId: !!process.env.SPREADSHEET_ID
    }
  });
};
