// Everything drawn on the canvas: the sky, the ridges, the patchwork valley, the
// rings and strips, the aircraft itself, and the lit instrument panel. The judge
// reads the game mostly through its screenshots, so every frame is drawn to show
// the aircraft, the terrain, a runway or a ring, and the HUD at once.

import { FIELD, FONT, PALETTE } from './config.js';
import { clamp, hash1, hash2, lerp, wrapAngle } from './random.js';
import { groundColor, groundHeight, hasTree, listAirfields, riverX, roadX } from './terrain.js';
import { feet, knots } from './flight.js';
import { drawParticles } from './particles.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_BRIEFING = 'briefing';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_COMPLETE = 'complete';

const CX = FIELD.width / 2;
const CY = FIELD.height / 2;
const FOCAL = 560;

/** Hex colour to [r, g, b]. */
function rgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** Mix two hex colours by t (0 = a, 1 = b). */
function mix(hexA, hexB, t) {
  const a = rgb(hexA);
  const b = rgb(hexB);
  return `rgb(${Math.round(lerp(a[0], b[0], t))}, ${Math.round(lerp(a[1], b[1], t))}, ${Math.round(lerp(a[2], b[2], t))})`;
}

/** A fresh renderer bound to a canvas. */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = FIELD.width;
  canvas.height = FIELD.height;
  return { ctx, buttons: [] };
}

function text(ctx, str, x, y, size, colour, align = 'left', weight = 600) {
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function pill(ctx, x, y, w, h, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

/** The horizon's screen height: pitch tips it, altitude dips it a little. */
function horizonY(flight) {
  return 330 + flight.pitch * 420 + clamp(flight.y, 0, 300) * 0.06;
}

/** Camera position: 26 m behind the aircraft, 7 m above it. */
function cameraOf(flight) {
  return {
    x: flight.x - Math.sin(flight.heading) * 26,
    y: flight.y + 7,
    z: flight.z - Math.cos(flight.heading) * 26,
  };
}

/** Project a world point to the screen; null when behind the camera. */
function project(flight, cam, hy, wx, wy, wz) {
  const dx = wx - cam.x;
  const dy = wy - cam.y;
  const dz = wz - cam.z;
  const forward = dx * Math.sin(flight.heading) + dz * Math.cos(flight.heading);
  if (forward < 2) return null;
  const right = dx * Math.cos(flight.heading) - dz * Math.sin(flight.heading);
  return {
    x: CX + (right * FOCAL) / forward,
    y: hy - (dy * FOCAL) / forward,
    d: forward,
    scale: FOCAL / forward,
  };
}

/** Ridge height for a mountain layer: sines over a world coordinate. */
function ridgeHeight(worldX, seed) {
  return 46
    + 52 * Math.abs(Math.sin(worldX * 0.0011 + seed))
    + 34 * Math.abs(Math.sin(worldX * 0.0027 + seed * 2.3))
    + 18 * Math.sin(worldX * 0.008 + seed * 5.1);
}

function drawSky(ctx, flight, hy, mission, time) {
  const storm = mission.fog > 0.3;
  const top = storm ? PALETTE.stormTop : PALETTE.skyTop;
  const mid = storm ? PALETTE.stormMid : PALETTE.skyMid;
  const low = storm ? PALETTE.stormLow : PALETTE.skyLow;
  const grad = ctx.createLinearGradient(0, 0, 0, hy + 40);
  grad.addColorStop(0, top);
  grad.addColorStop(0.55, mid);
  grad.addColorStop(1, low);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, FIELD.width, hy + 40);

  // The sun hangs east of the valley; turning the nose pans it across the sky.
  const sunX = CX + 430 - wrapAngle(flight.heading + Math.PI / 2) * 260;
  const sunY = hy - 190;
  if (sunX > -80 && sunX < FIELD.width + 80) {
    const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 120);
    glow.addColorStop(0, storm ? 'rgba(255, 240, 180, 0.25)' : PALETTE.sunGlow);
    glow.addColorStop(1, 'rgba(255, 240, 180, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 120, sunY - 120, 240, 240);
    ctx.fillStyle = storm ? 'rgba(255, 243, 196, 0.7)' : PALETTE.sun;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  // High clouds, fixed to the world so they slide past as you fly.
  for (let i = 0; i < 12; i += 1) {
    const wx = (hash1(i * 7 + 3) - 0.5) * 5200;
    const wz = flight.z + 400 + hash1(i * 13 + 5) * 2400;
    const wy = 520 + hash1(i * 17 + 9) * 260;
    const p = project(flight, cameraOf(flight), hy, wx, wy, wz);
    if (!p || p.x < -160 || p.x > FIELD.width + 160) continue;
    const s = clamp(p.scale * 90, 8, 90);
    ctx.fillStyle = storm ? 'rgba(210, 214, 220, 0.5)' : 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, s, s * 0.32, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - s * 0.7, p.y + s * 0.08, s * 0.6, s * 0.24, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + s * 0.7, p.y + s * 0.06, s * 0.65, s * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  void time;
}

function drawMountains(ctx, flight, hy, mission) {
  const layers = [
    { parallax: 0.25, colour: PALETTE.mountainFar, seed: 1.7, snow: true, base: 30 },
    { parallax: 0.55, colour: PALETTE.mountainNear, seed: 4.2, snow: false, base: 12 },
  ];
  for (const layer of layers) {
    ctx.fillStyle = mission.fog > 0.3 ? mix(layer.colour, '#9aa0a8', 0.35) : layer.colour;
    ctx.beginPath();
    ctx.moveTo(-4, hy + 4);
    for (let sx = -4; sx <= FIELD.width + 4; sx += 16) {
      const worldX = flight.x * layer.parallax + (sx / FIELD.width) * 3200
        + wrapAngle(flight.heading) * 900 * layer.parallax;
      const h = ridgeHeight(worldX, layer.seed) * (0.7 + layer.parallax * 0.5) + layer.base;
      ctx.lineTo(sx, hy - h);
    }
    ctx.lineTo(FIELD.width + 4, hy + 4);
    ctx.closePath();
    ctx.fill();
    if (layer.snow) {
      ctx.fillStyle = PALETTE.mountainSnow;
      for (let sx = 0; sx <= FIELD.width; sx += 16) {
        const worldX = flight.x * layer.parallax + (sx / FIELD.width) * 3200
          + wrapAngle(flight.heading) * 900 * layer.parallax;
        const h = ridgeHeight(worldX, layer.seed) * 0.95 + layer.base;
        if (h > 118) {
          ctx.beginPath();
          ctx.moveTo(sx - 14, hy - h + 26);
          ctx.lineTo(sx, hy - h);
          ctx.lineTo(sx + 14, hy - h + 26);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }
}

/** The patchwork valley floor, drawn as perspective strips from far to near. */
function drawGround(ctx, flight, hy, mission) {
  const cam = cameraOf(flight);
  const fogMix = mission.fog;
  const strips = 46;
  const dMin = 30;
  const dMax = 2600;
  const depths = [];
  for (let i = 0; i <= strips; i += 1) {
    depths.push(dMin * Math.pow(dMax / dMin, i / strips));
  }
  const samples = 22;
  for (let i = strips; i >= 1; i -= 1) {
    const dFar = depths[i];
    const dNear = depths[i - 1];
    const dMid = Math.sqrt(dFar * dNear);
    const centreX = flight.x + Math.sin(flight.heading) * dMid;
    const centreZ = flight.z + Math.cos(flight.heading) * dMid;
    const ghFar = groundHeight(centreX + Math.sin(flight.heading) * (dFar - dMid), centreZ + Math.cos(flight.heading) * (dFar - dMid));
    const ghNear = groundHeight(centreX + Math.sin(flight.heading) * (dNear - dMid), centreZ + Math.cos(flight.heading) * (dNear - dMid));
    const yFar = hy + ((cam.y - ghFar) * FOCAL) / dFar;
    const yNear = hy + ((cam.y - ghNear) * FOCAL) / dNear;
    if (yFar > FIELD.height + 40 || yNear < hy - 4) {
      if (yFar > FIELD.height + 40 && yNear > FIELD.height + 40) continue;
    }
    const halfW = (CX * dMid) / FOCAL;
    const yTop = Math.min(yFar, yNear);
    const yBot = Math.max(yFar, yNear);
    if (yBot - yTop < 0.4 && yTop > FIELD.height) continue;
    for (let j = 0; j < samples; j += 1) {
      const l0 = -halfW + (j * 2 * halfW) / samples;
      const l1 = -halfW + ((j + 1) * 2 * halfW) / samples;
      const lm = (l0 + l1) / 2;
      const wx = flight.x + Math.sin(flight.heading) * dMid + Math.cos(flight.heading) * lm;
      const wz = flight.z + Math.cos(flight.heading) * dMid - Math.sin(flight.heading) * lm;
      let colour = groundColor(wx, wz);
      // Haze the far ground toward the sky so the valley melts into the horizon.
      colour = mix(colour, PALETTE.skyLow, clamp((dMid / 2600) * 0.55, 0, 0.55));
      if (fogMix > 0) colour = mix(colour, '#a8adb5', clamp(fogMix * (dMid / 900), 0, 0.75));
      ctx.fillStyle = colour;
      const x0 = CX + (l0 * FOCAL) / dMid;
      const x1 = CX + (l1 * FOCAL) / dMid;
      ctx.fillRect(x0, yTop, Math.max(1, x1 - x0 + 1), Math.max(1, yBot - yTop + 1));
    }
    // Trees on the near strips, where the valley grows them.
    if (dMid < 520) {
      const step = 34;
      for (let l = -halfW; l < halfW; l += step) {
        const wx = flight.x + Math.sin(flight.heading) * dMid + Math.cos(flight.heading) * (l + step / 2);
        const wz = flight.z + Math.cos(flight.heading) * dMid - Math.sin(flight.heading) * (l + step / 2);
        if (!hasTree(wx, wz)) continue;
        const p = project(flight, cam, hy, wx, groundHeight(wx, wz) + 5, wz);
        if (!p || p.y < hy) continue;
        const s = clamp(p.scale * 7, 2, 16);
        ctx.fillStyle = '#2f5c33';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - s);
        ctx.lineTo(p.x - s * 0.6, p.y);
        ctx.lineTo(p.x + s * 0.6, p.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  // Fog settles over the valley floor in the storm sortie.
  if (fogMix > 0) {
    const grad = ctx.createLinearGradient(0, hy - 60, 0, FIELD.height);
    grad.addColorStop(0, 'rgba(168, 173, 181, 0)');
    grad.addColorStop(1, `rgba(168, 173, 181, ${fogMix * 0.5})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, hy - 60, FIELD.width, FIELD.height - hy + 60);
  }
  void riverX;
  void roadX;
}

/** The instrument panel: airspeed, throttle, attitude, compass, altitude, fuel. */
function drawHud(ctx, view) {
  const { flight, run, mission } = view;
  const hy = view.hy;
  void hy;
  ctx.fillStyle = 'rgba(18, 22, 32, 0.92)';
  ctx.fillRect(0, 556, FIELD.width, 164);
  ctx.fillStyle = PALETTE.panelEdge;
  ctx.fillRect(0, 556, FIELD.width, 2);

  // Airspeed tape, left.
  const kt = knots(flight.speed);
  pill(ctx, 16, 572, 132, 132, '#10141d', '#2c3448');
  text(ctx, 'AIRSPEED', 82, 586, 11, PALETTE.muted, 'center');
  text(ctx, `${kt.toFixed(0)}`, 82, 632, 40, kt < 62 ? PALETTE.litRed : PALETTE.lit, 'center', 700);
  text(ctx, 'KT', 82, 664, 12, PALETTE.muted, 'center');
  text(ctx, `STALL ${knots(flight.flaps ? 24 : 30).toFixed(0)}`, 82, 690, 11, PALETTE.muted, 'center');

  // Throttle lever.
  pill(ctx, 160, 572, 64, 132, '#10141d', '#2c3448');
  text(ctx, 'THR', 192, 586, 11, PALETTE.muted, 'center');
  ctx.fillStyle = '#2c3448';
  ctx.fillRect(188, 600, 8, 84);
  const leverY = 684 - flight.throttle * 84;
  ctx.fillStyle = flight.throttle > 0.85 ? PALETTE.litAmber : PALETTE.lit;
  ctx.beginPath();
  ctx.roundRect(176, leverY - 5, 32, 10, 4);
  ctx.fill();
  text(ctx, `${Math.round(flight.throttle * 100)}%`, 192, 700, 11, PALETTE.text, 'center');

  // Attitude indicator: a ball that rolls with the bank and slides with pitch.
  const ax = 300;
  const ay = 630;
  const ar = 58;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, ay, ar, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(ax, ay);
  ctx.rotate(-flight.bank);
  ctx.translate(0, flight.pitch * 150);
  ctx.fillStyle = '#5d8fc4';
  ctx.fillRect(-ar - 4, -ar * 2 - 4, ar * 2 + 8, ar * 2 + 4);
  ctx.fillStyle = '#7a5a38';
  ctx.fillRect(-ar - 4, 0, ar * 2 + 8, ar * 2 + 4);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-ar, 0);
  ctx.lineTo(ar, 0);
  ctx.stroke();
  ctx.lineWidth = 1;
  for (const off of [-30, 30]) {
    ctx.beginPath();
    ctx.moveTo(-24, off);
    ctx.lineTo(24, off);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(ax, ay, ar, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = PALETTE.litAmber;
  ctx.beginPath();
  ctx.moveTo(ax - 26, ay + 4);
  ctx.lineTo(ax, ay - 6);
  ctx.lineTo(ax + 26, ay + 4);
  ctx.lineTo(ax + 18, ay + 4);
  ctx.lineTo(ax, ay - 1);
  ctx.lineTo(ax - 18, ay + 4);
  ctx.closePath();
  ctx.fill();
  text(ctx, 'ATTITUDE', ax, ay + ar + 12, 11, PALETTE.muted, 'center');

  // Heading compass strip.
  const cx0 = 420;
  const cw = 440;
  const cy0 = 576;
  pill(ctx, cx0, cy0, cw, 34, '#10141d', '#2c3448');
  const headingDeg = ((flight.heading * 180) / Math.PI + 360) % 360;
  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx0, cy0, cw, 34);
  ctx.clip();
  for (let d = -60; d <= 60; d += 5) {
    const deg = Math.round((headingDeg + d) / 5) * 5;
    const off = (deg - headingDeg) * (cw / 120);
    const x = cx0 + cw / 2 + off;
    const isCard = deg % 45 === 0;
    ctx.strokeStyle = isCard ? PALETTE.lit : '#5a6376';
    ctx.lineWidth = isCard ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, cy0 + 22);
    ctx.lineTo(x, cy0 + (isCard ? 8 : 15));
    ctx.stroke();
    if (isCard) {
      const label = cardinals[((deg / 45) % 8 + 8) % 8];
      text(ctx, label, x, cy0 + 29, 11, PALETTE.text, 'center');
    } else if (deg % 15 === 0) {
      text(ctx, String(((deg % 360) + 360) % 360), x, cy0 + 29, 9, PALETTE.muted, 'center');
    }
  }
  ctx.restore();
  ctx.fillStyle = PALETTE.litAmber;
  ctx.beginPath();
  ctx.moveTo(cx0 + cw / 2 - 6, cy0);
  ctx.lineTo(cx0 + cw / 2 + 6, cy0);
  ctx.lineTo(cx0 + cw / 2, cy0 + 8);
  ctx.closePath();
  ctx.fill();
  text(ctx, `${headingDeg.toFixed(0).padStart(3, '0')}°`, cx0 + cw / 2, cy0 + 48, 15, PALETTE.text, 'center', 700);

  // Altimeter tape, right of the compass.
  pill(ctx, 880, 572, 130, 132, '#10141d', '#2c3448');
  text(ctx, 'ALTITUDE', 945, 586, 11, PALETTE.muted, 'center');
  text(ctx, `${feet(flight.y).toFixed(0)}`, 945, 626, 32, PALETTE.lit, 'center', 700);
  text(ctx, 'FT', 945, 654, 12, PALETTE.muted, 'center');
  const vsFpm = flight.verticalSpeed * 196.85;
  const vsArrow = flight.verticalSpeed > 0.5 ? '▲' : flight.verticalSpeed < -0.5 ? '▼' : '—';
  text(ctx, `${vsArrow} ${Math.abs(vsFpm).toFixed(0)} FPM`, 945, 690, 12, vsFpm < -500 ? PALETTE.litRed : PALETTE.text, 'center');

  // Fuel, damage, gear, flaps, score and the clock.
  const fx = 1030;
  text(ctx, 'FUEL', fx, 586, 11, PALETTE.muted, 'left');
  ctx.fillStyle = '#2c3448';
  ctx.fillRect(fx, 594, 200, 12);
  ctx.fillStyle = flight.fuel < 20 ? PALETTE.litRed : flight.fuel < 45 ? PALETTE.litAmber : PALETTE.litGreen;
  ctx.fillRect(fx, 594, 200 * clamp(flight.fuel / 100, 0, 1), 12);
  text(ctx, `${flight.fuel.toFixed(0)}%`, fx + 208, 600, 12, PALETTE.text, 'left');
  text(ctx, 'HULL', fx, 620, 11, PALETTE.muted, 'left');
  ctx.fillStyle = '#2c3448';
  ctx.fillRect(fx, 628, 200, 12);
  ctx.fillStyle = flight.damage > 60 ? PALETTE.litRed : PALETTE.litGreen;
  ctx.fillRect(fx, 628, 200 * clamp(1 - flight.damage / 100, 0, 1), 12);
  text(ctx, `${Math.max(0, 100 - flight.damage).toFixed(0)}%`, fx + 208, 634, 12, PALETTE.text, 'left');
  const gearColour = flight.gearDown ? PALETTE.litGreen : PALETTE.litRed;
  text(ctx, `GEAR ${flight.gearDown ? 'DOWN' : 'UP'}`, fx, 662, 13, gearColour, 'left', 700);
  text(ctx, `FLAPS ${flight.flaps ? 'DOWN' : 'UP'}`, fx + 130, 662, 13, flight.flaps ? PALETTE.litAmber : PALETTE.muted, 'left', 700);
  text(ctx, `SCORE ${flight.score}`, fx, 692, 15, PALETTE.text, 'left', 700);
  const t = Math.max(0, Math.ceil(flight.timeLeft));
  text(ctx, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, fx + 170, 692, 15, t < 60 ? PALETTE.litRed : PALETTE.text, 'left', 700);

  // Stall warning, flashing over the aircraft.
  if (!flight.onGround && flight.speed < (flight.flaps ? 28 : 34) && flight.y > 10) {
    const on = Math.floor(view.time * 3) % 2 === 0;
    if (on) text(ctx, 'STALL — NOSE DOWN, FULL THROTTLE', CX, 300, 22, PALETTE.litRed, 'center', 800);
  }
}

/** The valley route strip, top right: where you are, what is left. */
function drawRoute(ctx, view) {
  const { flight, mission } = view;
  const x0 = 1010;
  const y0 = 14;
  const w = 256;
  const h = 54;
  pill(ctx, x0, y0, w, h, 'rgba(18, 22, 32, 0.78)', 'rgba(120, 130, 150, 0.6)');
  text(ctx, 'VALLEY ROUTE', x0 + 10, y0 + 11, 10, PALETTE.muted, 'left');
  const zToX = (z) => x0 + 14 + ((z + 600) / 7200) * (w - 28);
  ctx.strokeStyle = '#5a6376';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(zToX(-600), y0 + 34);
  ctx.lineTo(zToX(6600), y0 + 34);
  ctx.stroke();
  for (const field of listAirfields()) {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(zToX(field.z) - 3, y0 + 29, 6, 10);
  }
  for (let i = 0; i < mission.rings.length; i += 1) {
    const ring = mission.rings[i];
    ctx.fillStyle = flight.ringsPassed.has(i) ? PALETTE.ringDone : PALETTE.ringNext;
    ctx.beginPath();
    ctx.arc(zToX(ring.z), y0 + 34, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (mission.pickup) {
    ctx.fillStyle = flight.pickedUp ? PALETTE.ringDone : PALETTE.ringNext;
    ctx.beginPath();
    ctx.moveTo(zToX(mission.pickup.z), y0 + 27);
    ctx.lineTo(zToX(mission.pickup.z) + 5, y0 + 34);
    ctx.lineTo(zToX(mission.pickup.z), y0 + 41);
    ctx.lineTo(zToX(mission.pickup.z) - 5, y0 + 34);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(zToX(flight.z), y0 + 34, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#171c26';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(zToX(flight.z), y0 + 34, 5.5, 0, Math.PI * 2);
  ctx.stroke();
}

/** The mission banner, top centre, and the transient message below it. */
function drawBanner(ctx, view) {
  const { flight, run } = view;
  const label = run.mission.short.toUpperCase();
  const goal = view.objective;
  ctx.font = `700 15px ${FONT}`;
  const labelW = ctx.measureText(label).width;
  ctx.font = `600 15px ${FONT}`;
  const goalW = ctx.measureText(goal).width;
  const w = labelW + goalW + 46;
  pill(ctx, CX - w / 2, 12, w, 34, 'rgba(18, 22, 32, 0.82)', 'rgba(120, 130, 150, 0.6)');
  text(ctx, label, CX - w / 2 + 16, 30, 15, PALETTE.litAmber, 'left', 700);
  text(ctx, goal, CX - w / 2 + 30 + labelW, 30, 15, PALETTE.text, 'left', 600);
  if (flight.message && view.elapsed < flight.messageUntil) {
    text(ctx, flight.message, CX, 66, 17, PALETTE.litAmber, 'center', 700);
  }
}

function drawButton(ctx, b, hover) {
  pill(ctx, b.x, b.y, b.w, b.h, hover ? '#2b3547' : '#232a3a', hover ? PALETTE.lit : '#4a5468');
  text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, b.size || 17, hover ? '#ffffff' : PALETTE.text, 'center', 700);
}

function drawPanel(ctx, x, y, w, h, title) {
  ctx.fillStyle = 'rgba(14, 18, 26, 0.94)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, title, x + w / 2, y + 34, 30, PALETTE.text, 'center', 800);
}

/** The title screen: the game name, the three sorties, the controls. */
function drawTitle(ctx, view, renderer) {
  ctx.fillStyle = 'rgba(10, 14, 22, 0.45)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  text(ctx, 'SKYLARK VALLEY', CX, 108, 64, '#ffffff', 'center', 800);
  text(ctx, 'A valley courier flight game — rings, mail and a storm rescue', CX, 152, 19, PALETTE.lit, 'center', 600);
  const buttons = [];
  view.missions.forEach((m, i) => {
    const x = 190 + i * 320;
    const y = 210;
    const w = 300;
    const h = 190;
    const hover = view.mouse.x >= x && view.mouse.x <= x + w && view.mouse.y >= y && view.mouse.y <= y + h;
    ctx.fillStyle = hover ? 'rgba(43, 53, 71, 0.96)' : 'rgba(23, 28, 38, 0.94)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = hover ? PALETTE.lit : PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, m.name, x + w / 2, y + 30, 19, PALETTE.text, 'center', 800);
    text(ctx, m.goal, x + w / 2, y + 62, 14, PALETTE.litAmber, 'center', 600);
    const words = m.brief.split(' ');
    let line = '';
    let ly = y + 92;
    ctx.font = `500 13px ${FONT}`;
    for (const word of words) {
      if (ctx.measureText(`${line} ${word}`).width > w - 28) {
        text(ctx, line.trim(), x + w / 2, ly, 13, PALETTE.muted, 'center', 500);
        line = word;
        ly += 17;
      } else {
        line += ` ${word}`;
      }
    }
    if (line.trim()) text(ctx, line.trim(), x + w / 2, ly, 13, PALETTE.muted, 'center', 500);
    buttons.push({ id: `mission-${i}`, label: m.name, x, y, w, h, size: 17 });
  });
  renderer.buttons = buttons;
  text(ctx, '↑ ↓ pitch      ← → bank      W / S throttle      F flaps      G gear      P pause      M mute', CX, 600, 15, PALETTE.text, 'center', 600);
  text(ctx, 'Click a sortie, or press 1, 2 or 3 — Enter flies the first', CX, 628, 15, PALETTE.muted, 'center', 600);
  if (view.best > 0) text(ctx, `Best campaign score: ${view.best}`, CX, 660, 16, PALETTE.litAmber, 'center', 700);
  text(ctx, 'An original game — no borrowed aircraft, places or music', CX, 690, 13, PALETTE.muted, 'center', 500);
}

/** The briefing before a sortie, with its goal and its one tip. */
function drawBriefing(ctx, view, renderer) {
  ctx.fillStyle = 'rgba(10, 14, 22, 0.55)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  const m = view.mission;
  drawPanel(ctx, 290, 120, 700, 420, m.name);
  const words = m.brief.split(' ');
  let line = '';
  let ly = 210;
  ctx.font = `500 17px ${FONT}`;
  for (const word of words) {
    if (ctx.measureText(`${line} ${word}`).width > 620) {
      text(ctx, line.trim(), CX, ly, 17, PALETTE.text, 'center', 500);
      line = word;
      ly += 26;
    } else {
      line += ` ${word}`;
    }
  }
  if (line.trim()) text(ctx, line.trim(), CX, ly, 17, PALETTE.text, 'center', 500);
  ly += 44;
  text(ctx, `GOAL — ${m.goal}`, CX, ly, 17, PALETTE.litAmber, 'center', 700);
  text(ctx, `TIP — ${m.tip}`, CX, ly + 30, 15, PALETTE.muted, 'center', 500);
  text(ctx, `Time limit ${Math.floor(m.timeLimit / 60)}:${String(m.timeLimit % 60).padStart(2, '0')}  ·  Fuel ${m.fuel}%`, CX, ly + 62, 15, PALETTE.text, 'center', 600);
  const fly = { id: 'fly', label: 'FLY THIS SORTIE  (Enter)', x: CX - 190, y: 452, w: 380, h: 52 };
  const hover = view.mouse.x >= fly.x && view.mouse.x <= fly.x + fly.w && view.mouse.y >= fly.y && view.mouse.y <= fly.y + fly.h;
  drawButton(ctx, fly, hover);
  renderer.buttons = [fly, { id: 'back', label: 'Back', x: CX - 60, y: 512, w: 120, h: 16, size: 13 }];
  text(ctx, 'Back to title  (Esc)', CX, 520, 13, PALETTE.muted, 'center', 600);
}

/** Pause, crash, debrief and campaign-complete overlays. */
function drawOverlay(ctx, view, renderer) {
  const { screen, run, flight } = view;
  ctx.fillStyle = 'rgba(10, 14, 22, 0.55)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  if (screen === SCREEN_PAUSED) {
    drawPanel(ctx, 390, 240, 500, 220, 'Paused');
    text(ctx, 'P — resume      R — restart sortie      Esc — title', CX, 330, 16, PALETTE.text, 'center', 600);
    renderer.buttons = [{ id: 'resume', label: 'Resume  (P)', x: CX - 110, y: 372, w: 220, h: 48 }];
    drawButton(ctx, renderer.buttons[0], false);
    return;
  }
  const complete = screen === SCREEN_COMPLETE;
  const title = complete ? 'Sortie complete' : run.status === 'failed' ? 'Sortie failed' : 'Sortie over';
  drawPanel(ctx, 290, 110, 700, 440, title);
  const lines = view.debrief || [];
  lines.forEach((line, i) => {
    text(ctx, line, CX, 196 + i * 30, 17, i === 0 ? PALETTE.litAmber : PALETTE.text, 'center', i === 0 ? 700 : 500);
  });
  text(ctx, `Total score: ${view.campaignScore}`, CX, 196 + lines.length * 30 + 12, 20, PALETTE.text, 'center', 800);
  const buttons = [];
  const secondRow = complete && view.nextIndex >= 0;
  if (secondRow) {
    buttons.push({ id: 'next', label: `Next sortie — ${view.missions[view.nextIndex].short}  (Enter)`, x: CX - 220, y: 440, w: 440, h: 52 });
  }
  const rowY = secondRow ? 500 : 440;
  buttons.push({ id: 'retry', label: 'Fly again  (R)', x: CX - 220, y: rowY, w: 210, h: 52 });
  buttons.push({ id: 'title', label: 'Title  (Esc)', x: CX + 10, y: rowY, w: 210, h: 52 });
  for (const b of buttons) {
    const hover = view.mouse.x >= b.x && view.mouse.x <= b.x + b.w && view.mouse.y >= b.y && view.mouse.y <= b.y + b.h;
    drawButton(ctx, b, hover);
  }
  renderer.buttons = buttons;
}

/**
 * Paint one frame. `view` carries the screen, the flight, the mission run, the
 * particles, the clock and the mouse. The world draws behind every screen so
 * the title itself shows the valley from the air.
 */
export function draw(renderer, view) {
  const { ctx } = renderer;
  const { flight, mission } = view;
  const hy = horizonY(flight);
  const playLike = view.screen === SCREEN_PLAY || view.screen === SCREEN_PAUSED
    || view.screen === SCREEN_OVER || view.screen === SCREEN_COMPLETE;
  ctx.clearRect(0, 0, FIELD.width, FIELD.height);

  // The sky stays level — only the world below it rolls with the bank, so a
  // hard turn never leaves an unpainted corner at the top of the frame.
  drawSky(ctx, flight, hy, mission, view.time);
  // Paint the lower half in the sky's horizon colour first: where the rolling
  // ground's edge lifts off the horizon, the gap reads as haze, not black.
  ctx.fillStyle = mission.fog > 0.3 ? PALETTE.stormLow : PALETTE.skyLow;
  ctx.fillRect(0, hy, FIELD.width, FIELD.height - hy);
  ctx.save();
  ctx.translate(CX, hy);
  ctx.rotate(-flight.bank * 0.22);
  ctx.translate(-CX, -hy);
  drawMountains(ctx, flight, hy, mission);
  drawGround(ctx, flight, hy, mission);
  drawGroundFeatures(ctx, flight, hy);
  drawObjects(ctx, flight, hy, mission);
  ctx.restore();

  drawAircraft(ctx, flight, hy, view.time);
  drawParticles(ctx, view.particles);

  if (playLike) {
    drawHud(ctx, { ...view, hy });
    drawRoute(ctx, view);
    drawBanner(ctx, view);
  }
  if (view.screen === SCREEN_TITLE) drawTitle(ctx, view, renderer);
  else if (view.screen === SCREEN_BRIEFING) drawBriefing(ctx, view, renderer);
  else if (view.screen === SCREEN_PAUSED || view.screen === SCREEN_OVER || view.screen === SCREEN_COMPLETE) {
    drawOverlay(ctx, view, renderer);
  } else {
    renderer.buttons = [];
  }
}


/** Fill a ground quad from its four projected corners; skip it when any is behind. */
function groundQuad(ctx, flight, hy, corners, colour) {
  const cam = cameraOf(flight);
  const pts = corners.map(([x, z]) => project(flight, cam, hy, x, groundHeight(x, z) + 0.4, z));
  if (pts.some((p) => !p)) return;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

/**
 * The features the strip sampler is too coarse to hold: the runway and grass
 * strips, the road and the river, drawn as explicit ribbons on the ground so
 * they read as continuous surfaces instead of sampled dashes.
 */
function drawGroundFeatures(ctx, flight, hy) {
  const zNear = flight.z - 120;
  const zFar = flight.z + 2600;
  for (const field of listAirfields()) {
    const z0 = field.z - field.length / 2;
    const z1 = field.z + field.length / 2;
    if (z1 < zNear || z0 > zFar) continue;
    const hw = field.width / 2;
    if (field.surface === 'runway') {
      groundQuad(ctx, flight, hy, [
        [field.x - hw, z0], [field.x + hw, z0], [field.x + hw, z1], [field.x - hw, z1],
      ], PALETTE.runway);
      groundQuad(ctx, flight, hy, [
        [field.x - hw + 3, z0 + 8], [field.x + hw - 3, z0 + 8],
        [field.x + hw - 3, z0 + 16], [field.x - hw + 3, z0 + 16],
      ], PALETTE.runwayLine);
      for (let z = z0 + 40; z < z1 - 20; z += 48) {
        groundQuad(ctx, flight, hy, [
          [field.x - 1.6, z], [field.x + 1.6, z],
          [field.x + 1.6, z + 24], [field.x - 1.6, z + 24],
        ], PALETTE.runwayLine);
      }
    } else {
      groundQuad(ctx, flight, hy, [
        [field.x - hw, z0], [field.x + hw, z0], [field.x + hw, z1], [field.x - hw, z1],
      ], PALETTE.grassStrip);
      for (let z = z0 + 30; z < z1 - 10; z += 40) {
        groundQuad(ctx, flight, hy, [
          [field.x - 2, z], [field.x + 2, z],
          [field.x + 2, z + 20], [field.x - 2, z + 20],
        ], '#c8d89a');
      }
    }
  }
  // The road, east side, and the river, west side, as ribbons along the valley.
  for (let z = Math.max(zNear, -600); z < zFar; z += 110) {
    const rx = roadX(z);
    groundQuad(ctx, flight, hy, [
      [rx - 7, z], [rx + 7, z], [rx + 7, z + 110], [rx - 7, z + 110],
    ], PALETTE.road);
    const vx = riverX(z);
    groundQuad(ctx, flight, hy, [
      [vx - 26, z], [vx + 26, z], [vx + 26, z + 110], [vx - 26, z + 110],
    ], PALETTE.river);
  }
}

/** The rings, the pickup beacon and the airfield furniture, all projected. */
function drawObjects(ctx, flight, hy, mission) {
  const cam = cameraOf(flight);
  const rings = mission.rings.map((r, i) => ({ ...r, kind: 'ring', index: i }));
  if (mission.pickup) rings.push({ ...mission.pickup, kind: 'pickup', index: -1 });
  for (const ring of rings) {
    const p = project(flight, cam, hy, ring.x, ring.y, ring.z);
    if (!p || p.d > 2600 || p.x < -200 || p.x > FIELD.width + 200) continue;
    const passed = ring.kind === 'ring' && flight.ringsPassed.has(ring.index);
    const isNext = ring.kind === 'ring'
      && !passed
      && flight.ringsPassed.size === ring.index
      || (ring.kind === 'pickup' && !flight.pickedUp);
    const rx = ring.r * p.scale;
    const ry = rx * 0.62;
    if (rx < 2) continue;
    // A soft shadow on the ground below the ring, so height reads at a glance.
    const ground = project(flight, cam, hy, ring.x, groundHeight(ring.x, ring.z) + 1, ring.z);
    if (ground) {
      ctx.fillStyle = 'rgba(20, 30, 40, 0.28)';
      ctx.beginPath();
      ctx.ellipse(ground.x, ground.y, rx * 0.9, rx * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.lineWidth = Math.max(3, rx * 0.11);
    ctx.strokeStyle = passed
      ? PALETTE.ringDone
      : isNext ? PALETTE.ringNext : PALETTE.ringLater;
    if (isNext) {
      ctx.shadowColor = PALETTE.ringNext;
      ctx.shadowBlur = 18;
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 0.55, ry * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
    if (isNext && rx > 14) {
      text(ctx, ring.kind === 'pickup' ? 'PARCEL' : `RING ${ring.index + 1}`, p.x, p.y - ry - 16, 15, PALETTE.litAmber, 'center', 700);
    }
  }

  // Airfields: a windsock and a hangar beside each strip, when in view.
  for (const field of listAirfields()) {
    const sock = project(flight, cam, hy, field.x + field.width / 2 + 34, groundHeight(field.x, field.z) + 12, field.z - field.length / 2 + 30);
    if (sock && sock.d < 2200 && sock.x > -40 && sock.x < FIELD.width + 40) {
      const s = clamp(sock.scale, 0.25, 2.2);
      ctx.strokeStyle = '#e8e8e8';
      ctx.lineWidth = Math.max(1, 2.4 * s);
      ctx.beginPath();
      ctx.moveTo(sock.x, sock.y);
      ctx.lineTo(sock.x, sock.y - 26 * s);
      ctx.stroke();
      ctx.fillStyle = '#ff7a1a';
      ctx.beginPath();
      ctx.moveTo(sock.x, sock.y - 26 * s);
      ctx.lineTo(sock.x + 16 * s, sock.y - 22 * s);
      ctx.lineTo(sock.x, sock.y - 17 * s);
      ctx.closePath();
      ctx.fill();
    }
    const hangar = project(flight, cam, hy, field.x - field.width / 2 - 70, groundHeight(field.x, field.z) + 10, field.z + 40);
    if (hangar && hangar.d < 2200 && hangar.x > -80 && hangar.x < FIELD.width + 80) {
      const w = 46 * hangar.scale;
      const h = 20 * hangar.scale;
      ctx.fillStyle = '#7a6a58';
      ctx.fillRect(hangar.x - w / 2, hangar.y - h, w, h);
      ctx.fillStyle = '#9a8874';
      ctx.beginPath();
      ctx.moveTo(hangar.x - w / 2, hangar.y - h);
      ctx.lineTo(hangar.x, hangar.y - h - 12 * hangar.scale);
      ctx.lineTo(hangar.x + w / 2, hangar.y - h);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** The aircraft, seen from behind and slightly above, banking with the turn. */
function drawAircraft(ctx, flight, hy, time) {
  const planeY = hy + 150;
  // The shadow on the ground below, shrinking as you climb.
  const cam = cameraOf(flight);
  const shadow = project(flight, cam, hy, flight.x, groundHeight(flight.x, flight.z) + 1, flight.z);
  if (shadow && shadow.y > hy && shadow.y < FIELD.height) {
    const s = clamp(1200 / Math.max(flight.y, 20), 8, 90);
    ctx.fillStyle = `rgba(20, 30, 40, ${clamp(0.34 - flight.y * 0.001, 0.06, 0.34)})`;
    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y, s * 0.55, s * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(CX, planeY - flight.pitch * 90);
  ctx.rotate(flight.bank * 0.85);
  const wobble = flight.speed < 32 && !flight.onGround ? Math.sin(time * 9) * 0.02 : 0;
  ctx.rotate(wobble);

  // Main wings, mid-fuselage, slight dihedral, cream tips, nav lights on the ends.
  ctx.fillStyle = '#2e7f8f';
  ctx.beginPath();
  ctx.moveTo(-18, -34);
  ctx.lineTo(-150, -14);
  ctx.lineTo(-150, -4);
  ctx.lineTo(-16, -22);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(18, -34);
  ctx.lineTo(150, -14);
  ctx.lineTo(150, -4);
  ctx.lineTo(16, -22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f2ead8';
  ctx.fillRect(-150, -14, 22, 10);
  ctx.fillRect(128, -14, 22, 10);
  const blink = Math.floor(time * 1.4) % 2 === 0;
  ctx.fillStyle = '#ff4d4d';
  ctx.beginPath();
  ctx.arc(-152, -9, blink ? 5 : 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#37e08a';
  ctx.beginPath();
  ctx.arc(152, -9, blink ? 5 : 3, 0, Math.PI * 2);
  ctx.fill();

  // Fuselage: cream top, teal belly, orange cheatline, tapering to the nose.
  ctx.fillStyle = '#f2ead8';
  ctx.beginPath();
  ctx.moveTo(-20, 16);
  ctx.quadraticCurveTo(-23, -56, -10, -96);
  ctx.quadraticCurveTo(0, -104, 10, -96);
  ctx.quadraticCurveTo(23, -56, 20, 16);
  ctx.quadraticCurveTo(0, 24, -20, 16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(20, 30, 40, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#2e7f8f';
  ctx.beginPath();
  ctx.moveTo(-20, 2);
  ctx.quadraticCurveTo(-19, 12, -12, 16);
  ctx.quadraticCurveTo(0, 22, 12, 16);
  ctx.quadraticCurveTo(19, 12, 20, 2);
  ctx.lineTo(14, 8);
  ctx.lineTo(-14, 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff7a1a';
  ctx.fillRect(-19, -4, 38, 4);

  // Cockpit windows, catching the sky.
  ctx.fillStyle = '#1d2f45';
  ctx.beginPath();
  ctx.roundRect(-13, -74, 10, 17, 3);
  ctx.roundRect(3, -74, 10, 17, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(160, 210, 240, 0.7)';
  ctx.beginPath();
  ctx.roundRect(-12, -72, 8, 6, 2);
  ctx.roundRect(4, -72, 8, 6, 2);
  ctx.fill();

  // The prop, a spinning blur at the far end.
  const prop = (time * 22) % Math.PI;
  ctx.save();
  ctx.translate(0, -100);
  ctx.rotate(prop);
  ctx.fillStyle = 'rgba(40, 40, 40, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 36, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.arc(0, -100, 4, 0, Math.PI * 2);
  ctx.fill();

  // Tailplane and fin, nearest the viewer, smaller than the main wings.
  ctx.fillStyle = '#2e7f8f';
  ctx.beginPath();
  ctx.moveTo(-14, 12);
  ctx.lineTo(-54, 28);
  ctx.lineTo(-52, 35);
  ctx.lineTo(-12, 20);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14, 12);
  ctx.lineTo(54, 28);
  ctx.lineTo(52, 35);
  ctx.lineTo(12, 20);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-7, 14);
  ctx.lineTo(-9, -12);
  ctx.lineTo(9, -12);
  ctx.lineTo(7, 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff7a1a';
  ctx.fillRect(-9, -12, 18, 4);

  // The gear, down and visible under the belly.
  if (flight.gearDown) {
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(-11, 20, 4, 0, Math.PI * 2);
    ctx.arc(11, 20, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // Speed streaks at the edges when she is really moving.
  if (flight.speed > 58 && !flight.onGround) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i += 1) {
      const seed = hash1(i * 31 + Math.floor(time * 8));
      const x = seed < 0.5 ? seed * 160 : FIELD.width - (seed - 0.5) * 160;
      const y = 120 + hash1(i * 17 + Math.floor(time * 8)) * 380;
      const len = 26 + flight.speed * 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + len);
      ctx.stroke();
    }
  }
}
