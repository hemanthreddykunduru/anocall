-- ============================================================
-- SUPABASE TABLE SETUP — Run this in Supabase SQL Editor
-- Project: https://avmimgvnndaxszbmouah.supabase.co
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id           BIGSERIAL PRIMARY KEY,
  display_username TEXT UNIQUE NOT NULL,
  username_hash    TEXT NOT NULL,
  password_hash    TEXT NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_display_username
  ON users (display_username);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_full_access" ON users
  FOR ALL
  USING (true)
  WITH CHECK (true);
