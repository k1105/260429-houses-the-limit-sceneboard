import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type {
  CommonStyle,
  CommonStyleKind,
  Cut,
  ImageStyle,
  Narrative,
  PartSummary,
} from "./types";
import { COMMON_STYLE_KINDS } from "./types";
import { ScriptView } from "./components/ScriptView";
import { PartView } from "./components/PartView";
import { CommonStyleView } from "./components/CommonStyleView";
import { JobsIndicator } from "./components/JobsIndicator";
import { JobMonitorModal } from "./components/JobMonitorModal";

type Selection =
  | { kind: "script" }
  | { kind: "common-style"; common: CommonStyleKind }
  | { kind: "part"; part: number };

export function App() {
  const [selection, setSelection] = useState<Selection>({ kind: "script" });
  const [parts, setParts] = useState<PartSummary[]>([]);
  const [cutsByPart, setCutsByPart] = useState<Map<number, Cut[]>>(new Map());
  const [scriptContent, setScriptContent] = useState<string>("");
  const [commonStyle, setCommonStyle] = useState<CommonStyle[]>([]);
  const [status, setStatus] = useState<string>("");
  const [monitorJobId, setMonitorJobId] = useState<string | null>(null);
  const inflight = useRef<Map<number, Promise<void>>>(new Map());
  const cutsByPartRef = useRef<Map<number, Cut[]>>(new Map());

  useEffect(() => {
    void loadInitial();
  }, []);

  useEffect(() => {
    if (selection.kind === "part") {
      void ensurePart(selection.part);
    }
  }, [selection]);

  useEffect(() => {
    cutsByPartRef.current = cutsByPart;
  }, [cutsByPart]);

  async function loadInitial() {
    setStatus("読み込み中…");
    const [p, s, cs] = await Promise.all([
      api.listParts(),
      api.getScript(),
      api.listCommonStyle(),
    ]);
    setParts(p);
    setScriptContent(s.content);
    setCommonStyle(cs);
    setStatus("");
  }

  async function ensurePart(part: number) {
    if (cutsByPart.has(part)) return;
    if (inflight.current.has(part)) return inflight.current.get(part);
    setStatus(`Part ${part} 読み込み中…`);
    const p = (async () => {
      const list = await api.listCuts(part);
      setCutsByPart((prev) => {
        const next = new Map(prev);
        next.set(part, list);
        return next;
      });
      setStatus("");
    })();
    inflight.current.set(part, p);
    try {
      await p;
    } finally {
      inflight.current.delete(part);
    }
  }

  async function refreshPart(part: number) {
    const list = await api.listCuts(part);
    setCutsByPart((prev) => {
      const next = new Map(prev);
      next.set(part, list);
      return next;
    });
  }

  const commonStyleByKind = useMemo(() => {
    const map = new Map<CommonStyleKind, string>();
    for (const cs of commonStyle) map.set(cs.kind, cs.content);
    return map;
  }, [commonStyle]);

  async function saveCut(next: Cut) {
    setStatus(`保存中… ${next.cut_id}`);
    setCutsByPart((prev) => {
      const list = prev.get(next.part);
      if (!list) return prev;
      const updated = list.map((c) => (c.cut_id === next.cut_id ? next : c));
      const m = new Map(prev);
      m.set(next.part, updated);
      return m;
    });
    await api.saveCut(next);
    setStatus(`保存: ${next.cut_id}`);
  }

  async function refreshCut(cutId: string, part: number) {
    const fresh = await api.getCut(cutId);
    setCutsByPart((prev) => {
      const list = prev.get(part);
      if (!list) return prev;
      const updated = list.map((c) => (c.cut_id === cutId ? fresh : c));
      const m = new Map(prev);
      m.set(part, updated);
      return m;
    });
  }

  // refresh whichever loaded part contains this cut; ignore otherwise
  const refreshCutInLoadedParts = useCallback(async (cutId: string) => {
    const map = cutsByPartRef.current;
    for (const [part, list] of map) {
      if (list.some((c) => c.cut_id === cutId)) {
        await refreshCut(cutId, part);
        return;
      }
    }
  }, []);

  async function saveNarrative(next: Narrative) {
    setStatus(`保存中… part-${next.part}`);
    setParts((prev) =>
      prev.map((p) => (p.part === next.part ? { ...p, ...next } : p)),
    );
    await api.saveNarrative(next);
    setStatus(`保存: part-${next.part}`);
  }

  async function saveScript(next: string) {
    setStatus(`保存中… script`);
    setScriptContent(next);
    await api.saveScript(next);
    setStatus(`保存: script`);
  }

  async function saveCommonStyle(next: CommonStyle) {
    setStatus(`保存中… common-style/${next.kind}`);
    setCommonStyle((prev) => prev.map((cs) => (cs.kind === next.kind ? next : cs)));
    await api.saveCommonStyle(next.kind, next.content);
    setStatus(`保存: common-style/${next.kind}`);
  }

  const currentPart =
    selection.kind === "part" ? parts.find((p) => p.part === selection.part) : undefined;
  const currentCuts = selection.kind === "part" ? cutsByPart.get(selection.part) ?? [] : [];
  const currentCommonStyle =
    selection.kind === "common-style"
      ? commonStyle.find((cs) => cs.kind === selection.common)
      : undefined;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-title">HOUSES THE LIMIT</div>
          <div className="brand-sub">sceneboard</div>
        </div>
        <nav className="nav">
          <button
            className={"nav-item" + (selection.kind === "script" ? " active" : "")}
            onClick={() => setSelection({ kind: "script" })}
          >
            <span className="nav-label">脚本全体</span>
            <span className="nav-hint">script-v5</span>
          </button>
          <div className="nav-section">common-style</div>
          {COMMON_STYLE_KINDS.map((k) => {
            const active = selection.kind === "common-style" && selection.common === k;
            return (
              <button
                key={k}
                className={"nav-item nav-item-small" + (active ? " active" : "")}
                onClick={() => setSelection({ kind: "common-style", common: k })}
              >
                <span className="nav-label">{k}</span>
              </button>
            );
          })}
          <div className="nav-section">シーン</div>
          {parts.map((p) => {
            const active = selection.kind === "part" && selection.part === p.part;
            return (
              <button
                key={p.part}
                className={"nav-item" + (active ? " active" : "")}
                onClick={() => setSelection({ kind: "part", part: p.part })}
              >
                <div className="nav-row">
                  <span className="nav-part">Part {p.part}</span>
                  <span className={"pill pill-" + p.status}>{p.status}</span>
                </div>
                <div className="nav-label">{p.setting_name}</div>
                <div className="nav-hint">
                  {p.dj} · {p.cut_count} cuts
                </div>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-title">
            {selection.kind === "script"
              ? "脚本全体"
              : selection.kind === "common-style"
                ? `common-style / ${selection.common}`
                : `Part ${selection.part} · ${currentPart?.setting_name ?? ""}`}
          </div>
          <div className="topbar-right">
            <JobsIndicator
              onOpenJob={(id) => setMonitorJobId(id)}
              onItemDone={refreshCutInLoadedParts}
            />
            <div className="topbar-status">{status}</div>
          </div>
        </header>

        <main className="content">
          {selection.kind === "script" ? (
            <ScriptView content={scriptContent} onSave={saveScript} />
          ) : selection.kind === "common-style" && currentCommonStyle ? (
            <CommonStyleView item={currentCommonStyle} onSave={saveCommonStyle} />
          ) : selection.kind === "part" && currentPart ? (
            <PartView
              narrative={partAsNarrative(currentPart)}
              cuts={currentCuts}
              getStyleText={(s: ImageStyle) => commonStyleByKind.get(s) ?? ""}
              getNegativeText={() => commonStyleByKind.get("negative") ?? ""}
              onSaveNarrative={saveNarrative}
              onSaveCut={saveCut}
              onAfterGenerate={(cutId) => refreshCut(cutId, currentPart.part)}
              onRefreshPart={() => refreshPart(currentPart.part)}
            />
          ) : (
            <div className="empty">読み込み中…</div>
          )}
        </main>
      </div>

      {monitorJobId && (
        <JobMonitorModal
          jobId={monitorJobId}
          onClose={() => setMonitorJobId(null)}
          onCompleted={async () => {
            if (selection.kind === "part") await refreshPart(selection.part);
          }}
        />
      )}
    </div>
  );
}

function partAsNarrative(p: PartSummary): Narrative {
  return {
    part: p.part,
    dj: p.dj,
    setting_name: p.setting_name,
    concept_keyword: p.concept_keyword,
    status: p.status,
    revision_memo: p.revision_memo,
    plot: p.plot,
  };
}
