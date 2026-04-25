import { useState } from "react";
import type { Cut, ImageCell, ImageStyle } from "../types";
import { IMAGE_STYLES, STATUS_OPTIONS } from "../types";
import { ImageModal } from "./ImageModal";

type Props = {
  cut: Cut;
  getStyleText: (style: ImageStyle) => string;
  getNegativeText: () => string;
  onSave: (c: Cut) => Promise<void>;
  onAfterGenerate: (cutId: string) => Promise<void> | void;
};

export function CutRow({ cut, getStyleText, getNegativeText, onSave, onAfterGenerate }: Props) {
  const [open, setOpen] = useState(false);
  const [modalStyle, setModalStyle] = useState<ImageStyle | null>(null);

  function patch<K extends keyof Cut>(key: K, value: Cut[K]) {
    void onSave({ ...cut, [key]: value });
  }

  return (
    <div className={"cut-row" + (open ? " expanded" : "")}>
      <div className="col col-id">
        <button className="cut-id" onClick={() => setOpen((v) => !v)} title="展開/折り畳み">
          <span className="toggle">{open ? "▼" : "▶"}</span>
          <span className="cut-id-text">{cut.cut_id}</span>
        </button>
      </div>

      <div className="col col-title">
        <div className="cut-title-jp">{cut.title_jp || <em>(無題)</em>}</div>
        <div className="cut-summary">{cut.summary_jp}</div>
        {open && (
          <div className="prompts">
            <PromptField
              label="camera"
              value={cut.camera}
              onBlur={(v) => patch("camera", v)}
              rows={2}
            />
            <PromptField
              label="scene_en"
              value={cut.scene_en}
              onBlur={(v) => patch("scene_en", v)}
              rows={6}
            />
            <PromptField
              label="video_prompt_en"
              value={cut.video_prompt_en}
              onBlur={(v) => patch("video_prompt_en", v)}
              rows={3}
            />
            <div className="prompt-meta">
              <label>
                title_jp
                <input
                  type="text"
                  defaultValue={cut.title_jp}
                  onBlur={(e) => patch("title_jp", e.target.value)}
                />
              </label>
              <label>
                summary_jp
                <input
                  type="text"
                  defaultValue={cut.summary_jp}
                  onBlur={(e) => patch("summary_jp", e.target.value)}
                />
              </label>
              <label>
                setting
                <input
                  type="text"
                  defaultValue={cut.setting}
                  onBlur={(e) => patch("setting", e.target.value)}
                />
              </label>
              <label className="checkbox-meta">
                <input
                  type="checkbox"
                  checked={cut.include_car_reference}
                  onChange={(e) => patch("include_car_reference", e.target.checked)}
                />
                include_car_reference
                <span className="meta-hint">
                  （OFF にすると車のリファレンス画像と car-clause を生成リクエストから外す）
                </span>
              </label>
            </div>
          </div>
        )}
      </div>

      {IMAGE_STYLES.map((style) => (
        <ImageCellView
          key={style}
          style={style}
          cell={cut.images[style]}
          onOpen={() => setModalStyle(style)}
        />
      ))}

      <div className="col col-video">
        <div className="slot slot-video">
          <span className="slot-label">video</span>
          <span className="slot-hint">(未接続)</span>
        </div>
      </div>

      <div className="col col-memo">
        <textarea
          className="memo-input"
          defaultValue={cut.revision_memo}
          placeholder="修正方針メモ…"
          onBlur={(e) => patch("revision_memo", e.target.value)}
        />
      </div>

      <div className="col col-status">
        <select
          className={"status-select status-" + cut.status}
          value={cut.status}
          onChange={(e) => patch("status", e.target.value)}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      {modalStyle && (
        <ImageModal
          cut={cut}
          style={modalStyle}
          styleText={getStyleText(modalStyle)}
          negativeText={getNegativeText()}
          onClose={() => setModalStyle(null)}
          onCellChanged={() => onAfterGenerate(cut.cut_id)}
        />
      )}
    </div>
  );
}

function PromptField({
  label,
  value,
  rows,
  onBlur,
}: {
  label: string;
  value: string;
  rows: number;
  onBlur: (v: string) => void;
}) {
  return (
    <label className="prompt-field">
      <span className="prompt-label">{label}</span>
      <textarea
        defaultValue={value}
        rows={rows}
        spellCheck={false}
        onBlur={(e) => {
          if (e.target.value !== value) onBlur(e.target.value);
        }}
      />
    </label>
  );
}

function ImageCellView({
  style,
  cell,
  onOpen,
}: {
  style: ImageStyle;
  cell: ImageCell;
  onOpen: () => void;
}) {
  const sel = cell.selected;
  if (!sel) {
    return (
      <div className="col col-image">
        <button className="slot slot-empty slot-button" onClick={onOpen}>
          <span className="slot-label">{style}</span>
          <span className="slot-hint">未生成 (クリックで生成 / D&D)</span>
        </button>
      </div>
    );
  }
  const extras = cell.versions.length - 1;
  return (
    <div className="col col-image">
      <button className="image-stack image-stack-button" onClick={onOpen}>
        <span className="image-thumb">
          <img src={sel.thumb} alt={`${style} ${sel.filename}`} loading="lazy" decoding="async" />
          {extras > 0 && <span className="version-badge">+{extras}</span>}
          <span className={"source-badge source-" + sel.source}>{sel.source}</span>
        </span>
      </button>
    </div>
  );
}
