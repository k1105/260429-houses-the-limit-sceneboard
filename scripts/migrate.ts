import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  cpSync,
  existsSync,
  readdirSync,
  renameSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseCsv } from "csv-parse/sync";
import matter from "gray-matter";
import { buildThumbnail } from "../server/generate.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const source = resolve(root, "..");
const dataDir = resolve(root, "data");

const CUTS_CSV = join(source, "prompts/all-cuts-skeleton-v7.csv");
const NARRATIVE_CSV = join(source, "narrative-by-performer-v2.csv");
const SCRIPT_MD = join(source, "story-script/script-v5.md");
const IMAGES_SRC = join(source, "out/gemini");
const COMMON_SRC = join(source, "prompts");
const COMMON_FILES = [
  { src: "common-style-illustration.txt", kind: "illustration" },
  { src: "common-style-game.txt", kind: "game" },
  { src: "common-style-camera.txt", kind: "camera" },
  { src: "common-negative.txt", kind: "negative" },
] as const;

type CutRow = {
  cut_id: string;
  part: string;
  dj: string;
  setting: string;
  title_jp: string;
  summary_jp: string;
  camera: string;
  scene_en: string;
  video_prompt_en: string;
};

type NarrativeRow = {
  part: string;
  dj: string;
  setting_name: string;
  concept_keyword: string;
  plot: string;
};

function ensureDir(p: string) {
  mkdirSync(p, { recursive: true });
}

const CUT_COLUMNS = [
  "cut_id",
  "part",
  "dj",
  "setting",
  "title_jp",
  "summary_jp",
  "camera",
  "scene_en",
  "video_prompt_en",
] as const;

function migrateCuts() {
  const csv = readFileSync(CUTS_CSV, "utf8");
  const raw: string[][] = parseCsv(csv, {
    skip_empty_lines: true,
    relax_column_count: true,
  });
  raw.shift();
  const rows: CutRow[] = raw.map((r, i) => {
    if (r.length === CUT_COLUMNS.length) {
      return Object.fromEntries(CUT_COLUMNS.map((k, j) => [k, r[j]])) as CutRow;
    }
    if (r.length > CUT_COLUMNS.length) {
      const extra = r.length - CUT_COLUMNS.length;
      const scene = r.slice(7, 8 + extra).join(",");
      console.warn(`  repaired row ${r[0]}: merged ${extra + 1} fragments into scene_en`);
      const normalized = [...r.slice(0, 7), scene, r[r.length - 1]];
      return Object.fromEntries(CUT_COLUMNS.map((k, j) => [k, normalized[j]])) as CutRow;
    }
    throw new Error(`row ${i} (${r[0]}) has too few columns: ${r.length}`);
  });
  const outDir = join(dataDir, "cuts");
  ensureDir(outDir);

  for (const row of rows) {
    const existing = readExisting(join(outDir, `${row.cut_id}.md`));
    const existingSelected =
      (existing?.data.selected_image as Record<string, string> | undefined) ?? {};
    const frontmatter = {
      cut_id: row.cut_id,
      part: Number(row.part),
      dj: row.dj,
      setting: row.setting,
      title_jp: row.title_jp,
      summary_jp: row.summary_jp,
      status: existing?.data.status ?? "draft",
      revision_memo: existing?.data.revision_memo ?? "",
      selected_image: {
        illustration: existingSelected.illustration ?? "",
        game: existingSelected.game ?? "",
        camera: existingSelected.camera ?? "",
      },
    };

    const body = [
      "## camera",
      "",
      row.camera,
      "",
      "## scene_en",
      "",
      row.scene_en,
      "",
      "## video_prompt_en",
      "",
      row.video_prompt_en,
      "",
    ].join("\n");

    const md = matter.stringify(body, frontmatter);
    writeFileSync(join(outDir, `${row.cut_id}.md`), md);
  }
  console.log(`  cuts: wrote ${rows.length} files to ${outDir}`);
}

function readExisting(path: string) {
  if (!existsSync(path)) return null;
  try {
    return matter(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function migrateNarratives() {
  const csv = readFileSync(NARRATIVE_CSV, "utf8");
  const rows: NarrativeRow[] = parseCsv(csv, { columns: true, skip_empty_lines: true });
  const outDir = join(dataDir, "narratives");
  ensureDir(outDir);

  for (const row of rows) {
    const path = join(outDir, `part-${row.part}.md`);
    const existing = readExisting(path);
    const frontmatter = {
      part: Number(row.part),
      dj: row.dj,
      setting_name: row.setting_name,
      concept_keyword: row.concept_keyword,
      status: existing?.data.status ?? "draft",
      revision_memo: existing?.data.revision_memo ?? "",
    };
    const body = ["## plot", "", row.plot, ""].join("\n");
    writeFileSync(path, matter.stringify(body, frontmatter));
  }
  console.log(`  narratives: wrote ${rows.length} files to ${outDir}`);
}

function migrateScript() {
  const outDir = join(dataDir, "scripts");
  ensureDir(outDir);
  const dst = join(outDir, "script.md");
  cpSync(SCRIPT_MD, dst);
  console.log(`  script: copied ${SCRIPT_MD} -> ${dst}`);
}

function migrateCommonStyle() {
  const outDir = join(dataDir, "common-style");
  ensureDir(outDir);
  let written = 0;
  for (const { src, kind } of COMMON_FILES) {
    const srcPath = join(COMMON_SRC, src);
    if (!existsSync(srcPath)) {
      console.log(`  common-style: skip ${src} (not found)`);
      continue;
    }
    const dst = join(outDir, `${kind}.txt`);
    if (existsSync(dst)) continue;
    cpSync(srcPath, dst);
    written++;
  }
  console.log(`  common-style: wrote ${written} files to ${outDir}`);
}

function migrateImages() {
  if (!existsSync(IMAGES_SRC)) {
    console.log(`  images: skipped (source ${IMAGES_SRC} not found)`);
    return;
  }
  const outDir = join(dataDir, "images/gemini");
  // skip if already populated (avoid re-copying flat files over the
  // reorganized per-cell directory layout on subsequent runs)
  if (existsSync(outDir) && readdirSync(outDir).length > 0) {
    console.log(`  images: skipped (${outDir} already populated)`);
    return;
  }
  ensureDir(outDir);
  cpSync(IMAGES_SRC, outDir, { recursive: true });
  console.log(`  images: copied ${IMAGES_SRC} -> ${outDir}`);
}

function reorganizeImages() {
  const geminiDir = join(dataDir, "images/gemini");
  if (!existsSync(geminiDir)) return;
  const styles = ["illustration", "game", "camera"] as const;
  const cutsDir = join(dataDir, "cuts");
  const selectedByCut = new Map<string, Record<string, string>>();
  let moved = 0;

  for (const style of styles) {
    const styleDir = join(geminiDir, style);
    if (!existsSync(styleDir)) continue;
    for (const f of readdirSync(styleDir)) {
      const src = join(styleDir, f);
      const stat = statSync(src);
      if (stat.isDirectory()) continue;
      if (!/\.(png|jpe?g|webp)$/i.test(f)) continue;
      const m = f.match(/^(.+?)\.([^.]+)$/);
      if (!m) continue;
      const cutId = m[1];
      const ext = m[2];
      const targetName = `${formatTimestamp(stat.mtime)}-migrated.${ext}`;
      const cellDir = join(styleDir, cutId);
      ensureDir(cellDir);
      const target = join(cellDir, targetName);
      if (!existsSync(target)) {
        renameSync(src, target);
        moved++;
      }
      const sel = selectedByCut.get(cutId) ?? {};
      sel[style] = targetName;
      selectedByCut.set(cutId, sel);
    }
  }

  // also reorganize existing thumbs the same way
  const thumbsDir = join(dataDir, "images/thumbs");
  if (existsSync(thumbsDir)) {
    for (const style of styles) {
      const styleDir = join(thumbsDir, style);
      if (!existsSync(styleDir)) continue;
      for (const f of readdirSync(styleDir)) {
        const src = join(styleDir, f);
        const stat = statSync(src);
        if (stat.isDirectory()) continue;
        if (!/\.(png|jpe?g|webp)$/i.test(f)) continue;
        const m = f.match(/^(.+?)\.([^.]+)$/);
        if (!m) continue;
        const cutId = m[1];
        const sel = selectedByCut.get(cutId);
        if (!sel) continue;
        const targetName = sel[style];
        if (!targetName) continue;
        const cellDir = join(styleDir, cutId);
        ensureDir(cellDir);
        const target = join(cellDir, targetName.replace(/\.[^.]+$/, ".jpg"));
        if (!existsSync(target)) renameSync(src, target);
      }
    }
  }

  // write selection back into each cut .md
  let written = 0;
  for (const [cutId, sel] of selectedByCut) {
    const path = join(cutsDir, `${cutId}.md`);
    if (!existsSync(path)) continue;
    const parsed = matter(readFileSync(path, "utf8"));
    const data = parsed.data as Record<string, unknown>;
    const current = (data.selected_image as Record<string, string> | undefined) ?? {};
    const merged = { illustration: "", game: "", camera: "", ...current, ...sel };
    if (
      merged.illustration === current.illustration &&
      merged.game === current.game &&
      merged.camera === current.camera
    ) {
      continue;
    }
    data.selected_image = merged;
    writeFileSync(path, matter.stringify(parsed.content, data));
    written++;
  }

  console.log(`  reorganize: moved ${moved} files, updated ${written} cut files`);
}

function formatTimestamp(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

async function generateThumbnails() {
  const geminiDir = join(dataDir, "images/gemini");
  const thumbsRoot = join(dataDir, "images/thumbs");
  if (!existsSync(geminiDir)) return;
  let made = 0;
  let skipped = 0;
  for (const style of readdirSync(geminiDir)) {
    const styleSrc = join(geminiDir, style);
    if (!existsSync(styleSrc) || !statSync(styleSrc).isDirectory()) continue;
    for (const cutId of readdirSync(styleSrc)) {
      const cellDir = join(styleSrc, cutId);
      if (!statSync(cellDir).isDirectory()) continue;
      const dstDir = join(thumbsRoot, style, cutId);
      ensureDir(dstDir);
      for (const f of readdirSync(cellDir)) {
        if (!/\.(png|jpe?g|webp)$/i.test(f)) continue;
        const src = join(cellDir, f);
        const dstName = f.replace(/\.[^.]+$/, ".jpg");
        const dst = join(dstDir, dstName);
        if (existsSync(dst)) {
          skipped++;
          continue;
        }
        try {
          await buildThumbnail(src, dst);
          made++;
        } catch (e) {
          console.warn(`  thumb failed: ${src} -> ${dst}`, e);
        }
      }
    }
  }
  console.log(`  thumbs: made ${made}, skipped ${skipped} (existed)`);
}

async function main() {
  console.log("migrating...");
  migrateCuts();
  migrateNarratives();
  migrateScript();
  migrateCommonStyle();
  migrateImages();
  reorganizeImages();
  await generateThumbnails();
  console.log("done.");
}

await main();
