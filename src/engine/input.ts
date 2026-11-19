/** Tracks keyboard and mouse state for desktop browser gameplay. */
export class InputManager {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly released = new Set<string>();
  private readonly mouseDown = new Set<number>();

  public mouseX = 0;
  public mouseY = 0;
  public mouseDeltaX = 0;
  public mouseDeltaY = 0;
  public wheelDelta = 0;

  private readonly target: HTMLElement;
  private readonly ac = new AbortController();

  constructor(target: HTMLElement) {
    this.target = target;
    const signal = this.ac.signal;

    window.addEventListener("keydown", (e) => {
      if (!e.repeat && !this.down.has(e.code)) {
        this.pressed.add(e.code);
      }
      this.down.add(e.code);
    }, { signal });

    window.addEventListener("keyup", (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    }, { signal });

    window.addEventListener("blur", () => {
      this.down.clear();
      this.mouseDown.clear();
    }, { signal });

    target.addEventListener("mousedown", (e) => {
      this.mouseDown.add(e.button);
    }, { signal });

    window.addEventListener("mouseup", (e) => {
      this.mouseDown.delete(e.button);
    }, { signal });

    window.addEventListener("mousemove", (e) => {
      const rect = this.target.getBoundingClientRect();
      const nx = e.clientX - rect.left;
      const ny = e.clientY - rect.top;
      this.mouseDeltaX += e.movementX || (nx - this.mouseX);
      this.mouseDeltaY += e.movementY || (ny - this.mouseY);
      this.mouseX = nx;
      this.mouseY = ny;
    }, { signal });

    target.addEventListener("wheel", (e) => {
      this.wheelDelta += e.deltaY;
    }, { signal, passive: true });
  }

  public isKeyDown(code: string): boolean {
    return this.down.has(code);
  }

  public wasKeyPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  public wasKeyReleased(code: string): boolean {
    return this.released.has(code);
  }

  public isMouseDown(button = 0): boolean {
    return this.mouseDown.has(button);
  }

  public getAxis(negativeCode: string, positiveCode: string): number {
    return (this.down.has(positiveCode) ? 1 : 0) - (this.down.has(negativeCode) ? 1 : 0);
  }

  public endFrame(): void {
    this.pressed.clear();
    this.released.clear();
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.wheelDelta = 0;
  }

  public dispose(): void {
    this.ac.abort();
  }
}
