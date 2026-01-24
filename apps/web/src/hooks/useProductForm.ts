import { useState } from "react";
import type { PriceConfig } from "@/components/Products/PricingEngineSection";
import type { SelectedFeature } from "@/components/Products/FeatureSelector";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

export function useProductForm(organizationId: string) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [trialDays, setTrialDays] = useState(0);

  // Default to monthly pricing
  const [prices, setPrices] = useState<PriceConfig[]>([
    {
      amount_type: "fixed",
      price_amount: undefined,
      price_currency: "usd",
      recurring_interval: "month",
    },
  ]);

  const [features, setFeatures] = useState<SelectedFeature[]>([]);

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
    isValid,
    getValidationError,
  };
}
