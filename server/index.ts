import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import matter from "gray-matter";
import {
  buildCache,
  getImageCell,
  IMAGE_STYLES,
  rebuildImageCell,
  startWatcher,
  type Cache,
  type CutFile,
  type ImageStyle,
  type NarrativeFile,
} from "./cache.ts";
import { generateImage, resolveCarReference } from "./generate.ts";
import { JobManager } from "./jobs.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dataDir = resolve(root, "data");

const dirs = {
  dataDir,
  cutsDir: join(dataDir, "cuts"),
  narrativesDir: join(dataDir, "narratives"),
  scriptsDir: join(dataDir, "scripts"),
  commonStyleDir: join(dataDir, "common-style"),
  imagesDir: join(dataDir, "images"),
};

const cache: Cache = buildCache(dirs);
startWatcher(dirs, cache);

const COMMON_STYLE_KINDS = ["illustration", "game", "camera", "negative"] as const;
type CommonStyleKind = (typeof COMMON_STYLE_KINDS)[number];

function cutIdCompare(a: string, b: string): number {
  const [ap, as] = a.split("-");
  const [bp, bs] = b.split("-");
  if (ap !== bp) return Number(ap) - Number(bp);
  const aNum = parseSuffix(as);
  const bNum = parseSuffix(bs);
  if (aNum.kind !== bNum.kind) return aNum.kind === "main" ? -1 : 1;
  if (aNum.num !== bNum.num) return aNum.num - bNum.num;
  return aNum.tail.localeCompare(bNum.tail);
}

function parseSuffix(s: string): { kind: "main" | "extra"; num: number; tail: string } {
  if (s.startsWith("m")) {
    const num = parseInt(s.slice(1), 10) || 0;
    return { kind: "extra", num, tail: s };
  }
  const match = s.match(/^(\d+)(.*)$/);
  if (match) return { kind: "main", num: Number(match[1]), tail: match[2] };
  return { kind: "main", num: 0, tail: s };
}

function sortedCutIds(filterPart?: number): string[] {
  const ids: string[] = [];
  for (const cut of cache.cuts.values()) {
    if (filterPart !== undefined && cut.part !== filterPart) continue;
    ids.push(cut.cut_id);
  }
  return ids.sort(cutIdCompare);
}

function cutWithImages(cutId: string) {
  const cut = cache.cuts.get(cutId);
  if (!cut) return null;
  const images = getImageCell(cache, cutId);
  return { ...cut, images };
}

function writeCutFile(cut: CutFile) {
  const frontmatter = {
    cut_id: cut.cut_id,
    part: cut.part,
    dj: cut.dj,
    setting: cut.setting,
    title_jp: cut.title_jp,
    summary_jp: cut.summary_jp,
    status: cut.status,
    revision_memo: cut.revision_memo,
    selected_image: cut.selected_image,
  };
  const body = [
    "## camera",
    "",
    cut.camera,
    "",
    "## scene_en",
    "",
    cut.scene_en,
    "",
    "## video_prompt_en",
    "",
    cut.video_prompt_en,
    "",
  ].join("\n");
  const md = matter.stringify(body, frontmatter);
  writeFileSync(join(dirs.cutsDir, `${cut.cut_id}.md`), md);
  cache.cuts.set(cut.cut_id, cut);
  for (const style of IMAGE_STYLES) rebuildImageCell(cache, dirs, style, cut.cut_id);
}

const jobManager = new JobManager({
  cache,
  imagesDir: dirs.imagesDir,
  dataDir: dirs.dataDir,
  setSelectedImage: (id, style, filename) => setSelectedImage(id, style, filename),
});

function setSelectedImage(cutId: string, style: ImageStyle, filename: string) {
  const cut = cache.cuts.get(cutId);
  if (!cut) return;
  const next: CutFile = {
    ...cut,
    selected_image: { ...cut.selected_image, [style]: filename },
  };
  writeCutFile(next);
}

function writeNarrativeFile(n: NarrativeFile) {
  const frontmatter = {
    part: n.part,
    dj: n.dj,
    setting_name: n.setting_name,
    concept_keyword: n.concept_keyword,
    status: n.status,
    revision_memo: n.revision_memo,
  };
  const body = ["## plot", "", n.plot, ""].join("\n");
  writeFileSync(join(dirs.narrativesDir, `part-${n.part}.md`), matter.stringify(body, frontmatter));
  cache.narratives.set(n.part, n);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(
  "/images",
  express.static(dirs.imagesDir, {
    fallthrough: true,
    maxAge: "10m",
    immutable: false,
  }),
);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/script", (_req, res) => res.json({ content: cache.script }));

app.put("/api/script", (req, res) => {
  const content = String(req.body?.content ?? "");
  writeFileSync(join(dirs.scriptsDir, "script.md"), content);
  cache.script = content;
  res.json({ ok: true });
});

app.get("/api/narratives", (_req, res) => {
  const list = [...cache.narratives.values()].sort((a, b) => a.part - b.part);
  res.json(list);
});

app.put("/api/narratives/:part", (req, res) => {
  const part = Number(req.params.part);
  writeNarrativeFile({ ...(req.body as NarrativeFile), part });
  res.json({ ok: true });
});

app.get("/api/parts", (_req, res) => {
  const counts = new Map<number, number>();
  for (const cut of cache.cuts.values()) {
    counts.set(cut.part, (counts.get(cut.part) ?? 0) + 1);
  }
  const parts = [...cache.narratives.values()]
    .map((n) => ({ ...n, cut_count: counts.get(n.part) ?? 0 }))
    .sort((a, b) => a.part - b.part);
  res.json(parts);
});

app.get("/api/cuts", (req, res) => {
  const partParam = req.query.part;
  const partFilter = partParam === undefined ? undefined : Number(partParam);
  const ids = sortedCutIds(partFilter);
  res.json(ids.map(cutWithImages).filter(Boolean));
});

app.get("/api/cuts/:id", (req, res) => {
  const cut = cutWithImages(req.params.id);
  if (!cut) return res.status(404).json({ error: "not found" });
  res.json(cut);
});

app.put("/api/cuts/:id", (req, res) => {
  const id = req.params.id;
  writeCutFile({ ...(req.body as CutFile), cut_id: id });
  res.json({ ok: true });
});

app.get("/api/common-style", (_req, res) => {
  const items = COMMON_STYLE_KINDS.map((kind) => ({
    kind,
    content: cache.commonStyle.get(kind) ?? "",
  }));
  res.json(items);
});

app.get("/api/common-style/:kind", (req, res) => {
  const kind = req.params.kind as CommonStyleKind;
  if (!COMMON_STYLE_KINDS.includes(kind)) return res.status(404).json({ error: "unknown kind" });
  res.json({ kind, content: cache.commonStyle.get(kind) ?? "" });
});

app.put("/api/common-style/:kind", (req, res) => {
  const kind = req.params.kind as CommonStyleKind;
  if (!COMMON_STYLE_KINDS.includes(kind)) return res.status(404).json({ error: "unknown kind" });
  const content = String(req.body?.content ?? "");
  writeFileSync(join(dirs.commonStyleDir, `${kind}.txt`), content);
  cache.commonStyle.set(kind, content);
  res.json({ ok: true });
});

app.post("/api/jobs/bulk-generate", (req, res) => {
  const body = (req.body ?? {}) as {
    scope?: string;
    part?: number;
    styles?: string[];
    model?: string;
    force?: boolean;
    concurrency?: number;
  };
  const scope = body.scope === "all" ? "all" : "part";
  if (scope === "part" && body.part === undefined) {
    return res.status(400).json({ ok: false, error: "part required for scope=part" });
  }
  const styles = (body.styles ?? []).filter((s): s is ImageStyle =>
    IMAGE_STYLES.includes(s as ImageStyle),
  );
  if (styles.length === 0) {
    return res.status(400).json({ ok: false, error: "at least one valid style required" });
  }
  const model = String(body.model ?? "");
  if (!model) return res.status(400).json({ ok: false, error: "model required" });

  try {
    const job = jobManager.create({
      scope,
      part: body.part,
      styles,
      model,
      force: !!body.force,
      concurrency: body.concurrency ?? 2,
    });
    res.json({ ok: true, job });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/api/jobs", (_req, res) => {
  res.json(jobManager.list());
});

app.get("/api/jobs/:id", (req, res) => {
  const job = jobManager.get(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: "not found" });
  res.json(job);
});

app.post("/api/jobs/:id/cancel", (req, res) => {
  const ok = jobManager.cancel(req.params.id);
  if (!ok) return res.status(400).json({ ok: false, error: "not cancellable" });
  res.json({ ok: true });
});

app.post("/api/generate", async (req, res) => {
  const cutId = String(req.body?.cut_id ?? "");
  const style = String(req.body?.style ?? "") as ImageStyle;
  const model = String(req.body?.model ?? "");
  if (!cutId || !style || !model) {
    return res.status(400).json({ ok: false, error: "cut_id, style, model are required" });
  }
  if (!IMAGE_STYLES.includes(style)) {
    return res.status(400).json({ ok: false, error: `unsupported style: ${style}` });
  }
  const cut = cache.cuts.get(cutId);
  if (!cut) return res.status(404).json({ ok: false, error: `cut not found: ${cutId}` });

  const styleText = cache.commonStyle.get(style) ?? "";
  const negativeText = cache.commonStyle.get("negative") ?? "";
  const carClause = cache.commonStyle.get("car-clause") ?? "";
  const includeCarRef = cut.include_car_reference !== false;
  const carRef = includeCarRef ? resolveCarReference(dirs.dataDir) : null;
  const stylePrompt = includeCarRef && carClause
    ? `${styleText}\n\n${carClause}`.trim()
    : styleText;
  const cellDir = join(dirs.imagesDir, "gemini", style, cutId);
  const thumbDir = join(dirs.imagesDir, "thumbs", style, cutId);

  const result = await generateImage({
    cutId,
    style,
    model,
    scenePrompt: cut.scene_en,
    stylePrompt,
    negativePrompt: negativeText,
    carReferencePath: carRef,
    cellDir,
    thumbDir,
  });

  if (!result.ok) return res.status(500).json(result);

  if (result.filename) {
    setSelectedImage(cutId, style, result.filename);
  }
  res.json(result);
});

// upload (drag-drop) — preserves original filename
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.post(
  "/api/images/upload",
  upload.single("file"),
  async (req, res) => {
    const cutId = String(req.body?.cut_id ?? "");
    const style = String(req.body?.style ?? "") as ImageStyle;
    if (!cutId || !style || !IMAGE_STYLES.includes(style)) {
      return res.status(400).json({ ok: false, error: "cut_id and valid style required" });
    }
    if (!cache.cuts.has(cutId)) {
      return res.status(404).json({ ok: false, error: `cut not found: ${cutId}` });
    }
    const f = req.file;
    if (!f) return res.status(400).json({ ok: false, error: "file required" });

    const cellDir = join(dirs.imagesDir, "gemini", style, cutId);
    const thumbDir = join(dirs.imagesDir, "thumbs", style, cutId);
    mkdirSync(cellDir, { recursive: true });
    mkdirSync(thumbDir, { recursive: true });

    const safeName = sanitizeFilename(f.originalname);
    const finalName = uniqueFilename(cellDir, safeName);
    const savedPath = join(cellDir, finalName);
    writeFileSync(savedPath, f.buffer);

    const thumbName = finalName.replace(/\.[^.]+$/, ".jpg");
    const thumbPath = join(thumbDir, thumbName);
    try {
      const sharp = (await import("sharp")).default;
      await sharp(f.buffer)
        .resize(256, null, { withoutEnlargement: true, fit: "inside" })
        .jpeg({ quality: 80 })
        .toFile(thumbPath);
    } catch (e) {
      console.warn(`thumb failed for upload ${cutId}/${style}/${finalName}:`, e);
    }

    setSelectedImage(cutId, style, finalName);

    res.json({
      ok: true,
      filename: finalName,
      relativeUrl: `/images/gemini/${style}/${cutId}/${encodeURIComponent(finalName)}`,
      thumbUrl: `/images/thumbs/${style}/${cutId}/${encodeURIComponent(thumbName)}`,
    });
  },
);

app.put("/api/images/select", (req, res) => {
  const cutId = String(req.body?.cut_id ?? "");
  const style = String(req.body?.style ?? "") as ImageStyle;
  const filename = String(req.body?.filename ?? "");
  if (!cutId || !IMAGE_STYLES.includes(style)) {
    return res.status(400).json({ ok: false, error: "cut_id and valid style required" });
  }
  if (!cache.cuts.has(cutId)) {
    return res.status(404).json({ ok: false, error: `cut not found: ${cutId}` });
  }
  setSelectedImage(cutId, style, filename);
  res.json({ ok: true });
});

app.delete("/api/images/:style/:cut_id/:filename", (req, res) => {
  const style = req.params.style as ImageStyle;
  const cutId = req.params.cut_id;
  const filename = req.params.filename;
  if (!IMAGE_STYLES.includes(style)) {
    return res.status(400).json({ ok: false, error: "unknown style" });
  }
  const cellDir = join(dirs.imagesDir, "gemini", style, cutId);
  const thumbDir = join(dirs.imagesDir, "thumbs", style, cutId);
  const target = join(cellDir, filename);
  if (!target.startsWith(cellDir + "/")) {
    return res.status(400).json({ ok: false, error: "invalid filename" });
  }
  if (existsSync(target)) {
    try {
      unlinkSync(target);
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e) });
    }
  }
  const thumbPath = join(thumbDir, filename.replace(/\.[^.]+$/, ".jpg"));
  if (existsSync(thumbPath)) {
    try {
      unlinkSync(thumbPath);
    } catch {}
  }
  // if it was the selected one, clear selection (cache rebuild will pick newest)
  const cut = cache.cuts.get(cutId);
  if (cut && cut.selected_image[style] === filename) {
    setSelectedImage(cutId, style, "");
  } else {
    rebuildImageCell(cache, dirs, style, cutId);
  }
  res.json({ ok: true });
});

function sanitizeFilename(name: string): string {
  // strip directory portion, keep extension; allow safe chars
  const base = name.replace(/^.*[/\\]/, "");
  const cleaned = base.replace(/[^\w\u00A0-\uFFFF.\-]+/g, "_");
  if (!/\.[a-zA-Z0-9]+$/.test(cleaned)) return cleaned + ".png";
  return cleaned;
}

function uniqueFilename(dir: string, name: string): string {
  if (!existsSync(join(dir, name))) return name;
  const ext = extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let i = 1; i < 1000; i++) {
    const candidate = `${stem}-${i}${ext}`;
    if (!existsSync(join(dir, candidate))) return candidate;
  }
  return `${stem}-${Date.now()}${ext}`;
}

const PORT = 5174;
app.listen(PORT, () => {
  console.log(`sceneboard server listening on http://localhost:${PORT}`);
  console.log(
    `  cache loaded: ${cache.cuts.size} cuts, ${cache.narratives.size} narratives, ${cache.commonStyle.size} common-style files`,
  );
});
