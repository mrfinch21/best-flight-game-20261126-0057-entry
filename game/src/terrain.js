// The valley itself: how high the ground is anywhere, what colour it is from the
// air, and where the river, the road and the three strips lie. Everything here is
// a pure function of position, so the renderer, the physics and the autopilot all
// agree about the same valley.

import { AIRFIELDS, PALETTE, VALLEY } from './config.js';
import { clamp, hash2 } from './random.js';

/** The river's centreline: it winds down the west side of the valley. */
export function riverX(z) {
  return -360 + 130 * Math.sin(z * 0.00045) + 60 * Math.sin(z * 0.0013 + 1.7);
}

/** The road's centreline: a straight-ish lane down the east side. */
export function roadX(z) {
  return 420 + 40 * Math.sin(z * 0.0006 + 0.6);
}

/**
 * Ground height in metres at (x, z). The floor undulates gently, the walls rise
 * steeply past the valley sides, and the strips are flattened to their own level.
 */
export function groundHeight(x, z) {
  let h = 6 * Math.sin(x * 0.004 + 1.2) * Math.sin(z * 0.0016 + 0.4)
    + 3 * Math.sin(x * 0.011 + z * 0.003);
  const over = Math.abs(x) - VALLEY.wallStart;
  if (over > 0) h += over * VALLEY.wallSlope + over * over * 0.0012;
  // The strips are graded flat, so a landing reads as a landing.
  for (const key of Object.keys(AIRFIELDS)) {
    const f = AIRFIELDS[key];
    const dz = Math.abs(z - f.z);
    const dx = Math.abs(x - f.x);
    if (dz < f.length / 2 + 30 && dx < f.width / 2 + 30) {
      const t = clamp(1 - Math.max(dz / (f.length / 2 + 30), dx / (f.width / 2 + 30)), 0, 1);
      h = h * (1 - t) + 0 * t;
    }
  }
  return h;
}

/** Which strip, if any, covers (x, z): 'north' | 'south' | 'rescue' | null. */
export function stripAt(x, z) {
  for (const key of Object.keys(AIRFIELDS)) {
    const f = AIRFIELDS[key];
    if (Math.abs(z - f.z) <= f.length / 2 && Math.abs(x - f.x) <= f.width / 2) return key;
  }
  return null;
}

/** True when (x, z) is over the river (a water landing is a crash). */
export function isRiver(x, z) {
  return Math.abs(x - riverX(z)) < 26;
}

/**
 * The colour of the ground at (x, z), as the pilot sees it from above: patchwork
 * fields, forest belts along the walls, the river, the road, and the strips with
 * their markings. The renderer samples this per strip segment.
 */
export function groundColor(x, z) {
  const strip = stripAt(x, z);
  if (strip) {
    const f = AIRFIELDS[strip];
    const along = z - (f.z - f.length / 2); // metres from the threshold
    const across = Math.abs(x - f.x);
    if (f.surface === 'runway') {
      if (across < 2 && ((along % 48) < 24)) return PALETTE.runwayLine;
      if (along < 30 && ((Math.floor(across / 4) % 2) === 0)) return PALETTE.runwayLine;
      return PALETTE.runway;
    }
    // Grass strip: mown centre, rougher edges, white corner markers.
    if (across < 3 && ((along % 40) < 20)) return '#c8d89a';
    return PALETTE.grassStrip;
  }
  if (isRiver(x, z)) return PALETTE.river;
  if (Math.abs(x - roadX(z)) < 7) return PALETTE.road;
  const over = Math.abs(x) - 780;
  if (over > 0) return PALETTE.forest;
  // Patchwork fields: 260 m cells east-west, 340 m north-south, four crops.
  const cellX = Math.floor(x / 260);
  const cellZ = Math.floor(z / 340);
  const pick = hash2(cellX, cellZ);
  if (pick < 0.3) return PALETTE.fieldA;
  if (pick < 0.55) return PALETTE.fieldB;
  if (pick < 0.8) return PALETTE.fieldC;
  return PALETTE.fieldD;
}

/** True when a tree stands at (x, z): forest belts and field edges only. */
export function hasTree(x, z) {
  if (stripAt(x, z) || isRiver(x, z)) return false;
  if (Math.abs(x - roadX(z)) < 12) return false;
  const over = Math.abs(x) - 780;
  if (over > 0) return hash2(Math.floor(x / 14), Math.floor(z / 14)) < 0.5;
  return hash2(Math.floor(x / 18), Math.floor(z / 18)) < 0.045;
}

/** The two airfields plus the rescue strip, as a list for the renderer. */
export function listAirfields() {
  return Object.keys(AIRFIELDS).map((key) => ({ key, ...AIRFIELDS[key] }));
}
