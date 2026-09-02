import Link from "next/link";
import { AlertTriangle, ArrowLeft, Eye, MessageCircle } from "lucide-react";
import { getPendingFollowUps } from "../../../lib/db";

export const dynamic = "force-dynamic";

export default async function FollowUpQueuePage() {
  const pending = await getPendingFollowUps();

  return (
    <>
      <p>
        <Link className="link" href="/">
          <ArrowLeft size={14} /> Kembali ke daftar submission
        </Link>
      </p>

      <div className="panel">
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <MessageCircle size={18} /> Perlu Ditindaklanjuti
        </h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Submission yang sudah diproses tapi belum di-WA ke PIC-nya, terurut dari yang paling
          lama menunggu. Klik &ldquo;Review &amp; WA&rdquo; untuk membuka draft pesan — submission
          otomatis ditandai selesai begitu laporan di-download &amp; WhatsApp dibuka dari sana.
        </p>

        {pending.length === 0 ? (
          <p className="muted">Tidak ada yang mengantre — semua submission sudah ditindaklanjuti.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Waktu Submit</th>
                  <th>PIC</th>
                  <th>Instansi</th>
                  <th>Lokasi (Form)</th>
                  <th>Valid</th>
                  <th>Tidak Valid</th>
                  <th>WA PIC</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((s) => (
                  <tr key={s.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{s.timestamp}</td>
                    <td title={s.picName}>{s.picName}</td>
                    <td>
                      <span className="truncate-cell" title={s.instansi}>
                        {s.instansi}
                      </span>
                    </td>
                    <td>
                      {s.declaredProvinsi} - {s.declaredKabKota}
                    </td>
                    <td>{s.validCount}</td>
                    <td>{s.invalidCount}</td>
                    <td>
                      {s.picWhatsappValid ? (
                        s.picWhatsapp
                      ) : (
                        <span className="badge warning">
                          <AlertTriangle size={12} /> Tidak valid
                        </span>
                      )}
                    </td>
                    <td>
                      <Link className="btn btn-sm" href={`/submissions/${s.id}`}>
                        <Eye size={13} /> Review &amp; WA
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
