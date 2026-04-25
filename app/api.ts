import type {
  CommonStyle,
  CommonStyleKind,
  Cut,
  ImageStyle,
  Job,
  Narrative,
  PartSummary,
} from "./types";

export type GenerateResult = {
  ok: boolean;
  filename?: string;
  savedPath?: string;
  relativeUrl?: string;
  thumbUrl?: string;
  source?: "flash" | "pro";
  note?: string;
  error?: string;
};

export type UploadResult = {
  ok: boolean;
  filename?: string;
  relativeUrl?: string;
  thumbUrl?: string;
  error?: string;
};

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} (${url})`);
  return res.json();
}

export const api = {
  getScript: () => jsonFetch<{ content: string }>("/api/script"),
  saveScript: (content: string) =>
    jsonFetch<{ ok: true }>("/api/script", {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),

  listNarratives: () => jsonFetch<Narrative[]>("/api/narratives"),
  saveNarrative: (n: Narrative) =>
    jsonFetch<{ ok: true }>(`/api/narratives/${n.part}`, {
      method: "PUT",
      body: JSON.stringify(n),
    }),

  listParts: () => jsonFetch<PartSummary[]>("/api/parts"),
  listCuts: (part?: number) =>
    jsonFetch<Cut[]>(part === undefined ? "/api/cuts" : `/api/cuts?part=${part}`),
  saveCut: (c: Cut) =>
    jsonFetch<{ ok: true }>(`/api/cuts/${c.cut_id}`, {
      method: "PUT",
      body: JSON.stringify(c),
    }),
  getCut: (id: string) => jsonFetch<Cut>(`/api/cuts/${id}`),

  listCommonStyle: () => jsonFetch<CommonStyle[]>("/api/common-style"),
  saveCommonStyle: (kind: CommonStyleKind, content: string) =>
    jsonFetch<{ ok: true }>(`/api/common-style/${kind}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),

  generate: (cutId: string, style: ImageStyle, model: string) =>
    jsonFetchAllowError<GenerateResult>("/api/generate", {
      method: "POST",
      body: JSON.stringify({ cut_id: cutId, style, model }),
    }),

  uploadImage: async (cutId: string, style: ImageStyle, file: File): Promise<UploadResult> => {
    const fd = new FormData();
    fd.append("cut_id", cutId);
    fd.append("style", style);
    fd.append("file", file);
    const res = await fetch("/api/images/upload", { method: "POST", body: fd });
    return res.json();
  },

  selectImage: (cutId: string, style: ImageStyle, filename: string) =>
    jsonFetch<{ ok: true }>("/api/images/select", {
      method: "PUT",
      body: JSON.stringify({ cut_id: cutId, style, filename }),
    }),

  deleteImage: (cutId: string, style: ImageStyle, filename: string) =>
    jsonFetch<{ ok: true }>(
      `/api/images/${style}/${encodeURIComponent(cutId)}/${encodeURIComponent(filename)}`,
      { method: "DELETE" },
    ),

  bulkGenerate: (input: {
    scope: "part" | "all";
    part?: number;
    styles: ImageStyle[];
    model: string;
    force: boolean;
    concurrency: number;
  }) =>
    jsonFetch<{ ok: true; job: Job }>("/api/jobs/bulk-generate", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  listJobs: () => jsonFetch<Job[]>("/api/jobs"),
  getJob: (id: string) => jsonFetch<Job>(`/api/jobs/${id}`),

  cancelJob: (id: string) =>
    jsonFetch<{ ok: true }>(`/api/jobs/${id}/cancel`, { method: "POST" }),
};

async function jsonFetchAllowError<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  return res.json();
}
