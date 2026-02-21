import { useState, useCallback, useRef, useEffect } from 'react';
import { useUpdateProduct } from '@/hooks/queries/products';
import { useToast } from '@/hooks/use-toast';
import type { Product } from '@/hooks/queries/products';

/**
 * Custom hook for managing product visibility with debouncing
 */
export function useProductVisibility(product: Product | undefined) {
  const [isVisible, setIsVisible] = useState(product?.visible_in_pricing_table ?? true);
  const [isUpdating, setIsUpdating] = useState(false);
  const updateProduct = useUpdateProduct();
  const { toast } = useToast();
  const debounceTimeout = useRef<NodeJS.Timeout | undefined>(undefined);

  // Update local state when product changes
  useEffect(() => {
    if (product) {
      setIsVisible(product.visible_in_pricing_table ?? true);
    }
  }, [product?.visible_in_pricing_table]);

  const toggleVisibility = useCallback(async (newValue: boolean) => {
    // Update UI immediately for responsiveness
    setIsVisible(newValue);

    // Clear any pending updates
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    // Debounce the API call by 500ms
    debounceTimeout.current = setTimeout(async () => {
      if (!product) return;

      setIsUpdating(true);
      try {
        await updateProduct.mutateAsync({
          id: product.id,
          body: {
            visible_in_pricing_table: newValue,
          },
        });

        toast({
          title: newValue ? 'Product made visible' : 'Product hidden',
          description: newValue
            ? 'This product will now appear in your pricing table'
            : 'This product has been hidden from your pricing table',
        });
      } catch (error) {
        // Revert the toggle on error
        setIsVisible(!newValue);

        toast({
          title: 'Error',
          description: 'Failed to update product visibility. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setIsUpdating(false);
      }
    }, 500); // 500ms debounce
  }, [product, updateProduct, toast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, []);

  return {
    isVisible,
    toggleVisibility,
    isUpdating,
  };
}