// api/setup.js — Returns Supabase SQL Setup Scripts and Config Info
export default async function handler(req, res) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const sqlSetupScript = `
-- ================================================================
-- PEMILU OSIS DIGITAL — SUPABASE POSTGRESQL SCHEMA & RPC SETUP
-- ================================================================

-- 1. CANDIDATES TABLE
CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INT NOT NULL,
  chairman TEXT NOT NULL,
  vice TEXT NOT NULL,
  pair_image_url TEXT,
  pair_image_file_id TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. SESSIONS TABLE (MULTI-STATION SESSION LIFECYCLE)
CREATE TABLE IF NOT EXISTS sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id TEXT NOT NULL,
  status TEXT DEFAULT 'WAITING', -- WAITING, ACTIVE, VOTED, COMPLETED
  candidate_id UUID REFERENCES candidates(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  voted_at TIMESTAMPTZ
);

-- Index for station lookup speed
CREATE INDEX IF NOT EXISTS idx_sessions_station ON sessions(station_id, status);

-- 3. VOTES TABLE
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(session_id),
  station_id TEXT NOT NULL,
  candidate_id UUID NOT NULL REFERENCES candidates(id),
  candidate_number INT NOT NULL,
  chairman TEXT NOT NULL,
  vice TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Index for vote aggregation
CREATE INDEX IF NOT EXISTS idx_votes_candidate ON votes(candidate_id);

-- 4. SETTINGS TABLE
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. LOGS TABLE
CREATE TABLE IF NOT EXISTS logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT
);

-- Insert Default Settings
INSERT INTO settings (key, value) VALUES 
  ('TITLE', 'PEMILU OSIS DIGITAL'),
  ('STATUS', 'NOT_STARTED'),
  ('CANDIDATE_VERSION', '1')
ON CONFLICT (key) DO NOTHING;

-- ENABLE REALTIME ON SESSIONS & SETTINGS
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE settings;

-- ================================================================
-- ATOMIC SUBMIT_VOTE RPC FUNCTION (WITH FOR UPDATE ROW LOCKING)
-- ================================================================
CREATE OR REPLACE FUNCTION submit_vote(
  p_session_id UUID,
  p_station_id TEXT,
  p_candidate_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_session RECORD;
  v_cand RECORD;
  v_vote_id UUID;
  v_status TEXT;
BEGIN
  -- Check Election Status
  SELECT value INTO v_status FROM settings WHERE key = 'STATUS';
  IF v_status IS NULL OR v_status != 'RUNNING' THEN
    RETURN json_build_object('success', false, 'message', 'Pemilu belum dibuka atau telah selesai.');
  END IF;

  -- Lock Session Row atomically (FOR UPDATE)
  SELECT * INTO v_session FROM sessions WHERE session_id = p_session_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Sesi voting tidak ditemukan.');
  END IF;

  IF v_session.status = 'VOTED' OR v_session.status = 'COMPLETED' THEN
    RETURN json_build_object('success', false, 'message', 'Sesi voting ini sudah digunakan!');
  END IF;

  -- Fetch Candidate Details
  SELECT * INTO v_cand FROM candidates WHERE id = p_candidate_id AND active = TRUE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Kandidat pilihan tidak valid.');
  END IF;

  -- 1. Insert Vote
  v_vote_id := gen_random_uuid();
  INSERT INTO votes (id, session_id, station_id, candidate_id, candidate_number, chairman, vice, timestamp)
  VALUES (v_vote_id, p_session_id, COALESCE(p_station_id, v_session.station_id), v_cand.id, v_cand.number, v_cand.chairman, v_cand.vice, NOW());

  -- 2. Mark Session as VOTED
  UPDATE sessions 
  SET status = 'VOTED', voted_at = NOW(), candidate_id = v_cand.id
  WHERE session_id = p_session_id;

  RETURN json_build_object(
    'success', true,
    'voteId', v_vote_id,
    'sessionId', p_session_id,
    'message', 'Suara Anda telah berhasil dicatat!'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`;

  return res.status(200).json({
    success: true,
    supabaseUrl: supabaseUrl,
    supabaseAnonKey: supabaseAnonKey,
    sqlSetupScript: sqlSetupScript
  });
}
