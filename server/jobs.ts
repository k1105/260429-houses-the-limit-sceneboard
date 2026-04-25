import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { type Cache, type ImageStyle, IMAGE_STYLES } from "./cache.ts";
import { generateImage, resolveCarReference } from "./generate.ts";

export type JobItemStatus = "pending" | "running" | "done" | "failed" | "skipped";

export type JobItem = {
  cut_id: string;
  style: ImageStyle;
  status: JobItemStatus;
  filename?: string;
  error?: string;
  note?: string;
};

export type JobStatus = "running" | "done" | "cancelled" | "failed";

export type JobScope = "part" | "all";

export type Job = {
  id: string;
  scope: JobScope;
  scope_part?: number;
  styles: ImageStyle[];
  model: string;
  force: boolean;
  concurrency: number;
  status: JobStatus;
  items: JobItem[];
  totals: {
    total: number;
    completed: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
  started_at: number;
  ended_at?: number;
  cancel_requested: boolean;
};

export type CreateJobInput = {
  scope: JobScope;
  part?: number;
  styles: ImageStyle[];
  model: string;
  force: boolean;
  concurrency: number;
};

export type JobDeps = {
  cache: Cache;
  imagesDir: string;
  dataDir: string;
  setSelectedImage: (cutId: string, style: ImageStyle, filename: string) => void;
};

export class JobManager {
  private jobs = new Map<string, Job>();

  constructor(private deps: JobDeps) {}

  list(): Job[] {
    return [...this.jobs.values()].sort((a, b) => b.started_at - a.started_at);
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  create(input: CreateJobInput): Job {
    const styles = input.styles.filter((s) => IMAGE_STYLES.includes(s));
    if (styles.length === 0) throw new Error("at least one style is required");
    const concurrency = Math.max(1, Math.min(8, input.concurrency || 1));

    const items: JobItem[] = [];
    for (const cut of this.deps.cache.cuts.values()) {
      if (input.scope === "part" && cut.part !== input.part) continue;
      for (const style of styles) {
        const cell = this.deps.cache.images.get(style)!.get(cut.cut_id);
        const has = !!(cell && cell.versions.length > 0);
        if (!input.force && has) {
          items.push({ cut_id: cut.cut_id, style, status: "skipped" });
          continue;
        }
        items.push({ cut_id: cut.cut_id, style, status: "pending" });
      }
    }

    items.sort((a, b) => {
      const aId = a.cut_id;
      const bId = b.cut_id;
      if (aId !== bId) return aId.localeCompare(bId);
      return styles.indexOf(a.style) - styles.indexOf(b.style);
    });

    const totals = computeTotals(items);
    const job: Job = {
      id: randomUUID(),
      scope: input.scope,
      scope_part: input.part,
      styles,
      model: input.model,
      force: input.force,
      concurrency,
      status: "running",
      items,
      totals,
      started_at: Date.now(),
      cancel_requested: false,
    };
    this.jobs.set(job.id, job);
    void this.runJob(job);
    return job;
  }

  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.status !== "running") return false;
    job.cancel_requested = true;
    return true;
  }

  private async runJob(job: Job) {
    const pending = job.items.filter((i) => i.status === "pending");
    const queue = [...pending];
    const workers: Promise<void>[] = [];
    for (let i = 0; i < job.concurrency; i++) {
      workers.push(this.worker(job, queue));
    }
    await Promise.all(workers);
    job.totals = computeTotals(job.items);
    job.status = job.cancel_requested ? "cancelled" : "done";
    job.ended_at = Date.now();
  }

  private async worker(job: Job, queue: JobItem[]) {
    while (true) {
      if (job.cancel_requested) return;
      const item = queue.shift();
      if (!item) return;
      item.status = "running";
      try {
        await this.generateOne(job, item);
        item.status = "done";
      } catch (e) {
        item.status = "failed";
        item.error = e instanceof Error ? e.message : String(e);
      } finally {
        job.totals = computeTotals(job.items);
      }
    }
  }

  private async generateOne(job: Job, item: JobItem): Promise<void> {
    const { cache, imagesDir, dataDir, setSelectedImage } = this.deps;
    const cut = cache.cuts.get(item.cut_id);
    if (!cut) throw new Error(`cut not found: ${item.cut_id}`);

    const styleText = cache.commonStyle.get(item.style) ?? "";
    const negativeText = cache.commonStyle.get("negative") ?? "";
    const cellDir = join(imagesDir, "gemini", item.style, item.cut_id);
    const thumbDir = join(imagesDir, "thumbs", item.style, item.cut_id);
    const carRef = resolveCarReference(dataDir);

    const result = await generateImage({
      cutId: item.cut_id,
      style: item.style,
      model: job.model,
      scenePrompt: cut.scene_en,
      stylePrompt: styleText,
      negativePrompt: negativeText,
      carReferencePath: carRef,
      cellDir,
      thumbDir,
    });
    if (!result.ok) {
      throw new Error(result.error ?? "generation failed");
    }
    if (result.filename) {
      setSelectedImage(item.cut_id, item.style, result.filename);
      item.filename = result.filename;
    }
    if (result.note) item.note = result.note;
  }
}

function computeTotals(items: JobItem[]): Job["totals"] {
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  let completed = 0;
  for (const it of items) {
    if (it.status === "done") {
      succeeded++;
      completed++;
    } else if (it.status === "failed") {
      failed++;
      completed++;
    } else if (it.status === "skipped") {
      skipped++;
      completed++;
    }
  }
  return {
    total: items.length,
    completed,
    succeeded,
    failed,
    skipped,
  };
}
