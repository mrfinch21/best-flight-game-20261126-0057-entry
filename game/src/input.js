// Keyboard and mouse: the sticks, the throttle, the toggles, and clicks on the
// menu buttons the renderer lays out. One frame's worth of actions at a time.

export const ACTION_CONFIRM = 1 << 0;
export const ACTION_PAUSE = 1 << 1;
export const ACTION_RESTART = 1 << 2;
export const ACTION_MUTE = 1 << 3;

/** Fresh input state, bound to a canvas. */
export function createInput(canvas) {
  const input = {
    keys: new Set(),
    actions: 0,
    missionPick: -1,
    clicks: [],
    mouse: { x: 0, y: 0 },
  };

  const KEY_ACTIONS = {
    Enter: ACTION_CONFIRM,
    ' ': ACTION_CONFIRM,
    p: ACTION_PAUSE,
    P: ACTION_PAUSE,
    Escape: ACTION_PAUSE,
    r: ACTION_RESTART,
    R: ACTION_RESTART,
    m: ACTION_MUTE,
    M: ACTION_MUTE,
  };

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    input.keys.add(event.key.length === 1 ? event.key.toLowerCase() : event.key);
    const action = KEY_ACTIONS[event.key];
    if (action) input.actions |= action;
    if (['1', '2', '3'].includes(event.key)) input.missionPick = Number(event.key) - 1;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    input.keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    input.mouse.x = ((event.clientX - rect.left) / rect.width) * 1280;
    input.mouse.y = ((event.clientY - rect.top) / rect.height) * 720;
    // Clicks act only through the buttons the renderer lays out; a click on
    // empty space does nothing, so it never confirms a menu by accident.
    input.clicks.push({ x: input.mouse.x, y: input.mouse.y });
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    input.mouse.x = ((event.clientX - rect.left) / rect.width) * 1280;
    input.mouse.y = ((event.clientY - rect.top) / rect.height) * 720;
  });
  return input;
}

/** The held stick position this frame: pitch up positive, bank right positive. */
export function stick(input) {
  const keys = input.keys;
  const pitchIn = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
  const bankIn = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0)
    - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
  const throttleIn = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
  return { pitchIn, bankIn, throttleIn };
}

/** Take and clear this frame's one-shot actions. */
export function takeActions(input) {
  const actions = input.actions;
  input.actions = 0;
  return actions;
}

/** Take and clear the queued clicks. */
export function takeClicks(input) {
  const clicks = input.clicks;
  input.clicks = [];
  return clicks;
}

/** Take and clear a mission number key (0, 1, 2) or -1. */
export function takeMissionPick(input) {
  const pick = input.missionPick;
  input.missionPick = -1;
  return pick;
}
