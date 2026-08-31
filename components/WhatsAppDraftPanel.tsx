"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, MessageCircle } from "lucide-react";

/**
 * WhatsApp's wa.me click-to-chat links only support pre-filled text — there's no way to attach a
 * file through the link itself (that would need the full WhatsApp Business API, which the project
 * deliberately avoided so sending stays a manual, operator-reviewed action). This works around
 * that: trigger the report download and open the WA chat in the same synchronous click handler,
 * so the operator just has to drag the file that's already in their Downloads into the chat that's
 * already open. Both calls have to stay synchronous (no `await` between them) or the browser's
 * popup blocker can silently swallow the window.open().
 *
 * This click is also treated as the "followed up with this PIC" signal — there's no separate
 * mark-as-followed-up button; taking the actual follow-up action (downloading the report and
 * opening the chat) is what marks it, so there's nothing extra for the operator to remember.
 */
function downloadReportAndOpenWhatsApp(submissionId: string, waLink: string): Promise<unknown> {
  const a = document.createElement("a");
  a.href = `/api/report?submissionId=${submissionId}`;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  window.open(waLink, "_blank", "noopener,noreferrer");

  return fetch(`/api/submissions/${submissionId}/follow-up`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ followedUp: true }),
  }).catch(() => {});
}

export function WhatsAppDraftPanel({ submissionId }: { submissionId: string }) {
  const router = useRouter();
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
          <button
            className="primary"
            onClick={() => downloadReportAndOpenWhatsApp(submissionId, waLink).then(() => router.refresh())}
          >
            <MessageCircle size={14} /> Download Laporan &amp; Buka WhatsApp
          </button>
        ) : (
          <span className="badge warning">
            <AlertTriangle size={12} /> No WA PIC tidak valid — kirim manual, cari kontak lain untuk PIC ini.
          </span>
        )}
      </div>
      {waLink && (
        <p className="muted" style={{ marginTop: 8, fontSize: 12.5 }}>
          Laporan otomatis ke-download dan chat WhatsApp langsung terbuka dengan draft pesan di
          atas — tinggal tarik (drag) file laporan yang baru ke-download ke chat itu, lalu kirim.
          Submission ini otomatis ditandai sudah ditindaklanjuti.
        </p>
      )}
    </div>
  );
}
