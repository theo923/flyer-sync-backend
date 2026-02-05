-- Migration: Add alternative_name column to products table
-- Run this in the Supabase SQL Editor AFTER 006_store_management.sql

-- Add alternative_name column for multilingual/generic product names
ALTER TABLE products ADD COLUMN IF NOT EXISTS alternative_name TEXT;

-- Create index for efficient search on alternative names
CREATE INDEX IF NOT EXISTS products_alt_name_idx 
  ON products USING gin(to_tsvector('english', alternative_name));

-- Add index for combined name + alternative_name search
CREATE INDEX IF NOT EXISTS products_combined_name_idx 
  ON products USING gin(
    to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(alternative_name, ''))
  );
