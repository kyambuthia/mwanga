import type { MwangaEngine } from "../engine/engine.ts";
import type { ShaderProgram } from "../engine/gl.ts";
import type { GlbModel } from "../engine/gltf.ts";
import type { ImpostorAtlas, ImpostorBatchRenderer } from "../engine/impostor.ts";
import type { GpuMesh } from "../engine/mesh.ts";

export interface LoadedAssets {
  heroModel: GlbModel | null;
  golemModel: GlbModel | null;
  droneModel: GlbModel | null;
  handModel: GlbModel | null;
  heroAtlas: ImpostorAtlas | null;
  golemAtlas: ImpostorAtlas | null;
  droneAtlas: ImpostorAtlas | null;
  boxMesh: GpuMesh;
  gridMesh: GpuMesh;
  litProgram: ShaderProgram;
  lineProgram: ShaderProgram;
  impostors: ImpostorBatchRenderer;
}

export interface DemoScene {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  update(dt: number, elapsed: number, eng: MwangaEngine, assets: LoadedAssets): string;
  render(eng: MwangaEngine, assets: LoadedAssets): number; // returns draw call count
}
