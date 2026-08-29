"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, MessageCircle } from "lucide-react";

export function WhatsAppDraftPanel({ submissionId }: { submissionId: string }) {
  const [text, setText] = useState("");
  const [waLink, setWaLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/wa-message/${submissionId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
        } else {
          setText(data.text);
          setWaLink(data.waLink);
        }
      })
      .catch((err) => !cancelled && setError(String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  if (loading)
    return (
      <p className="muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Loader2 size={14} className="spin" /> Menyiapkan draft pesan...
      </p>
    );
  if (error)
    return (
      <p className="alert danger" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <AlertTriangle size={14} /> Gagal menyiapkan pesan: {error}
      </p>
    );

  return (
    <div>
      <textarea className="wa-text" readOnly value={text} />
      <div className="toolbar" style={{ marginTop: 10 }}>
        {waLink ? (
          <a className="btn primary" href={waLink} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={14} /> Buka WhatsApp
          </a>
        ) : (
          <span className="badge warning">
            <AlertTriangle size={12} /> No WA PIC tidak valid — kirim manual, cari kontak lain untuk PIC ini.
          </span>
        )}
      </div>
    </div>
  );
}
