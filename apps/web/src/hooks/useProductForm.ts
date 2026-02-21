import { useState } from "react";
import type { PriceConfig } from "@/components/Products/PricingEngineSection";
import type { SelectedFeature } from "@/components/Products/FeatureSelector";
import type { Product } from "@/hooks/queries/products";

export interface ProductFormData {
  organization_id: string;
  name: string;
  description: string;
  recurring_interval: "month" | "year" | "week" | "day";
  recurring_interval_count: number;
  trial_days: number;
  prices: PriceConfig[];
  features: SelectedFeature[];
  is_archived?: boolean;
  visible_in_pricing_table?: boolean; // Only for create, not update
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

/** Convert an existing Product into initial form state */
function productToFormState(product: Product) {
  const prices: PriceConfig[] = product.prices.map((p) => ({
    amount_type: (p.amount_type === "free" ? "free" : "fixed") as "fixed" | "free",
    price_amount: p.price_amount ?? undefined,
    price_currency: p.price_currency ?? "usd",
    recurring_interval: p.recurring_interval,
  }));

  const features: SelectedFeature[] = (product.features ?? []).map((f, i) => {
    // API returns nested feature data under 'features' key (table name from Supabase join)
    const featureData = (f as any).features || (f as any).feature;

    return {
      feature_id: featureData?.id || f.feature_id,
      display_order: f.display_order ?? i + 1,
      config: f.config ?? {},
      featureName: featureData?.name,
      featureTitle: featureData?.title,
      featureType: featureData?.type as "boolean_flag" | "usage_quota" | "numeric_limit",
    };
  });

  const currency = prices[0]?.price_currency ?? "usd";
  const trialDays = product.trial_days ?? 0;

  return { prices, features, currency, trialDays };
}

export function useProductForm(organizationId: string, initialProduct?: Product) {
  const initial = initialProduct ? productToFormState(initialProduct) : null;

  const [name, setName] = useState(initialProduct?.name ?? "");
  const [description, setDescription] = useState(initialProduct?.description ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "usd");
  const [trialDays, setTrialDays] = useState(initial?.trialDays ?? 0);

  const [prices, setPrices] = useState<PriceConfig[]>(
    initial?.prices ?? [
      {
        amount_type: "fixed",
        price_amount: undefined,
        price_currency: "usd",
        recurring_interval: "month",
      },
    ],
  );

  const [features, setFeatures] = useState<SelectedFeature[]>(initial?.features ?? []);

  // Store initial product for change detection
  const initialProductRef = initialProduct;

  // Sync currency across all prices
  const handleCurrencyChange = (newCurrency: string) => {
    setCurrency(newCurrency);
    setPrices((prev) =>
      prev.map((p) => ({ ...p, price_currency: newCurrency }))
    );
  };

  // Build API payload
  const buildPayload = (): ProductFormData => {
    // Determine primary recurring interval from prices
    const primaryInterval =
      prices.find((p) => p.recurring_interval === "month")
        ?.recurring_interval ||
      prices[0]?.recurring_interval ||
      "month";

    return {
      organization_id: organizationId,
      name,
      description,
      recurring_interval: primaryInterval,
      recurring_interval_count: 1,
      trial_days: trialDays,
      prices: prices.map((p) => ({
        ...p,
        price_currency: currency,
      })),
      features: features.map(({ feature_id, display_order, config }) => ({
        feature_id,
        display_order,
        config,
      })),
    };
  };

  // Validation
  const isValid = (): boolean => {
    if (!name.trim()) return false;
    if (prices.length === 0) return false;

    // Validate each price
    for (const price of prices) {
      if (price.amount_type === "fixed") {
        // Must have a price amount
        if (!price.price_amount) return false;

        // Must be a valid positive number
        if (isNaN(price.price_amount) || price.price_amount <= 0) return false;

        // Must be in cents (whole number)
        if (!Number.isInteger(price.price_amount)) return false;
      }
    }

    return true;
  };

  // Get validation error message
  const getValidationError = (): string | null => {
    if (!name.trim()) return "Product name is required";
    if (prices.length === 0) return "At least one price is required";

    for (const price of prices) {
      if (price.amount_type === "fixed") {
        if (!price.price_amount) {
          return `Price amount is required for ${price.recurring_interval}ly billing`;
        }
        if (isNaN(price.price_amount) || price.price_amount <= 0) {
          return `Price must be a valid positive number for ${price.recurring_interval}ly billing`;
        }
        if (!Number.isInteger(price.price_amount)) {
          return `Price must have at most 2 decimal places for ${price.recurring_interval}ly billing`;
        }
      }
    }

    return null;
  };

  // Build update payload with change detection
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildUpdatePayload = (): any => {
    if (!initialProductRef) {
      // If no initial product, use buildPayload for create
      return buildPayload();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatePayload: any = {};

    // Check basic fields
    if (name !== initialProductRef.name) {
      updatePayload.name = name;
    }
    if (description !== (initialProductRef.description ?? "")) {
      updatePayload.description = description;
    }
    if (trialDays !== (initialProductRef.trial_days ?? 0)) {
      updatePayload.trial_days = trialDays;
    }

    // Price change detection
    const initialPrices = initialProductRef.prices || [];
    const currentPrices = prices;

    // Helper to compare prices (ignoring IDs)
    const priceEquals = (p1: any, p2: any) => {
      return (
        p1.amount_type === p2.amount_type &&
        p1.price_amount === p2.price_amount &&
        p1.price_currency === p2.price_currency &&
        p1.recurring_interval === p2.recurring_interval
      );
    };

    // Find prices to archive (exist in initial but not in current)
    const pricesToArchive = initialPrices
      .filter((initialPrice) => {
        return !currentPrices.some((currentPrice) =>
          priceEquals(initialPrice, currentPrice)
        );
      })
      .map((p) => p.id)
      .filter(Boolean);

    // Find prices to create (exist in current but not in initial)
    const pricesToCreate = currentPrices.filter((currentPrice) => {
      return !initialPrices.some((initialPrice) =>
        priceEquals(initialPrice, currentPrice)
      );
    });

    if (pricesToArchive.length > 0 || pricesToCreate.length > 0) {
      updatePayload.prices = {};
      if (pricesToArchive.length > 0) {
        updatePayload.prices.archive = pricesToArchive;
      }
      if (pricesToCreate.length > 0) {
        updatePayload.prices.create = pricesToCreate.map((p) => ({
          amount_type: p.amount_type,
          price_amount: p.price_amount,
          price_currency: p.price_currency ?? currency,
          recurring_interval: p.recurring_interval,
        }));
      }
    }

    // Feature change detection
    const initialFeatures = (initialProductRef.features || [])
      .map((f) => f.feature_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const currentFeatures = features
      .map((f) => f.feature_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    // Features to unlink (exist in initial but not in current)
    const featuresToUnlink = initialFeatures.filter(
      (id) => !currentFeatures.includes(id)
    );

    // Features to link (exist in current but not in initial)
    const featuresToLink = features.filter(
      (f) => !initialFeatures.includes(f.feature_id)
    );

    // Features to update (exist in both but config/display_order changed)
    const featuresToUpdate = features
      .filter((currentFeature) => {
        const initialFeature = initialProductRef.features?.find(
          (f) => f.feature_id === currentFeature.feature_id
        );
        if (!initialFeature) return false;

        // Check if config or display_order changed
        const configChanged =
          JSON.stringify(currentFeature.config) !==
          JSON.stringify(initialFeature.config);
        const orderChanged =
          currentFeature.display_order !== initialFeature.display_order;

        return configChanged || orderChanged;
      })
      .map((f) => ({
        feature_id: f.feature_id,
        display_order: f.display_order,
        config: f.config,
      }));

    if (
      featuresToUnlink.length > 0 ||
      featuresToLink.length > 0 ||
      featuresToUpdate.length > 0
    ) {
      updatePayload.features = {};
      if (featuresToUnlink.length > 0) {
        updatePayload.features.unlink = featuresToUnlink;
      }
      if (featuresToLink.length > 0) {
        updatePayload.features.link = featuresToLink.map((f) => ({
          feature_id: f.feature_id,
          display_order: f.display_order,
          config: f.config,
        }));
      }
      if (featuresToUpdate.length > 0) {
        updatePayload.features.update = featuresToUpdate;
      }
    }

    return updatePayload;
  };

  return {
    // Form state
    name,
    setName,
    description,
    setDescription,
    currency,
    setCurrency: handleCurrencyChange,
    trialDays,
    setTrialDays,
    prices,
    setPrices,
    features,
    setFeatures,

    // Helpers
    buildPayload,
    buildUpdatePayload,
    isValid,
    getValidationError,
    isEditMode: !!initialProductRef,
  };
}
