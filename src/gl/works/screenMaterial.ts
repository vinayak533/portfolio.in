import { ShaderMaterial, Vector2, type Texture } from 'three'
import screenVert from '../shaders/works/screen.vert'
import screenFrag from '../shaders/works/screen.frag'
import { colors } from '../world'
import type { VisualKind } from '../../content'

export const KIND_INDEX: Record<VisualKind, number> = { rag: 0, vision: 1, pipeline: 2, agents: 3, recsys: 4 }

/** One material per screen; also used by the overlay's live media canvas. */
export function createScreenMaterial(kind: VisualKind, aspect: number, standalone = false) {
  // Standalone (overlay canvas) renders straight to screen, so it needs its own
  // tone mapping + colour-space output; in the main scene post handles both.
  const fragmentShader = standalone
    ? screenFrag.replace(/}\s*$/, '#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}')
    : screenFrag
  return new ShaderMaterial({
    vertexShader: screenVert,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uKind: { value: KIND_INDEX[kind] },
      uHover: { value: 0 },
      uFocus: { value: 1 },
      uMouse: { value: new Vector2(0.5, 0.5) },
      uAspect: { value: aspect },
      uOpacity: { value: 1 },
      uMedia: { value: null as Texture | null },
      uMediaMix: { value: 0 },
      uMediaAspect: { value: 16 / 9 },
      uMediaDecode: { value: 0 },
      uAccent: { value: colors.accent },
      uInk: { value: colors.ink },
    },
  })
}
