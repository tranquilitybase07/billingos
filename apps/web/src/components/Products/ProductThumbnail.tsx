import { Texture as TextureOutlined } from '@mui/icons-material'
import { Product } from '@/utils/product'
import { cn } from '@/lib/utils'

export const ProductThumbnail = ({
  size = 'small',
  product,
}: {
  size?: 'small' | 'medium'
  product: Product
}) => {
  let coverUrl = null
  if (product.medias && product.medias.length > 0) {
    coverUrl = product.medias[0].public_url
  }

  const sizeClassName = size === 'small' ? 'h-10 rounded-md' : 'h-24 rounded-xl'

  return (
    <div
      className={cn(
        'hidden aspect-square h-10 shrink-0 grow-0 flex-col items-center justify-center border border-transparent bg-gray-100 text-center dark:border-gray-700 dark:bg-gray-800 md:flex',
        sizeClassName,
      )}
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={product.name}
          className={cn('aspect-square h-10 object-cover', sizeClassName)}
        />
      ) : (
        <TextureOutlined fontSize="medium" className="text-gray-300 dark:text-gray-600" />
      )}
    </div>
  )
}
