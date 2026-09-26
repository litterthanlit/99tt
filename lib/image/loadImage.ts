import { PAINTING_SIZE } from '@/lib/doc/types'

/** Decode an image file, downscaled so its longest side is ≤ maxSide. */
export async function loadImage(file: Blob, maxSide = PAINTING_SIZE): Promise<ImageBitmap> {
  const bmp = await createImageBitmap(file)
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  if (s === 1) return bmp
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * s)
  canvas.height = Math.round(bmp.height * s)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return createImageBitmap(canvas)
}
