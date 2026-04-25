import { useEffect, useRef, useState } from "react";
import type { ImageStyle, Job } from "../types";
import { IMAGE_STYLES, MODEL_OPTIONS } from "../types";
import { api } from "../api";
import { Modal } from "./Modal";
import { JobProgress, JobSummaryLine } from "./JobProgress";

type Props = {
  partNumber: number;
  partName: string;
  onClose: () => void;
  onCompleted: () => Promise<void> | void;
};

export function BulkGenerateModal({ partNumber, partName, onClose, onCompleted }: Props) {
  const [phase, setPhase] = useState<"setup" | "running">("setup");
  const [styles, setStyles] = useState<Record<ImageStyle, boolean>>({
    illustration: true,
    game: true,
    camera: true,
  });
  const [model, setModel] = useState<string>(MODEL_OPTIONS[0]);
  const [force, setForce] = useState(false);
  const [concurrency, setConcurrency] = useState(2);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string>("");
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  async function handleStart() {
    setError("");
    const selectedStyles = (Object.keys(styles) as ImageStyle[]).filter((s) => styles[s]);
    if (selectedStyles.length === 0) {
      setError("少なくとも1つのスタイルを選択してください");
      return;
    }
    try {
      const res = await api.bulkGenerate({
        scope: "part",
        part: partNumber,
        styles: selectedStyles,
        model,
        force,
        concurrency,
      });
      setJob(res.job);
      setPhase("running");
      startPolling(res.job.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function startPolling(jobId: string) {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const j = await api.getJob(jobId);
        setJob(j);
        if (j.status !== "running") {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          await onCompleted();
        }
      } catch (e) {
        // keep polling on transient errors
      }
    }, 1000);
  }

  async function handleCancel() {
    if (!job) return;
    try {
      await api.cancelJob(job.id);
    } catch {}
  }

  return (
    <Modal
      title={
        phase === "setup"
          ? `Part ${partNumber} 一括生成 — ${partName}`
          : `生成中… Part ${partNumber}`
      }
      onClose={onClose}
      footer={
        phase === "setup" ? (
          <div className="bulk-footer">
            <div className="bulk-error">{error}</div>
            <div className="bulk-actions">
              <button className="btn" onClick={onClose}>
                キャンセル
              </button>
              <button className="btn btn-primary" onClick={handleStart}>
                開始
              </button>
            </div>
          </div>
        ) : (
          <div className="bulk-footer">
            <div>{job ? <JobSummaryLine job={job} /> : null}</div>
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
        )
      }
    >
      {phase === "setup" ? (
        <SetupView
          styles={styles}
          setStyles={setStyles}
          model={model}
          setModel={setModel}
          force={force}
          setForce={setForce}
          concurrency={concurrency}
          setConcurrency={setConcurrency}
        />
      ) : (
        <JobProgress job={job} />
      )}
    </Modal>
  );
}

function SetupView(props: {
  styles: Record<ImageStyle, boolean>;
  setStyles: (s: Record<ImageStyle, boolean>) => void;
  model: string;
  setModel: (m: string) => void;
  force: boolean;
  setForce: (b: boolean) => void;
  concurrency: number;
  setConcurrency: (n: number) => void;
}) {
  return (
    <div className="bulk-setup">
      <div className="field">
        <label>スタイル</label>
        <div className="checkbox-row">
          {IMAGE_STYLES.map((s) => (
            <label key={s} className="checkbox-label">
              <input
                type="checkbox"
                checked={props.styles[s]}
                onChange={(e) => props.setStyles({ ...props.styles, [s]: e.target.checked })}
              />
              {s}
            </label>
          ))}
        </div>
      </div>
      <div className="field">
        <label>モデル</label>
        <select value={props.model} onChange={(e) => props.setModel(e.target.value)}>
          {MODEL_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>並列数</label>
        <input
          type="number"
          min={1}
          max={8}
          value={props.concurrency}
          onChange={(e) =>
            props.setConcurrency(Math.max(1, Math.min(8, Number(e.target.value) || 1)))
          }
        />
      </div>
      <div className="field field-full">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={props.force}
            onChange={(e) => props.setForce(e.target.checked)}
          />
          既存セルも再生成（チェックなしの場合は未生成セルのみ）
        </label>
      </div>
    </div>
  );
}

