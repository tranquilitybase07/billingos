-- Add visible_in_pricing_table column to products table
-- This field controls whether the product appears in the public pricing table via the SDK
ALTER TABLE public.products
ADD COLUMN visible_in_pricing_table BOOLEAN NOT NULL DEFAULT true;

-- Add index for faster filtering
CREATE INDEX idx_products_visible_in_pricing_table
ON public.products(organization_id, visible_in_pricing_table)
WHERE is_archived = false;

-- Update the column comment for documentation
COMMENT ON COLUMN public.products.visible_in_pricing_table IS
'Controls whether this product appears in the public pricing table displayed via the SDK. Set to false to hide products from public pricing pages while keeping them available for internal use.';