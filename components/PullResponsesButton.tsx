"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Download, RefreshCw, Sparkles } from "lucide-react";
import type { PullResponsesResult } from "../lib/pullResponses";

export function PullResponsesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PullResponsesResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/pull-responses", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal menarik data");
      setResult(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <button className="primary" onClick={handleClick} disabled={loading}>
          <RefreshCw size={14} className={loading ? "spin" : ""} />
          {loading ? "Menarik data..." : "Tarik Data Baru"}
        </button>
        <a className="btn" href="/api/report">
          <Download size={14} /> Download Laporan Konsolidasi
        </a>
        <a className="btn secondary" href="/api/clean-export">
          <Sparkles size={14} /> Download Data Bersih (Gabungan)
        </a>
        <a className="btn secondary" href="/api/clean-export?pending=1">
          <Sparkles size={14} /> Download Data Bersih (Sheet Pending)
        </a>
      </div>

      {error && (
        <p className="alert danger" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertCircle size={14} /> Gagal: {error}
        </p>
      )}

      {result && (
        <p className="muted" style={{ marginTop: 10, display: "flex", alignItems: "flex-start", gap: 6 }}>
          <CheckCircle2 size={14} className="muted-icon" style={{ marginTop: 1 }} />
          <span>
            Selesai. Total respons: {result.totalResponses}, baru diproses: {result.newlyProcessed}
            {result.smartMapped > 0 && ` (${result.smartMapped} via deteksi otomatis)`}, sudah diproses
            sebelumnya: {result.alreadyProcessed}, gagal: {result.failed}
            {result.failed > 0 && (
              <> — {result.errors.map((e) => `${e.picName}: ${e.message}`).join("; ")}</>
            )}
          </span>
        </p>
      )}
    </div>
  );
}
