/**
 * The robot's life in the hero: one scene, one action. It sits at its desk and
 * codes, and never leaves the chair. One continuous loop of small seated
 * actions, driven by its own clock (delta time) and the shared 96 BPM beat
 * (beat.ts), never more than one at a time, each blended in and out over
 * 0.5-0.8 s with a 1-2 s settle before the next may start:
 *
 *   type      the main action (about two thirds of the time): bursts of 6-14
 *             keys at a human pace with 0.8-2 s pauses; each press curls a
 *             finger (both segments), nudges its wrist and flashes its key
 *   read      the hands hover above the keys while the eyes scan the lines
 *             left to right in time with the code's scroll
 *   compile   every 10-12 s: the terminal prints for 1.2 s, the build passes
 *             (the screen's sweep, the commit pulse) and the head gives a quick
 *             nod with the eyes ^ ^ for 400 ms
 *   glance    every 12-15 s: the head and eyes turn about 15 deg toward the
 *             viewer for 1.2 s, then back to the screen
 *   phones    rarely (every 30-40 s): the near hand lifts to its headphone cup
 *             and returns to the keys
 *
 * Always on, and subtle: the breath (the torso +-0.6% over 5 s, the chair
 * swaying with it by under 1 deg), the head's bob (pitch, about 1.5 deg on
 * each beat) and a light toe tap on beats 2 and 4. Nothing else moves to the
 * beat.
 *
 * The pose is a set of targets in the body's frame (hips, torso, ankles, wrists,
 * hand directions, finger curl), applied with two-bone solves. The hands' home
 * is read off the laptop's keyboard (wherever model.ts put it): the middle
 * fingertips resting on the home row, the hands turned with the keys. A
 * collision pass then lifts a wrist whenever a fingertip, the hand or the
 * forearm would pass through the keycaps, the laptop or the table. It writes the
 * body and reports what the head and eyes should do; the engine blends the
 * pointer over the head (never the body) and hands everything to the scroll.
 */
import { Object3D, Vector3 } from 'three'
import { BEAT, type BeatSample } from './beat'
import { orient, span, type Arm, type Leg } from './body'
import { keyAt } from './props'
import type { RobotModel } from './model'

export type EyeState = 'focused' | 'reading' | 'happy' | 'glance'
export type Action = 'type' | 'read' | 'compile' | 'glance' | 'phones'

export interface PerformOut {
  action: Action
  /** Head motion on top of its aim (radians) and its dip (body units). */
  nod: number
  roll: number
  dip: number
  /** 0..1: a glance at the viewer (head ~15 deg, eyes the rest). */
  glance: number
  /** Eye shift (head units) and narrowing. */
  eyeX: number
  eyeY: number
  narrow: number
  joy: boolean
  state: EyeState
  /** The equaliser's amplitude. */
  eq: number
  /** The laptop's scroll speed (1 while typing or reading, 0.5 otherwise). */
  scroll: number
  /** Seconds into the current build (the terminal printing), or -1. */
  buildT: number
  /** Set for one frame: the build just passed (the sweep, the check mark, the pulse, the nod). */
  success: boolean
  /** Read only, for the backdrop: seconds until the next build is due (it starts at the next pause after), or Infinity while one runs. */
  compileIn: number
}

export interface PerformOptions {
  /** Motion amplitude: 1, or 0.7 in lite (the typing). */
  amp: number
  /** 0..1: the performance's weight (fades out as the scroll takes over). */
  weight: number
  /** Static seated pose (reduced motion). */
  still: boolean
  /** The glide (0..1): the body turns to face `faceYaw` (stage space) as the camera closes in. */
  turn: number
  faceYaw: number
}

const lerpA = (a: number, b: number, t: number) => a + (b - a) * t
const lerpAng = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (x: number) => {
  const t = clamp01(x)
  return t * t * (3 - 2 * t)
}
const easeInOut = (t: number) => {
  const x = clamp01(t)
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}
/** Ease in over `inT`, hold, ease out over `outT`, across a span of `len` seconds. */
const envelope = (t: number, len: number, inT: number, outT: number) => easeInOut(t / inT) * (1 - easeInOut((t - (len - outT)) / outT))
const rand = (a: number, b: number) => a + Math.random() * (b - a)

/** One line of code scrolls past in this long (s). */
const LINE = 0.8
const PRESS = { down: 0.055, up: 0.16 }
/** Seated: the hips on the seat, the feet flat under the knees, the back nearly straight (under 10 deg). */
const SEAT_HIP = 0.462
const SEAT_FEET_Z = 0.31
const LEAN = 0.15
/** The middle fingertips on the home row (the keyboard's centre row): either side of its middle (keyboard-plane units). */
const HOME_X = 0.04
/**
 * The keycaps' top above the keyboard plane (keyboard-plane units); a fingertip's radius, its end sphere's
 * centre along the tip segment (as a share of the tip marker's distance, body.ts) and its rest above a cap.
 */
const CAP_TOP = 0.0034
const TIP_R = 0.0112
const TIP_END = 0.027 / 0.034
const TIP_REST = 0.001
/** Collision radii: the fingertips, the palm under the wrist, the forearm. */
const CLEAR = { tip: TIP_R, wrist: 0.03, fore: 0.042 }
const DUR = { read: LINE * 4, build: 1.2, nod: 0.6, glance: 1.2, phones: 2.6 }
const BLEND = 0.6

export function createPerformance(robot: RobotModel) {
  const { rig, body, seat, laptop, chair } = robot
  const kb = laptop.keyboard
  const out: PerformOut = {
    action: 'type',
    nod: 0,
    roll: 0,
    dip: 0,
    glance: 0,
    eyeX: 0,
    eyeY: 0,
    narrow: 0,
    joy: false,
    state: 'focused',
    eq: 0.6,
    scroll: 1,
    buildT: -1,
    success: false,
    compileIn: Infinity,
  }

  // ---- the loop: one action at a time, a settle between them
  let clock = 0
  let action: Action = 'type'
  let actionAt = 0
  let settleUntil = 0
  const due = { compile: 8 + rand(0, 1.5), glance: 6 + rand(0, 2), read: 4 + rand(0, 2), phones: 22 + rand(0, 6) }
  let successAt = -99

  // ---- typing
  const fingers = rig.arms.map((a) => a.fingers.map(() => ({ t: -1, hit: false })))
  const wristOff = rig.arms.map(() => new Vector3())
  const wristAim = rig.arms.map(() => new Vector3())
  let burstLeft = 0
  let nextKey = 0.6
  let lastHand = 0

  // ---- eyes
  let glance = 0
  let narrow = 0

  // ---- pose targets (body frame)
  const hip = new Vector3(0, SEAT_HIP, -0.03)
  const feet = [new Vector3(), new Vector3()]
  const wrist = [new Vector3(), new Vector3()]
  const hUp = [new Vector3(), new Vector3()]
  const hFwd = [new Vector3(), new Vector3()]
  const pole = [new Vector3(), new Vector3()]
  const curl = [0.25, 0.25]

  const tmp = new Vector3()
  const kbO = new Vector3()
  const kbX = new Vector3()
  const ry = new Object3D()
  const handQ = new Object3D()
  const probe = new Vector3()
  /** The centre of a fingertip's rounded end, world space (its lowest point is TIP_R under it, pointing down). */
  const tipEnd = (f: Arm['fingers'][number], out: Vector3) => f.mid.localToWorld(out.set(0, 0, f.tip.position.z * TIP_END))
  // Each hand's middle fingertip, in the hand's own frame, at its rest curl (as built).
  const tipLocal = rig.arms.map((arm) => {
    arm.hand.updateWorldMatrix(true, true)
    return arm.hand.worldToLocal(tipEnd(arm.fingers[1], new Vector3()))
  })
  const cup = new Vector3()
  const S = new Vector3()
  const W = new Vector3()
  const E = new Vector3()
  const d = new Vector3()
  const pv = new Vector3()
  const n = new Vector3()
  const hint = new Vector3()
  const up = new Vector3()
  const fwd = new Vector3()
  const end = new Vector3()
  const ankle = new Vector3()
  const toe = new Vector3()

  /** Two-bone solve: from `root` toward `target`, bending toward `poleDir`; places the two segment groups. */
  function solve(root: Vector3, target: Vector3, a: number, b: number, poleDir: Vector3, first: Object3D, second: Object3D) {
    d.subVectors(target, root)
    let len = d.length()
    const maxLen = a + b - 0.002
    if (len > maxLen) {
      d.multiplyScalar(maxLen / len)
      len = maxLen
    }
    end.copy(root).add(d)
    d.normalize()
    const cosA = Math.min(1, Math.max(-1, (a * a + len * len - b * b) / (2 * a * len)))
    const sinA = Math.sqrt(1 - cosA * cosA)
    pv.copy(poleDir).addScaledVector(d, -poleDir.dot(d)).normalize()
    E.copy(root).addScaledVector(d, a * cosA).addScaledVector(pv, a * sinA)
    // The hinge axis: the bend plane's normal, so the elbow and knee hubs turn the right way.
    n.subVectors(E, root).cross(d).normalize()
    if (n.lengthSq() < 0.5) n.set(1, 0, 0)
    span(first, root, E, hint.crossVectors(n, up.subVectors(root, E).normalize()))
    span(second, E, end, hint.crossVectors(n, up.subVectors(E, end).normalize()))
    return end
  }

  function shoulder(arm: Arm, out: Vector3) {
    return out.copy(arm.shoulder).applyMatrix4(rig.torso.matrix).applyMatrix4(rig.hips.matrix)
  }

  /** How far (m) the hand or forearm is into the furniture's top surfaces (0 when clear). */
  function sink(arm: Arm) {
    let over = 0
    const at = (p: Vector3, r: number) => {
      body.localToWorld(probe.copy(p))
      over = Math.max(over, robot.deskTop(probe) + r - probe.y)
    }
    arm.hand.updateMatrixWorld(true)
    for (const f of arm.fingers) at(body.worldToLocal(tipEnd(f, tmp)), CLEAR.tip)
    at(arm.hand.position, CLEAR.wrist)
    // The forearm, elbow to wrist.
    for (let k = 0; k <= 4; k++) at(tmp.lerpVectors(E, arm.hand.position, k / 4), CLEAR.fore)
    return over
  }

  function solveArm(arm: Arm, i: number) {
    shoulder(arm, S)
    W.copy(wrist[i]).add(wristOff[i])
    // Collision: lift the wrist out of the keys, the laptop or the table, and solve again.
    for (let pass = 0; pass < 3; pass++) {
      arm.hand.position.copy(solve(S, W, rig.upperLen, rig.foreLen, pole[i], arm.upper, arm.fore))
      orient(arm.hand, hUp[i], hFwd[i])
      const over = sink(arm)
      if (over <= 1e-4) break
      W.y += over + 2e-4
    }
  }

  function solveLeg(leg: Leg, i: number, toeUp: number) {
    S.copy(leg.hip).applyMatrix4(rig.hips.matrix)
    ankle.copy(feet[i])
    // Knees bend forward, over the toes, a little outward.
    fwd.set(leg.side * 0.1, 0, 1).normalize()
    tmp.set(leg.side * 0.12, 0.05, 0).add(fwd)
    leg.foot.position.copy(solve(S, ankle, rig.thighLen, rig.shinLen, tmp, leg.thigh, leg.shin))
    orient(leg.foot, up.set(0, 1, 0), fwd)
    leg.sole.rotation.x = -toeUp
  }

  /**
   * The seated pose's hands: the middle fingertips resting on the home row either side of the keyboard's
   * middle, the hands (fingers forward, a little inward) turned with the keys, the wrists where that puts them.
   */
  function seatedHands() {
    // The keyboard's frame in the body's: its plane's origin, and its yaw (the laptop's cheat). The keys
    // face the robot, so the plane's -x is the robot's +x (its right hand's side).
    kb.plane.updateWorldMatrix(true, false)
    body.worldToLocal(kb.plane.localToWorld(kbO.set(0, 0, 0)))
    body.worldToLocal(kb.plane.localToWorld(kbX.set(-1, 0, 0))).sub(kbO)
    ry.rotation.set(0, Math.atan2(-kbX.z, kbX.x), 0)
    ry.updateMatrix()
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1
      hFwd[i].set(-s * 0.16, -0.42, 1).applyQuaternion(ry.quaternion)
      hUp[i].set(s * 0.12, 1, 0.3).applyQuaternion(ry.quaternion)
      pole[i].set(s, -0.6, -0.5)
      curl[i] = 0.25
      // The fingertip's target on its cap, then the wrist behind it.
      body.worldToLocal(kb.plane.localToWorld(wrist[i].set(-s * HOME_X, 0, CAP_TOP)))
      wrist[i].y += TIP_R + TIP_REST
      orient(handQ, hUp[i], hFwd[i])
      wrist[i].sub(tmp.copy(tipLocal[i]).applyQuaternion(handQ.quaternion))
    }
  }

  function strike(amp: number) {
    const h = Math.random() < 0.7 ? 1 - lastHand : lastHand
    lastHand = h
    const f = Math.random() < 0.12 ? 3 : Math.floor(Math.random() * 3)
    fingers[h][f].t = 0
    fingers[h][f].hit = false
    // The wrist travels a touch with the keys: across the rows and along them.
    wristAim[h].set((Math.random() * 2 - 1) * 0.02, 0, (Math.random() * 2 - 1) * 0.022).multiplyScalar(amp)
  }

  const keyLocal = new Vector3()
  function flash(arm: Arm, f: number) {
    arm.fingers[f].tip.getWorldPosition(keyLocal)
    kb.plane.worldToLocal(keyLocal)
    kb.press(keyAt(keyLocal.x, keyLocal.y))
  }

  function start(a: Action, now: number) {
    action = a
    actionAt = now
    if (a === 'compile') due.compile = Infinity
    if (a === 'glance') due.glance = now + rand(12, 15)
    if (a === 'read') due.read = now + rand(8, 11)
    if (a === 'phones') due.phones = now + rand(30, 40)
  }

  function finish(now: number) {
    action = 'type'
    actionAt = now
    settleUntil = now + rand(1, 2)
    nextKey = rand(0.4, 0.8)
    burstLeft = 0
  }

  /** At a pause between bursts: start whatever is due (the build first), if the last action has settled. */
  function pick(now: number) {
    if (now < settleUntil) return
    if (now >= due.compile) start('compile', now)
    else if (now >= due.glance) start('glance', now)
    else if (now >= due.phones) start('phones', now)
    else if (now >= due.read) start('read', now)
  }

  return {
    out,
    clockNow: () => clock,
    update(dt: number, b: BeatSample, o: PerformOptions) {
      clock += dt
      const now = clock
      const live = !o.still && o.weight > 0.02
      const beatLive = live && b.on
      out.success = false

      // ---- the action's clock
      const ta = now - actionAt
      if (!live) {
        if (action !== 'type') finish(now)
      } else if (action === 'read' && ta >= DUR.read) finish(now)
      else if (action === 'glance' && ta >= DUR.glance) finish(now)
      else if (action === 'phones' && ta >= DUR.phones) finish(now)
      else if (action === 'compile') {
        if (ta >= DUR.build && successAt < actionAt) {
          successAt = now
          out.success = true
          due.compile = now + rand(10, 12)
        }
        if (ta >= DUR.build + DUR.nod) finish(now)
      }
      out.action = action
      out.buildT = action === 'compile' ? ta : -1
      out.compileIn = due.compile - now

      // ---- the body sits at the seat (the glide turns it to face the camera)
      body.position.set(seat.x, 0, seat.z)
      body.rotation.set(0, lerpAng(seat.yaw, o.faceYaw, o.turn), 0)
      body.updateMatrixWorld()
      seatedHands()
      for (let i = 0; i < 2; i++) feet[i].set((i ? 1 : -1) * 0.15, rig.ankleH, SEAT_FEET_Z)

      // The read pause: the hands lift a little off the keys and hover, fingers easing open.
      const t = now - actionAt
      const hover = action === 'read' ? envelope(t, DUR.read, BLEND, BLEND) : 0
      // The headphone adjust: the near hand (its right, toward the camera) goes up to its cup and back.
      const reach = action === 'phones' ? envelope(t, DUR.phones, 0.75, 0.75) : 0
      for (let i = 0; i < 2; i++) {
        wrist[i].y += 0.028 * hover
        wrist[i].z -= 0.012 * hover
        curl[i] -= 0.12 * hover
      }
      if (reach > 0) {
        robot.phones.group.localToWorld(cup.set(-0.69, -0.12, 0.0))
        body.worldToLocal(cup)
        shoulder(rig.arms[0], S)
        tmp.subVectors(cup, S)
        const dist = tmp.length()
        tmp.normalize()
        // Short of the cup by the hand's length; the arm never quite straightens.
        W.copy(S).addScaledVector(tmp, Math.min(0.49, dist - 0.1))
        // A small shake at the cup, as if settling it.
        W.y += 0.006 * Math.sin(t * 9) * smooth((t - 0.8) / 0.2) * (1 - smooth((t - 1.7) / 0.2))
        wrist[0].lerp(W, reach)
        hFwd[0].lerp(tmp, reach)
        hUp[0].lerp(E.set(-1, 0.25, 0.35), reach)
        pole[0].lerp(E.set(-1, -0.7, -0.1), reach)
        curl[0] = lerpA(curl[0], 0.45, reach)
      }

      // ---- the beat: the head bobs a little on every beat
      let bob = 0
      if (beatLive) {
        const x = b.phase / 0.22
        bob = x * x * Math.exp(2 * (1 - x))
      }
      // The build passing: a quick nod, a breath of anticipation first.
      const ts = now - successAt
      const nod = ts < 0.45 ? Math.sin(Math.PI * (ts / 0.45)) ** 2 * 0.13 - 0.02 * Math.sin(Math.PI * Math.min(1, ts / 0.1)) : 0
      const w = o.weight
      out.nod = (0.026 * bob * o.amp + nod) * w
      out.dip = -0.006 * bob * o.amp * w
      out.roll = 0.1 * reach * w
      out.eq = 0.6
      out.scroll = (action === 'type' && burstLeft > 0) || action === 'read' ? 1 : 0.5

      const breath = o.still ? 0 : Math.sin((now / 5) * Math.PI * 2)
      rig.hips.position.copy(hip)
      rig.hips.position.y += 0.4 * out.dip
      rig.hips.rotation.set(0, 0, 0)
      rig.hips.updateMatrix()
      rig.torso.rotation.set(LEAN - 0.15 * out.nod, 0, 0)
      rig.torso.scale.setScalar(1 + 0.006 * breath * w)
      rig.torso.updateMatrix()
      // The chair sways with the breath, under a degree.
      chair.rotation.y = seat.yaw + 0.015 * breath * w

      // ---- typing (only while typing, and only to the music)
      if (beatLive && action === 'type' && w > 0.05) {
        nextKey -= dt
        if (nextKey <= 0) {
          if (burstLeft <= 0) burstLeft = 6 + Math.floor(Math.random() * 9)
          strike(o.amp)
          burstLeft--
          if (burstLeft > 0) nextKey = 0.085 + Math.random() * 0.09
          else {
            nextKey = rand(0.8, 2)
            pick(now)
          }
        }
      }
      rig.arms.forEach((arm, h) => {
        let push = 0
        arm.fingers.forEach((finger, f) => {
          const st = fingers[h][f]
          let p = 0
          if (st.t >= 0) {
            st.t += dt
            p = st.t < PRESS.down ? easeInOut(st.t / PRESS.down) : 1 - easeInOut((st.t - PRESS.down) / (PRESS.up - PRESS.down))
            if (!st.hit && st.t >= PRESS.down * 0.8) {
              st.hit = true
              flash(arm, f)
            }
            if (st.t >= PRESS.up) st.t = -1
          }
          p = Math.max(0, p) * Math.min(1, o.amp * 1.4)
          push = Math.max(push, p)
          // The pose's curl (a fist at 1), plus the keystroke: both segments move.
          const c = Math.max(0, curl[h] - 0.3) / 0.7
          const open = Math.max(0, 0.25 - curl[h])
          finger.base.rotation.x = lerpA(finger.rest[0], 1.35, c) - 0.6 * open + 0.42 * p
          finger.mid.rotation.x = lerpA(finger.rest[1], 1.5, c) - 0.8 * open + 0.22 * p
        })
        const k = 1 - Math.exp(-dt * 7)
        const typing = action === 'type' || action === 'compile' ? 1 : 0
        wristOff[h].lerp(tmp.copy(wristAim[h]).multiplyScalar(typing), k)
        wristOff[h].y = -0.006 * push - 0.4 * out.dip
        solveArm(arm, h)
      })

      // ---- the toe taps on beats 2 and 4, lifting through the beat before (under 3 px)
      let lift = 0
      if (beatLive) {
        if (b.inBar === 0 || b.inBar === 2) lift = smooth((b.phase - 0.45) / 0.45)
        else lift = 1 - smooth(b.phase / 0.1)
      }
      rig.legs.forEach((leg, i) => solveLeg(leg, i, i === 0 ? 0.1 * lift * o.amp * w : 0))
      // Contact shadows under the soles.
      robot.root.updateMatrixWorld()
      rig.legs.forEach((leg, i) => {
        leg.toe.getWorldPosition(toe)
        leg.foot.getWorldPosition(ankle)
        const sh = robot.footShadows[i]
        sh.position.set((toe.x + ankle.x) / 2, sh.position.y, (toe.z + ankle.z) / 2)
        sh.parent?.worldToLocal(sh.position.setY(0.004))
        sh.position.y = 0.004
        sh.rotation.z = Math.atan2(toe.x - ankle.x, toe.z - ankle.z)
      })

      // ---- glow: the chest core breathes (6 s, +-15%) and flares on the beat; the headphones' rings too
      const coreBreath = 1 + (o.still ? 0 : 0.15 * Math.sin((now / 6) * Math.PI * 2))
      const pulse = beatLive ? b.pulse : 0
      for (const vent of rig.vents) {
        vent.uniforms.uTime.value = now
        vent.uniforms.uBreath.value = coreBreath
        vent.uniforms.uPulse.value = pulse * w
      }
      rig.coreGlow.opacity = (0.22 + (0.05 * (coreBreath - 1)) / 0.15 + 0.08 * pulse) * w
      robot.phones.rings.color.setRGB(0.655, 0.545, 0.98).multiplyScalar(1.15 + 0.35 * pulse)
      const wv = robot.phones.waves.uniforms
      wv.uPhase.value = beatLive ? Math.min(1, b.since / (BEAT * 0.95)) : 0
      wv.uOn.value = beatLive ? w : 0

      // ---- eyes: focused at the screen; reading along the lines; ^ ^ when the build passes; the glance
      let state: EyeState = 'focused'
      if (live) {
        if (action === 'read') state = 'reading'
        else if (action === 'glance') state = 'glance'
        if (ts >= 0 && ts < 0.4) state = 'happy'
      }
      out.state = state
      out.joy = state === 'happy'
      glance += ((state === 'glance' ? 1 : 0) - glance) * (1 - Math.exp(-dt * 6))
      out.glance = glance
      narrow += ((state === 'focused' || state === 'reading' ? 0.55 : 0) - narrow) * (1 - Math.exp(-dt * 8))
      out.narrow = narrow * w

      let ex = 0
      let ey = -0.006
      if (state === 'reading') {
        const ph = ((now - actionAt) % LINE) / LINE
        ex = ph < 0.78 ? -0.045 + 0.09 * easeInOut(ph / 0.78) : 0.045 - 0.09 * smooth((ph - 0.78) / 0.12)
        ey = -0.012
      }
      // The terminal printing: the eyes drop to it.
      if (action === 'compile' && t < DUR.build) ey = -0.03 * smooth(t / 0.3)
      out.eyeX = ex
      out.eyeY = ey
    },
  }
}

export type Performance = ReturnType<typeof createPerformance>
