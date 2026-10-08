import { SIM_DT } from '../sim/constants';

/**
 * Fixed-timestep accumulator. Feed it real frame durations (any refresh rate);
 * it calls `onStep` a whole number of times with the constant simulation step and
 * returns the interpolation factor (0..1) for rendering between the last two states.
 */
export class FixedStepper {
  private acc = 0;
  /** guards against the "spiral of death" after a long stall */
  maxStepsPerFrame = 12;
  maxFrameDt = 0.25;

  constructor(readonly stepDt: number = SIM_DT) {}

  advance(frameDt: number, onStep: () => void): number {
    if (!(frameDt > 0)) return this.acc / this.stepDt;
    this.acc += Math.min(frameDt, this.maxFrameDt);
    let n = 0;
    // small epsilon so float rounding (e.g. 1/144 sums) never drops a step
    const eps = 1e-9;
    while (this.acc + eps >= this.stepDt && n < this.maxStepsPerFrame) {
      onStep();
      this.acc -= this.stepDt;
      n++;
    }
    if (this.acc < 0) this.acc = 0;
    if (n === this.maxStepsPerFrame && this.acc > this.stepDt) this.acc = 0;
    return Math.min(1, this.acc / this.stepDt);
  }

  reset(): void {
    this.acc = 0;
  }
}
