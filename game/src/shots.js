// The screenshot scenes behind ?shot=cover|rings|landing|rescue. Each one puts a
// real aircraft in a real situation — mid-flight toward a ring, on final to a
// strip, in the storm — then flies the rules forward with the autopilot until
// the frame shows what the screenshot must show. The same seed always gives the
// same frame: nothing here rolls dice the staging does not fix.

import { MISSIONS } from './config.js';
import { createFlight } from './flight.js';
import { createMissionRun } from './missions.js';
import { flyToward } from './autopilot.js';
import { SCREEN_PLAY } from './render.js';

/** Put a fresh flight at a pose: position, speed, throttle, gear and flaps. */
function pose(flight, x, y, z, heading, speed, throttle, gearDown, flaps) {
  flight.x = x;
  flight.y = y;
  flight.z = z;
  flight.heading = heading;
  flight.speed = speed;
  flight.throttle = throttle;
  flight.onGround = false;
  flight.airborne = true;
  flight.gearDown = gearDown;
  flight.flaps = flaps;
  flight.pitch = 0;
  flight.bank = 0;
  return flight;
}

/**
 * Build the world for the named scene and return the screen to draw over it.
 * Any unknown name stages the cover.
 */
export function stageShot(name, world) {
  const pick = name === 'rings' ? 0 : name === 'landing' ? 1 : name === 'rescue' ? 2 : 0;
  const mission = MISSIONS[pick];
  const run = createMissionRun(pick);
  const flight = createFlight(mission);
  run.status = 'flying';
  world.mission = mission;
  world.run = run;
  world.flight = flight;
  world.particles = [];

  if (name === 'rings') {
    // Mid-valley, banked into a turn, two rings ahead of the nose.
    flight.ringsPassed.add(0);
    flight.ringsPassed.add(1);
    flight.ringsPassed.add(2);
    flight.score = 300;
    pose(flight, 280, 150, 3150, 0.12, 58, 0.62, true, false);
    flyToward(flight, mission, { x: 320, y: 160, z: 3500, speed: 56 }, 3.2);
  } else if (name === 'landing') {
    // Short final to South Strip: gear down, flaps out, runway filling the view.
    pose(flight, 250, 40, 5200, 0, 38, 0.34, true, true);
    flight.pickedUp = true;
    flight.score = 150;
    flyToward(flight, mission, { x: 250, y: 12, z: 5420, speed: 36 }, 3.0,
      (state) => state.z > 5300);
  } else if (name === 'rescue') {
    // In the storm, low over the river bend, the beacon ring just ahead.
    pose(flight, -480, 75, 4600, 0, 52, 0.6, true, false);
    flyToward(flight, mission, { x: -480, y: 70, z: 5000, speed: 50 }, 5.0,
      (state) => state.z > 4840);
  } else {
    // The cover: dawn over the valley, a ring ahead, the strip behind.
    flight.ringsPassed.add(0);
    flight.score = 100;
    pose(flight, -60, 120, 1500, 0.05, 55, 0.6, true, false);
    flyToward(flight, mission, { x: 180, y: 130, z: 1900, speed: 55 }, 3.2);
  }
  return { screen: SCREEN_PLAY };
}
