import { useEffect, useRef, useState } from "react";
import type { Job } from "../types";
import { api } from "../api";

type Props = {
  onOpenJob: (jobId: string) => void;
  onItemDone?: (cutId: string) => void;
};

export function JobsIndicator({ onOpenJob, onItemDone }: Props) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // tracks completed items we've already notified about, keyed by job:cut:style
  const seenDone = useRef<Set<string>>(new Set());

  useEffect(() => {
    let canceled = false;
    let timer: number | null = null;
    async function tick() {
      let hasRunning = false;
      try {
        const list = await api.listJobs();
        if (canceled) return;
        setJobs(list);
        hasRunning = list.some((j) => j.status === "running");

        if (onItemDone) {
          for (const j of list) {
            for (const it of j.items) {
              if (it.status !== "done") continue;
              const key = `${j.id}:${it.cut_id}:${it.style}`;
              if (seenDone.current.has(key)) continue;
              seenDone.current.add(key);
              onItemDone(it.cut_id);
            }
          }
        }
      } catch {}
      if (canceled) return;
      timer = window.setTimeout(tick, hasRunning ? 1500 : 5000);
    }
    void tick();
    return () => {
      canceled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [onItemDone]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const running = jobs.filter((j) => j.status === "running");
  const recent = jobs.slice(0, 8);

  return (
    <div className="jobs-indicator" ref={containerRef}>
      <button
        className={"jobs-pill" + (running.length > 0 ? " active" : "")}
        onClick={() => setOpen((v) => !v)}
        title="ジョブモニター"
      >
        {running.length > 0 ? (
          <>
            <span className="dot pulse" />
            ジョブ {running.length}件 実行中
          </>
        ) : jobs.length > 0 ? (
          <>ジョブ履歴 ({jobs.length})</>
        ) : (
          <>ジョブ —</>
        )}
      </button>
      {open && (
        <div className="jobs-dropdown">
          {recent.length === 0 ? (
            <div className="jobs-empty">ジョブはありません</div>
          ) : (
            recent.map((j) => (
              <button
                key={j.id}
                className={"jobs-row jobs-row-" + j.status}
                onClick={() => {
                  setOpen(false);
                  onOpenJob(j.id);
                }}
              >
                <span className="jobs-status-dot" data-status={j.status} />
                <span className="jobs-row-main">
                  <span className="jobs-row-title">
                    {j.scope === "part" ? `Part ${j.scope_part}` : "全Part"} ・ {j.styles.join("/")}
                  </span>
                  <span className="jobs-row-meta">
                    {j.totals.completed}/{j.totals.total} ({j.status})
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
