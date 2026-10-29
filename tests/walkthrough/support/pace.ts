/**
 * Rushing Human Pacing Configuration
 *
 * Natural, fast, watchable timing for full continuous product walkthroughs.
 * Ensures multi-hundred step tours finish in 15-20 minutes without looking robotic.
 */

export interface PaceConfig {
  /** Sequential character entry delay in milliseconds (~40-50 chars/sec) */
  typeDelay: number;
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

const scale = Number(process.env.WALKTHROUGH_SPEED_SCALE ?? "1") || 1;

export const pace: PaceConfig = {
  typeDelay: Math.max(10, Math.round(25 * scale)),
  glideSteps: Math.max(4, Math.round(10 * scale)),
  beforeClick: Math.max(40, Math.round(120 * scale)),
  afterClick: Math.max(50, Math.round(180 * scale)),
  settle: Math.max(80, Math.round(300 * scale)),
  dwell: Math.max(150, Math.round(600 * scale)),
};
