-- Migration: Switch from Supabase Auth to Clerk
-- Run this once in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/vxexrrwgtmibjnvfmnqu/sql

-- Step 1: Drop RLS policies FIRST (they reference user_id, blocking the type change)
DROP POLICY IF EXISTS "profiles_own"  ON public.profiles;
DROP POLICY IF EXISTS "games_own"     ON public.games;
DROP POLICY IF EXISTS "missed_own"    ON public.missed_moves;
DROP POLICY IF EXISTS "puzzles_own"   ON public.puzzles;

-- Step 2: Drop foreign key constraints that reference auth.users
-- (Clerk user IDs are TEXT like "user_2abc..." not UUIDs)
ALTER TABLE public.profiles     DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;
ALTER TABLE public.games        DROP CONSTRAINT IF EXISTS games_user_id_fkey;
ALTER TABLE public.missed_moves DROP CONSTRAINT IF EXISTS missed_moves_user_id_fkey;
ALTER TABLE public.puzzles      DROP CONSTRAINT IF EXISTS puzzles_user_id_fkey;

-- Step 3: Change user_id columns from UUID to TEXT
ALTER TABLE public.profiles     ALTER COLUMN user_id TYPE TEXT;
ALTER TABLE public.games        ALTER COLUMN user_id TYPE TEXT;
ALTER TABLE public.missed_moves ALTER COLUMN user_id TYPE TEXT;
ALTER TABLE public.puzzles      ALTER COLUMN user_id TYPE TEXT;

-- Service-role policies remain — backend writes continue to work as before.
