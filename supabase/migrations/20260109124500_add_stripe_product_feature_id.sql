-- Add stripe_product_feature_id to product_features table
-- This stores the Stripe ProductFeature object ID returned from POST /v1/products/{id}/features
-- ProductFeature objects are the link between Products and Entitlement Features in Stripe

ALTER TABLE product_features
ADD COLUMN stripe_product_feature_id TEXT;

-- Add index for faster lookups by Stripe ProductFeature ID
CREATE INDEX idx_product_features_stripe_product_feature_id
ON product_features(stripe_product_feature_id);

-- Add comment for documentation
COMMENT ON COLUMN product_features.stripe_product_feature_id IS
'Stripe ProductFeature object ID (e.g., pfeat_xxx). Created when attaching an Entitlement Feature to a Product via POST /v1/products/{id}/features';
