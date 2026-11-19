import { AudioEngine } from "./audio.ts";
import { createWebGL2Context } from "./gl.ts";
import { InputManager } from "./input.ts";

export interface EngineCallbacks {
  onInit?(engine: MwangaEngine): void;
  onUpdate?(dt: number, elapsed: number, engine: MwangaEngine): void;
  onRender?(engine: MwangaEngine): void;
  onResize?(width: number, height: number, engine: MwangaEngine): void;
}

export class MwangaEngine {
  public readonly gl: WebGL2RenderingContext;
  public readonly input: InputManager;
  public readonly audio: AudioEngine;

  public width = 1;
  public height = 1;
  public aspect = 1;
  public fps = 0;
  public frameTimeMs = 0;

  private rafId = 0;
  private running = false;
  private lastTime = 0;
  private elapsed = 0;
  private fpsFrames = 0;
  private fpsAccum = 0;

  private readonly resizeObserver: ResizeObserver;
  private readonly callbacks: EngineCallbacks;
  private readonly maxDpr: number;

  constructor(
    public readonly canvas: HTMLCanvasElement,
    callbacks: EngineCallbacks,
    maxDpr = 2
  ) {
    this.callbacks = callbacks;
    this.maxDpr = maxDpr;
    this.gl = createWebGL2Context(canvas);
    this.input = new InputManager(canvas);
    this.audio = new AudioEngine();

    const unlockAudio = () => this.audio.unlock();
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });

    this.resizeObserver = new ResizeObserver(() => this.syncSize());
    this.resizeObserver.observe(canvas);
    this.syncSize();
  }

  public syncSize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (w !== this.width || h !== this.height) {
      this.width = w;
      this.height = h;
      this.aspect = w / h;
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
      this.callbacks.onResize?.(w, h, this);
    }
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.callbacks.onInit?.(this);
    this.lastTime = performance.now();

    const tick = (now: number) => {
      if (!this.running) return;
      const rawDt = (now - this.lastTime) * 0.001;
      this.lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0), 0.05);
      this.elapsed += dt;

      this.fpsFrames++;
      this.fpsAccum += rawDt;
      if (this.fpsAccum >= 0.5) {
        this.fps = Math.round(this.fpsFrames / this.fpsAccum);
        this.frameTimeMs = Number(((this.fpsAccum / this.fpsFrames) * 1000).toFixed(2));
        this.fpsFrames = 0;
        this.fpsAccum = 0;
      }

      this.callbacks.onUpdate?.(dt, this.elapsed, this);
      this.callbacks.onRender?.(this);
      this.input.endFrame();

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  public dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    this.input.dispose();
    this.audio.dispose();
  }
}
