// The flight model: one aircraft, one fixed step, real enough to be flown.
// Throttle sets speed, bank turns, pitch climbs and dives, speed buys lift, and
// fuel and gravity always collect. Nothing here knows about the screen.

import { LANDING, PLANE, SCORE } from './config.js';
import { clamp, wrapAngle } from './random.js';
import { groundHeight, isRiver, stripAt } from './terrain.js';

export const EVENT_NONE = 0;
export const EVENT_RING = 1 << 0;
export const EVENT_RING_MISS = 1 << 1;
export const EVENT_PICKUP = 1 << 2;
export const EVENT_LANDED = 1 << 3;
export const EVENT_CRASH = 1 << 4;
export const EVENT_FUEL_LOW = 1 << 5;
export const EVENT_TIME_UP = 1 << 6;
export const EVENT_COMPLETE = 1 << 7;

/** A fresh flight for a mission: on the runway at North Field, engine off. */
export function createFlight(mission) {
  const s = mission.start;
  return {
    x: s.x,
    y: s.y,
    z: s.z,
    heading: s.heading,
    pitch: 0,
    bank: 0,
    speed: s.speed,
    throttle: s.throttle,
    verticalSpeed: 0,
    fuel: mission.fuel,
    damage: 0,
    gearDown: true,
    flaps: false,
    onGround: true,
    airborne: false,
    crashed: false,
    crashReason: '',
    landed: false,
    landedStrip: null,
    landedGentle: false,
    ringsPassed: new Set(),
    pickedUp: false,
    score: 0,
    timeLeft: mission.timeLimit,
    elapsed: 0,
    fuelWarned: false,
    message: '',
    messageUntil: 0,
  };
}

/** A control frame: -1..1 sticks, -1..1 throttle nudge, plus one-shot toggles. */
export function emptyControls() {
  return { pitchIn: 0, bankIn: 0, throttleIn: 0, flapsToggle: false, gearToggle: false };
}

/**
 * Advance the flight one fixed step. Returns an event bitmask; the caller reads
 * the state for scores, messages and the mission's end. `now` is mission time.
 */
export function stepFlight(state, ctrl, mission, dt, now) {
  if (state.crashed || state.landed) return EVENT_NONE;
  let events = EVENT_NONE;

  if (ctrl.flapsToggle) {
    state.flaps = !state.flaps;
    state.message = state.flaps ? 'Flaps down — slower flight, more drag' : 'Flaps up';
    state.messageUntil = now + 2.5;
  }
  if (ctrl.gearToggle) {
    state.gearDown = !state.gearDown;
    state.message = state.gearDown ? 'Gear down' : 'Gear up';
    state.messageUntil = now + 2.5;
  }

  // Throttle, then the sticks. Control authority fades toward the stall.
  if (state.fuel > 0) {
    state.throttle = clamp(state.throttle + ctrl.throttleIn * PLANE.throttleRate * dt, 0, 1);
  } else {
    state.throttle = 0;
  }
  const stall = state.flaps ? PLANE.stallSpeedFlaps : PLANE.stallSpeed;
  const lift = clamp(state.speed / stall, 0, 1);
  const authority = 0.35 + 0.65 * lift;

  const bankTarget = ctrl.bankIn * PLANE.maxBank;
  const bankRate = ctrl.bankIn !== 0 ? PLANE.bankRate : PLANE.levelRate;
  state.bank += clamp(bankTarget - state.bank, -bankRate * dt, bankRate * dt) * authority;

  const pitchTarget = ctrl.pitchIn * PLANE.maxPitch;
  const pitchRate = ctrl.pitchIn !== 0 ? PLANE.pitchRate : PLANE.pitchSettle;
  state.pitch += clamp(pitchTarget - state.pitch, -pitchRate * dt, pitchRate * dt) * authority;

  // Speed chases the throttle, climbs bleed it, dives feed it, flaps drag it.
  let targetSpeed = PLANE.minSpeed + state.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
  if (state.flaps) targetSpeed *= 0.9;
  state.speed += (targetSpeed - state.speed) * dt * 0.5;
  state.speed -= Math.sin(state.pitch) * 9.8 * dt * 0.55;
  if (state.onGround) state.speed = Math.max(0, state.speed - 6 * dt);
  state.speed = clamp(state.speed, 0, PLANE.maxSpeed + 6);

  // A coordinated turn: heading rate grows with bank and shrinks with speed.
  const turnRate = (9.81 * Math.tan(state.bank)) / Math.max(state.speed, 25);
  state.heading = wrapAngle(state.heading + turnRate * dt * authority);

  // Gusts in the storm sortie shove the aircraft sideways and shake the wings.
  let gustX = 0;
  if (mission.wind > 0) {
    gustX = mission.wind * (7 * Math.sin(now * 0.7) + 4 * Math.sin(now * 1.9 + 2));
    state.bank += mission.wind * 0.02 * Math.sin(now * 2.3) * dt * 10;
  }

  // Lift, sink, and the ground.
  const prevZ = state.z;
  const prevY = state.y;
  state.verticalSpeed = state.speed * Math.sin(state.pitch) * lift - (1 - lift) * 12;
  if (state.onGround && state.speed < stall) state.verticalSpeed = 0;
  state.y += state.verticalSpeed * dt;
  state.x += Math.sin(state.heading) * state.speed * dt + gustX * dt;
  state.z += Math.cos(state.heading) * state.speed * dt;
  state.elapsed += dt;
  state.timeLeft -= dt;

  // Liftoff: fast enough and pitched up — or rolling well past stall speed,
  // which rotates the nose up on its own rather than rolling off the strip.
  if (state.onGround && state.speed > stall && (state.pitch > 0.06 || state.speed > stall * 1.3)) {
    state.onGround = false;
    state.airborne = true;
    if (state.pitch <= 0.06) state.pitch = 0.1;
    state.y = Math.max(state.y, groundHeight(state.x, state.z) + 1);
  }
  if (state.onGround) state.y = groundHeight(state.x, state.z);

  // Fuel: the base draw plus the square of the throttle.
  if (!state.onGround || state.throttle > 0) {
    state.fuel -= (PLANE.fuelBase + PLANE.fuelThrottle * state.throttle * state.throttle) * dt;
  }
  if (state.fuel <= 0) {
    state.fuel = 0;
    if (!state.fuelWarned) {
      state.fuelWarned = true;
      events |= EVENT_FUEL_LOW;
      state.message = 'FUEL EMPTY — gliding now, find a strip';
      state.messageUntil = now + 4;
    }
  } else if (state.fuel < 20 && !state.fuelWarned) {
    state.fuelWarned = true;
    events |= EVENT_FUEL_LOW;
    state.message = 'Fuel low — throttle back and head for a strip';
    state.messageUntil = now + 4;
  }

  // Rings: crossing the ring's plane, inside its circle, heading roughly north.
  for (let i = 0; i < mission.rings.length; i += 1) {
    const ring = mission.rings[i];
    if (state.ringsPassed.has(i)) continue;
    if (prevZ < ring.z && state.z >= ring.z && Math.cos(state.heading) > 0.4) {
      const dx = state.x - ring.x;
      const dy = state.y - ring.y;
      if (Math.hypot(dx, dy) < ring.r) {
        state.ringsPassed.add(i);
        state.score += SCORE.ring;
        events |= EVENT_RING;
        state.message = `Ring ${state.ringsPassed.size} of ${mission.rings.length} — +${SCORE.ring}`;
        state.messageUntil = now + 2.5;
      } else {
        events |= EVENT_RING_MISS;
        state.message = 'Ring missed — turn around and try again';
        state.messageUntil = now + 2.5;
      }
    }
  }

  // The courier pickup: a low pass through the beacon.
  if (mission.pickup && !state.pickedUp) {
    const p = mission.pickup;
    if (prevZ < p.z && state.z >= p.z && Math.cos(state.heading) > 0.4) {
      if (Math.hypot(state.x - p.x, state.y - p.y) < p.r) {
        state.pickedUp = true;
        state.score += SCORE.pickup;
        events |= EVENT_PICKUP;
        state.message = `Parcel aboard — +${SCORE.pickup}. Now land on South Strip`;
        state.messageUntil = now + 3;
      }
    }
  }

  // The ground: a landing, a rough field, or a crash.
  const ground = groundHeight(state.x, state.z);
  if (!state.onGround && state.y <= ground + 0.4) {
    state.y = ground;
    const strip = stripAt(state.x, state.z);
    const overWater = isRiver(state.x, state.z);
    const sink = -state.verticalSpeed;
    const headingErr = strip
      ? Math.abs(wrapAngle(state.heading - 0))
      : 0;
    const gentle = sink <= LANDING.maxSink && state.speed <= LANDING.maxSpeed
      && state.speed >= LANDING.minSpeed && headingErr <= LANDING.maxHeadingError;
    if (overWater) {
      state.crashed = true;
      state.crashReason = 'Ditched in the river';
      events |= EVENT_CRASH;
    } else if (strip && gentle && state.gearDown) {
      state.onGround = true;
      state.landed = true;
      state.landedStrip = strip;
      state.landedGentle = sink <= 2.2;
      state.score += SCORE.landing + (state.landedGentle ? SCORE.gentleBonus : 0);
      events |= EVENT_LANDED;
      if (mission.landAt && strip === mission.landAt) events |= EVENT_COMPLETE;
    } else if (strip && !state.gearDown) {
      state.crashed = true;
      state.crashReason = 'Belly landing — the gear was up';
      events |= EVENT_CRASH;
    } else if (strip && !gentle) {
      state.crashed = true;
      state.crashReason = sink > LANDING.maxSink
        ? `Hit the strip too hard (${sink.toFixed(1)} m/s down)`
        : state.speed > LANDING.maxSpeed
          ? `Too fast to land (${(state.speed * 1.944).toFixed(0)} kt)`
          : 'Landed across the runway';
      events |= EVENT_CRASH;
    } else if (!strip && gentle && state.gearDown && state.speed < 40) {
      // A rough-field landing: survivable, but the sortie is over.
      state.onGround = true;
      state.landed = true;
      state.landedStrip = 'field';
      state.damage += 25;
      events |= EVENT_LANDED;
    } else {
      state.crashed = true;
      state.crashReason = prevY - ground > 2 && sink > 4
        ? 'Flew into the ground'
        : 'Stalled into the terrain';
      events |= EVENT_CRASH;
    }
    state.verticalSpeed = 0;
    if (state.crashed) state.damage = 100;
  }

  // Rolling out after a landing: brakes bite, the aircraft stops.
  if (state.onGround && state.landed) {
    state.speed = Math.max(0, state.speed - 14 * dt);
    state.throttle = 0;
  }

  if (state.timeLeft <= 0 && !state.crashed && !state.landed) {
    state.timeLeft = 0;
    events |= EVENT_TIME_UP;
  }

  return events;
}

/** Knots for the HUD: 1 m/s is 1.944 kt. */
export function knots(speed) {
  return speed * 1.944;
}

/** Feet for the HUD altimeter: 1 m is 3.281 ft. */
export function feet(alt) {
  return alt * 3.281;
}
