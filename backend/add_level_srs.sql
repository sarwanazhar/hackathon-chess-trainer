-- Migration: add level to profiles, attempt_count to missed_moves
-- Run in Supabase SQL editor before deploying backend changes.

-- Add skill level column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS level TEXT DEFAULT 'intermediate';

-- Add attempt tracking to missed_moves (used by Task 18 / improved SRS)
ALTER TABLE public.missed_moves
ADD COLUMN IF NOT EXISTS attempt_count INT DEFAULT 0;
