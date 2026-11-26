// The autopilot: a plain controller that flies the aircraft toward a waypoint.
// The screenshot stager uses it, and nothing in the game hides behind it — it
// feeds the same control frame a player's keys feed, through the same physics.

import { clamp, wrapAngle } from './random.js';
import { stepFlight } from './flight.js';
import { STEP } from './config.js';

/**
 * Controls that steer `state` toward `target` {x, y, z, speed}: bank hard into
 * the heading error, pitch toward the height error, throttle toward the speed —
 * and slow down to turn tighter whenever the nose is far off the target, since
 * a fast aircraft turns wide and a slow one turns on a coin. The stick commands
 * are feedforward deflections (a bank command is the bank itself, over the
 * maximum), so the aircraft reaches the bank it is asked for instead of
 * settling short of it the way a proportional loop would.
 */
export function autopilotControls(state, target) {
  const desiredHeading = Math.atan2(target.x - state.x, target.z - state.z);
  const headingErr = wrapAngle(desiredHeading - state.heading);
  const bankTarget = clamp(headingErr * 2.4, -0.85, 0.85);
  const bankIn = clamp(bankTarget / 0.85, -1, 1);

  const dy = target.y - state.y;
  // On final the caller caps the sink (a gentle landing needs under ~3 m/s);
  // anywhere else the aircraft may dive at up to 9 m/s.
  const vsMax = target.maxSink ?? 9;
  const desiredVs = clamp(dy * 0.18, -vsMax, 9);
  const desiredPitch = Math.asin(clamp(desiredVs / Math.max(state.speed, 20), -0.38, 0.38));
  const pitchIn = clamp(desiredPitch / 0.42, -1, 1);

  const aligned = Math.abs(headingErr) < 0.35;
  const desiredSpeed = target.speed ?? (aligned ? 55 : 38);
  const throttleIn = clamp((desiredSpeed - state.speed) * 0.06, -1, 1);

  return { pitchIn, bankIn, throttleIn, flapsToggle: false, gearToggle: false };
}

/**
 * Fly the real rules toward `target` for up to `seconds`, stopping early when
 * `until(state)` holds. Returns the events seen on the last step.
 */
export function flyToward(state, mission, target, seconds, until) {
  const steps = Math.ceil(seconds / STEP);
  let events = 0;
  for (let i = 0; i < steps; i += 1) {
    events = stepFlight(state, autopilotControls(state, target), mission, STEP, state.elapsed);
    if (state.crashed || state.landed) break;
    if (until && until(state)) break;
  }
  return events;
}
