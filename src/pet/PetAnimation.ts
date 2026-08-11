export type ImageChangeHandler = (source: string) => void;

export class PetAnimationManager {
  private timer: number | undefined;
  private lastIndex = -1;

  constructor(
    private readonly images: string[],
    private intervalSeconds: number,
    private readonly onImageChange: ImageChangeHandler,
  ) {}

  start(): void {
    this.stop();
    if (this.images.length === 0) return;
    this.showNext();
    if (this.images.length > 1) this.scheduleNext();
  }

  stop(): void {
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = undefined;
  }

  setIntervalSeconds(seconds: number): void {
    this.intervalSeconds = Math.max(1, seconds);
    if (this.timer !== undefined) {
      this.stop();
      if (this.images.length > 1) this.scheduleNext();
    }
  }

  private showNext(): void {
    if (this.images.length === 1) {
      this.lastIndex = 0;
    } else {
      let next = Math.floor(Math.random() * this.images.length);
      while (next === this.lastIndex) next = Math.floor(Math.random() * this.images.length);
      this.lastIndex = next;
    }
    this.onImageChange(this.images[this.lastIndex]);
  }

  private scheduleNext(): void {
    // The chosen settings value is the maximum; use 50%–100% of it to avoid a mechanical rhythm.
    const delay = this.intervalSeconds * (0.5 + Math.random() * 0.5) * 1000;
    this.timer = window.setTimeout(() => {
      this.showNext();
      this.scheduleNext();
    }, delay);
  }
}
