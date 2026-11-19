import type { MwangaEngine } from "../engine/engine.ts";
import { createMat4, mat4LookAt, mat4Multiply, mat4Perspective, mat4TRS } from "../engine/math.ts";
import type { DemoScene, LoadedAssets } from "./types.ts";

interface TargetDrone {
  x: number;
  y: number;
  z: number;
  yaw: number;
  phase: number;
}

export class FpsDemo implements DemoScene {
  public readonly id = "fps";
  public readonly title = "2. First-Person Gauntlet";
  public readonly subtitle = "WASD move | Drag/Arrows look | Click/Space fire | Meshy Hand + Impostor Drones";

  private readonly proj = createMat4();
  private readonly view = createMat4();
  private readonly viewProj = createMat4();
  private readonly model = createMat4();

  private px = 0;
  private pz = 8;
  private yaw = Math.PI;
  private pitch = 0;
  private recoil = 0;
  private walkTime = 0;
  private hits = 0;

  private readonly targets: TargetDrone[] = [];

  constructor() {
    for (let i = 0; i < 48; i++) {
      this.targets.push(this.spawnTarget(i));
    }
  }

  private spawnTarget(i: number): TargetDrone {
    return {
      x: (Math.random() - 0.5) * 32,
      y: 0.9 + Math.random() * 1.4,
      z: -4 - Math.random() * 24,
      yaw: Math.random() * Math.PI * 2,
      phase: i * 0.7,
    };
  }

  public update(dt: number, _elapsed: number, eng: MwangaEngine): string {
    const { input, audio } = eng;
    if (input.isMouseDown(0)) {
      this.yaw -= input.mouseDeltaX * 0.004;
      this.pitch = Math.max(-0.6, Math.min(0.6, this.pitch - input.mouseDeltaY * 0.004));
    }
    this.yaw -= input.getAxis("ArrowLeft", "ArrowRight") * dt * 2.0;

    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    const moveF = input.getAxis("KeyS", "KeyW");
    const moveR = input.getAxis("KeyA", "KeyD");
    if (moveF !== 0 || moveR !== 0) {
      this.walkTime += dt * 10;
      this.px = Math.max(-18, Math.min(18, this.px + (fwdX * moveF + rightX * moveR) * 7 * dt));
      this.pz = Math.max(-18, Math.min(18, this.pz + (fwdZ * moveF + rightZ * moveR) * 7 * dt));
    }

    this.recoil = Math.max(0, this.recoil - dt * 6);
    if (input.wasKeyPressed("Space") || (input.isMouseDown(0) && this.recoil <= 0.05)) {
      this.recoil = 1;
      audio.playTone(760, 0.09, "square", 0.18);

      // Ray-sphere check along camera forward
      const dirX = Math.sin(this.yaw) * Math.cos(this.pitch);
      const dirY = Math.sin(this.pitch);
      const dirZ = Math.cos(this.yaw) * Math.cos(this.pitch);

      for (let i = 0; i < this.targets.length; i++) {
        const t = this.targets[i];
        const ox = t.x - this.px;
        const oy = t.y - 1.5;
        const oz = t.z - this.pz;
        const proj = ox * dirX + oy * dirY + oz * dirZ;
        if (proj > 0 && proj < 35) {
          const distSq = ox * ox + oy * oy + oz * oz - proj * proj;
          if (distSq < 0.85) {
            this.hits++;
            audio.playTone(300, 0.12, "triangle", 0.3);
            this.targets[i] = this.spawnTarget(i);
            break;
          }
        }
      }
    }

    for (const t of this.targets) {
      t.yaw += dt * 0.9;
    }

    return `Hits: ${this.hits} | Targets: ${this.targets.length} (1 instanced draw call) + 3D Hand Viewmodel`;
  }

  public render(eng: MwangaEngine, assets: LoadedAssets): number {
    const gl = eng.gl;
    let draws = 0;

    const camPos = { x: this.px, y: 1.5, z: this.pz };
    const target = {
      x: this.px + Math.sin(this.yaw) * Math.cos(this.pitch),
      y: 1.5 + Math.sin(this.pitch),
      z: this.pz + Math.cos(this.yaw) * Math.cos(this.pitch),
    };
    mat4Perspective(this.proj, (68 * Math.PI) / 180, eng.aspect, 0.08, 55);
    mat4LookAt(this.view, camPos, target, { x: 0, y: 1, z: 0 });
    mat4Multiply(this.viewProj, this.proj, this.view);

    // Grid
    assets.lineProgram.use();
    gl.uniformMatrix4fv(assets.lineProgram.uniform("uViewProj"), false, this.viewProj);
    gl.uniform3f(assets.lineProgram.uniform("uColor"), 0.18, 0.24, 0.34);
    assets.gridMesh.draw();
    draws++;

    // Impostor drones
    if (assets.droneAtlas) {
      const right = { x: Math.cos(this.yaw), y: 0, z: -Math.sin(this.yaw) };
      for (let i = 0; i < this.targets.length; i++) {
        const t = this.targets[i];
        const bob = Math.sin(performance.now() * 0.004 + t.phase) * 0.25;
        assets.impostors.setInstance(i, t.x, t.y + bob, t.z, 1.5, t.yaw, 1, 1, 1);
      }
      assets.impostors.draw(this.targets.length, assets.droneAtlas, this.viewProj, camPos, right, [0.05, 0.07, 0.1], 14, 42);
      draws++;
    }

    // First-person Hand Viewmodel in camera space
    gl.clear(gl.DEPTH_BUFFER_BIT);
    const vmView = createMat4();
    mat4LookAt(vmView, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
    mat4Multiply(this.viewProj, this.proj, vmView);

    assets.litProgram.use();
    gl.uniformMatrix4fv(assets.litProgram.uniform("uViewProj"), false, this.viewProj);
    gl.uniform3f(assets.litProgram.uniform("uLightDir"), 0.3, 0.9, 0.7);

    const bobX = Math.cos(this.walkTime) * 0.025;
    const bobY = Math.abs(Math.sin(this.walkTime)) * 0.025;
    mat4TRS(
      this.model,
      0.42 + bobX,
      -0.46 - bobY + this.recoil * 0.04,
      -0.85 + this.recoil * 0.12,
      this.recoil * 0.25,
      Math.PI * 0.92,
      0,
      0.55,
      0.55,
      0.55
    );
    gl.uniformMatrix4fv(assets.litProgram.uniform("uModel"), false, this.model);
    if (assets.handModel) {
      assets.handModel.draw(assets.litProgram);
      draws += assets.handModel.primitives.length;
    } else {
      gl.uniform1f(assets.litProgram.uniform("uUseTexture"), 0);
      gl.uniform3f(assets.litProgram.uniform("uColor"), 0.85, 0.55, 0.35);
      assets.boxMesh.draw();
      draws++;
    }

    return draws;
  }
}
