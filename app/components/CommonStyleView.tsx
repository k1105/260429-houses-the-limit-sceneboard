import { useEffect, useRef, useState } from "react";
import type { CommonStyle } from "../types";

type Props = {
  item: CommonStyle;
  onSave: (next: CommonStyle) => Promise<void>;
};

export function CommonStyleView({ item, onSave }: Props) {
  const [draft, setDraft] = useState(item.content);
  const timerRef = useRef<number | null>(null);

  useEffect(() => setDraft(item.content), [item.content, item.kind]);

  function schedule(next: string) {
    setDraft(next);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void onSave({ ...item, content: next });
    }, 800);
  }

  return (
    <div className="common-style-view">
      <div className="cs-header">
        <h2>common-style / {item.kind}</h2>
        <p className="cs-hint">
          {item.kind === "negative"
            ? "全スタイル共通のネガティブプロンプト。画像生成時に scene_en に追記されます"
            : `style "${item.kind}" の生成時に scene_en に追記される共通スタイル定義`}
        </p>
      </div>
      <textarea
        className="cs-editor"
        value={draft}
        spellCheck={false}
        onChange={(e) => schedule(e.target.value)}
      />
    </div>
  );
}
