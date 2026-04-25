export type ImageStyle = "illustration" | "game" | "camera";

export type ImageSource = "flash" | "pro" | "migrated" | "manual";

export type ImageVersion = {
  filename: string;
  full: string;
  thumb: string;
  source: ImageSource;
  mtime: number;
};

export type ImageCell = {
  selected: ImageVersion | null;
  versions: ImageVersion[];
};

export type Cut = {
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
  selected_image: Record<ImageStyle, string>;
  images: Record<ImageStyle, ImageCell>;
};

export type PartSummary = {
  part: number;
  dj: string;
  setting_name: string;
  concept_keyword: string;
  status: string;
  revision_memo: string;
  plot: string;
  cut_count: number;
};

export type Narrative = {
  part: number;
  dj: string;
  setting_name: string;
  concept_keyword: string;
  status: string;
  revision_memo: string;
  plot: string;
};

export const STATUS_OPTIONS = ["draft", "reviewing", "approved"] as const;
export type Status = (typeof STATUS_OPTIONS)[number];

export const IMAGE_STYLES: ImageStyle[] = ["illustration", "game", "camera"];

export type CommonStyleKind = "illustration" | "game" | "camera" | "negative";

export type CommonStyle = {
  kind: CommonStyleKind;
  content: string;
};

export const COMMON_STYLE_KINDS: CommonStyleKind[] = [
  "illustration",
  "game",
  "camera",
  "negative",
];

export const MODEL_OPTIONS = [
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview",
] as const;

export type ModelOption = (typeof MODEL_OPTIONS)[number];

export type JobItemStatus = "pending" | "running" | "done" | "failed" | "skipped";

export type JobItem = {
  cut_id: string;
  style: ImageStyle;
  status: JobItemStatus;
  filename?: string;
  error?: string;
  note?: string;
};

export type JobStatusValue = "running" | "done" | "cancelled" | "failed";

export type Job = {
  id: string;
  scope: "part" | "all";
  scope_part?: number;
  styles: ImageStyle[];
  model: string;
  force: boolean;
  concurrency: number;
  status: JobStatusValue;
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

