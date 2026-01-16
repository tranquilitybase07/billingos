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
    if (prices.some((p) => p.amount_type === "fixed" && !p.price_amount))
      return false;
    return true;
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
  };
}
