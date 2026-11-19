You are working in `~/Projects/mwanga` (a TypeScript + WebGL2 game engine targeting 60 FPS on low-end PCs and mobile browsers for OpenGame Jam #1).

Your goal is to build the **Meshy AI 3D -> Pre-rendered 2D Impostor / Sprite Pipeline**, generate **multiple character and hand assets**, and ship **3 playable showcase demos** in `mwanga` within ~25 minutes.

### Environment & Secrets Notes
- `MESHY_API_KEY` is configured via the instabox proxy. Load it from login shell (`bash -lc`) or `process.env.MESHY_API_KEY`. NEVER print or log the secret value.
- If Node `fetch` hits TLS certificate errors through the proxy, run Node with `NODE_OPTIONS=--use-openssl-ca`.
- Keep all code clean, modular, strict TypeScript (`tsc --noEmit && pnpm build` must pass).

### Step 1: Meshy AI 3D Asset Generation Script (`scripts/generate-meshy-assets.mjs`)
1. Write a clean Node script that calls the Meshy Text-to-3D API (`https://api.meshy.ai/openapi/v2/text-to-3d`, preview + refine or fast low-poly mode with `topology: "triangle"`, `target_polycount: 3000`, stylized art style), polls until complete, and downloads `.glb` files into `public/assets/models/`.
2. Generate at least **4 distinct assets** (run requests in parallel to save time!):
   - `hero_runner.glb`: Stylized low-poly sci-fi courier / arena hero character, bold silhouette, vibrant accent colors, T-pose or idle stance.
   - `golem_enemy.glb`: Stylized low-poly mechanical / stone golem enemy, chunky readable silhouette.
   - `drone_scout.glb`: Stylized low-poly floating hover-drone enemy with glowing eye.
   - `fps_hand.glb`: Stylized first-person right-hand cyber-gauntlet holding a compact energy blaster, clean low-poly geometry.
3. Cache/skip already-downloaded `.glb` files so re-running the script is idempotent.

### Step 2: 3D-to-2D Impostor / Sprite Atlas Baker (`scripts/bake-impostors.mjs` + `src/engine/impostor.ts`)
1. Build a baker (using headless Chromium/Playwright if installed, or an in-browser WebGL2 offscreen baker route/script, or pure Node + headless browser rendering of `mwanga`’s own `loadGlb()`) that renders each character `.glb` from **8 yaw angles** (0°, 45°, 90°, ..., 315°) with crisp directional + hemisphere lighting into a **PNG sprite atlas** (`public/assets/impostors/<name>.png`, e.g., 8×1 grid of 256×256 frames) + JSON metadata (`public/assets/impostors/<name>.json`).
2. Add `src/engine/impostor.ts` (`ImpostorBatchRenderer`):
   - Renders hundreds/thousands of 3D-positioned billboard quads in **1 WebGL2 instanced draw call** (`gl.drawElementsInstanced`).
   - Automatically selects the horizontal frame (0..7) in the vertex/fragment shader based on the entity’s facing angle relative to the camera!
   - Includes a cheap projected **blob shadow** or grounded contact feel.

### Step 3: 3 Playable Showcase Demos in `mwanga` (`src/demos/` + Demo Switcher in `src/main.ts`)
Replace/upgrade `src/main.ts` with a clean **Demo Switcher** (keys `1`, `2`, `3` + clickable HUD buttons) featuring **3 distinct playable demos**:
1. **Demo 1 — Horde Arena (Action / Survival):**
   - You control `hero_runner` (WASD move, Space dash/pulse, mouse aim/shoot) while **300+ instanced impostor enemies** (`golem_enemy` + `drone_scout`) swarm toward you at **60 FPS**, demonstrating huge draw-call savings.
2. **Demo 2 — First-Person Gauntlet (Shooter):**
   - First-person camera (`WASD` move, mouse look / click to fire) with the Meshy **`fps_hand.glb`** (or 3D viewmodel) rendered with smooth walk-bob, recoil kick, and muzzle flash, blasting waves of 8-angle impostor drones in a retro-fogged arena.
3. **Demo 3 — 3D vs. Impostor Diorama (Inspector):**
   - Side-by-side comparison showing the live **`GlbModel` 3D mesh** next to its **8-angle baked impostor** rotating on turntables, with HUD toggles for **fog, cel/toon shading, and instance count** (10 → 1,000) plus live FPS & draw-call counter.

### Step 4: Verify, Commit & Push
- Run `pnpm build` (`tsc --noEmit && vite build`) and ensure it succeeds with 0 errors.
- Commit your work in clean, scoped commits (assets/scripts, impostor renderer, demos) and `git push` to `origin main`.
- Leave a concise summary of generated assets, atlas sizes, and build output.
