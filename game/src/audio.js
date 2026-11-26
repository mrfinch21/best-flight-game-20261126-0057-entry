// Synthesised sound: no audio files, everything is an oscillator or filtered
// noise made at run time. The context starts on the first player gesture; if
// the browser refuses audio, the game plays on silently.

/** A fresh sound engine; call unlock() from the first gesture. */
export function createAudio() {
  return {
    ctx: null,
    master: null,
    engineOsc: null,
    engineOsc2: null,
    engineGain: null,
    windGain: null,
    muted: false,
    started: false,
  };
}

function ensureContext(audio) {
  if (audio.ctx) return true;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    audio.ctx = new Ctx();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.5;
    audio.master.connect(audio.ctx.destination);
    return true;
  } catch {
    return false;
  }
}

/** Start the engine drone and wind after a user gesture. Safe to call twice. */
export function unlockAudio(audio) {
  if (audio.started) return;
  if (!ensureContext(audio)) return;
  try {
    if (audio.ctx.state === 'suspended') void audio.ctx.resume();
    audio.engineOsc = audio.ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 55;
    audio.engineOsc2 = audio.ctx.createOscillator();
    audio.engineOsc2.type = 'square';
    audio.engineOsc2.frequency.value = 82;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    audio.engineGain = audio.ctx.createGain();
    audio.engineGain.gain.value = 0;
    audio.engineOsc.connect(filter);
    audio.engineOsc2.connect(filter);
    filter.connect(audio.engineGain);
    audio.engineGain.connect(audio.master);
    audio.engineOsc.start();
    audio.engineOsc2.start();

    // Wind: a looped noise buffer through a band-pass filter.
    const len = audio.ctx.sampleRate;
    const buffer = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = audio.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const band = audio.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 700;
    band.Q.value = 0.6;
    audio.windGain = audio.ctx.createGain();
    audio.windGain.gain.value = 0;
    noise.connect(band);
    band.connect(audio.windGain);
    audio.windGain.connect(audio.master);
    noise.start();
    audio.started = true;
  } catch {
    audio.started = false;
  }
}

/** Follow the flight: engine pitch and loudness follow throttle, wind follows speed. */
export function updateAudio(audio, flight) {
  if (!audio.started || !audio.ctx) return;
  try {
    const t = audio.ctx.currentTime;
    const rpm = 0.4 + flight.throttle * 0.9;
    audio.engineOsc.frequency.setTargetAtTime(52 * rpm, t, 0.1);
    audio.engineOsc2.frequency.setTargetAtTime(78 * rpm, t, 0.1);
    const loud = flight.onGround && flight.speed < 2 ? 0.02 : 0.05 + flight.throttle * 0.11;
    audio.engineGain.gain.setTargetAtTime(audio.muted ? 0 : loud, t, 0.1);
    const wind = Math.min(0.14, (flight.speed / 78) * 0.14);
    audio.windGain.gain.setTargetAtTime(audio.muted ? 0 : wind, t, 0.15);
  } catch {
    // Audio is decoration; never let it break the frame.
  }
}

function blip(audio, freq, dur, type, vol, when = 0) {
  if (!audio.started || !audio.ctx || audio.muted) return;
  try {
    const t = audio.ctx.currentTime + when;
    const osc = audio.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = audio.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  } catch {
    // Ignore.
  }
}

/** A bright two-note chime for a ring flown. */
export function playRing(audio) {
  blip(audio, 880, 0.35, 'sine', 0.22);
  blip(audio, 1318, 0.5, 'sine', 0.18, 0.09);
}

/** A low thud for a touchdown. */
export function playTouchdown(audio) {
  blip(audio, 70, 0.3, 'sine', 0.35);
  blip(audio, 140, 0.18, 'triangle', 0.2, 0.02);
}

/** A short warning beep (fuel, damage, stall). */
export function playWarning(audio) {
  blip(audio, 660, 0.16, 'square', 0.1);
  blip(audio, 660, 0.16, 'square', 0.1, 0.22);
}

/** Toggle mute; returns the new state. */
export function toggleMute(audio) {
  audio.muted = !audio.muted;
  return audio.muted;
}
