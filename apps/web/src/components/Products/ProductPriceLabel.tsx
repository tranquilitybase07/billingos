import { isLegacyRecurringPrice, Product, ProductPrice } from '@/utils/product'
import AmountLabel from '../Shared/AmountLabel'

interface ProductPriceLabelProps {
  product: Product
}

function isSeatBasedPrice(price: ProductPrice): boolean {
  return price.amount_type === 'seat_based'
}

const ProductPriceLabel: React.FC<ProductPriceLabelProps> = ({
  product,
}: ProductPriceLabelProps) => {
  const staticPrice = product.prices.find(({ amount_type }) =>
    ['fixed', 'custom', 'free', 'seat_based'].includes(amount_type),
  )

  if (!staticPrice) {
    return null
  }

  if (staticPrice.amount_type === 'fixed' && staticPrice.price_amount && staticPrice.price_currency) {
    return (
      <AmountLabel
        amount={staticPrice.price_amount}
        currency={staticPrice.price_currency}
        interval={
          isLegacyRecurringPrice(staticPrice)
            ? staticPrice.recurring_interval
            : product.recurring_interval || undefined
        }
        intervalCount={product.recurring_interval_count}
      />
    )
  } else if (isSeatBasedPrice(staticPrice)) {
    // TODO: Implement seat-based pricing display when type is available
    return (
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs text-gray-500 dark:text-gray-500">
          Seat-based pricing
        </span>
      </div>
    )
  } else if (staticPrice.amount_type === 'custom') {
    return <div className="text-[min(1em,24px)]">Pay what you want</div>
  } else {
    return <div className="text-[min(1em,24px)]">Free</div>
  }
}

export default ProductPriceLabel
