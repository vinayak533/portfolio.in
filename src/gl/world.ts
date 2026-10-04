import { Color, Vector3 } from 'three'
import { palette, layout } from '../theme'

/** Linear-space colours for shaders. */
export const colors = {
  base: new Color(palette.base),
  ink: new Color(palette.ink),
  accent: new Color(palette.accent),
}

/** World anchors for every act. Units are metres-ish; camera fov ~40. */
export const world = {
  hero: {
    /** Plateau top centre of the floating island. */
    island: new Vector3(0, 5.2, 0),
    /**
     * Resting camera eye and gaze for the hero composition: a slightly raised,
     * ~35mm view with the island just above centre, the horizon in the upper
     * third and a lot of empty sky around it.
     */
    eye: new Vector3(0.9, 6.75, 11.2),
    target: new Vector3(0, 5.2, 0),
    /** The cloud sea the island floats in. */
    cloudBase: 0.7,
  },
  about: { center: new Vector3(0, 0, -34) },
  works: { z: -74, spacing: layout.worksSpacing, startX: layout.worksStartX },
  experience: {
    points: [
      new Vector3(33.5, -1.2, -78),
      new Vector3(37.5, 0.4, -94),
      new Vector3(32.5, 1.6, -110),
      new Vector3(37.0, -0.6, -126),
      new Vector3(34.0, 0.6, -142),
      new Vector3(34.0, 0.4, -152),
    ],
  },
  contact: { center: new Vector3(34, 0.4, -166) },
}


/**
 * Moon direction, derived from the hero camera so the moon always lands in the
 * upper right of the opening frame, low over the horizon, where the towering
 * cloud bank can half hide it.
 */
export const moonDir = (() => {
  const f = world.hero.target.clone().sub(world.hero.eye).normalize()
  const r = f.clone().cross(new Vector3(0, 1, 0)).normalize()
  const u = r.clone().cross(f).normalize()
  return f.add(r.multiplyScalar(0.21)).add(u.multiplyScalar(0.2)).normalize()
})()

/**
 * Key light for the night scene: the moon's bearing, raised to ~32 degrees.
 * A moon this low would only graze the island; lifting the key keeps the
 * backlit, silver-rimmed look while the grass still reads from above.
 */
export const keyDir = (() => {
  const flat = new Vector3(moonDir.x, 0, moonDir.z).normalize()
  const e = (32 * Math.PI) / 180
  return flat.multiplyScalar(Math.cos(e)).setY(Math.sin(e)).normalize()
})()

/**
 * Night palette for Act I (linear). Midnight navy, charcoal, muted forest
 * green and moonlit silver, with a whisper of warmth at the horizon. The rest
 * of the site keeps the three-colour palette above.
 */
export const night = {
  zenith: new Color('#060a14'),
  horizon: new Color('#262f42'),
  warm: new Color('#5a4a3a'),
  moon: new Color('#e6ebf3'),
  silver: new Color('#c9d3e2'),
  cloudShadow: new Color('#141b28'),
  cloudLit: new Color('#9ca7ba'),
  haze: new Color('#151c29'),
  ambientSky: new Color('#2a3650'),
  ambientGround: new Color('#07090d'),
  grassRoot: new Color('#0b1109'),
  grassMid: new Color('#24321a'),
  grassTip: new Color('#56643a'),
  grassDry: new Color('#77734f'),
  screen: new Color('#dfe9ff'),
  screenLight: new Color('#c7d8ff'),
}
