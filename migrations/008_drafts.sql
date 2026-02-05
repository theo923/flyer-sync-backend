-- 008: DRAFTS SUPPORT
-- Add status and items_snapshot columns to receipts table for draft functionality

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'status') THEN
    ALTER TABLE receipts ADD COLUMN status TEXT DEFAULT 'complete' CHECK (status IN ('draft', 'complete'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'receipts' AND column_name = 'items_snapshot') THEN
    ALTER TABLE receipts ADD COLUMN items_snapshot JSONB;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS receipts_status_idx ON receipts(status);
