import { useState } from "react";
import type { Cut, ImageStyle, Narrative } from "../types";
import { STATUS_OPTIONS } from "../types";
import { CutRow } from "./CutRow";
import { BulkGenerateModal } from "./BulkGenerateModal";

type Props = {
  narrative: Narrative;
  cuts: Cut[];
  getStyleText: (style: ImageStyle) => string;
  getNegativeText: () => string;
  onSaveNarrative: (n: Narrative) => Promise<void>;
  onSaveCut: (c: Cut) => Promise<void>;
  onAfterGenerate: (cutId: string) => Promise<void> | void;
  onRefreshPart: () => Promise<void> | void;
};

export function PartView({
  narrative,
  cuts,
  getStyleText,
  getNegativeText,
  onSaveNarrative,
  onSaveCut,
  onAfterGenerate,
  onRefreshPart,
}: Props) {
  const [open, setOpen] = useState(true);
  const [bulkOpen, setBulkOpen] = useState(false);

  const missingCount = cuts.reduce((acc, c) => {
    let n = 0;
    for (const s of ["illustration", "game", "camera"] as ImageStyle[]) {
      if (c.images[s].versions.length === 0) n++;
    }
    return acc + n;
  }, 0);

  function update<K extends keyof Narrative>(key: K, value: Narrative[K]) {
    void onSaveNarrative({ ...narrative, [key]: value });
  }

  return (
    <div className="part-view">
      <section className={"narrative-panel" + (open ? " open" : "")}>
        <header className="panel-header" onClick={() => setOpen((v) => !v)}>
          <span className="toggle">{open ? "▼" : "▶"}</span>
          <span className="panel-title">シーン概要</span>
          <span className={"pill pill-" + narrative.status}>{narrative.status}</span>
          <span className="meta">
            DJ: {narrative.dj} / キーワード: {narrative.concept_keyword}
          </span>
        </header>
        {open && (
          <div className="panel-body">
            <div className="field">
              <label>設定名</label>
              <input
                type="text"
                defaultValue={narrative.setting_name}
                onBlur={(e) => update("setting_name", e.target.value)}
              />
            </div>
            <div className="field">
              <label>コンセプト</label>
              <input
                type="text"
                defaultValue={narrative.concept_keyword}
                onBlur={(e) => update("concept_keyword", e.target.value)}
              />
            </div>
            <div className="field field-full">
              <label>プロット</label>
              <textarea
                defaultValue={narrative.plot}
                onBlur={(e) => update("plot", e.target.value)}
                rows={6}
              />
            </div>
            <div className="field">
              <label>ステータス</label>
              <select
                value={narrative.status}
                onChange={(e) => update("status", e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="field field-full">
              <label>修正方針メモ</label>
              <textarea
                defaultValue={narrative.revision_memo}
                onBlur={(e) => update("revision_memo", e.target.value)}
                rows={2}
              />
            </div>
          </div>
        )}
      </section>

      <div className="cuts-toolbar">
        <div className="cuts-toolbar-left">
          <span className="cuts-count">{cuts.length} cuts</span>
          <span className="cuts-missing">未生成セル: {missingCount}</span>
        </div>
        <button className="btn btn-primary" onClick={() => setBulkOpen(true)}>
          一括生成…
        </button>
      </div>

      <section className="cuts-section">
        <div className="cuts-header">
          <div className="col col-id">Cut</div>
          <div className="col col-title">タイトル / プロンプト</div>
          <div className="col col-image">illustration</div>
          <div className="col col-image">game</div>
          <div className="col col-image">camera</div>
          <div className="col col-video">video</div>
          <div className="col col-memo">修正方針</div>
          <div className="col col-status">状態</div>
        </div>
        {cuts.map((c) => (
          <CutRow
            key={c.cut_id}
            cut={c}
            getStyleText={getStyleText}
            getNegativeText={getNegativeText}
            onSave={onSaveCut}
            onAfterGenerate={onAfterGenerate}
          />
        ))}
      </section>

      {bulkOpen && (
        <BulkGenerateModal
          partNumber={narrative.part}
          partName={narrative.setting_name}
          onClose={() => setBulkOpen(false)}
          onCompleted={onRefreshPart}
        />
      )}
    </div>
  );
}
