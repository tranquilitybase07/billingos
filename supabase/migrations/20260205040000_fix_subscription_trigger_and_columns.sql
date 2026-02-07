-- Fix subscription feature grants trigger and column references
-- This migration fixes multiple issues in the grant_subscription_features trigger:
-- 1. product_features table uses 'config' column, not 'properties'
-- 2. usage_records table doesn't have a 'metadata' column
-- 3. product_features table doesn't have an 'updated_at' column

-- First, drop the existing trigger and function
DROP TRIGGER IF EXISTS grant_subscription_features_trigger ON subscriptions;
DROP FUNCTION IF EXISTS grant_subscription_features();

-- Create the corrected function
CREATE OR REPLACE FUNCTION grant_subscription_features()
RETURNS TRIGGER AS $$
DECLARE
    feature_record RECORD;
    existing_grant_id UUID;
    usage_record_id UUID;
BEGIN
    -- Only process active subscriptions
    IF NEW.status = 'active' OR NEW.status = 'trialing' THEN
        -- Get all features associated with the product
        FOR feature_record IN
            SELECT
                pf.*,
                f.type as feature_type,
                f.properties as feature_properties
            FROM product_features pf
            JOIN features f ON f.id = pf.feature_id
            WHERE pf.product_id = NEW.product_id
        LOOP
            -- Check if grant already exists
            SELECT id INTO existing_grant_id
            FROM feature_grants
            WHERE customer_id = NEW.customer_id
                AND feature_id = feature_record.feature_id
                AND subscription_id = NEW.id
            LIMIT 1;

            IF existing_grant_id IS NULL THEN
                -- Create feature grant
                -- FIXED: Use 'config' field from product_features, not 'properties'
                INSERT INTO feature_grants (
                    customer_id,
                    feature_id,
                    subscription_id,
                    properties,
                    granted_at
                ) VALUES (
                    NEW.customer_id,
                    feature_record.feature_id,
                    NEW.id,
                    feature_record.config,  -- FIXED: product_features has 'config' column
                    NOW()
                );

                -- If it's a usage quota feature, create usage record
                IF feature_record.feature_type = 'usage_quota' THEN
                    -- Check if usage record exists
                    SELECT id INTO usage_record_id
                    FROM usage_records
                    WHERE customer_id = NEW.customer_id
                        AND feature_id = feature_record.feature_id
                        AND subscription_id = NEW.id
                        AND period_start <= NOW()
                        AND period_end > NOW()
                    LIMIT 1;

                    IF usage_record_id IS NULL THEN
                        -- FIXED: Removed 'metadata' column which doesn't exist
                        INSERT INTO usage_records (
                            customer_id,
                            feature_id,
                            subscription_id,
                            period_start,
                            period_end,
                            limit_units,
                            consumed_units
                        ) VALUES (
                            NEW.customer_id,
                            feature_record.feature_id,
                            NEW.id,
                            COALESCE(NEW.current_period_start, NOW()),
                            COALESCE(NEW.current_period_end, NOW() + INTERVAL '1 month'),
                            (feature_record.config->>'limit')::numeric,  -- FIXED: Use 'config' not 'properties'
                            0
                        );
                    END IF;
                END IF;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER grant_subscription_features_trigger
    AFTER INSERT OR UPDATE OF status ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION grant_subscription_features();

-- Fix existing product_features data to use 'config' column
-- The original migration incorrectly tried to insert into 'properties' column
-- product_features table has: product_id, feature_id, display_order, config, created_at
UPDATE product_features pf
SET config = COALESCE(
    -- Try to extract limit from any existing config
    CASE
        WHEN pf.config IS NOT NULL THEN pf.config
        ELSE
            -- Set default configs based on feature type
            CASE
                WHEN f.name LIKE '%api_calls%' THEN '{"limit": 1000}'::jsonb
                WHEN f.name LIKE '%llm_tokens%' THEN '{"limit": 10000}'::jsonb
                WHEN f.name LIKE '%analytics%' THEN '{"enabled": true}'::jsonb
                WHEN f.name LIKE '%support%' THEN '{"enabled": true}'::jsonb
                WHEN f.name LIKE '%integrations%' THEN '{"enabled": true}'::jsonb
                ELSE '{}'::jsonb
            END
    END,
    '{}'::jsonb
)
FROM features f
WHERE pf.feature_id = f.id
  AND pf.config IS NULL;

-- Ensure display_order is set for all product_features
UPDATE product_features
SET display_order = 1
WHERE display_order IS NULL;

COMMENT ON FUNCTION grant_subscription_features() IS 'Automatically grants features to customers when subscriptions are created or activated - Fixed column references';

-- Log the fix
DO $$
BEGIN
    RAISE NOTICE 'Fixed grant_subscription_features trigger:';
    RAISE NOTICE '  - Changed feature_record.properties to feature_record.config';
    RAISE NOTICE '  - Removed metadata column from usage_records INSERT';
    RAISE NOTICE '  - Updated existing product_features data';
END $$;