import type { MwangaEngine } from "../engine/engine.ts";
import { createMat4, mat4LookAt, mat4Multiply, mat4Perspective, mat4TRS } from "../engine/math.ts";
import type { DemoScene, LoadedAssets } from "./types.ts";

interface Enemy {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  kind: 0 | 1; // 0 = golem, 1 = drone
  hp: number;
  flash: number;
}

interface Bolt {
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
}

export class HordeDemo implements DemoScene {
  public readonly id = "horde";
  public readonly title = "1. Horde Arena";
  public readonly subtitle = "WASD move | Click/Space blast | 300+ instanced 8-angle impostors";

  private readonly proj = createMat4();
  private readonly view = createMat4();
  private readonly viewProj = createMat4();
  private readonly model = createMat4();

  private playerX = 0;
  private playerZ = 0;
  private playerYaw = 0;
  private score = 0;
  private fireCooldown = 0;

  private readonly enemies: Enemy[] = [];
  private readonly bolts: Bolt[] = [];

  constructor(count = 320) {
    for (let i = 0; i < count; i++) {
      this.enemies.push(this.spawnEnemy(i % 2 === 0 ? 0 : 1));
    }
  }

  private spawnEnemy(kind: 0 | 1): Enemy {
    const angle = Math.random() * Math.PI * 2;
    const dist = 14 + Math.random() * 24;
    return {
      x: this.playerX + Math.cos(angle) * dist,
      z: this.playerZ + Math.sin(angle) * dist,
      yaw: 0,
      speed: kind === 0 ? 1.8 + Math.random() * 0.8 : 2.9 + Math.random() * 1.1,
      kind,
      hp: kind === 0 ? 2 : 1,
      flash: 0,
    };
  }

  public update(dt: number, _elapsed: number, eng: MwangaEngine): string {
    const { input, audio } = eng;
    const mx = input.getAxis("KeyA", "KeyD");
    const mz = input.getAxis("KeyW", "KeyS");
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      const nx = mx / len;
      const nz = mz / len;
      this.playerX = Math.max(-22, Math.min(22, this.playerX + nx * 7.5 * dt));
      this.playerZ = Math.max(-22, Math.min(22, this.playerZ + nz * 7.5 * dt));
      this.playerYaw = Math.atan2(nx, nz);
    }

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if ((input.isMouseDown(0) || input.isKeyDown("Space")) && this.fireCooldown <= 0) {
      this.fireCooldown = 0.14;
      const vx = Math.sin(this.playerYaw) * 22;
      const vz = Math.cos(this.playerYaw) * 22;
      this.bolts.push({ x: this.playerX, z: this.playerZ, vx, vz, life: 1.4 });
      audio.playTone(620 + Math.random() * 120, 0.08, "sawtooth", 0.2);
    }

    // Update bolts
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.life -= dt;
      if (b.life <= 0) {
        this.bolts.splice(i, 1);
      }
    }

    // Update enemies
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      e.flash = Math.max(0, e.flash - dt * 5);
      const dx = this.playerX - e.x;
      const dz = this.playerZ - e.z;
      const d = Math.hypot(dx, dz) || 1;
      e.yaw = Math.atan2(dx, dz);
      if (d > 1.0) {
        e.x += (dx / d) * e.speed * dt;
        e.z += (dz / d) * e.speed * dt;
      } else {
        // Respawn outside ring on touch
        Object.assign(e, this.spawnEnemy(e.kind));
      }

      // Check bolt hits
      for (let j = this.bolts.length - 1; j >= 0; j--) {
        const b = this.bolts[j];
        if ((b.x - e.x) ** 2 + (b.z - e.z) ** 2 < 0.9) {
          this.bolts.splice(j, 1);
          e.hp -= 1;
          e.flash = 1;
          if (e.hp <= 0) {
            this.score += 10;
            audio.playTone(220, 0.11, "triangle", 0.25);
            Object.assign(e, this.spawnEnemy(e.kind));
          }
          break;
        }
      }
    }

    return `Enemies: ${this.enemies.length} (2 instanced draw calls) | Score: ${this.score}`;
  }

  public render(eng: MwangaEngine, assets: LoadedAssets): number {
    const gl = eng.gl;
    let draws = 0;

    const camPos = { x: this.playerX, y: 9.5, z: this.playerZ + 11.5 };
    const target = { x: this.playerX, y: 0.7, z: this.playerZ };
    mat4Perspective(this.proj, (52 * Math.PI) / 180, eng.aspect, 0.2, 70);
    mat4LookAt(this.view, camPos, target, { x: 0, y: 1, z: 0 });
    mat4Multiply(this.viewProj, this.proj, this.view);

    // 1. Grid
    assets.lineProgram.use();
    gl.uniformMatrix4fv(assets.lineProgram.uniform("uViewProj"), false, this.viewProj);
    gl.uniform3f(assets.lineProgram.uniform("uColor"), 0.16, 0.22, 0.31);
    assets.gridMesh.draw();
    draws++;

    // 2. Hero 3D model + bolts
    assets.litProgram.use();
    gl.uniformMatrix4fv(assets.litProgram.uniform("uViewProj"), false, this.viewProj);
    gl.uniform3f(assets.litProgram.uniform("uLightDir"), 0.5, 1.0, 0.6);

    mat4TRS(this.model, this.playerX, 0, this.playerZ, 0, this.playerYaw, 0, 1.15, 1.15, 1.15);
    gl.uniformMatrix4fv(assets.litProgram.uniform("uModel"), false, this.model);
    if (assets.heroModel) {
      assets.heroModel.draw(assets.litProgram);
      draws += assets.heroModel.primitives.length;
    } else {
      gl.uniform1f(assets.litProgram.uniform("uUseTexture"), 0);
      gl.uniform3f(assets.litProgram.uniform("uColor"), 0.96, 0.62, 0.22);
      assets.boxMesh.draw();
      draws++;
    }

    gl.uniform1f(assets.litProgram.uniform("uUseTexture"), 0);
    gl.uniform3f(assets.litProgram.uniform("uColor"), 0.35, 0.95, 1.0);
    for (const b of this.bolts) {
      mat4TRS(this.model, b.x, 0.7, b.z, 0, 0, 0, 0.22, 0.22, 0.45);
      gl.uniformMatrix4fv(assets.litProgram.uniform("uModel"), false, this.model);
      assets.boxMesh.draw();
      draws++;
    }

    // 3. Instanced Impostor Enemies (1 draw call per atlas!)
    const camRight = { x: 1, y: 0, z: 0 };
    if (assets.golemAtlas) {
      let count = 0;
      for (const e of this.enemies) {
        if (e.kind !== 0) continue;
        assets.impostors.setInstance(count++, e.x, 0, e.z, 1.85, e.yaw, 1, 1 - e.flash * 0.6, 1 - e.flash * 0.6);
      }
      assets.impostors.draw(count, assets.golemAtlas, this.viewProj, camPos, camRight);
      draws++;
    }
    if (assets.droneAtlas) {
      let count = 0;
      for (const e of this.enemies) {
        if (e.kind !== 1) continue;
        const bob = 0.55 + Math.sin(performance.now() * 0.005 + e.x) * 0.2;
        assets.impostors.setInstance(count++, e.x, bob, e.z, 1.45, e.yaw, 1, 1 - e.flash * 0.5, 1 - e.flash * 0.5);
      }
      assets.impostors.draw(count, assets.droneAtlas, this.viewProj, camPos, camRight);
      draws++;
    }

    return draws;
  }
}
