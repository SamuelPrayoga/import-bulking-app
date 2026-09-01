"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, MessageCircle } from "lucide-react";

/**
 * Opens the WA chat with the draft pre-filled. The report file itself is downloaded separately via
 * the "Download Laporan Review" button above (on the submission detail page) — this used to also
 * trigger that download automatically, but that's a separate, manual step now.
 *
 * This click is also treated as the "followed up with this PIC" signal — there's no separate
 * mark-as-followed-up button; opening the chat is what marks it, so there's nothing extra for the
 * operator to remember.
 */
function openWhatsApp(submissionId: string, waLink: string): Promise<{ sheetUpdateError: string | null } | undefined> {
  window.open(waLink, "_blank", "noopener,noreferrer");

  return fetch(`/api/submissions/${submissionId}/follow-up`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ followedUp: true }),
  })
    .then((res) => res.json())
    .catch(() => undefined);
}

export function WhatsAppDraftPanel({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [waLink, setWaLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetUpdateWarning, setSheetUpdateWarning] = useState<string | null>(null);

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
          <button
            className="primary"
            onClick={() =>
              openWhatsApp(submissionId, waLink).then((result) => {
                setSheetUpdateWarning(result?.sheetUpdateError ?? null);
                router.refresh();
              })
            }
          >
            <MessageCircle size={14} /> Buka WhatsApp
          </button>
        ) : (
          <span className="badge warning">
            <AlertTriangle size={12} /> No WA PIC tidak valid — kirim manual, cari kontak lain untuk PIC ini.
          </span>
        )}
      </div>
      {waLink && (
        <p className="muted" style={{ marginTop: 8, fontSize: 12.5 }}>
          Chat WhatsApp langsung terbuka dengan draft pesan di atas — kalau perlu lampirkan
          laporan, download dulu lewat tombol "Download Laporan Review" di atas, lalu tarik (drag)
          filenya ke chat itu. Submission ini otomatis ditandai sudah ditindaklanjuti, dan kolom
          Status (K) di Google Sheet otomatis diisi "Done".
        </p>
      )}
      {sheetUpdateWarning && (
        <p className="alert warning" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertTriangle size={14} /> Status lokal sudah tersimpan, tapi gagal update kolom Status
          (K) di Google Sheet: {sheetUpdateWarning}. Cek apakah service account sudah punya akses
          Editor ke Sheet-nya.
        </p>
      )}
    </div>
  );
}
