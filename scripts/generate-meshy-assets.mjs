import fs from "node:fs";
import path from "node:path";

const API_KEY = process.env.MESHY_API_KEY;
if (!API_KEY) {
  console.error("MESHY_API_KEY is not set.");
  process.exit(1);
}

const OUT_DIR = path.resolve("public/assets/models");
fs.mkdirSync(OUT_DIR, { recursive: true });

const ASSETS = [
  {
    name: "hero_runner",
    prompt: "stylized low-poly sci-fi courier hero character in idle stance, vibrant amber and slate armor, crisp readable silhouette, game asset",
  },
  {
    name: "golem_enemy",
    prompt: "stylized low-poly mechanical stone golem enemy, chunky silhouette, glowing cyan core, game asset",
  },
  {
    name: "drone_scout",
    prompt: "stylized low-poly floating hover drone enemy with single glowing red optic eye and thrusters, game asset",
  },
  {
    name: "fps_hand",
    prompt: "stylized first-person right hand wearing a sci-fi cyber gauntlet holding a compact energy blaster pistol, game viewmodel",
  },
];

async function meshyFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meshy API ${res.status} on ${url}: ${body}`);
  }
  return res.json();
}

async function pollTask(taskId, label) {
  for (let i = 0; i < 120; i++) {
    const data = await meshyFetch(`https://api.meshy.ai/openapi/v2/text-to-3d/${taskId}`);
    if (data.status === "SUCCEEDED") return data;
    if (data.status === "FAILED" || data.status === "EXPIRED") {
      throw new Error(`Task ${label} (${taskId}) ${data.status}: ${data.task_error?.message || "unknown"}`);
    }
    if (i % 4 === 0) {
      console.log(`[${label}] status=${data.status} progress=${data.progress ?? 0}%`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Task ${label} timed out`);
}

async function generateOne(asset) {
  const outPath = path.join(OUT_DIR, `${asset.name}.glb`);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1024) {
    console.log(`[${asset.name}] already exists (${outPath}), skipping.`);
    return outPath;
  }

  console.log(`[${asset.name}] starting preview...`);
  const preview = await meshyFetch("https://api.meshy.ai/openapi/v2/text-to-3d", {
    method: "POST",
    body: JSON.stringify({
      mode: "preview",
      prompt: asset.prompt,
      art_style: "low-poly",
      topology: "triangle",
      target_polycount: 3000,
    }),
  });
  const previewResult = await pollTask(preview.result, `${asset.name}:preview`);

  console.log(`[${asset.name}] starting refine for textures...`);
  const refine = await meshyFetch("https://api.meshy.ai/openapi/v2/text-to-3d", {
    method: "POST",
    body: JSON.stringify({
      mode: "refine",
      preview_task_id: previewResult.id,
      enable_pbr: false,
    }),
  });
  const refineResult = await pollTask(refine.result, `${asset.name}:refine`);
  const glbUrl = refineResult.model_urls?.glb || previewResult.model_urls?.glb;
  if (!glbUrl) throw new Error(`No GLB URL for ${asset.name}`);

  const glbRes = await fetch(glbUrl);
  if (!glbRes.ok) throw new Error(`Failed to download GLB for ${asset.name}: ${glbRes.status}`);
  const buf = Buffer.from(await glbRes.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  console.log(`[${asset.name}] saved ${outPath} (${(buf.length / 1024).toFixed(1)} KB)`);
  return outPath;
}

const results = await Promise.allSettled(ASSETS.map(generateOne));
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  if (r.status === "rejected") {
    console.error(`[${ASSETS[i].name}] FAILED:`, r.reason);
    process.exitCode = 1;
  }
}
