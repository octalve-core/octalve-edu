/**
 * Pacing for the continuous product walkthrough.
 *
 * The person in the video is a very fast human (decided 2026-11-06): quick, sure movements and a very fast typist, never a robot. The pauses around a click (glide, hover, settle,
 * dwell) can be shortened further with WALKTHROUGH_SPEED_SCALE for a recon run. Typing cannot: it stays one real key press at a time, 35 to 80 ms apart (about 200 words a minute,
 * with the unevenness of a hand), because a constant or near-zero delay is a script, not a person. The scale never touches key delays.
 */

export interface PaceConfig {
  /** Number of interpolation steps between current cursor position and target */
  glideSteps: number;
  /** Pause in ms upon hovering target before initiating mouse click */
  beforeClick: number;
  /** Pause in ms after click to display button active/ripple state */
  afterClick: number;
  /** Pause in ms for DOM transitions and UI animations to settle */
  settle: number;
  /** Pause in ms at the end of each step to frame the caption */
  dwell: number;
}

/** A person's gap between two key presses, in milliseconds. */
export const KEY_DELAY_MIN_MS = 35;
export const KEY_DELAY_MAX_MS = 80;

/** `random` is injectable so that the bounds can be tested exactly. */
export const keyDelay = (random: () => number = Math.random): number =>
  KEY_DELAY_MIN_MS + Math.floor(random() * (KEY_DELAY_MAX_MS - KEY_DELAY_MIN_MS + 1));

/** The most typing a whole pass may contain, in minutes. Fixture text is kept short to stay inside it. */
export const TYPING_BUDGET_MINUTES = 12;

const scale = Number(process.env.WALKTHROUGH_SPEED_SCALE ?? "1") || 1;

/// A RECON run only (never a strict one, which is the deliverable): the gap between two key presses is multiplied by WALKTHROUGH_TYPING_SCALE, so that a run that exists to find a wrong
/// label or a missing button takes a few minutes and not twelve. Typing at this speed is not a person's, which is why `Walk.type` ignores it in a strict run. Default 1 (no change).
export const reconTypingScale = Math.max(0.05, Number(process.env.WALKTHROUGH_TYPING_SCALE ?? "1") || 1);

export const pace: PaceConfig = {
  glideSteps: Math.max(4, Math.round(7 * scale)),
  beforeClick: Math.max(30, Math.round(70 * scale)),
  afterClick: Math.max(40, Math.round(110 * scale)),
  settle: Math.max(60, Math.round(200 * scale)),
  dwell: Math.max(120, Math.round(400 * scale)),
};
