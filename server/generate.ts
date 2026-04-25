import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";
import { GoogleGenAI } from "@google/genai";

export const THUMB_WIDTH = 256;

const SUPPORTED_STYLES = ["illustration", "game", "camera"] as const;
export type ImageStyle = (typeof SUPPORTED_STYLES)[number];

export type GenerateInput = {
  cutId: string;
  style: ImageStyle;
  model: string;
  scenePrompt: string;
  stylePrompt: string;
  negativePrompt: string;
  carReferencePath: string;
  cellDir: string;
  thumbDir: string;
};

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

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY (or GEMINI_API_KEY) is not set");
  }
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

function buildPrompt(input: GenerateInput): string {
  const sections = [input.scenePrompt.trim(), input.stylePrompt.trim()];
  if (input.negativePrompt.trim()) {
    sections.push(`Negative: ${input.negativePrompt.trim()}`);
  }
  return sections.filter(Boolean).join("\n\n");
}

function ensureDir(p: string) {
  mkdirSync(p, { recursive: true });
}

function modelToTag(model: string): "flash" | "pro" {
  return model.toLowerCase().includes("pro") ? "pro" : "flash";
}

function timestamp(): string {
  const d = new Date();
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

export async function generateImage(input: GenerateInput): Promise<GenerateResult> {
  if (!SUPPORTED_STYLES.includes(input.style)) {
    return { ok: false, error: `unsupported style: ${input.style}` };
  }
  if (!existsSync(input.carReferencePath)) {
    return { ok: false, error: `car reference not found: ${input.carReferencePath}` };
  }

  const client = getClient();
  const prompt = buildPrompt(input);
  const carBytes = readFileSync(input.carReferencePath);
  const carBase64 = carBytes.toString("base64");

  let response;
  try {
    response = await client.models.generateContent({
      model: input.model,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: carBase64 } },
          ],
        },
      ],
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  let textNote: string | undefined;
  let imageData: string | undefined;
  let imageMime = "image/png";

  for (const part of parts) {
    if (part.text) textNote = (textNote ? textNote + "\n" : "") + part.text;
    if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("image/")) {
      imageData = part.inlineData.data;
      imageMime = part.inlineData.mimeType;
    }
  }

  if (!imageData) {
    return { ok: false, error: "no image returned from model", note: textNote };
  }

  const ext = imageMime === "image/jpeg" ? "jpg" : "png";
  const tag = modelToTag(input.model);
  const filename = `${timestamp()}-${tag}.${ext}`;

  ensureDir(input.cellDir);
  const savedPath = join(input.cellDir, filename);
  const buf = Buffer.from(imageData, "base64");
  writeFileSync(savedPath, buf);

  ensureDir(input.thumbDir);
  const thumbName = filename.replace(/\.[^.]+$/, ".jpg");
  const thumbPath = join(input.thumbDir, thumbName);
  try {
    await sharp(buf)
      .resize(THUMB_WIDTH, null, { withoutEnlargement: true, fit: "inside" })
      .jpeg({ quality: 80 })
      .toFile(thumbPath);
  } catch (e) {
    console.warn(`thumb generation failed for ${input.cutId}/${input.style}:`, e);
  }

  const relativeUrl = `/images/gemini/${input.style}/${input.cutId}/${encodeURIComponent(filename)}`;
  const thumbUrl = `/images/thumbs/${input.style}/${input.cutId}/${encodeURIComponent(thumbName)}`;
  return {
    ok: true,
    filename,
    savedPath,
    relativeUrl,
    thumbUrl,
    source: tag,
    note: textNote,
  };
}

export async function buildThumbnail(srcPath: string, dstPath: string): Promise<void> {
  ensureDir(dirname(dstPath));
  await sharp(srcPath)
    .resize(THUMB_WIDTH, null, { withoutEnlargement: true, fit: "inside" })
    .jpeg({ quality: 80 })
    .toFile(dstPath);
}

export function resolveCarReference(dataDir: string): string {
  const local = join(dataDir, "car-reference.jpeg");
  if (existsSync(local)) return local;
  const fallback = resolve(dirname(dataDir), "..", "car-reference.jpeg");
  return fallback;
}
