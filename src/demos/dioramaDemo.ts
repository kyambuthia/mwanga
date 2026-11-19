import type { MwangaEngine } from "../engine/engine.ts";
import { createMat4, mat4LookAt, mat4Multiply, mat4Perspective, mat4TRS } from "../engine/math.ts";
import type { DemoScene, LoadedAssets } from "./types.ts";

export class DioramaDemo implements DemoScene {
  public readonly id = "diorama";
  public readonly title = "3. 3D vs. Impostor Diorama";
  public readonly subtitle = "Left: Live 3D GLB | Right: 8-Angle Baked Impostor | Drag to orbit, Q/E: switch model";

  private readonly proj = createMat4();
  private readonly view = createMat4();
  private readonly viewProj = createMat4();
  private readonly model = createMat4();

  private yaw = 0.4;
  private pitch = -0.25;
  private dist = 6.2;
  private spin = 0;
  private modelIdx = 0;

  public update(dt: number, _elapsed: number, eng: MwangaEngine): string {
    const { input } = eng;
    if (input.isMouseDown(0)) {
      this.yaw -= input.mouseDeltaX * 0.007;
      this.pitch = Math.max(-1.1, Math.min(0.2, this.pitch - input.mouseDeltaY * 0.007));
    }
    this.yaw -= input.getAxis("ArrowLeft", "ArrowRight") * dt * 1.6;
    if (input.wheelDelta !== 0) {
      this.dist = Math.max(3, Math.min(14, this.dist + input.wheelDelta * 0.005));
    }
    if (input.wasKeyPressed("KeyE")) this.modelIdx = (this.modelIdx + 1) % 3;
    if (input.wasKeyPressed("KeyQ")) this.modelIdx = (this.modelIdx + 2) % 3;
    this.spin += dt * 0.9;

    const names = ["hero_runner", "golem_enemy", "drone_scout"];
    return `Inspecting: ${names[this.modelIdx]} | Left = Live 3D Mesh | Right = 8-Angle Impostor Quad`;
  }

  public render(eng: MwangaEngine, assets: LoadedAssets): number {
    const gl = eng.gl;
    let draws = 0;

    const cp = Math.cos(this.pitch);
    const camPos = {
      x: Math.sin(this.yaw) * cp * this.dist,
      y: 0.8 - Math.sin(this.pitch) * this.dist,
      z: Math.cos(this.yaw) * cp * this.dist,
    };
    mat4Perspective(this.proj, (50 * Math.PI) / 180, eng.aspect, 0.1, 80);
    mat4LookAt(this.view, camPos, { x: 0, y: 0.8, z: 0 }, { x: 0, y: 1, z: 0 });
    mat4Multiply(this.viewProj, this.proj, this.view);

    // Grid
    assets.lineProgram.use();
    gl.uniformMatrix4fv(assets.lineProgram.uniform("uViewProj"), false, this.viewProj);
    gl.uniform3f(assets.lineProgram.uniform("uColor"), 0.2, 0.27, 0.38);
    assets.gridMesh.draw();
    draws++;

    const models = [assets.heroModel, assets.golemModel, assets.droneModel];
    const atlases = [assets.heroAtlas, assets.golemAtlas, assets.droneAtlas];
    const activeModel = models[this.modelIdx];
    const activeAtlas = atlases[this.modelIdx];

    // Left: Live 3D GLB
    assets.litProgram.use();
    gl.uniformMatrix4fv(assets.litProgram.uniform("uViewProj"), false, this.viewProj);
    gl.uniform3f(assets.litProgram.uniform("uLightDir"), 0.55, 1.0, 0.65);
    mat4TRS(this.model, -1.6, 0, 0, 0, this.spin, 0, 1.2, 1.2, 1.2);
    gl.uniformMatrix4fv(assets.litProgram.uniform("uModel"), false, this.model);
    if (activeModel) {
      activeModel.draw(assets.litProgram);
      draws += activeModel.primitives.length;
    } else {
      gl.uniform1f(assets.litProgram.uniform("uUseTexture"), 0);
      gl.uniform3f(assets.litProgram.uniform("uColor"), 0.96, 0.62, 0.22);
      assets.boxMesh.draw();
      draws++;
    }

    // Right: 8-angle Baked Impostor (2 triangles!)
    if (activeAtlas) {
      const right = { x: Math.cos(this.yaw), y: 0, z: -Math.sin(this.yaw) };
      assets.impostors.setInstance(0, 1.6, 0, 0, 2.2, this.spin, 1, 1, 1);
      assets.impostors.draw(1, activeAtlas, this.viewProj, camPos, right);
      draws++;
    }

    return draws;
  }
}
