export const PHOTO_WIDTHS = { '2k': 2048, '4k': 3840, '8k': 7680 } as const
export type PhotoTier = keyof typeof PHOTO_WIDTHS

/** Budget for the cover-fitted image at the closest visible camera position. */
export function photoTierForView(o: {
  width: number
  height: number
  dpr: number
  aspect: number
  zoom: number
  nearExponent: number
  maxTextureSize: number
  cap: PhotoTier | 'off'
  compact: boolean
}): PhotoTier | 'off' {
  if (o.cap === 'off') return 'off'
  const limit = Math.min(PHOTO_WIDTHS[o.cap], o.compact ? 3840 : 7680, o.maxTextureSize)
  const available = (Object.keys(PHOTO_WIDTHS) as PhotoTier[]).filter(t => PHOTO_WIDTHS[t] <= limit)
  const required = Math.max(o.width, o.height * o.aspect) * o.dpr * Math.pow(o.zoom, o.nearExponent)
  return available.find(t => PHOTO_WIDTHS[t] >= required) ?? available.at(-1) ?? 'off'
}

/** Keep at least one scene sample per CSS pixel within the device's pixel budget. */
export function sceneSizeForView(width: number, height: number, dpr: number, budget: number, quality: number) {
  const nativePixels = width * height * dpr * dpr
  const floor = Math.min(width * height, budget)
  const pixels = Math.min(nativePixels, Math.max(floor, budget * quality))
  const scale = Math.min(1, Math.sqrt(pixels / nativePixels))
  return { width: Math.max(1, Math.floor(width * dpr * scale)), height: Math.max(1, Math.floor(height * dpr * scale)) }
}
