import { useEffect, useRef, useState } from "react";
import type { Cut, ImageStyle, ImageVersion } from "../types";
import { MODEL_OPTIONS } from "../types";
import { api } from "../api";
import { Modal } from "./Modal";

type Props = {
  cut: Cut;
  style: ImageStyle;
  styleText: string;
  negativeText: string;
  onClose: () => void;
  onCellChanged: () => Promise<void> | void;
};

export function ImageModal({
  cut,
  style,
  styleText,
  negativeText,
  onClose,
  onCellChanged,
}: Props) {
  const [model, setModel] = useState<string>(MODEL_OPTIONS[0]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const cell = cut.images[style];
  const sel = cell.selected;
  const versions = cell.versions;

  // local override of which version is highlighted/previewed (defaults to selected)
  const [previewFilename, setPreviewFilename] = useState<string | null>(sel?.filename ?? null);
  useEffect(() => {
    setPreviewFilename(sel?.filename ?? null);
  }, [sel?.filename]);

  const previewVersion: ImageVersion | null =
    versions.find((v) => v.filename === previewFilename) ?? sel;

  const fullPrompt = [
    cut.scene_en.trim(),
    styleText.trim(),
    negativeText.trim() ? `Negative: ${negativeText.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  async function handleGenerate() {
    setBusy(true);
    setMessage(`生成中… ${model}`);
    const result = await api.generate(cut.cut_id, style, model);
    if (result.ok && result.filename) {
      setMessage(
        result.note ? `生成: ${result.filename}\nmodel note: ${result.note}` : `生成: ${result.filename}`,
      );
      await onCellChanged();
    } else {
      setMessage(`エラー: ${result.error ?? "unknown"}${result.note ? `\n${result.note}` : ""}`);
    }
    setBusy(false);
  }

  async function handleSelect(filename: string) {
    setBusy(true);
    await api.selectImage(cut.cut_id, style, filename);
    setMessage(`選択: ${filename}`);
    await onCellChanged();
    setBusy(false);
  }

  async function handleDelete(filename: string) {
    if (!window.confirm(`削除しますか？ ${filename}`)) return;
    setBusy(true);
    await api.deleteImage(cut.cut_id, style, filename);
    setMessage(`削除: ${filename}`);
    await onCellChanged();
    setBusy(false);
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    let last: string | null = null;
    for (const f of list) {
      setMessage(`アップロード中… ${f.name}`);
      const result = await api.uploadImage(cut.cut_id, style, f);
      if (result.ok && result.filename) {
        last = result.filename;
      } else {
        setMessage(`エラー: ${result.error ?? "unknown"}`);
        setBusy(false);
        return;
      }
    }
    setMessage(`追加: ${list.length}件 (選択中: ${last})`);
    await onCellChanged();
    setBusy(false);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer?.files?.length) {
      void handleFiles(e.dataTransfer.files);
    }
  }

  return (
    <Modal
      title={`${cut.cut_id} — ${style}`}
      onClose={onClose}
      footer={
        <div className="gen-footer">
          <div className="gen-status">{message}</div>
          <div className="gen-controls">
            <label className="gen-field">
              <span>モデル</span>
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-primary" disabled={busy} onClick={handleGenerate}>
              {busy ? "送信中…" : sel ? "新規生成" : "生成"}
            </button>
          </div>
        </div>
      }
    >
      <div
        className={"image-modal" + (dragOver ? " dropping" : "")}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="image-modal-preview">
          {previewVersion ? (
            <a href={previewVersion.full} target="_blank" rel="noreferrer">
              <img src={previewVersion.full} alt={previewVersion.filename} />
            </a>
          ) : (
            <div className="image-modal-empty">
              <div className="empty-hint">バージョンがありません</div>
              <div className="empty-path">
                ドラッグ&amp;ドロップ または「生成」で追加
              </div>
            </div>
          )}
        </div>

        <div className="versions-bar">
          <div className="versions-header">
            <span>{versions.length} 版</span>
            <button
              className="btn"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              + ファイル追加
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) void handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          <div className="versions-strip">
            {versions.map((v) => {
              const isSelected = v.filename === sel?.filename;
              const isPreview = v.filename === previewVersion?.filename;
              return (
                <div
                  key={v.filename}
                  className={
                    "version-card" +
                    (isSelected ? " selected" : "") +
                    (isPreview ? " preview" : "")
                  }
                >
                  <button
                    className="version-thumb"
                    onClick={() => setPreviewFilename(v.filename)}
                    title={v.filename}
                  >
                    <img src={v.thumb} alt={v.filename} loading="lazy" />
                    <span className={"source-badge source-" + v.source}>{v.source}</span>
                  </button>
                  <div className="version-meta">
                    <div className="version-name" title={v.filename}>
                      {v.filename}
                    </div>
                    <div className="version-actions">
                      <button
                        className="btn btn-small"
                        disabled={busy || isSelected}
                        onClick={() => handleSelect(v.filename)}
                      >
                        {isSelected ? "選択中" : "選択"}
                      </button>
                      <button
                        className="btn btn-small btn-danger"
                        disabled={busy}
                        onClick={() => handleDelete(v.filename)}
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {versions.length === 0 && (
              <div className="versions-empty">バージョンなし — D&amp;Dで追加してください</div>
            )}
          </div>
        </div>

        <div className="image-modal-prompts">
          <section>
            <h4>全文プレビュー</h4>
            <pre className="fullprompt">{fullPrompt || "(空)"}</pre>
          </section>
        </div>

        {dragOver && <div className="drop-overlay">ここにドロップして追加</div>}
      </div>
    </Modal>
  );
}
