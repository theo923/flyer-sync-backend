-- Fix missing function for rankings
CREATE OR REPLACE FUNCTION get_top_contributors(lim INTEGER DEFAULT 10)
RETURNS TABLE (
  "userId" UUID,
  "count" BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT user_id as "userId", COUNT(*) as "count"
  FROM prices
  GROUP BY user_id
  ORDER BY "count" DESC
  LIMIT lim;
END;
$$ LANGUAGE plpgsql STABLE;

-- RE-APPLY fix for the "table u" error in check_price_drop_alerts if it failed before
-- (This overrides the previous function definition)
CREATE OR REPLACE FUNCTION check_price_drop_alerts()
RETURNS TRIGGER AS $$
DECLARE
  bookmark RECORD;
  prev_price DECIMAL(10,2);
BEGIN
  -- Find all bookmarks for this product (FIXED: removed u.product_id reference)
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
      INSERT INTO price_alerts (user_id, bookmark_id, product_id, price_id, alert_type, old_price, new_price, store_name, created_at)
      SELECT 
        bookmark.user_id,
        bookmark.id,
        NEW.product_id,
        NEW.id,
        'price_drop',
        prev_price,
        NEW.price,
        (SELECT name FROM stores WHERE id = NEW.store_id),
        NOW();
    END IF;
    
    -- If target price is set and new price is at or below target
    IF bookmark.target_price IS NOT NULL AND NEW.price <= bookmark.target_price THEN
      INSERT INTO price_alerts (user_id, bookmark_id, product_id, price_id, alert_type, old_price, new_price, store_name, created_at)
      SELECT 
        bookmark.user_id,
        bookmark.id,
        NEW.product_id,
        NEW.id,
        'target_reached',
        prev_price,
        NEW.price,
        (SELECT name FROM stores WHERE id = NEW.store_id),
        NOW();
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
