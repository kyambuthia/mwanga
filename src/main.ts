import { DioramaDemo } from "./demos/dioramaDemo.ts";
import { FpsDemo } from "./demos/fpsDemo.ts";
import { HordeDemo } from "./demos/hordeDemo.ts";
import type { DemoScene, LoadedAssets } from "./demos/types.ts";
import { MwangaEngine } from "./engine/engine.ts";
import { createWhiteTexture, LINE_FRAG, LINE_VERT, LIT_FRAG, LIT_VERT, ShaderProgram } from "./engine/gl.ts";
import { loadGlb } from "./engine/gltf.ts";
import { bakeGlbToImpostorAtlas, ImpostorBatchRenderer } from "./engine/impostor.ts";
import { createBoxMesh, createGridMesh } from "./engine/mesh.ts";

const canvas = document.getElementById("mwanga-canvas") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLDivElement;
const crosshair = document.getElementById("crosshair") as HTMLDivElement;
const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("#switcher button"));

const demos: DemoScene[] = [new HordeDemo(320), new FpsDemo(), new DioramaDemo()];
let activeDemoIdx = 0;
let lastDraws = 0;
let assetStatus = "Loading Meshy GLBs...";

let assets: LoadedAssets;

function setDemo(idx: number): void {
  activeDemoIdx = Math.max(0, Math.min(demos.length - 1, idx));
  buttons.forEach((b, i) => b.classList.toggle("active", i === activeDemoIdx));
  crosshair.style.display = activeDemoIdx === 1 ? "block" : "none";
}

buttons.forEach((btn, idx) => {
  btn.addEventListener("click", () => setDemo(idx));
});

const engine = new MwangaEngine(canvas, {
  onInit(eng) {
    const gl = eng.gl;
    const litProgram = new ShaderProgram(gl, LIT_VERT, LIT_FRAG);
    const lineProgram = new ShaderProgram(gl, LINE_VERT, LINE_FRAG);
    const whiteTex = createWhiteTexture(gl);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, whiteTex);

    assets = {
      heroModel: null,
      golemModel: null,
      droneModel: null,
      handModel: null,
      heroAtlas: null,
      golemAtlas: null,
      droneAtlas: null,
      boxMesh: createBoxMesh(gl, 1),
      gridMesh: createGridMesh(gl, 24, 2),
      litProgram,
      lineProgram,
      impostors: new ImpostorBatchRenderer(gl, 2048),
    };

    gl.clearColor(0.05, 0.07, 0.1, 1.0);

    // Load Meshy GLBs asynchronously and bake 8-angle impostor atlases on GPU
    void (async () => {
      const tryLoad = async (url: string) => {
        try {
          return await loadGlb(gl, url);
        } catch {
          return null;
        }
      };

      const [hero, golem, drone, hand] = await Promise.all([
        tryLoad("./assets/models/hero_runner.glb"),
        tryLoad("./assets/models/golem_enemy.glb"),
        tryLoad("./assets/models/drone_scout.glb"),
        tryLoad("./assets/models/fps_hand.glb"),
      ]);

      assets.heroModel = hero;
      assets.golemModel = golem;
      assets.droneModel = drone;
      assets.handModel = hand;

      if (hero) assets.heroAtlas = bakeGlbToImpostorAtlas(gl, hero, litProgram, 8, 256);
      if (golem) assets.golemAtlas = bakeGlbToImpostorAtlas(gl, golem, litProgram, 8, 256);
      if (drone) assets.droneAtlas = bakeGlbToImpostorAtlas(gl, drone, litProgram, 8, 256);

      const loadedCount = [hero, golem, drone, hand].filter(Boolean).length;
      assetStatus = loadedCount > 0 ? `Meshy GLBs: ${loadedCount}/4 baked` : "Fallback boxes (no GLBs yet)";
    })();
  },

  onUpdate(dt, elapsed, eng) {
    if (eng.input.wasKeyPressed("Digit1")) setDemo(0);
    if (eng.input.wasKeyPressed("Digit2")) setDemo(1);
    if (eng.input.wasKeyPressed("Digit3")) setDemo(2);

    const demo = demos[activeDemoIdx];
    const demoInfo = demo.update(dt, elapsed, eng, assets);

    hud.textContent =
      `mwanga | ${eng.fps} FPS (${eng.frameTimeMs} ms) | ${lastDraws} draws | ${assetStatus}\n` +
      `${demo.title}: ${demoInfo}\n` +
      `${demo.subtitle}`;
  },

  onRender(eng) {
    const gl = eng.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    lastDraws = demos[activeDemoIdx].render(eng, assets);
  },
});

engine.start();
