-- Migration: Add published field to prices and create bookmarks system
-- Run this in the Supabase SQL Editor after 002_add_votes_and_discussions.sql

-- Add published field to prices table (default false - private)
ALTER TABLE prices ADD COLUMN IF NOT EXISTS published BOOLEAN DEFAULT false;

-- Create index for finding published prices
CREATE INDEX IF NOT EXISTS prices_published_idx ON prices(published) WHERE published = true;

-- Bookmarks table for product subscriptions
CREATE TABLE IF NOT EXISTS bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  notify_on_price_drop BOOLEAN DEFAULT true,
  target_price DECIMAL(10,2),  -- Alert when price drops below this
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- One bookmark per user per product
  UNIQUE(user_id, product_id)
);

-- Price alerts / notifications table
CREATE TABLE IF NOT EXISTS price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  bookmark_id UUID NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_id UUID REFERENCES prices(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('price_drop', 'target_reached', 'new_price')),
  old_price DECIMAL(10,2),
  new_price DECIMAL(10,2),
  store_name TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient bookmark queries
CREATE INDEX IF NOT EXISTS bookmarks_user_idx ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS bookmarks_product_idx ON bookmarks(product_id);
CREATE INDEX IF NOT EXISTS price_alerts_user_idx ON price_alerts(user_id);
CREATE INDEX IF NOT EXISTS price_alerts_unread_idx ON price_alerts(user_id, is_read) WHERE is_read = false;

-- Function to check for price drops and create alerts
CREATE OR REPLACE FUNCTION check_price_drop_alerts()
RETURNS TRIGGER AS $$
DECLARE
  bookmark RECORD;
  prev_price DECIMAL(10,2);
BEGIN
  -- Find all bookmarks for this product
  FOR bookmark IN 
    SELECT * FROM bookmarks b 
    WHERE b.product_id = NEW.product_id AND b.notify_on_price_drop = true
  LOOP
    -- Get the previous lowest price for this product
    SELECT MIN(price) INTO prev_price
    FROM prices 
    WHERE product_id = NEW.product_id AND id != NEW.id;
    
    -- If new price is lower than previous, create an alert
    IF prev_price IS NOT NULL AND NEW.price < prev_price THEN
      INSERT INTO price_alerts (user_id, bookmark_id, product_id, price_id, alert_type, old_price, new_price, store_name)
      SELECT 
        bookmark.user_id,
        bookmark.id,
        NEW.product_id,
        NEW.id,
        'price_drop',
        prev_price,
        NEW.price,
        (SELECT name FROM stores WHERE id = NEW.store_id);
    END IF;
    
    -- If target price is set and new price is at or below target
    IF bookmark.target_price IS NOT NULL AND NEW.price <= bookmark.target_price THEN
      INSERT INTO price_alerts (user_id, bookmark_id, product_id, price_id, alert_type, old_price, new_price, store_name)
      SELECT 
        bookmark.user_id,
        bookmark.id,
        NEW.product_id,
        NEW.id,
        'target_reached',
        prev_price,
        NEW.price,
        (SELECT name FROM stores WHERE id = NEW.store_id);
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to check for price drops when new prices are added
DROP TRIGGER IF EXISTS price_drop_alert_trigger ON prices;
CREATE TRIGGER price_drop_alert_trigger
AFTER INSERT ON prices
FOR EACH ROW
EXECUTE FUNCTION check_price_drop_alerts();
