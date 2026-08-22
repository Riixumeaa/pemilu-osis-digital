// api/setup.js — Supabase config + full SQL setup script
export default async function handler(req, res) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const sqlSetupScript = `
-- ================================================================
-- PEMILU OSIS DIGITAL — SUPABASE SCHEMA v3
-- Run this entire script in Supabase SQL Editor
-- ================================================================

-- 1. CANDIDATES
CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INT NOT NULL,
  chairman TEXT NOT NULL,
  vice TEXT NOT NULL,
  pair_image_url TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Safe migration: remove old column if exists
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='candidates' AND column_name='pair_image_file_id') THEN
    ALTER TABLE candidates DROP COLUMN pair_image_file_id;
  END IF;
END $$;

-- 2. AUTH REQUESTS (Station requests panitia approval)
CREATE TABLE IF NOT EXISTS auth_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',   -- PENDING | APPROVED | REJECTED
  role TEXT DEFAULT 'peserta',     -- peserta | panitia | guru
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_requests_station ON auth_requests(station_id, status);

-- 3. SESSIONS
CREATE TABLE IF NOT EXISTS sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id TEXT NOT NULL,
  status TEXT DEFAULT 'WAITING',   -- WAITING | ACTIVE | VOTED | COMPLETED
  role TEXT DEFAULT 'peserta',     -- peserta | panitia | guru
  vote_multiplier INT DEFAULT 1,   -- how many votes this session is worth
  candidate_id UUID REFERENCES candidates(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  voted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sessions_station ON sessions(station_id, status);

-- Safe migration: add columns if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='role') THEN
    ALTER TABLE sessions ADD COLUMN role TEXT DEFAULT 'peserta';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='vote_multiplier') THEN
    ALTER TABLE sessions ADD COLUMN vote_multiplier INT DEFAULT 1;
  END IF;
END $$;

-- 4. VOTES
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(session_id),
  station_id TEXT NOT NULL,
  candidate_id UUID NOT NULL REFERENCES candidates(id),
  candidate_number INT NOT NULL,
  chairman TEXT NOT NULL,
  vice TEXT NOT NULL,
  role TEXT DEFAULT 'peserta',
  vote_weight INT DEFAULT 1,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_votes_candidate ON votes(candidate_id);

-- Safe migration: add vote_weight if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='votes' AND column_name='vote_weight') THEN
    ALTER TABLE votes ADD COLUMN vote_weight INT DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='votes' AND column_name='role') THEN
    ALTER TABLE votes ADD COLUMN role TEXT DEFAULT 'peserta';
  END IF;
END $$;

-- 5. SETTINGS
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. LOGS
CREATE TABLE IF NOT EXISTS logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT
);

-- Default Settings
INSERT INTO settings (key, value) VALUES
  ('TITLE', 'PEMILU OSIS DIGITAL'),
  ('STATUS', 'NOT_STARTED'),
  ('CANDIDATE_VERSION', '1'),
  ('votes_peserta', '1'),
  ('votes_panitia', '1'),
  ('votes_guru', '1')
ON CONFLICT (key) DO NOTHING;

-- Safe Enable Realtime
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sessions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'auth_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE auth_requests;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'settings') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE settings;
  END IF;
END $$;

-- ================================================================
-- SUBMIT_VOTE RPC — Atomic with vote_weight support
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
  v_multiplier INT;
BEGIN
  SELECT value INTO v_status FROM settings WHERE key = 'STATUS';
  IF v_status IS NULL OR v_status != 'RUNNING' THEN
    RETURN json_build_object('success', false, 'message', 'Pemilu belum dibuka atau telah selesai.');
  END IF;

  SELECT * INTO v_session FROM sessions WHERE session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Sesi voting tidak ditemukan.');
  END IF;
  IF v_session.status = 'VOTED' OR v_session.status = 'COMPLETED' THEN
    RETURN json_build_object('success', false, 'message', 'Sesi voting ini sudah digunakan!');
  END IF;

  SELECT * INTO v_cand FROM candidates WHERE id = p_candidate_id AND active = TRUE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Kandidat pilihan tidak valid.');
  END IF;

  v_multiplier := COALESCE(v_session.vote_multiplier, 1);
  v_vote_id := gen_random_uuid();

  INSERT INTO votes (id, session_id, station_id, candidate_id, candidate_number, chairman, vice, role, vote_weight, timestamp)
  VALUES (v_vote_id, p_session_id, COALESCE(p_station_id, v_session.station_id),
          v_cand.id, v_cand.number, v_cand.chairman, v_cand.vice,
          COALESCE(v_session.role, 'peserta'), v_multiplier, NOW());

  UPDATE sessions SET status = 'VOTED', voted_at = NOW(), candidate_id = v_cand.id
  WHERE session_id = p_session_id;

  RETURN json_build_object(
    'success', true, 'voteId', v_vote_id,
    'sessionId', p_session_id, 'voteWeight', v_multiplier,
    'message', 'Suara Anda telah berhasil dicatat!'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`;

  return res.status(200).json({ success: true, supabaseUrl, supabaseAnonKey, sqlSetupScript });
}
