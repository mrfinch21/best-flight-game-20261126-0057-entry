// The sorties: what each one asks for, whether it is done, and what the debrief
// says. The flight model reports events; this module turns them into progress.

import { AIRFIELDS, MISSIONS, SCORE } from './config.js';
import { EVENT_COMPLETE, EVENT_CRASH, EVENT_LANDED, EVENT_TIME_UP } from './flight.js';

/** A fresh mission run: the flight plus the sortie's own bookkeeping. */
export function createMissionRun(index) {
  const mission = MISSIONS[index];
  return {
    index,
    mission,
    status: 'briefing', // briefing | flying | complete | failed | landed-early
    failReason: '',
    ringsDone: 0,
    ringsTotal: mission.rings.length,
    bonus: 0,
  };
}

/** The one-line objective the HUD banner shows, live. */
export function objectiveText(run, flight) {
  const m = run.mission;
  if (m.id === 'rings') {
    return `Rings ${flight.ringsPassed.size}/${m.rings.length} — thread them all`;
  }
  if (m.id === 'courier') {
    if (!flight.pickedUp) return 'Collect the parcel at Miller’s Crossing (45 m)';
    return 'Parcel aboard — land on South Strip, gear down';
  }
  if (!flight.ringsPassed.size) return 'Fly the beacon ring through the storm';
  return 'Beacon flown — land on the grass strip by the hut';
}

/** Feed a flight event into the mission; returns the new status when it ends. */
export function applyEvent(run, flight, events) {
  const m = run.mission;
  if (events & EVENT_CRASH) {
    run.status = 'failed';
    run.failReason = flight.crashReason || 'Crashed';
    return run.status;
  }
  if (events & EVENT_TIME_UP) {
    run.status = 'failed';
    run.failReason = 'Out of time — the sortie window closed';
    return run.status;
  }
  // The Ring Run ends the moment the last ring is flown — no landing required.
  if (m.id === 'rings' && flight.ringsPassed.size === m.rings.length) {
    run.status = 'complete';
    run.bonus = Math.round(flight.fuel * SCORE.fuelPerUnit + flight.timeLeft * SCORE.timePerSecond);
    flight.score += run.bonus;
    return run.status;
  }
  if (events & EVENT_COMPLETE) {
    run.status = 'complete';
    run.bonus = Math.round(flight.fuel * SCORE.fuelPerUnit + flight.timeLeft * SCORE.timePerSecond);
    flight.score += run.bonus;
    return run.status;
  }
  if (events & EVENT_LANDED) {
    if (m.id === 'rings') {
      run.status = 'landed-early';
      run.failReason = `Landed safely with ${flight.ringsPassed.size}/${m.rings.length} rings — the sortie needed them all`;
      return run.status;
    }
    if (m.id === 'courier' && !flight.pickedUp) {
      run.status = 'landed-early';
      run.failReason = 'Landed without the parcel — the mail never left the valley';
      return run.status;
    }
    if (m.landAt && flight.landedStrip !== m.landAt) {
      run.status = 'landed-early';
      run.failReason = `Landed on the wrong strip — the sortie needed ${AIRFIELDS[m.landAt].name}`;
      return run.status;
    }
    // A landing that is not the mission's end (rough field) ends the sortie.
    run.status = 'landed-early';
    run.failReason = 'Put down in a field — the aircraft needs a proper strip to continue';
    return run.status;
  }
  return run.status;
}

/** The debrief lines for a finished sortie, for the end screen. */
export function debriefLines(run, flight) {
  const m = run.mission;
  const lines = [];
  if (run.status === 'complete') {
    lines.push(`${m.short} complete — nicely flown.`);
    if (m.rings.length) lines.push(`Rings: ${flight.ringsPassed.size}/${m.rings.length}`);
    if (m.pickup) lines.push('Parcel delivered.');
    lines.push(`Time and fuel bonus: +${run.bonus}`);
  } else if (run.status === 'failed') {
    lines.push(run.failReason);
    if (m.rings.length) lines.push(`Rings flown: ${flight.ringsPassed.size}/${m.rings.length}`);
    if (m.pickup) lines.push(flight.pickedUp ? 'Parcel was aboard.' : 'Parcel never collected.');
  } else {
    lines.push(run.failReason);
  }
  lines.push(`Score this sortie: ${flight.score}`);
  return lines;
}

/** The next mission's index, or -1 when the campaign is done. */
export function nextMissionIndex(run) {
  return run.index + 1 < MISSIONS.length ? run.index + 1 : -1;
}
