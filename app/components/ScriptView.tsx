import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  content: string;
  onSave: (next: string) => Promise<void>;
};

export function ScriptView({ content, onSave }: Props) {
  const [draft, setDraft] = useState(content);
  const [mode, setMode] = useState<"read" | "edit">("read");
  const timerRef = useRef<number | null>(null);

  useEffect(() => setDraft(content), [content]);

  function schedule(next: string) {
    setDraft(next);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void onSave(next);
    }, 800);
  }

  return (
    <div className="script-view">
      <div className="script-toolbar">
        <div className="segmented">
          <button
            className={mode === "read" ? "active" : ""}
            onClick={() => setMode("read")}
          >
            読む
          </button>
          <button
            className={mode === "edit" ? "active" : ""}
            onClick={() => setMode("edit")}
          >
            編集
          </button>
        </div>
      </div>
      {mode === "read" ? (
        <div className="script-read markdown">
          <Markdown remarkPlugins={[remarkGfm]}>{draft}</Markdown>
        </div>
      ) : (
        <textarea
          className="script-edit"
          value={draft}
          onChange={(e) => schedule(e.target.value)}
          spellCheck={false}
        />
      )}
    </div>
  );
}
