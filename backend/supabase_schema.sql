-- Chess Trainer Schema
-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard/project/vxexrrwgtmibjnvfmnqu/sql

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    user_id     TEXT PRIMARY KEY,  -- Clerk user ID (e.g. user_2abc...)
    username    TEXT,
    rating      INT DEFAULT 800,
    personality TEXT DEFAULT 'mentor',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Games
CREATE TABLE IF NOT EXISTS public.games (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    TEXT NOT NULL,      -- Clerk user ID
    pgn        TEXT,
    moves      TEXT[],
    result     TEXT,
    color      TEXT,
    analyzed   BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Missed moves (source of personal puzzles)
CREATE TABLE IF NOT EXISTS public.missed_moves (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        TEXT NOT NULL,  -- Clerk user ID
    game_id        UUID REFERENCES public.games(id) ON DELETE SET NULL,
    fen            TEXT NOT NULL,
    user_move      TEXT,
    best_move      TEXT NOT NULL,
    eval_drop      FLOAT NOT NULL,
    theme          TEXT,
    next_review_at TIMESTAMPTZ DEFAULT NOW(),
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Puzzles (user_id NULL = general pool)
CREATE TABLE IF NOT EXISTS public.puzzles (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    TEXT,               -- Clerk user ID, NULL = general pool
    fen        TEXT NOT NULL,
    solution   TEXT[] NOT NULL,
    theme      TEXT,
    difficulty INT DEFAULT 1,
    source     TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Videos cache (pre-seeded YouTube videos per topic, served from DB — no live API call per request)
CREATE TABLE IF NOT EXISTS public.videos (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic      TEXT NOT NULL,
    title      TEXT NOT NULL,
    video_url  TEXT NOT NULL UNIQUE,
    channel    TEXT,
    fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_games_user_id ON public.games(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_topic  ON public.videos(topic);
CREATE INDEX IF NOT EXISTS idx_missed_moves_user_id ON public.missed_moves(user_id);
CREATE INDEX IF NOT EXISTS idx_missed_moves_review ON public.missed_moves(next_review_at);
CREATE INDEX IF NOT EXISTS idx_puzzles_pool ON public.puzzles(user_id) WHERE user_id IS NULL;

-- Row Level Security
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missed_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.puzzles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos      ENABLE ROW LEVEL SECURITY;

-- Note: user_id is now a Clerk TEXT ID — auth.uid() RLS policies removed.
-- All data access goes through the backend service role (bypasses RLS).

-- Service role bypasses RLS (used by the backend service key)
CREATE POLICY "profiles_service" ON public.profiles    TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "games_service"    ON public.games       TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "missed_service"   ON public.missed_moves TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "puzzles_service"  ON public.puzzles     TO service_role USING (true) WITH CHECK (true);
-- Videos: anyone can read, service role can write
CREATE POLICY "videos_read"    ON public.videos FOR SELECT USING (true);
CREATE POLICY "videos_service" ON public.videos TO service_role USING (true) WITH CHECK (true);
