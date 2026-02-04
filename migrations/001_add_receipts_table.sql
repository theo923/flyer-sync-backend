-- FlyerSync Migration: Add Receipts Table
-- Run this in Supabase SQL Editor if you already have the base schema

-- ─────────────────────────────────────────────────────────────
-- RECEIPTS TABLE (Transaction Grouping)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  total_price DECIMAL(10,2),
  store_location TEXT,
  receipt_date DATE,
  receipt_time TIME,
  currency TEXT DEFAULT 'USD',
  image_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS receipts_user_idx ON receipts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS receipts_store_idx ON receipts(store_id);

-- Add new columns to prices table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prices' AND column_name = 'purchase_time') THEN
    ALTER TABLE prices ADD COLUMN purchase_time TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prices' AND column_name = 'receipt_id') THEN
    ALTER TABLE prices ADD COLUMN receipt_id UUID REFERENCES receipts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS prices_receipt_idx ON prices(receipt_id);

-- RLS for receipts
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Receipts are viewable by everyone" ON receipts;
DROP POLICY IF EXISTS "Users can insert their own receipts" ON receipts;

CREATE POLICY "Receipts are viewable by everyone" ON receipts FOR SELECT USING (true);
CREATE POLICY "Users can insert their own receipts" ON receipts FOR INSERT WITH CHECK (true);

-- Verify migration
SELECT 'Migration complete! Receipts table created.' as status;
