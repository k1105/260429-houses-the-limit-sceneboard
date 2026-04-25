import { useEffect, useRef, useState } from "react";
import type { Job } from "../types";
import { api } from "../api";
import { Modal } from "./Modal";
import { JobProgress, JobSummaryLine } from "./JobProgress";

type Props = {
  jobId: string;
  onClose: () => void;
  onCompleted?: () => Promise<void> | void;
};

export function JobMonitorModal({ jobId, onClose, onCompleted }: Props) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string>("");
  const pollRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    void load();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [jobId]);

  async function load() {
    try {
      const j = await api.getJob(jobId);
      setJob(j);
      if (j.status === "running") startPolling();
      else if (!completedRef.current) {
        completedRef.current = true;
        if (onCompleted) await onCompleted();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const j = await api.getJob(jobId);
        setJob(j);
        if (j.status !== "running") {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          if (!completedRef.current) {
            completedRef.current = true;
            if (onCompleted) await onCompleted();
          }
        }
      } catch {}
    }, 1000);
  }

  async function handleCancel() {
    try {
      await api.cancelJob(jobId);
    } catch {}
  }

  const title = job
    ? `ジョブ ${jobId.slice(0, 8)} — ${describeScope(job)} (${job.status})`
    : `ジョブ ${jobId.slice(0, 8)}`;

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <div className="bulk-footer">
          <div>{job ? <JobSummaryLine job={job} /> : error ? <span className="bulk-error">{error}</span> : null}</div>
          <div className="bulk-actions">
            {job?.status === "running" ? (
              <button className="btn btn-danger" onClick={handleCancel}>
                キャンセル
              </button>
            ) : (
              <button className="btn btn-primary" onClick={onClose}>
                閉じる
              </button>
            )}
          </div>
        </div>
      }
    >
      <JobProgress job={job} />
    </Modal>
  );
}

function describeScope(job: Job): string {
  if (job.scope === "part") return `Part ${job.scope_part}`;
  return "全Part";
}
