"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, CheckCircle2, DatabaseBackup } from "lucide-react";

export function BackupNowButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneName, setDoneName] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    setDoneName(null);
    try {
      const res = await fetch("/api/backup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal membuat backup");
      setDoneName(data.name);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button className="primary" onClick={handleClick} disabled={loading}>
        <DatabaseBackup size={14} className={loading ? "spin" : ""} />
        {loading ? "Membuat backup..." : "Backup Sekarang"}
      </button>
      {error && (
        <p className="alert danger" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertCircle size={14} /> Gagal: {error}
        </p>
      )}
      {doneName && (
        <p className="muted" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <CheckCircle2 size={14} className="muted-icon" /> Backup dibuat: {doneName}
        </p>
      )}
    </div>
  );
}
