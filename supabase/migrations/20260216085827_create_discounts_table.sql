-- Create discounts table
-- This table stores discount codes and coupons for organizations

CREATE TABLE IF NOT EXISTS public.discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    type TEXT NOT NULL CHECK (type IN ('percentage', 'fixed')),
    basis_points INTEGER,
    amount INTEGER,
    currency TEXT,
    duration TEXT NOT NULL DEFAULT 'once' CHECK (duration IN ('once', 'forever', 'repeating')),
    duration_in_months INTEGER,
    max_redemptions INTEGER,
    redemptions_count INTEGER NOT NULL DEFAULT 0,
    stripe_coupon_id TEXT,
    stripe_promotion_code_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_discounts_organization_id ON public.discounts(organization_id);
CREATE INDEX idx_discounts_code ON public.discounts(code) WHERE code IS NOT NULL;
CREATE INDEX idx_discounts_deleted_at ON public.discounts(deleted_at);

-- Unique constraint: codes must be unique within an organization (only for non-deleted)
CREATE UNIQUE INDEX idx_discounts_unique_code_per_org
    ON public.discounts(organization_id, code)
    WHERE deleted_at IS NULL AND code IS NOT NULL;

-- Enable RLS
ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies (users can only access discounts for organizations they belong to)
CREATE POLICY "Users can view discounts for their organizations"
    ON public.discounts
    FOR SELECT
    USING (
        organization_id IN (
            SELECT uo.organization_id
            FROM public.user_organizations uo
            WHERE uo.user_id = auth.uid()
              AND uo.deleted_at IS NULL
        )
    );

CREATE POLICY "Users can insert discounts for their organizations"
    ON public.discounts
    FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT uo.organization_id
            FROM public.user_organizations uo
            WHERE uo.user_id = auth.uid()
              AND uo.deleted_at IS NULL
        )
    );

CREATE POLICY "Users can update discounts for their organizations"
    ON public.discounts
    FOR UPDATE
    USING (
        organization_id IN (
            SELECT uo.organization_id
            FROM public.user_organizations uo
            WHERE uo.user_id = auth.uid()
              AND uo.deleted_at IS NULL
        )
    );

CREATE POLICY "Users can delete discounts for their organizations"
    ON public.discounts
    FOR DELETE
    USING (
        organization_id IN (
            SELECT uo.organization_id
            FROM public.user_organizations uo
            WHERE uo.user_id = auth.uid()
              AND uo.deleted_at IS NULL
        )
    );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_discounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_discounts_updated_at
    BEFORE UPDATE ON public.discounts
    FOR EACH ROW
    EXECUTE FUNCTION update_discounts_updated_at();

-- Junction table: links discounts to specific products
-- If a discount has NO rows here, it applies to ALL products
CREATE TABLE IF NOT EXISTS public.discount_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discount_id UUID NOT NULL REFERENCES public.discounts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(discount_id, product_id)
);

CREATE INDEX idx_discount_products_discount ON public.discount_products(discount_id);
CREATE INDEX idx_discount_products_product ON public.discount_products(product_id);

ALTER TABLE public.discount_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view discount_products for their organizations"
    ON public.discount_products
    FOR SELECT
    USING (
        discount_id IN (
            SELECT d.id FROM public.discounts d
            WHERE d.organization_id IN (
                SELECT uo.organization_id
                FROM public.user_organizations uo
                WHERE uo.user_id = auth.uid()
                  AND uo.deleted_at IS NULL
            )
        )
    );

CREATE POLICY "Users can insert discount_products for their organizations"
    ON public.discount_products
    FOR INSERT
    WITH CHECK (
        discount_id IN (
            SELECT d.id FROM public.discounts d
            WHERE d.organization_id IN (
                SELECT uo.organization_id
                FROM public.user_organizations uo
                WHERE uo.user_id = auth.uid()
                  AND uo.deleted_at IS NULL
            )
        )
    );

CREATE POLICY "Users can delete discount_products for their organizations"
    ON public.discount_products
    FOR DELETE
    USING (
        discount_id IN (
            SELECT d.id FROM public.discounts d
            WHERE d.organization_id IN (
                SELECT uo.organization_id
                FROM public.user_organizations uo
                WHERE uo.user_id = auth.uid()
                  AND uo.deleted_at IS NULL
            )
        )
    );
