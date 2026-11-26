// Skylark Valley — every tuning number, colour and mission fact in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720 };

// The simulation's fixed step, in seconds: 60 updates a second whatever the rate.
export const STEP = 1 / 60;

// The valley the game flies in, in metres. x runs east across the valley, z runs
// north along it, y is height above the valley floor. The walls rise past |x| 1000.
export const VALLEY = {
  halfWidth: 1000,
  zStart: -600,
  zEnd: 6600,
  wallSlope: 0.85,
  wallStart: 1000,
};

// The aircraft. Speeds are m/s; the HUD shows knots (1 m/s = 1.944 kt).
export const PLANE = {
  cruiseSpeed: 55,
  maxSpeed: 78,
  minSpeed: 18,
  stallSpeed: 30,
  stallSpeedFlaps: 24,
  maxBank: 0.85,
  bankRate: 1.7,
  levelRate: 1.4,
  maxPitch: 0.42,
  pitchRate: 1.1,
  pitchSettle: 0.45,
  throttleRate: 0.8,
  fuelMax: 100,
  // Fuel burn per second: a base draw plus the square of the throttle, so cruising
  // at half throttle lasts far longer than firewalling it the whole way.
  fuelBase: 0.14,
  fuelThrottle: 0.95,
  gearSpeedMax: 48,
  flapSpeedMax: 45,
};

// How a landing is judged: gentle, slow, on a strip, gear down, roughly aligned.
export const LANDING = {
  maxSink: 3.6,
  maxSpeed: 52,
  minSpeed: 20,
  maxHeadingError: 0.35,
};

// Scoring: rings pay, a clean landing pays, and what is left over pays too.
export const SCORE = {
  ring: 100,
  pickup: 150,
  landing: 250,
  gentleBonus: 100,
  fuelPerUnit: 2,
  timePerSecond: 1,
};

export const PALETTE = {
  skyTop: '#7fb2e5',
  skyMid: '#a8c8e8',
  skyLow: '#f2d8a8',
  dawnTop: '#5d7fb8',
  dawnMid: '#c98d6b',
  dawnLow: '#f7c489',
  stormTop: '#4a5568',
  stormMid: '#6b7686',
  stormLow: '#9aa0a8',
  sun: '#fff3c4',
  sunGlow: 'rgba(255, 240, 180, 0.55)',
  mountainFar: '#8fa3c8',
  mountainNear: '#5d7a5e',
  mountainSnow: '#e8eef7',
  fieldA: '#7da95c',
  fieldB: '#a8b25a',
  fieldC: '#c2a55e',
  fieldD: '#6d9a4f',
  forest: '#3f6b3a',
  river: '#5b8fc4',
  road: '#5a5148',
  runway: '#8d8d94',
  runwayLine: '#f4f4f4',
  grassStrip: '#8fae62',
  panel: '#171c26',
  panelEdge: '#39415a',
  lit: '#8fe3ff',
  litAmber: '#ffc46b',
  litGreen: '#7be495',
  litRed: '#ff6b5e',
  text: '#eef1f5',
  muted: '#9aa3b5',
  ringNext: '#ffb020',
  ringDone: '#58d68d',
  ringLater: '#7fd4ff',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best campaign score is kept between visits (this browser only). */
export const BEST_KEY = 'skylark-valley.best';

/**
 * The three sorties, in order. Each one is a different kind of flying: rings for
 * throttle and turn discipline, a courier run that ends in a real landing, and a
 * rescue in fog and gusts that ends on a short grass strip.
 */
export const MISSIONS = [
  {
    id: 'rings',
    name: 'Sortie 1 — Ring Run',
    short: 'Ring Run',
    brief:
      'Six rings stand along the valley at dawn. Thread every one, mind your throttle — fuel is the only clock that matters — and bring her home.',
    goal: 'Fly through all 6 rings',
    timeLimit: 260,
    fuel: 100,
    fog: 0,
    wind: 0,
    start: { x: -150, y: 2, z: 420, heading: 0, speed: 0, throttle: 0 },
    rings: [
      { x: -260, y: 90, z: 1100, r: 38 },
      { x: 180, y: 130, z: 1900, r: 38 },
      { x: -300, y: 100, z: 2700, r: 36 },
      { x: 220, y: 160, z: 3500, r: 38 },
      { x: -120, y: 110, z: 4300, r: 36 },
      { x: 200, y: 140, z: 5100, r: 38 },
    ],
    pickup: null,
    landAt: null,
    tip: 'Full throttle climbs fast but drinks fuel. Cruise near 60% and let the valley do the work.',
  },
  {
    id: 'courier',
    name: 'Sortie 2 — Valley Mail',
    short: 'Valley Mail',
    brief:
      'A parcel waits at the low beacon over Miller’s Crossing. Scoop it at 45 metres, then carry it the length of the valley and put her down on South Strip — gear down, flaps out, gentle as you like.',
    goal: 'Collect the parcel, then land on South Strip',
    timeLimit: 320,
    fuel: 100,
    fog: 0,
    wind: 0.15,
    start: { x: -150, y: 2, z: 420, heading: 0, speed: 0, throttle: 0 },
    rings: [],
    pickup: { x: -340, y: 45, z: 1800, r: 30 },
    landAt: 'south',
    tip: 'On final, keep speed between 25 and 45 m/s and sink under 3 m/s. Flaps (F) let you fly slower; gear (G) must be down.',
  },
  {
    id: 'rescue',
    name: 'Sortie 3 — Storm Rescue',
    short: 'Storm Rescue',
    brief:
      'A hiker is stranded at the north end in a closing storm. Fly the beacon ring through fog and gusts, then land on the short grass strip beside the hut. Short field, bad weather, no second chances.',
    goal: 'Reach the beacon, then land on grass',
    timeLimit: 320,
    fuel: 100,
    fog: 0.55,
    wind: 0.5,
    start: { x: -150, y: 2, z: 420, heading: 0, speed: 0, throttle: 0 },
    rings: [{ x: -480, y: 70, z: 5000, r: 38 }],
    pickup: null,
    landAt: 'rescue',
    tip: 'Gusts shove you sideways — correct early, correct small. The grass strip is short: touch down in the first third or go around.',
  },
];

/** The two airfields and the rescue strip: position, runway heading, length, width. */
export const AIRFIELDS = {
  north: { name: 'North Field', x: -150, z: 600, heading: 0, length: 420, width: 26, surface: 'runway' },
  south: { name: 'South Strip', x: 250, z: 5600, heading: 0, length: 460, width: 28, surface: 'runway' },
  rescue: { name: 'Hut Grass Strip', x: -520, z: 6150, heading: 0, length: 300, width: 22, surface: 'grass' },
};
