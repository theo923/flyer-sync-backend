-- 009: DISCOUNTED PRICE
-- Add discounted_price to prices table. 
-- The 'price' column should store the FINAL price paid. 
-- 'discounted_price' is optional and can store the unit price after discount if useful, 
-- or we can treat 'price' as final and 'unit_price' as original.
-- Requirement says: "add a price discounted field (this should not have any affect the total price)"
-- So we will add it as an informational field.

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prices' AND column_name = 'discounted_price') THEN
    ALTER TABLE prices ADD COLUMN discounted_price DECIMAL(10,2);
  END IF;
END $$;
