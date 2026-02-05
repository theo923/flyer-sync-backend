-- Migration: Add votes and discussions tables
-- Run this in the Supabase SQL Editor after 001_add_alternative_name.sql

-- Votes table for product/price voting (thumbs up/down)
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('product', 'price', 'discussion')),
  target_id UUID NOT NULL,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('up', 'down')),
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure one vote per user per target
  UNIQUE(user_id, target_type, target_id)
);

-- Discussions table for product/price comments
CREATE TABLE IF NOT EXISTS discussions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('product', 'price')),
  target_id UUID NOT NULL,
  parent_id UUID REFERENCES discussions(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 2000),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS votes_target_idx ON votes(target_type, target_id);
CREATE INDEX IF NOT EXISTS votes_user_idx ON votes(user_id);
CREATE INDEX IF NOT EXISTS discussions_target_idx ON discussions(target_type, target_id);
CREATE INDEX IF NOT EXISTS discussions_parent_idx ON discussions(parent_id);

-- Helper function to get vote counts
CREATE OR REPLACE FUNCTION get_vote_counts(p_target_type TEXT, p_target_id UUID)
RETURNS TABLE(upvotes BIGINT, downvotes BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END), 0) as upvotes,
    COALESCE(SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END), 0) as downvotes
  FROM votes
  WHERE target_type = p_target_type AND target_id = p_target_id;
END;
$$ LANGUAGE plpgsql;
