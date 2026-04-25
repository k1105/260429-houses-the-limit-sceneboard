import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dataDir = resolve(root, "data");
const cutsDir = join(dataDir, "cuts");
const narrativesDir = join(dataDir, "narratives");

type NarrativeEntry = {
  part: number;
  setting_name: string;
  status: string;
  revision_memo: string;
};

type CutEntry = {
  cut_id: string;
  part: number;
  title_jp: string;
  status: string;
  revision_memo: string;
};

function parseSuffix(s: string): { kind: "main" | "extra"; num: number; tail: string } {
  if (s.startsWith("m")) {
    const num = parseInt(s.slice(1), 10) || 0;
    return { kind: "extra", num, tail: s };
  }
  const match = s.match(/^(\d+)(.*)$/);
  if (match) return { kind: "main", num: Number(match[1]), tail: match[2] };
  return { kind: "main", num: 0, tail: s };
}

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

function nonEmpty(memo: unknown): string {
  if (typeof memo !== "string") return "";
  const trimmed = memo.trim();
  return trimmed;
}

function collectNarratives(): NarrativeEntry[] {
  if (!existsSync(narrativesDir)) return [];
  const out: NarrativeEntry[] = [];
  for (const f of readdirSync(narrativesDir)) {
    if (!f.endsWith(".md")) continue;
    const { data } = matter(readFileSync(join(narrativesDir, f), "utf8"));
    const memo = nonEmpty(data.revision_memo);
    if (!memo) continue;
    out.push({
      part: Number(data.part ?? 0),
      setting_name: String(data.setting_name ?? ""),
      status: String(data.status ?? ""),
      revision_memo: memo,
    });
  }
  return out.sort((a, b) => a.part - b.part);
}

function collectCuts(): CutEntry[] {
  if (!existsSync(cutsDir)) return [];
  const out: CutEntry[] = [];
  for (const f of readdirSync(cutsDir)) {
    if (!f.endsWith(".md")) continue;
    const { data } = matter(readFileSync(join(cutsDir, f), "utf8"));
    const memo = nonEmpty(data.revision_memo);
    if (!memo) continue;
    out.push({
      cut_id: String(data.cut_id ?? f.replace(/\.md$/, "")),
      part: Number(data.part ?? 0),
      title_jp: String(data.title_jp ?? ""),
      status: String(data.status ?? ""),
      revision_memo: memo,
    });
  }
  return out.sort((a, b) => cutIdCompare(a.cut_id, b.cut_id));
}

function indentBlock(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => (line.length === 0 ? prefix.trimEnd() : prefix + line))
    .join("\n");
}

function render(narratives: NarrativeEntry[], cuts: CutEntry[]): string {
  const lines: string[] = [];
  lines.push("# Revision feedback (collected)");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(
    `Found: narratives=${narratives.length}, cuts=${cuts.length}`,
  );
  lines.push("");

  const partsWithContent = new Set<number>();
  for (const n of narratives) partsWithContent.add(n.part);
  for (const c of cuts) partsWithContent.add(c.part);
  const parts = [...partsWithContent].sort((a, b) => a - b);

  if (parts.length === 0) {
    lines.push("_No revision_memo entries found._");
    lines.push("");
    return lines.join("\n");
  }

  for (const part of parts) {
    lines.push(`## Part ${part}`);
    lines.push("");

    const narr = narratives.find((n) => n.part === part);
    if (narr) {
      lines.push(`### Narrative — ${narr.setting_name} _(status: ${narr.status})_`);
      lines.push("");
      lines.push(indentBlock(narr.revision_memo, "> "));
      lines.push("");
    }

    const partCuts = cuts.filter((c) => c.part === part);
    for (const c of partCuts) {
      const title = c.title_jp ? ` — ${c.title_jp}` : "";
      lines.push(`### ${c.cut_id}${title} _(status: ${c.status})_`);
      lines.push("");
      lines.push(indentBlock(c.revision_memo, "> "));
      lines.push("");
    }
  }

  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  let outPath: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "-o" || args[i] === "--out") && args[i + 1]) {
      outPath = args[i + 1];
      i++;
    }
  }

  const narratives = collectNarratives();
  const cuts = collectCuts();
  const md = render(narratives, cuts);

  if (outPath) {
    writeFileSync(resolve(process.cwd(), outPath), md);
    process.stderr.write(
      `wrote ${outPath} (narratives=${narratives.length}, cuts=${cuts.length})\n`,
    );
  } else {
    process.stdout.write(md);
  }
}

main();
