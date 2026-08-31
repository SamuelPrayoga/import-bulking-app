import Link from "next/link";
import { ArrowLeft, BarChart3, CheckCircle2, Eye, Search, XCircle } from "lucide-react";
import { getErrorFrequency, getProvinceBreakdown, getValidityTrend } from "../../../lib/analytics";
import { searchByNik } from "../../../lib/db";

export const dynamic = "force-dynamic";

function Bar({ pct, variant }: { pct: number; variant?: "invalid" }) {
  return (
    <div className="stat-bar-track">
      <div className={`stat-bar-fill ${variant ?? ""}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nikQuery = typeof params.nik === "string" ? params.nik.trim() : "";

  const errorFrequency = getErrorFrequency();
  const provinceBreakdown = getProvinceBreakdown();
  const trend = getValidityTrend();
  const nikHits = nikQuery ? searchByNik(nikQuery) : [];

  const maxErrorCount = Math.max(1, ...errorFrequency.map((e) => e.count));
  const maxProvinceSubmissions = Math.max(1, ...provinceBreakdown.map((p) => p.submissionCount));

  return (
    <>
      <p>
        <Link className="link" href="/">
          <ArrowLeft size={14} /> Kembali ke daftar submission
        </Link>
      </p>

      <div className="panel">
        <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <BarChart3 size={18} /> Dashboard Analitik
        </h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Ringkasan pola data dari seluruh submission yang sudah diproses.
        </p>

        <form action="/dashboard" method="get" className="search-box" style={{ maxWidth: 420 }}>
          <Search size={15} className="search-icon" />
          <input className="search-input" name="nik" placeholder="Cari NIK (boleh sebagian)..." defaultValue={nikQuery} />
        </form>

        {nikQuery && (
          <div style={{ marginTop: 16 }}>
            <p className="muted" style={{ margin: "0 0 8px" }}>
              {nikHits.length} baris ditemukan untuk &ldquo;{nikQuery}&rdquo;
              {nikHits.length === 200 && " (dibatasi 200 hasil pertama)"}
            </p>
            {nikHits.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>NIK</th>
                      <th>Nama</th>
                      <th>Status</th>
                      <th>PIC</th>
                      <th>Waktu Submit</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {nikHits.map((hit, i) => (
                      <tr key={`${hit.submissionId}-${hit.rowNumber}-${i}`}>
                        <td>{hit.nik}</td>
                        <td>{hit.nama}</td>
                        <td>
                          {hit.status === "valid" ? (
                            <span className="badge valid">
                              <CheckCircle2 size={12} /> Valid
                            </span>
                          ) : (
                            <span className="badge invalid">
                              <XCircle size={12} /> Tidak Valid
                            </span>
                          )}
                        </td>
                        <td>{hit.picName}</td>
                        <td>{hit.timestamp}</td>
                        <td>
                          <Link className="btn btn-sm" href={`/submissions/${hit.submissionId}`}>
                            <Eye size={13} /> Review
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Jenis Error Paling Sering</h3>
          {errorFrequency.length === 0 ? (
            <p className="muted">Belum ada baris tidak valid.</p>
          ) : (
            errorFrequency.slice(0, 10).map((e) => (
              <div className="stat-row" key={e.label}>
                <span className="stat-row-label" title={e.label}>
                  {e.label}
                </span>
                <Bar pct={(e.count / maxErrorCount) * 100} variant="invalid" />
                <span className="stat-row-value">{e.count}</span>
              </div>
            ))
          )}
        </div>

        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Submission per Provinsi</h3>
          {provinceBreakdown.length === 0 ? (
            <p className="muted">Belum ada data.</p>
          ) : (
            provinceBreakdown.map((p) => {
              const total = p.validRows + p.invalidRows;
              const validPct = total > 0 ? Math.round((p.validRows / total) * 100) : 0;
              return (
                <div className="stat-row" key={p.provinsi}>
                  <span className="stat-row-label" title={p.provinsi}>
                    {p.provinsi || "(kosong)"}
                  </span>
                  <Bar pct={(p.submissionCount / maxProvinceSubmissions) * 100} />
                  <span className="stat-row-value" title={`${p.validRows} valid, ${p.invalidRows} tidak valid`}>
                    {p.submissionCount} ({validPct}%)
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className="panel" style={{ gridColumn: "1 / -1" }}>
          <h3 style={{ marginTop: 0 }}>Tren Validitas per Hari</h3>
          {trend.length === 0 ? (
            <p className="muted">Belum ada data.</p>
          ) : (
            trend.map((t) => {
              const total = t.validCount + t.invalidCount;
              const validPct = total > 0 ? Math.round((t.validCount / total) * 100) : 0;
              return (
                <div className="stat-row" key={t.date}>
                  <span className="stat-row-label">{t.date}</span>
                  <Bar pct={validPct} />
                  <span className="stat-row-value" title={`${t.submissionCount} submission, ${t.validCount} valid, ${t.invalidCount} tidak valid`}>
                    {validPct}%
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
