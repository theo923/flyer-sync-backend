-- FlyerSync Database Schema for Supabase
-- Run this in the Supabase SQL Editor

-- Enable PostGIS extension for geolocation
CREATE EXTENSION IF NOT EXISTS postgis;

-- ─────────────────────────────────────────────────────────────
-- PRODUCTS TABLE
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for product search
CREATE INDEX IF NOT EXISTS products_name_idx ON products USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS products_barcode_idx ON products(barcode) WHERE barcode IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- STORES TABLE
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  location GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Spatial index for nearby queries
CREATE INDEX IF NOT EXISTS stores_location_idx ON stores USING GIST(location);
CREATE INDEX IF NOT EXISTS stores_name_idx ON stores(name);

-- ─────────────────────────────────────────────────────────────
-- PRICES TABLE (Transaction Log)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  price DECIMAL(10,2) NOT NULL CHECK (price > 0),
  quantity INTEGER DEFAULT 1,
  weight TEXT,
  unit_price DECIMAL(10,2),
  tags TEXT[],
  currency TEXT DEFAULT 'USD',
  receipt_image_path TEXT,
  detected_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS prices_product_idx ON prices(product_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS prices_store_idx ON prices(store_id);
CREATE INDEX IF NOT EXISTS prices_user_idx ON prices(user_id);
CREATE INDEX IF NOT EXISTS prices_detected_at_idx ON prices(detected_at DESC);

-- ─────────────────────────────────────────────────────────────
-- HELPER FUNCTION: Find stores within radius
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
    radius_km * 1000  -- Convert km to meters
  )
  ORDER BY location <-> ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography;
$$;

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (Optional but recommended)
-- ─────────────────────────────────────────────────────────────

-- Enable RLS on prices table
ALTER TABLE prices ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read prices
CREATE POLICY "Prices are viewable by everyone" ON prices
  FOR SELECT USING (true);

-- Only authenticated users can insert their own prices
CREATE POLICY "Users can insert their own prices" ON prices
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Products and stores are public
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Products are viewable by everyone" ON products FOR SELECT USING (true);
CREATE POLICY "Products can be created by anyone" ON products FOR INSERT WITH CHECK (true);

CREATE POLICY "Stores are viewable by everyone" ON stores FOR SELECT USING (true);
CREATE POLICY "Stores can be created by anyone" ON stores FOR INSERT WITH CHECK (true);

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

-- Index for user's receipt history
CREATE INDEX IF NOT EXISTS receipts_user_idx ON receipts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS receipts_store_idx ON receipts(store_id);

-- Add purchase_time and receipt_id to prices (for migration, use IF NOT EXISTS pattern)
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

CREATE POLICY "Receipts are viewable by everyone" ON receipts FOR SELECT USING (true);
CREATE POLICY "Users can insert their own receipts" ON receipts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- HELPER FUNCTION: Get top contributors
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_top_contributors(lim INTEGER DEFAULT 10)
RETURNS TABLE (userId UUID, count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT user_id as userId, COUNT(*) as count
  FROM prices
  GROUP BY user_id
  ORDER BY count DESC
  LIMIT lim;
$$;

-- ─────────────────────────────────────────────────────────────
-- STORAGE BUCKET (Run separately in Supabase Dashboard)
-- ─────────────────────────────────────────────────────────────
-- 1. Go to Storage in Supabase Dashboard
-- 2. Create a new bucket called "receipts"
-- 3. Set it to public or configure RLS as needed

-- ─────────────────────────────────────────────────────────────
-- SAMPLE DATA (Optional - for testing)
-- ─────────────────────────────────────────────────────────────
/*
INSERT INTO products (name, category) VALUES
  ('Milk 1 Gallon', 'Dairy'),
  ('Eggs 12pk', 'Dairy'),
  ('Bread White', 'Bakery'),
  ('Coca Cola 12pk', 'Beverages'),
  ('Bananas 1lb', 'Produce');

INSERT INTO stores (name, address, latitude, longitude) VALUES
  ('Walmart Supercenter', '123 Main St', 40.7128, -74.0060),
  ('Trader Joes', '456 Oak Ave', 40.7580, -73.9855),
  ('Whole Foods', '789 Park Blvd', 40.7614, -73.9776);
*/

