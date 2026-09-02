import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, Download, FileText, MessageCircle, Sparkles } from "lucide-react";
import { getSubmission, getSubmissionRows } from "../../../../lib/db";
import { RowsReviewTable } from "../../../../components/RowsReviewTable";
import { WhatsAppDraftPanel } from "../../../../components/WhatsAppDraftPanel";
import { formatSheetStatusLabel, isSheetStatusDone } from "../../../../lib/sheetStatus";

export const dynamic = "force-dynamic";

export default async function SubmissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const submission = await getSubmission(id);
  if (!submission) notFound();

  const rows = await getSubmissionRows(id);

  // Preserve the list page's search/filter/page state — the Review link on the list carries its
  // own query string forward here, so bouncing "back" returns to the same filtered view.
  const backParams = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") backParams.set(key, value);
  }
  const backHref = backParams.toString() ? `/?${backParams.toString()}` : "/";

  return (
    <>
      <p>
        <Link className="link" href={backHref}>
          <ArrowLeft size={14} /> Kembali ke daftar submission
        </Link>
      </p>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>{submission.picName}</h2>
        <p className="muted">
          {submission.instansi} · {submission.declaredProvinsi} - {submission.declaredKabKota} ·{" "}
          {submission.timestamp}
        </p>
        <div className="toolbar">
          <span className={`badge ${isSheetStatusDone(submission.sheetStatus) ? "valid" : "warning"}`}>
            {isSheetStatusDone(submission.sheetStatus) ? <CheckCircle2 size={12} /> : <Clock size={12} />}
            {formatSheetStatusLabel(submission.sheetStatus)}
          </span>
          {submission.importMethod === "smart-mapped" && (
            <span className="badge warning">
              <Sparkles size={12} /> Deteksi Otomatis (Skor: {submission.mappingScore}%)
            </span>
          )}
          {submission.followedUpAt && (
            <span
              className="badge valid"
              title={`Ditandai otomatis saat laporan di-download & WhatsApp dibuka: ${new Date(
                submission.followedUpAt
              ).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}`}
            >
              <MessageCircle size={12} /> Sudah Ditindaklanjuti
            </span>
          )}
        </div>

        <div className="summary-grid">
          <div className="summary-item">
            <div className="value">{submission.validCount}</div>
            <div className="label">Baris Valid</div>
          </div>
          <div className="summary-item">
            <div className="value">{submission.invalidCount}</div>
            <div className="label">Baris Tidak Valid</div>
          </div>
          <div className="summary-item">
            <div className="value">{submission.fileProvinsi ?? "-"}</div>
            <div className="label">Provinsi di File</div>
          </div>
        </div>

        {(submission.status === "failed" ||
          submission.locationMismatch ||
          !submission.picWhatsappValid) && (
          <div className="notes-section">
            <h3>Catatan</h3>
            {submission.status === "failed" && (
              <p className="alert danger">
                Submission ini gagal diproses: {submission.errorMessage ?? "penyebab tidak diketahui"}
              </p>
            )}
            {submission.locationMismatch && (
              <p className="alert warning">
                Provinsi di dalam file ({submission.fileProvinsi ?? "-"}) tidak sesuai dengan yang
                didaftarkan di Form ({submission.declaredProvinsi})
              </p>
            )}
            {!submission.picWhatsappValid && (
              <p className="alert warning">No WA PIC ({submission.picWhatsapp}) tidak valid</p>
            )}
          </div>
        )}

        <div className="toolbar" style={{ marginTop: 16 }}>
          {submission.status === "processed" && (
            <a className="btn secondary" href={`/api/clean-export?submissionId=${submission.id}`}>
              <Sparkles size={14} /> Download Data Bersih (sesuai template)
            </a>
          )}
          <a className="btn" href={`/api/report?submissionId=${submission.id}`}>
            <Download size={14} /> Download Laporan Review
          </a>
        </div>
      </div>

      {submission.status === "processed" && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Review Data Agen</h3>
          <RowsReviewTable rows={rows} />
        </div>
      )}

      <div className="panel">
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <FileText size={16} /> Draft Pesan WhatsApp ke PIC
        </h3>
        <WhatsAppDraftPanel submissionId={submission.id} />
      </div>
    </>
  );
}
