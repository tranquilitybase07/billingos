-- Add recurring_interval and recurring_interval_count to product_prices table
-- This allows each price to have its own billing interval (monthly, yearly, etc.)
-- instead of inheriting from the product level

ALTER TABLE product_prices
ADD COLUMN recurring_interval VARCHAR(20),
ADD COLUMN recurring_interval_count INTEGER DEFAULT 1;

-- Set default values from parent product for existing prices
UPDATE product_prices pp
SET
  recurring_interval = p.recurring_interval,
  recurring_interval_count = p.recurring_interval_count
FROM products p
WHERE pp.product_id = p.id;

-- Make recurring_interval NOT NULL after setting defaults
ALTER TABLE product_prices
ALTER COLUMN recurring_interval SET NOT NULL;

-- Add check constraint for valid intervals
ALTER TABLE product_prices
ADD CONSTRAINT product_prices_recurring_interval_check
CHECK (recurring_interval IN ('day', 'week', 'month', 'year'));

-- Add comment for documentation
COMMENT ON COLUMN product_prices.recurring_interval IS 'Billing interval for this price (day, week, month, year). Allows one product to have multiple billing intervals.';
COMMENT ON COLUMN product_prices.recurring_interval_count IS 'Number of intervals between billings. For example, 1 month, 3 months, 1 year, etc.';
