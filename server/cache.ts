import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename, sep } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import matter from "gray-matter";

export const IMAGE_STYLES = ["illustration", "game", "camera"] as const;
export type ImageStyle = (typeof IMAGE_STYLES)[number];

export type CutFile = {
  cut_id: string;
  part: number;
  dj: string;
  setting: string;
  title_jp: string;
  summary_jp: string;
  status: string;
  revision_memo: string;
  camera: string;
  scene_en: string;
  video_prompt_en: string;
  /** filename per style, "" = none/auto */
  selected_image: Record<ImageStyle, string>;
  /** When false, skip the car reference image and the car-clause text in generation. Default true. */
  include_car_reference: boolean;
};

export type NarrativeFile = {
  part: number;
  dj: string;
  setting_name: string;
  concept_keyword: string;
  status: string;
  revision_memo: string;
  plot: string;
};

export type ImageVersion = {
  filename: string;
  full: string;
  thumb: string;
  source: "flash" | "pro" | "migrated" | "manual";
  mtime: number;
};

export type ImageCell = {
  selected: ImageVersion | null;
  versions: ImageVersion[];
};

export type Cache = {
  cuts: Map<string, CutFile>;
  narratives: Map<number, NarrativeFile>;
  commonStyle: Map<string, string>;
  script: string;
  // images[style][cutId] = ImageCell
  images: Map<ImageStyle, Map<string, ImageCell>>;
};

export type CacheDirs = {
  dataDir: string;
  cutsDir: string;
  narrativesDir: string;
  scriptsDir: string;
  commonStyleDir: string;
  imagesDir: string;
};

const GENERATED_PATTERN = /^\d{8}T\d{6}(?:[-_])?(flash|pro|migrated)\.(?:png|jpe?g|webp)$/i;

function inferSource(filename: string): ImageVersion["source"] {
  const m = filename.match(GENERATED_PATTERN);
  if (m) return m[1].toLowerCase() as ImageVersion["source"];
  return "manual";
}

function splitSections(body: string): Record<string, string> {
  const parts = body.split(/^##\s+/m).slice(1);
  const out: Record<string, string> = {};
  for (const part of parts) {
    const [headline, ...rest] = part.split("\n");
    out[headline.trim()] = rest.join("\n").trim();
  }
  return out;
}

function readSelected(data: Record<string, unknown>): Record<ImageStyle, string> {
  const raw = (data.selected_image ?? {}) as Record<string, unknown>;
  const out: Record<ImageStyle, string> = { illustration: "", game: "", camera: "" };
  for (const s of IMAGE_STYLES) {
    out[s] = typeof raw[s] === "string" ? (raw[s] as string) : "";
  }
  return out;
}

function readCut(path: string): CutFile | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  const { data, content } = matter(raw);
  const sections = splitSections(content);
  const cut_id = String(data.cut_id ?? basename(path, ".md"));
  return {
    cut_id,
    part: Number(data.part ?? 0),
    dj: String(data.dj ?? ""),
    setting: String(data.setting ?? ""),
    title_jp: String(data.title_jp ?? ""),
    summary_jp: String(data.summary_jp ?? ""),
    status: String(data.status ?? "draft"),
    revision_memo: String(data.revision_memo ?? ""),
    camera: sections.camera ?? "",
    scene_en: sections.scene_en ?? "",
    video_prompt_en: sections.video_prompt_en ?? "",
    selected_image: readSelected(data as Record<string, unknown>),
    include_car_reference: data.include_car_reference !== false,
  };
}

function readNarrative(path: string): NarrativeFile | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  const { data, content } = matter(raw);
  const sections = splitSections(content);
  const m = basename(path).match(/^part-(\d+)\.md$/);
  const part = Number(data.part ?? (m ? m[1] : 0));
  return {
    part,
    dj: String(data.dj ?? ""),
    setting_name: String(data.setting_name ?? ""),
    concept_keyword: String(data.concept_keyword ?? ""),
    status: String(data.status ?? "draft"),
    revision_memo: String(data.revision_memo ?? ""),
    plot: sections.plot ?? "",
  };
}

function listVersions(
  imagesDir: string,
  style: ImageStyle,
  cutId: string,
): ImageVersion[] {
  const cellDir = join(imagesDir, "gemini", style, cutId);
  if (!existsSync(cellDir) || !statSync(cellDir).isDirectory()) return [];
  const out: ImageVersion[] = [];
  for (const f of readdirSync(cellDir)) {
    if (!/\.(png|jpe?g|webp)$/i.test(f)) continue;
    const fullPath = join(cellDir, f);
    const stat = statSync(fullPath);
    if (!stat.isFile()) continue;
    const thumbName = f.replace(/\.[^.]+$/, ".jpg");
    const thumbDisk = join(imagesDir, "thumbs", style, cutId, thumbName);
    const thumbUrl = existsSync(thumbDisk)
      ? `/images/thumbs/${style}/${cutId}/${encodeURIComponent(thumbName)}`
      : `/images/gemini/${style}/${cutId}/${encodeURIComponent(f)}`;
    out.push({
      filename: f,
      full: `/images/gemini/${style}/${cutId}/${encodeURIComponent(f)}`,
      thumb: thumbUrl,
      source: inferSource(f),
      mtime: stat.mtimeMs,
    });
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

export function buildImageCell(
  imagesDir: string,
  style: ImageStyle,
  cutId: string,
  selectedFilename: string,
): ImageCell {
  const versions = listVersions(imagesDir, style, cutId);
  let selected: ImageVersion | null = null;
  if (selectedFilename) {
    selected = versions.find((v) => v.filename === selectedFilename) ?? null;
  }
  if (!selected && versions.length > 0) selected = versions[0];
  return { selected, versions };
}

export function buildCache(dirs: CacheDirs): Cache {
  const cache: Cache = {
    cuts: new Map(),
    narratives: new Map(),
    commonStyle: new Map(),
    script: "",
    images: new Map(IMAGE_STYLES.map((s) => [s, new Map()])),
  };

  if (existsSync(dirs.cutsDir)) {
    for (const f of readdirSync(dirs.cutsDir)) {
      if (!f.endsWith(".md")) continue;
      const cut = readCut(join(dirs.cutsDir, f));
      if (cut) cache.cuts.set(cut.cut_id, cut);
    }
  }

  if (existsSync(dirs.narrativesDir)) {
    for (const f of readdirSync(dirs.narrativesDir)) {
      if (!f.endsWith(".md")) continue;
      const narr = readNarrative(join(dirs.narrativesDir, f));
      if (narr) cache.narratives.set(narr.part, narr);
    }
  }

  if (existsSync(dirs.commonStyleDir)) {
    for (const f of readdirSync(dirs.commonStyleDir)) {
      if (!f.endsWith(".txt")) continue;
      const kind = f.replace(/\.txt$/, "");
      cache.commonStyle.set(kind, readFileSync(join(dirs.commonStyleDir, f), "utf8"));
    }
  }

  const scriptPath = join(dirs.scriptsDir, "script.md");
  cache.script = existsSync(scriptPath) ? readFileSync(scriptPath, "utf8") : "";

  for (const style of IMAGE_STYLES) {
    const styleMap = cache.images.get(style)!;
    for (const cut of cache.cuts.values()) {
      const cell = buildImageCell(dirs.imagesDir, style, cut.cut_id, cut.selected_image[style]);
      if (cell.versions.length > 0 || cell.selected) styleMap.set(cut.cut_id, cell);
    }
  }

  return cache;
}

export function rebuildImageCell(
  cache: Cache,
  dirs: CacheDirs,
  style: ImageStyle,
  cutId: string,
) {
  const cut = cache.cuts.get(cutId);
  const selected = cut?.selected_image[style] ?? "";
  const cell = buildImageCell(dirs.imagesDir, style, cutId, selected);
  const map = cache.images.get(style)!;
  if (cell.versions.length > 0) map.set(cutId, cell);
  else map.delete(cutId);
}

export function startWatcher(dirs: CacheDirs, cache: Cache): FSWatcher {
  const targets = [
    dirs.cutsDir,
    dirs.narrativesDir,
    dirs.scriptsDir,
    dirs.commonStyleDir,
    join(dirs.imagesDir, "gemini"),
    join(dirs.imagesDir, "thumbs"),
  ].filter((p) => existsSync(p));

  const watcher = chokidar.watch(targets, { ignoreInitial: true, persistent: true });

  watcher.on("add", (p) => onChange(dirs, cache, p, "add"));
  watcher.on("change", (p) => onChange(dirs, cache, p, "change"));
  watcher.on("unlink", (p) => onChange(dirs, cache, p, "unlink"));

  return watcher;
}

function onChange(dirs: CacheDirs, cache: Cache, path: string, kind: "add" | "change" | "unlink") {
  if (path.startsWith(dirs.cutsDir + sep) && path.endsWith(".md")) {
    const id = basename(path, ".md");
    if (kind === "unlink") cache.cuts.delete(id);
    else {
      const cut = readCut(path);
      if (cut) {
        cache.cuts.set(cut.cut_id, cut);
        for (const style of IMAGE_STYLES) rebuildImageCell(cache, dirs, style, cut.cut_id);
      }
    }
    return;
  }
  if (path.startsWith(dirs.narrativesDir + sep) && path.endsWith(".md")) {
    const m = basename(path).match(/^part-(\d+)\.md$/);
    if (!m) return;
    const part = Number(m[1]);
    if (kind === "unlink") cache.narratives.delete(part);
    else {
      const narr = readNarrative(path);
      if (narr) cache.narratives.set(narr.part, narr);
    }
    return;
  }
  if (path.startsWith(dirs.commonStyleDir + sep) && path.endsWith(".txt")) {
    const kindName = basename(path, ".txt");
    if (kind === "unlink") cache.commonStyle.delete(kindName);
    else cache.commonStyle.set(kindName, readFileSync(path, "utf8"));
    return;
  }
  if (path === join(dirs.scriptsDir, "script.md")) {
    cache.script = kind === "unlink" ? "" : readFileSync(path, "utf8");
    return;
  }

  const geminiRoot = join(dirs.imagesDir, "gemini");
  const thumbsRoot = join(dirs.imagesDir, "thumbs");
  if (path.startsWith(geminiRoot + sep) || path.startsWith(thumbsRoot + sep)) {
    const root = path.startsWith(geminiRoot + sep) ? geminiRoot : thumbsRoot;
    const rel = path.slice(root.length + 1);
    const segs = rel.split(sep);
    if (segs.length < 3) return;
    const [style, cutId] = segs;
    if (!IMAGE_STYLES.includes(style as ImageStyle)) return;
    rebuildImageCell(cache, dirs, style as ImageStyle, cutId);
    return;
  }
}

export function getImageCell(
  cache: Cache,
  cutId: string,
): Record<ImageStyle, ImageCell> {
  const out = {} as Record<ImageStyle, ImageCell>;
  for (const style of IMAGE_STYLES) {
    out[style] = cache.images.get(style)!.get(cutId) ?? { selected: null, versions: [] };
  }
  return out;
}
