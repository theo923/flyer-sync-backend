-- Migration: Store Management Features
-- Adds soft delete, visit tracking for stores and soft delete for receipts

-- ─────────────────────────────────────────────────────────────
-- STORES: Add soft delete + visit tracking columns
-- ─────────────────────────────────────────────────────────────
DO $$ 
BEGIN
  -- created_by for tracking store creator (needed for RLS)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'stores' AND column_name = 'created_by') THEN
    ALTER TABLE stores ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  -- is_deleted for soft delete
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'stores' AND column_name = 'is_deleted') THEN
    ALTER TABLE stores ADD COLUMN is_deleted BOOLEAN DEFAULT false;
  END IF;

  -- last_visited_at for tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'stores' AND column_name = 'last_visited_at') THEN
    ALTER TABLE stores ADD COLUMN last_visited_at TIMESTAMPTZ;
  END IF;

  -- visit_count for tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'stores' AND column_name = 'visit_count') THEN
    ALTER TABLE stores ADD COLUMN visit_count INTEGER DEFAULT 0 NOT NULL;
  END IF;
END $$;

-- Index for efficient filtering
CREATE INDEX IF NOT EXISTS stores_is_deleted_idx ON stores(is_deleted);

-- ─────────────────────────────────────────────────────────────
-- RECEIPTS: Add soft delete column
-- ─────────────────────────────────────────────────────────────
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'receipts' AND column_name = 'is_deleted') THEN
    ALTER TABLE receipts ADD COLUMN is_deleted BOOLEAN DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS receipts_is_deleted_idx ON receipts(is_deleted);

-- ─────────────────────────────────────────────────────────────
-- Update stores_nearby function to exclude deleted stores
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION stores_nearby(
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION DEFAULT 5
)
RETURNS SETOF stores
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM stores
  WHERE ST_DWithin(
    location,
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
    radius_km * 1000
  )
  AND is_deleted = false
  ORDER BY location <-> ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography;
$$;

-- ─────────────────────────────────────────────────────────────
-- RLS policies for update/delete (soft delete)
-- ─────────────────────────────────────────────────────────────
-- Allow users to update their own data (for soft delete)
DO $$
BEGIN
  -- Update the INSERT policy to track who created the store
  -- Drop the old policy if it exists and create a new one
  DROP POLICY IF EXISTS "Stores can be created by anyone" ON stores;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can create stores') THEN
    CREATE POLICY "Authenticated users can create stores"
      ON stores
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = created_by);
  END IF;
  
  -- Allow users to update only the stores they created
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update stores') THEN
    CREATE POLICY "Users can update stores" 
      ON stores 
      FOR UPDATE 
      USING (auth.uid() = created_by)
      WITH CHECK (auth.uid() = created_by);
  END IF;
  
  -- Allow users to update only their own receipts
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update receipts') THEN
    CREATE POLICY "Users can update receipts" 
      ON receipts 
      FOR UPDATE 
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
