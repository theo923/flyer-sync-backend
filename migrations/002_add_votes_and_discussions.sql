-- Migration: Add votes and discussions tables
-- Run this in the Supabase SQL Editor after 001_add_alternative_name.sql

-- Votes table for product/price voting (thumbs up/down)
-- Votes table for product/price voting (thumbs up/down)
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('product', 'price', 'discussion', 'store')),
  target_id UUID NOT NULL,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('up', 'down')),
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure one vote per user per target
  UNIQUE(user_id, target_type, target_id)
);

-- Enable Row Level Security (RLS) on votes
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view all votes
CREATE POLICY "Votes are viewable by everyone" ON votes
  FOR SELECT USING (true);

-- Allow authenticated users to insert their own votes
CREATE POLICY "Users can insert their own votes" ON votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to delete their own votes
CREATE POLICY "Users can delete their own votes" ON votes
  FOR DELETE USING (auth.uid() = user_id);

-- Discussions table for product/price comments
CREATE TABLE IF NOT EXISTS discussions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('product', 'price', 'store')),
  target_id UUID NOT NULL,
  parent_id UUID REFERENCES discussions(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 2000),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS) on discussions
ALTER TABLE discussions ENABLE ROW LEVEL SECURITY;

-- Allow everyone to view discussions
CREATE POLICY "Discussions are viewable by everyone" ON discussions
  FOR SELECT USING (true);

-- Allow authenticated users to create discussions
CREATE POLICY "Users can create discussions" ON discussions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own discussions
CREATE POLICY "Users can update their own discussions" ON discussions
  FOR UPDATE USING (auth.uid() = user_id);

-- Allow users to delete their own discussions
CREATE POLICY "Users can delete their own discussions" ON discussions
  FOR DELETE USING (auth.uid() = user_id);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS votes_target_idx ON votes(target_type, target_id);
CREATE INDEX IF NOT EXISTS votes_user_idx ON votes(user_id);
CREATE INDEX IF NOT EXISTS discussions_target_idx ON discussions(target_type, target_id);
CREATE INDEX IF NOT EXISTS discussions_parent_idx ON discussions(parent_id);

-- Helper function to get vote counts
CREATE OR REPLACE FUNCTION get_vote_counts(p_target_type TEXT, p_target_id UUID)
RETURNS TABLE(upvotes BIGINT, downvotes BIGINT) 
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END), 0) as upvotes,
    COALESCE(SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END), 0) as downvotes
  FROM votes
  WHERE target_type = p_target_type AND target_id = p_target_id;
END;
$$;
