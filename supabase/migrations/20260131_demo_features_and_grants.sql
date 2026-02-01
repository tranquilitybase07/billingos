-- Demo Features and Feature Grants Migration
-- This creates example features for testing the feature gating system

-- First, let's get the organization ID (assuming we have at least one)
DO $$
DECLARE
    org_id UUID;
    basic_product_id UUID;
    pro_product_id UUID;
    enterprise_product_id UUID;
    api_calls_feature_id UUID;
    llm_tokens_feature_id UUID;
    advanced_analytics_feature_id UUID;
    priority_support_feature_id UUID;
    custom_integrations_feature_id UUID;
BEGIN
    -- Get the first organization
    SELECT id INTO org_id FROM organizations LIMIT 1;

    IF org_id IS NOT NULL THEN
        -- Get product IDs
        SELECT id INTO basic_product_id FROM products WHERE organization_id = org_id AND name ILIKE '%basic%' LIMIT 1;
        SELECT id INTO pro_product_id FROM products WHERE organization_id = org_id AND name ILIKE '%pro%' LIMIT 1;
        SELECT id INTO enterprise_product_id FROM products WHERE organization_id = org_id AND name ILIKE '%enterprise%' LIMIT 1;

        -- Create features for the organization

        -- 1. API Calls (Usage Quota)
        INSERT INTO features (organization_id, name, title, description, type, properties, metadata)
        VALUES (
            org_id,
            'api_calls',
            'API Calls',
            'Monthly API call limit',
            'usage_quota',
            '{"unit": "calls", "period": "month"}'::jsonb,
            '{"category": "usage"}'::jsonb
        )
        ON CONFLICT (organization_id, name) DO UPDATE
        SET updated_at = NOW()
        RETURNING id INTO api_calls_feature_id;

        -- 2. LLM Tokens (Usage Quota)
        INSERT INTO features (organization_id, name, title, description, type, properties, metadata)
        VALUES (
            org_id,
            'llm_tokens',
            'LLM Tokens',
            'Monthly LLM token usage limit',
            'usage_quota',
            '{"unit": "tokens", "period": "month"}'::jsonb,
            '{"category": "usage"}'::jsonb
        )
        ON CONFLICT (organization_id, name) DO UPDATE
        SET updated_at = NOW()
        RETURNING id INTO llm_tokens_feature_id;

        -- 3. Advanced Analytics (Boolean Flag)
        INSERT INTO features (organization_id, name, title, description, type, properties, metadata)
        VALUES (
            org_id,
            'advanced_analytics',
            'Advanced Analytics',
            'Access to advanced analytics dashboard',
            'boolean_flag',
            '{}'::jsonb,
            '{"category": "feature"}'::jsonb
        )
        ON CONFLICT (organization_id, name) DO UPDATE
        SET updated_at = NOW()
        RETURNING id INTO advanced_analytics_feature_id;

        -- 4. Priority Support (Boolean Flag)
        INSERT INTO features (organization_id, name, title, description, type, properties, metadata)
        VALUES (
            org_id,
            'priority_support',
            'Priority Support',
            'Access to priority customer support',
            'boolean_flag',
            '{}'::jsonb,
            '{"category": "support"}'::jsonb
        )
        ON CONFLICT (organization_id, name) DO UPDATE
        SET updated_at = NOW()
        RETURNING id INTO priority_support_feature_id;

        -- 5. Custom Integrations (Boolean Flag)
        INSERT INTO features (organization_id, name, title, description, type, properties, metadata)
        VALUES (
            org_id,
            'custom_integrations',
            'Custom Integrations',
            'Ability to create custom integrations',
            'boolean_flag',
            '{}'::jsonb,
            '{"category": "feature"}'::jsonb
        )
        ON CONFLICT (organization_id, name) DO UPDATE
        SET updated_at = NOW()
        RETURNING id INTO custom_integrations_feature_id;

        -- Link features to products

        -- Basic Plan Features
        IF basic_product_id IS NOT NULL THEN
            -- API Calls: 1,000/month
            INSERT INTO product_features (product_id, feature_id, properties, metadata)
            VALUES (
                basic_product_id,
                api_calls_feature_id,
                '{"limit": 1000}'::jsonb,
                '{"tier": "basic"}'::jsonb
            )
            ON CONFLICT (product_id, feature_id) DO UPDATE
            SET properties = '{"limit": 1000}'::jsonb, updated_at = NOW();

            -- LLM Tokens: 10,000/month
            INSERT INTO product_features (product_id, feature_id, properties, metadata)
            VALUES (
                basic_product_id,
                llm_tokens_feature_id,
                '{"limit": 10000}'::jsonb,
                '{"tier": "basic"}'::jsonb
            )
            ON CONFLICT (product_id, feature_id) DO UPDATE
            SET properties = '{"limit": 10000}'::jsonb, updated_at = NOW();

            -- No advanced features for Basic plan
        END IF;

        -- Pro Plan Features
        IF pro_product_id IS NOT NULL THEN
            -- API Calls: 10,000/month
            INSERT INTO product_features (product_id, feature_id, properties, metadata)
            VALUES (
                pro_product_id,
                api_calls_feature_id,
                '{"limit": 10000}'::jsonb,
                '{"tier": "pro"}'::jsonb
            )
            ON CONFLICT (product_id, feature_id) DO UPDATE
            SET properties = '{"limit": 10000}'::jsonb, updated_at = NOW();

            -- LLM Tokens: 100,000/month
            INSERT INTO product_features (product_id, feature_id, properties, metadata)
            VALUES (
                pro_product_id,
                llm_tokens_feature_id,
                '{"limit": 100000}'::jsonb,
                '{"tier": "pro"}'::jsonb
            )
            ON CONFLICT (product_id, feature_id) DO UPDATE
            SET properties = '{"limit": 100000}'::jsonb, updated_at = NOW();

            -- Advanced Analytics: Enabled
            INSERT INTO product_features (product_id, feature_id, properties, metadata)
            VALUES (
                pro_product_id,
                advanced_analytics_feature_id,
                '{"enabled": true}'::jsonb,
                '{"tier": "pro"}'::jsonb
            )
            ON CONFLICT (product_id, feature_id) DO UPDATE
            SET properties = '{"enabled": true}'::jsonb, updated_at = NOW();

            -- Priority Support: Enabled
            INSERT INTO product_features (product_id, feature_id, properties, metadata)
            VALUES (
                pro_product_id,
                priority_support_feature_id,
                '{"enabled": true}'::jsonb,
                '{"tier": "pro"}'::jsonb
            )
            ON CONFLICT (product_id, feature_id) DO UPDATE
            SET properties = '{"enabled": true}'::jsonb, updated_at = NOW();
        END IF;

        -- Enterprise Plan Features
        IF enterprise_product_id IS NOT NULL THEN
            -- API Calls: Unlimited (very high limit)
            INSERT INTO product_features (product_id, feature_id, properties, metadata)
            VALUES (
                enterprise_product_id,
                api_calls_feature_id,
                '{"limit": 1000000}'::jsonb,
                '{"tier": "enterprise", "unlimited": true}'::jsonb
            )
            ON CONFLICT (product_id, feature_id) DO UPDATE
            SET properties = '{"limit": 1000000}'::jsonb, updated_at = NOW();

            -- LLM Tokens: Unlimited (very high limit)
            INSERT INTO product_features (product_id, feature_id, properties, metadata)
            VALUES (
                enterprise_product_id,
                llm_tokens_feature_id,
                '{"limit": 10000000}'::jsonb,
                '{"tier": "enterprise", "unlimited": true}'::jsonb
            )
            ON CONFLICT (product_id, feature_id) DO UPDATE
            SET properties = '{"limit": 10000000}'::jsonb, updated_at = NOW();

            -- Advanced Analytics: Enabled
            INSERT INTO product_features (product_id, feature_id, properties, metadata)
            VALUES (
                enterprise_product_id,
                advanced_analytics_feature_id,
                '{"enabled": true}'::jsonb,
                '{"tier": "enterprise"}'::jsonb
            )
            ON CONFLICT (product_id, feature_id) DO UPDATE
            SET properties = '{"enabled": true}'::jsonb, updated_at = NOW();

            -- Priority Support: Enabled
            INSERT INTO product_features (product_id, feature_id, properties, metadata)
            VALUES (
                enterprise_product_id,
                priority_support_feature_id,
                '{"enabled": true}'::jsonb,
                '{"tier": "enterprise"}'::jsonb
            )
            ON CONFLICT (product_id, feature_id) DO UPDATE
            SET properties = '{"enabled": true}'::jsonb, updated_at = NOW();

            -- Custom Integrations: Enabled (Enterprise only)
            INSERT INTO product_features (product_id, feature_id, properties, metadata)
            VALUES (
                enterprise_product_id,
                custom_integrations_feature_id,
                '{"enabled": true}'::jsonb,
                '{"tier": "enterprise"}'::jsonb
            )
            ON CONFLICT (product_id, feature_id) DO UPDATE
            SET properties = '{"enabled": true}'::jsonb, updated_at = NOW();
        END IF;

        RAISE NOTICE 'Demo features and product links created successfully for organization %', org_id;
    ELSE
        RAISE WARNING 'No organizations found. Please create an organization and products first.';
    END IF;
END $$;

-- Create a function to automatically grant features when a subscription is created
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
                    feature_record.properties,
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
                        INSERT INTO usage_records (
                            customer_id,
                            feature_id,
                            subscription_id,
                            period_start,
                            period_end,
                            limit_units,
                            consumed_units,
                            metadata
                        ) VALUES (
                            NEW.customer_id,
                            feature_record.feature_id,
                            NEW.id,
                            COALESCE(NEW.current_period_start, NOW()),
                            COALESCE(NEW.current_period_end, NOW() + INTERVAL '1 month'),
                            (feature_record.properties->>'limit')::numeric,
                            0,
                            '{"auto_created": true}'::jsonb
                        );
                    END IF;
                END IF;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS grant_subscription_features_trigger ON subscriptions;
CREATE TRIGGER grant_subscription_features_trigger
    AFTER INSERT OR UPDATE OF status ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION grant_subscription_features();

-- Apply the trigger to existing active subscriptions
UPDATE subscriptions
SET updated_at = NOW()
WHERE status IN ('active', 'trialing');

COMMENT ON FUNCTION grant_subscription_features() IS 'Automatically grants features to customers when subscriptions are created or activated';