# Retro Game Optimization Techniques & Aesthetic Playbook for `mwanga`

A practical reference of classic game engineering tricks—and how they translate directly to **TypeScript + WebGL2** for hitting **60 FPS on low-end PCs and mobile browsers** while looking cohesive and intentional.

---

## 1. Classic Games: Optimization Techniques & Aesthetic Choices

| Game | Optimization Technique(s) | Aesthetic Choice(s) | `mwanga` (WebGL2) Takeaway |
|---|---|---|---|
| **Doom (1993)** | **BSP trees & 2.5D raycasting/columns**; no true overdraw on walls; precomputed visibility; fixed-point math; palette-shifted lighting (no real-time RGB shading). | High-contrast industrial/hellish palette, crisp pixel sprites, moody sector-based darkness/flickering lights. | Use **sector/zone culling** or simple 2D grid/AABB visibility for indoor arenas; fake dynamic lights with cheap **distance/sector brightness** uniforms. |
| **Quake (1996)** | **PVS (Potentially Visible Set)** baked offline; **surface caching / lightmaps** (baked lighting into textures); **affine/subdivided spans**; fast inverse square root. | Gritty, low-saturation browns/ochres with glowing runes & lava; atmospheric depth without high poly counts. | **Bake ambient occlusion & static shadows** into textures or vertex colors; keep runtime shaders to 1 directional light + hemisphere ambient. |
| **Super Mario 64 (1996)** | **Gouraud (vertex) shading** instead of per-pixel lighting; **flat-shaded / vertex-colored geometry** (no texture reads on many surfaces); **blob shadows** (dark alpha circle projected under character). | Bold, readable primary colors, toy-like silhouettes, bright skyboxes, clean shapes that read at any resolution. | **Vertex colors + simple hemisphere lighting** are nearly free on integrated GPUs; use **projected blob shadows** instead of expensive shadow-map passes. |
| **Crash Bandicoot (1996)** | **Corridor streaming & occlusion** (only active track segment in RAM/VRAM); vertex animation (morph targets) instead of heavy skeletal skinning; aggressive texture packing. | Chunky, expressive characters, saturated jungle/temple palettes, strong foreground/background value separation. | Stream or toggle **chunk/room visibility** by distance; use **rigid-part hierarchies** or lightweight morphs for low-end CPUs. |
| **Silent Hill (1999)** | **Distance fog + aggressive far-plane clipping** (hides geometry pop-in and cuts draw distance in half); **film grain & darkness** mask low-res textures. | Oppressive, iconic atmosphere born directly from hardware limits; claustrophobic framing and flashlight cone. | **Exponential/linear fog** matching `gl.clearColor` + a tight `far` plane (`40–80` units) slashes fragment & vertex work while adding instant mood. |
| **Jet Set Radio (2000)** | **Cel-shading (2–3 stepped light bands)** + **inverted-hull outlines**; flat/minimal textures with bold UV decals; low poly counts masked by sharp style. | Graphic-novel / street-art look, vibrant neon vs. concrete, timeless readability that still looks modern. | **Stepped toon ramp** (`smoothstep` or quantized `dot(N, L)`) in `LIT_FRAG` makes low-poly Meshy models look stylized and crisp with zero extra cost. |
| **The Legend of Zelda: The Wind Waker (2002)** | **2-tone cel shading**; **procedural/scrolling UV textures** for water, wind, and clouds; **billboarded particles & foliage**; minimal normal maps. | Storybook clarity, expressive silhouettes, painterly color harmony, zero "uncanny valley" aging. | Use **UV-scrolling shaders** for water/lava/energy, **billboard sprites** for particles/foliage, and bold color palettes over photorealism. |
| **Shadow of the Colossus (2005)** | **LODs + distant impostor cards**; **bloom & motion blur** hiding low-res distant terrain; fur rendered via stacked shell layers only up close. | Epic scale, desaturated/dreamy lighting, strong silhouette contrast against bright skies. | Swap distant props/enemies to **low-poly LODs or billboard impostors**; use simple **screen-space vignette / sky gradient** for atmosphere. |
| **Star Fox (1993)** | **Untextured flat-shaded triangles** (zero texture sampling!); **rail-shooter corridor** limits visible world; simple geometric enemies. | Iconic crisp sci-fi polygons, high-contrast lasers against dark space or bright horizons. | Flat-shaded / vertex-colored low-poly meshes need **no texture binds** and run at locked 60 FPS on the weakest GPUs. |
| **RollerCoaster Tycoon (1999)** | **Pre-rendered isometric sprites** + **integer/fixed-step simulation**; dirty-rect / minimal state updates; zero-allocation entity pools. | Crisp, legible diorama aesthetic with hundreds of animated agents on screen simultaneously. | Keep **simulation fixed-step** and **pre-allocate object pools** (`Float32Array` / reusable structs) so JS garbage collection never causes frame stutters. |

---

## 2. Core Optimization Techniques for `mwanga` (WebGL2 + TypeScript)

### Rendering & GPU
1. **Minimize Draw Calls (Target: `< 100–200` per frame on low-end)**
   * Use **WebGL2 Instancing** (`gl.drawElementsInstanced`) for repeated props, trees, bullets, particles, and enemies.
   * Batch static world geometry into a single merged mesh where possible.
2. **Tight Frustum + Distance Culling**
   * Skip draw calls outside camera frustum or beyond fog distance (`far` plane).
   * Combine with **distance fog** (`mix(lit, fogColor, fogFactor)`) matching `gl.clearColor` so pop-in disappears.
3. **Shader & Fillrate Discipline**
   * Avoid multi-pass post-processing (SSAO, heavy bloom, real-time shadow maps) on low-end/mobile GPUs.
   * Keep `maxDpr` capped (e.g., `1.5` or `2`, or dynamic resolution scaling if FPS drops below 50).
   * Prefer **1 directional sun + hemisphere ambient** + optional **blob shadows** (1 textured quad under characters).
4. **Texture & Asset Discipline (Especially for Meshy AI GLBs)**
   * Downscale textures to **256×256 or 512×512** for props/characters (1024×1024 max for hero/atlas).
   * Decimate Meshy GLB meshes for gameplay (**1k–5k triangles** for characters/props, **< 500 tris** for background/instanced props).
   * Sort draws **front-to-back** for opaque meshes (early-Z rejection) and minimize shader/texture state changes.

### CPU & Memory (Zero-GC Frame Loop)
1. **Zero Per-Frame Allocations**
   * Pre-allocate `Mat4` (`Float32Array`), `Vec3`, raycast results, and particle/bullet **object pools** at init.
   * Never create `new Float32Array`, `new Array`, or closures inside `onUpdate` / `onRender`.
2. **Simple, Fast Collision**
   * Use **spheres, capsules, and AABBs** + a **uniform 2D/3D spatial hash grid** instead of triangle-mesh physics for fast arcade/action gameplay.
3. **Fast First Frame (Jam Requirement #3 & Scoring)**
   * Render the title screen / first interactive frame immediately with procedural geometry (`< 100 KB`), and stream or decode heavy `.glb` assets asynchronously if needed.

---

## 3. Aesthetic Playbook: Making Low-End Look Intentional

1. **Pick a Cohesive Palette (3–5 Dominant Colors + 1 Accent)**
   * Example: Cool slate/indigo shadows + warm amber/coral player & pickups (instant figure-ground separation).
2. **Cel / Toon Shading + Rim Light**
   * Quantized diffuse lighting + subtle fresnel rim light makes low-poly Meshy models look stylized like *Wind Waker* or *Risk of Rain 2* instead of "unfinished 3D".
3. **PS1 / Retro Crispness (Optional Toggle)**
   * Nearest-neighbor filtering (`gl.NEAREST`) on low-res textures + subtle vertex snap or dithering turns hardware limitations into an unmistakable art direction.
4. **Juice & Game Feel Over Raw Poly Count**
   * Hit-stop (30–50 ms freeze frames), screen shake, squash-and-stretch scale pulses, particle bursts, and Web Audio pitch-varied SFX make simple geometry feel AAA.
