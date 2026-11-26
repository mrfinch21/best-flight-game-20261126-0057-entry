// Screen-space particles: ring bursts, touchdown smoke and crash sparks. They
// are decoration only — the flight model never reads them.

/** A fresh, empty particle list. */
export function createParticles() {
  return [];
}

/** A ring of sparks where a ring was just flown. */
export function burst(list, x, y, colour) {
  for (let i = 0; i < 26; i += 1) {
    const a = (i / 26) * Math.PI * 2;
    const speed = 60 + (i % 5) * 30;
    list.push({
      x, y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: 0.7,
      max: 0.7,
      size: 3,
      colour,
      gravity: 0,
    });
  }
}

/** A puff of smoke at a touchdown point. */
export function smoke(list, x, y) {
  for (let i = 0; i < 10; i += 1) {
    list.push({
      x: x + (i - 5) * 6,
      y: y - (i % 3) * 3,
      vx: -30 - i * 4,
      vy: -12 - (i % 4) * 6,
      life: 0.9,
      max: 0.9,
      size: 5 + (i % 3) * 2,
      colour: 'rgba(200, 200, 200, 0.5)',
      gravity: -8,
    });
  }
}

/** Debris and fire for a crash. */
export function crashBurst(list, x, y) {
  for (let i = 0; i < 40; i += 1) {
    const a = (i / 40) * Math.PI * 2;
    const speed = 40 + (i % 7) * 34;
    list.push({
      x, y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed - 60,
      life: 1.1,
      max: 1.1,
      size: 2 + (i % 4),
      colour: i % 3 === 0 ? '#ff9a3d' : '#5a5a5a',
      gravity: 160,
    });
  }
}

/** Advance every particle one step; dead ones leave the list. */
export function stepParticles(list, dt) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) {
      list.splice(i, 1);
      continue;
    }
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

/** Paint every particle as a fading dot. */
export function drawParticles(ctx, list) {
  for (const p of list) {
    const alpha = Math.max(0, p.life / p.max);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.colour;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.5 + alpha * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
