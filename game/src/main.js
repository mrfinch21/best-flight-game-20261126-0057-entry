// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between title, briefing, play, paused
// and the end screens.
//
// ?seed=N is accepted and ignored — the valley is fixed by its own hashes, so a
// frame is the same for every seed. ?shot=cover|rings|landing|rescue (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.
import { BEST_KEY, MISSIONS, STEP } from './config.js';
import { createFlight, emptyControls, stepFlight, EVENT_COMPLETE, EVENT_CRASH, EVENT_FUEL_LOW, EVENT_LANDED, EVENT_PICKUP, EVENT_RING, EVENT_TIME_UP } from './flight.js';
import { applyEvent, createMissionRun, debriefLines, nextMissionIndex, objectiveText } from './missions.js';
import { createInput, stick, takeActions, takeClicks, takeMissionPick, ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART } from './input.js';
import { createRenderer, draw, SCREEN_BRIEFING, SCREEN_COMPLETE, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';
import { burst, crashBurst, createParticles, smoke, stepParticles } from './particles.js';
import { createAudio, playRing, playTouchdown, playWarning, toggleMute, unlockAudio, updateAudio } from './audio.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;
void seed;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const audio = createAudio();
const input = createInput(canvas);

// One world: the mission being flown, its flight, its particles, its clock.
const world = {
  mission: MISSIONS[0],
  run: createMissionRun(0),
  flight: createFlight(MISSIONS[0]),
  particles: createParticles(),
  time: 0,
  screen: SCREEN_TITLE,
  scores: [0, 0, 0],
  campaignScore: 0,
  campaignDone: false,
  best: 0,
  muted: false,
};

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
}

world.best = readBest();

/**
 * The title screen's backdrop: the aircraft in a gentle cruise over the valley,
 * not sitting on the runway — the title is the game's cover, and it should show
 * the game flying. Restored whenever the player comes back to the title.
 */
function scenicFlight() {
  const flight = createFlight(MISSIONS[0]);
  flight.x = -100;
  flight.y = 140;
  flight.z = 2200;
  flight.heading = 0.05;
  flight.speed = 55;
  flight.throttle = 0.6;
  flight.onGround = false;
  flight.airborne = true;
  return flight;
}

world.flight = scenicFlight();

/** Back to the title, with the cruise backdrop again. */
function goTitle() {
  world.screen = SCREEN_TITLE;
  world.flight = scenicFlight();
}

function announce(message) {
  status.textContent = message;
}

/** Start a sortie from its briefing screen. */
function startMission(index) {
  world.mission = MISSIONS[index];
  world.run = createMissionRun(index);
  world.flight = createFlight(world.mission);
  world.particles = createParticles();
  world.campaignDone = false;
  world.run.status = 'flying';
  world.screen = SCREEN_PLAY;
  announce(`${world.mission.name}. ${world.mission.goal}.`);
}

function endMission() {
  const flight = world.flight;
  // The campaign keeps each sortie's best score, so a retry never double-counts.
  world.scores[world.run.index] = Math.max(world.scores[world.run.index] || 0, flight.score);
  world.campaignScore = world.scores.reduce((a, b) => a + b, 0);
  if (world.run.status === 'complete' && nextMissionIndex(world.run) < 0) {
    if (world.campaignScore > world.best) {
      world.best = world.campaignScore;
      saveBest(world.best);
    }
    world.campaignDone = true;
  }
  world.screen = world.run.status === 'complete' ? SCREEN_COMPLETE : SCREEN_OVER;
}

function viewForDraw() {
  const flight = world.flight;
  const run = world.run;
  let debrief = null;
  if (world.screen === SCREEN_OVER || world.screen === SCREEN_COMPLETE) {
    debrief = debriefLines(run, flight);
    if (world.campaignDone) debrief.unshift('Campaign complete — all three sorties flown.');
  }
  return {
    screen: world.screen,
    flight,
    run,
    mission: world.mission,
    missions: MISSIONS,
    particles: world.particles,
    time: world.time,
    elapsed: world.flight.elapsed,
    best: world.best,
    campaignScore: world.campaignScore,
    nextIndex: nextMissionIndex(run),
    objective: objectiveText(run, flight),
    debrief,
    mouse: input.mouse,
  };
}

function runShot(name) {
  const staged = stageShot(name, world);
  world.screen = staged.screen;
  let painted = 0;
  function paint() {
    draw(renderer, viewForDraw());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  let prevKeys = new Set();
  let pickedMission = 0;

  function clickButton(id) {
    if (id === 'fly') startMission(pickedMission);
    else if (id === 'back') goTitle();
    else if (id === 'resume') world.screen = SCREEN_PLAY;
    else if (id === 'retry') startMission(world.run.index);
    else if (id === 'next') startMission(nextMissionIndex(world.run));
    else if (id === 'title') goTitle();
    else if (id && id.startsWith('mission-')) {
      pickedMission = Number(id.slice('mission-'.length));
      world.screen = SCREEN_BRIEFING;
    }
  }

  function handleClicks() {
    for (const click of takeClicks(input)) {
      unlockAudio(audio);
      for (const b of renderer.buttons) {
        if (click.x >= b.x && click.x <= b.x + b.w && click.y >= b.y && click.y <= b.y + b.h) {
          clickButton(b.id);
          return;
        }
      }
    }
  }

  function handleKeys(actions) {
    const screen = world.screen;
    if (actions & ACTION_MUTE) {
      world.muted = toggleMute(audio);
      announce(world.muted ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      const pick = takeMissionPick(input);
      if (pick >= 0 && pick < MISSIONS.length) {
        pickedMission = pick;
        world.screen = SCREEN_BRIEFING;
      } else if (actions & ACTION_CONFIRM) {
        pickedMission = 0;
        world.screen = SCREEN_BRIEFING;
      }
      return;
    }
    if (screen === SCREEN_BRIEFING) {
      if (actions & ACTION_CONFIRM) startMission(pickedMission);
      else if (actions & ACTION_PAUSE) goTitle();
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        world.screen = SCREEN_PAUSED;
        announce('Paused.');
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & ACTION_PAUSE) world.screen = SCREEN_PLAY;
      else if (actions & ACTION_RESTART) startMission(world.run.index);
      return;
    }
    if (screen === SCREEN_OVER || screen === SCREEN_COMPLETE) {
      if (actions & ACTION_RESTART) startMission(world.run.index);
      else if (actions & ACTION_PAUSE) goTitle();
      else if (actions & ACTION_CONFIRM && screen === SCREEN_COMPLETE && nextMissionIndex(world.run) >= 0) {
        startMission(nextMissionIndex(world.run));
      }
    }
  }

  function step() {
    if (world.screen !== SCREEN_PLAY) return;
    const ctrl = emptyControls();
    const sticks = stick(input);
    ctrl.pitchIn = sticks.pitchIn;
    ctrl.bankIn = sticks.bankIn;
    ctrl.throttleIn = sticks.throttleIn;
    const now = input.keys;
    if (now.has('f') && !prevKeys.has('f')) ctrl.flapsToggle = true;
    if (now.has('g') && !prevKeys.has('g')) ctrl.gearToggle = true;
    prevKeys = new Set(now);
    const flight = world.flight;
    const events = stepFlight(flight, ctrl, world.mission, STEP, flight.elapsed);
    if (events & EVENT_RING || events & EVENT_PICKUP) {
      playRing(audio);
      burst(world.particles, 640, 300, '#ffb020');
    }
    if (events & EVENT_LANDED) {
      playTouchdown(audio);
      smoke(world.particles, 640, 480);
    }
    if (events & EVENT_CRASH) {
      playWarning(audio);
      crashBurst(world.particles, 640, 460);
    }
    if (events & EVENT_FUEL_LOW) playWarning(audio);
    if (events & (EVENT_CRASH | EVENT_LANDED | EVENT_COMPLETE | EVENT_TIME_UP | EVENT_RING)) {
      const statusNow = applyEvent(world.run, flight, events);
      if (statusNow !== 'flying') endMission();
    }
    updateAudio(audio, flight);
    stepParticles(world.particles, STEP);
  }

  function frame(nowMs) {
    requestAnimationFrame(frame);
    world.time = nowMs / 1000;
    accumulator += Math.min((nowMs - last) / 1000, MAX_FRAME);
    last = nowMs;
    const actions = takeActions(input);
    handleClicks();
    handleKeys(actions);
    while (accumulator >= STEP && world.screen === SCREEN_PLAY) {
      step();
      accumulator -= STEP;
    }
    if (world.screen !== SCREEN_PLAY) accumulator = 0;
    draw(renderer, viewForDraw());
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && world.screen === SCREEN_PLAY) {
      world.screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  window.addEventListener('pointerdown', () => unlockAudio(audio), { once: true });
  window.addEventListener('keydown', () => unlockAudio(audio), { once: true });

  announce('Skylark Valley. Pick a sortie — 1, 2 or 3 — then fly it.');
  requestAnimationFrame(frame);
}

// A handle for play-testing from the console: the live flight and screen.
window.__game = world;

if (shot) runShot(shot);
else runGame();
