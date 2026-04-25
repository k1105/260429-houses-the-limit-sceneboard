import type { Job } from "../types";

export function JobProgress({ job }: { job: Job | null }) {
  if (!job) return <div className="empty">準備中…</div>;
  const pct =
    job.totals.total === 0 ? 0 : Math.floor((job.totals.completed / job.totals.total) * 100);
  return (
    <div className="bulk-progress">
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: pct + "%" }} />
      </div>
      <div className="job-items">
        {job.items.map((it) => (
          <div key={`${it.cut_id}-${it.style}`} className={"job-row job-row-" + it.status}>
            <span className="job-cut">{it.cut_id}</span>
            <span className="job-style">{it.style}</span>
            <span className="job-status">{it.status}</span>
            <span className="job-detail" title={it.error ?? it.filename ?? ""}>
              {it.error ?? it.filename ?? ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function JobSummaryLine({ job }: { job: Job }) {
  return (
    <span className="bulk-summary">
      完了 {job.totals.completed}/{job.totals.total} ・ 成功{" "}
      <span className="ok">{job.totals.succeeded}</span> ・ 失敗{" "}
      <span className="ng">{job.totals.failed}</span> ・ スキップ{" "}
      <span className="mute">{job.totals.skipped}</span>
    </span>
  );
}
