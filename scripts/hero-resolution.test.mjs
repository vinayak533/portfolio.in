import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { photoTierForView, sceneSizeForView, PHOTO_WIDTHS } from '../src/hero/resolution.ts'

const desktop = {
  width: 1920, height: 1080, dpr: 1, aspect: 1672 / 941,
  zoom: 2.7, nearExponent: 1.45, maxTextureSize: 16384, cap: '8k', compact: false,
}

test('Full HD camera push requests 8K even though the opening frame fits in 2K', () => {
  assert.equal(photoTierForView({ ...desktop, zoom: 1, nearExponent: 1 }), '2k')
  assert.equal(photoTierForView(desktop), '8k')
})

test('portrait cover crop budgets for the full image width, not just viewport width', () => {
  assert.equal(photoTierForView({ ...desktop, width: 390, height: 844, dpr: 1.5, zoom: 2, compact: true }), '4k')
})

test('memory preference and GPU limits select supported tiers before requesting them', () => {
  assert.equal(photoTierForView({ ...desktop, compact: true }), '4k')
  assert.equal(photoTierForView({ ...desktop, cap: '4k' }), '4k')
  assert.equal(photoTierForView({ ...desktop, maxTextureSize: 4096 }), '4k')
  assert.equal(photoTierForView({ ...desktop, maxTextureSize: 2048 }), '2k')
  assert.equal(photoTierForView({ ...desktop, maxTextureSize: 1024 }), 'off')
  assert.equal(photoTierForView({ ...desktop, cap: 'off' }), 'off')
})

test('integrated desktop keeps native Full HD detail at minimum adaptive quality', () => {
  assert.deepEqual(sceneSizeForView(1920, 1080, 1, 4_200_000, 0.45), { width: 1920, height: 1080 })
})

test('high tier supports native 4K, with bounded scaling on retina and large displays', () => {
  assert.deepEqual(sceneSizeForView(3840, 2160, 1, 8_400_000, 1), { width: 3840, height: 2160 })
  for (const [w, h, dpr, budget] of [[1920, 1080, 2, 4_200_000], [390, 844, 1.5, 2_100_000], [7680, 4320, 2, 8_400_000]]) {
    for (const quality of [0.45, 0.8, 1]) {
      const s = sceneSizeForView(w, h, dpr, budget, quality)
      assert.ok(s.width * s.height <= budget)
      assert.ok(s.width <= w * dpr && s.height <= h * dpr)
      assert.ok(Math.abs(s.width / s.height - w / h) < 0.01)
      if (w * h <= budget) assert.ok(s.width >= w && s.height >= h)
    }
  }
})

test('shipped AVIF/WebP tiers have the advertised dimensions and original framing', async () => {
  for (const [tier, width] of Object.entries(PHOTO_WIDTHS)) {
    for (const ext of ['avif', 'webp']) {
      const file = new URL(`../src/assets/hero-hi/${tier}.${ext}`, import.meta.url)
      const m = await sharp(fileURLToPath(file)).metadata()
      assert.equal(m.width, width)
      assert.equal(m.height, Math.round(width * 941 / 1672))
    }
  }
})
