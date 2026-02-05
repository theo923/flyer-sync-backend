-- Migration: Update votes and discussions constraints to include 'store'
-- Run this in the Supabase SQL Editor

-- Drop existing constraints on votes table
ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_target_type_check;

-- Add updated constraint to votes table including 'store'
ALTER TABLE votes ADD CONSTRAINT votes_target_type_check 
  CHECK (target_type IN ('product', 'price', 'discussion', 'store'));


-- Drop existing constraints on discussions table
ALTER TABLE discussions DROP CONSTRAINT IF EXISTS discussions_target_type_check;

-- Add updated constraint to discussions table including 'store'
ALTER TABLE discussions ADD CONSTRAINT discussions_target_type_check 
  CHECK (target_type IN ('product', 'price', 'store'));
