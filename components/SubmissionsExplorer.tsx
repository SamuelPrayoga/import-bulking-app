"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import {
  ArrowDown,
  ArrowUp,
  Briefcase,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileWarning,
  MapPinX,
  MessageCircle,
  Search,
  UserRoundX,
  X,
  XCircle,
} from "lucide-react";
import type { SubmissionRecord } from "../types/index";
import { formatSheetStatusLabel, isSheetStatusDone } from "../lib/sheetStatus";
import { parseFormTimestamp } from "../lib/formTimestamp";

const PAGE_SIZE = 10;
type StatusFilter = "all" | "processed" | "failed";
type SheetFilter = "all" | "done" | "pending";
type FollowUpFilter = "all" | "done" | "pending";
type SortOrder = "desc" | "asc";

/** Shortens a long Jabatan/Instansi string to a handful of words for the list view; the full text is still in the title tooltip. */
function shortenInstansi(value: string, maxWords = 5): string {
  const words = value.trim().split(/\s+/);
  if (words.length <= maxWords) return value;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

/** Just the PIC's first name, uppercased, for a compact list view; the full name is in the title tooltip. */
function firstNameUpper(value: string): string {
  return (value.trim().split(/\s+/)[0] ?? "").toUpperCase();
}

export function SubmissionsExplorer({ submissions }: { submissions: SubmissionRecord[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = searchParams.get("q") ?? "";
  const statusFilter = (searchParams.get("status") as StatusFilter) ?? "all";
  const sheetFilter = (searchParams.get("sheet") as SheetFilter) ?? "all";
  const followUpFilter = (searchParams.get("followup") as FollowUpFilter) ?? "all";
  const kabKotaFilter = searchParams.get("kabkota") ?? "all";
  const nameMismatchFilter = searchParams.get("nameMismatch") === "1";
  const kabKotaAutoFixFilter = searchParams.get("kabkotaAutoFix") === "1";
  const jobFallbackFilter = searchParams.get("jobFallback") === "1";
  const sortOrder = (searchParams.get("sort") as SortOrder) ?? "desc";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  function updateParams(patch: Record<string, string | null>) {
    // Read the live URL rather than the `searchParams` from this render's closure — two filter
    // actions fired in quick succession (e.g. clicking a tab then typing) can otherwise race:
    // the second call would build on a stale snapshot from before the first one's replace()
    // landed and silently drop it.
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const totals = useMemo(() => {
    const totalValidRows = submissions.reduce((sum, s) => sum + s.validCount, 0);
    const totalInvalidRows = submissions.reduce((sum, s) => sum + s.invalidCount, 0);
    const failedCount = submissions.filter((s) => s.status === "failed").length;
    const sheetDoneCount = submissions.filter((s) => isSheetStatusDone(s.sheetStatus)).length;
    const nameMismatchCount = submissions.filter((s) => s.hasNameMismatch).length;
    const kabKotaAutoFixCount = submissions.filter((s) => s.hasKabKotaAutoFix).length;
    const jobFallbackCount = submissions.filter((s) => s.hasJobFallback).length;
    return { totalValidRows, totalInvalidRows, failedCount, sheetDoneCount, nameMismatchCount, kabKotaAutoFixCount, jobFallbackCount };
  }, [submissions]);

  const kabKotaOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of submissions) {
      const key = s.declaredKabKota || "(kosong)";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [submissions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return submissions.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (sheetFilter === "done" && !isSheetStatusDone(s.sheetStatus)) return false;
      if (sheetFilter === "pending" && isSheetStatusDone(s.sheetStatus)) return false;
      if (followUpFilter === "done" && !s.followedUpAt) return false;
      if (followUpFilter === "pending" && s.followedUpAt) return false;
      if (kabKotaFilter !== "all" && (s.declaredKabKota || "(kosong)") !== kabKotaFilter) return false;
      if (nameMismatchFilter && !s.hasNameMismatch) return false;
      if (kabKotaAutoFixFilter && !s.hasKabKotaAutoFix) return false;
      if (jobFallbackFilter && !s.hasJobFallback) return false;
      if (!q) return true;
      return (
        s.picName.toLowerCase().includes(q) ||
        s.instansi.toLowerCase().includes(q) ||
        s.declaredKabKota.toLowerCase().includes(q) ||
        s.declaredProvinsi.toLowerCase().includes(q)
      );
    });
  }, [submissions, query, statusFilter, sheetFilter, followUpFilter, kabKotaFilter, nameMismatchFilter, kabKotaAutoFixFilter, jobFallbackFilter]);

  const sorted = useMemo(() => {
    const withTime = filtered.map((s) => ({ s, t: parseFormTimestamp(s.timestamp) }));
    withTime.sort((a, b) => (sortOrder === "desc" ? b.t - a.t : a.t - b.t));
    return withTime.map((x) => x.s);
  }, [filtered, sortOrder]);

  const hasActiveFilters = Boolean(
    query ||
      statusFilter !== "all" ||
      sheetFilter !== "all" ||
      followUpFilter !== "all" ||
      kabKotaFilter !== "all" ||
      nameMismatchFilter ||
      kabKotaAutoFixFilter ||
      jobFallbackFilter
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <>
      <div className="panel">
        <div className="summary-grid">
          <div className="summary-item">
            <div className="value">{submissions.length}</div>
            <div className="label">Total Submission</div>
          </div>
          <div className="summary-item accent-valid">
            <div className="value">{totals.totalValidRows}</div>
            <div className="label">Baris Valid</div>
          </div>
          <div className="summary-item accent-invalid">
            <div className="value">{totals.totalInvalidRows}</div>
            <div className="label">Baris Tidak Valid</div>
          </div>
          <div className="summary-item accent-warning">
            <div className="value">{totals.failedCount}</div>
            <div className="label">Submission Gagal</div>
          </div>
          <div className="summary-item accent-valid">
            <div className="value">{totals.sheetDoneCount}</div>
            <div className="label">Done (Sheet)</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar-row">
          <h2 style={{ margin: 0 }}>Riwayat Submission</h2>
          <div className="search-box">
            <Search size={15} className="search-icon" />
            <input
              className="search-input"
              placeholder="Cari nama PIC, instansi, atau lokasi..."
              value={query}
              onChange={(e) => updateParams({ q: e.target.value, page: null })}
            />
          </div>
        </div>

        <div className="filter-row">
          <div className="filter-tabs">
            <button
              className={statusFilter === "all" ? "active" : ""}
              onClick={() => updateParams({ status: null, page: null })}
            >
              Semua ({submissions.length})
            </button>
            <button
              className={statusFilter === "processed" ? "active" : ""}
              onClick={() => updateParams({ status: "processed", page: null })}
            >
              <CheckCircle2 size={13} /> Reviewed ({submissions.length - totals.failedCount})
            </button>
            <button
              className={statusFilter === "failed" ? "active" : ""}
              onClick={() => updateParams({ status: "failed", page: null })}
            >
              <XCircle size={13} /> Failed ({totals.failedCount})
            </button>
          </div>

          <select
            className="select-filter"
            value={sheetFilter}
            onChange={(e) => updateParams({ sheet: e.target.value === "all" ? null : e.target.value, page: null })}
            aria-label="Filter Status Sheet"
          >
            <option value="all">Semua Status Sheet</option>
            <option value="done">Done</option>
            <option value="pending">Pending</option>
          </select>

          <select
            className="select-filter"
            value={followUpFilter}
            onChange={(e) => updateParams({ followup: e.target.value === "all" ? null : e.target.value, page: null })}
            aria-label="Filter Tindak Lanjut"
          >
            <option value="all">Semua Tindak Lanjut</option>
            <option value="done">Sudah Ditindaklanjuti</option>
            <option value="pending">Belum Ditindaklanjuti</option>
          </select>

          <select
            className="select-filter"
            value={kabKotaFilter}
            onChange={(e) => updateParams({ kabkota: e.target.value === "all" ? null : e.target.value, page: null })}
            aria-label="Filter Kab/Kota"
          >
            <option value="all">Semua Kab/Kota</option>
            {kabKotaOptions.map(([name, count]) => (
              <option key={name} value={name}>
                {name} ({count})
              </option>
            ))}
          </select>

          <div className="filter-tabs">
            <button
              className={nameMismatchFilter ? "active" : ""}
              onClick={() => updateParams({ nameMismatch: nameMismatchFilter ? null : "1", page: null })}
              title="Submission yang punya baris dengan NIK sama tapi nama berbeda dari submission sebelumnya"
            >
              <UserRoundX size={13} /> Nama Berbeda ({totals.nameMismatchCount})
            </button>
            <button
              className={kabKotaAutoFixFilter ? "active" : ""}
              onClick={() => updateParams({ kabkotaAutoFix: kabKotaAutoFixFilter ? null : "1", page: null })}
              title="Submission yang punya baris dengan Kota/Kabupaten diganti otomatis ke kab/kota PIC karena tidak sesuai Provinsi"
            >
              <MapPinX size={13} /> Kab/Kota Diganti ({totals.kabKotaAutoFixCount})
            </button>
            <button
              className={jobFallbackFilter ? "active" : ""}
              onClick={() => updateParams({ jobFallback: jobFallbackFilter ? null : "1", page: null })}
              title="Submission yang punya baris dengan JOB tidak dikenali, otomatis diganti ke 'Lainnya'"
            >
              <Briefcase size={13} /> JOB Diganti ({totals.jobFallbackCount})
            </button>
          </div>

          {hasActiveFilters && (
            <button onClick={() => router.replace(pathname, { scroll: false })}>
              <X size={13} /> Reset Filter
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <FileWarning size={28} strokeWidth={1.5} />
            <p>
              {submissions.length === 0
                ? 'Belum ada submission yang diproses. Klik "Tarik Data Baru" untuk mulai.'
                : "Tidak ada submission yang cocok dengan pencarian/filter ini."}
            </p>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      <button
                        className="th-sort"
                        onClick={() => updateParams({ sort: sortOrder === "desc" ? "asc" : null })}
                      >
                        Waktu Submit
                        {sortOrder === "desc" ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                      </button>
                    </th>
                    <th>PIC</th>
                    <th>Instansi</th>
                    <th>Lokasi (Form)</th>
                    <th>Status</th>
                    <th>Status Sheet</th>
                    <th>Valid</th>
                    <th>Tidak Valid</th>
                    <th title="Status Tindak Lanjut">
                      <MessageCircle size={13} />
                    </th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((s) => (
                    <tr key={s.id}>
                      <td>{s.timestamp}</td>
                      <td>
                        <span title={s.picName}>{firstNameUpper(s.picName)}</span>
                      </td>
                      <td>
                        <span className="truncate-cell" title={s.instansi}>
                          {shortenInstansi(s.instansi)}
                        </span>
                      </td>
                      <td>
                        {s.declaredProvinsi} - {s.declaredKabKota}
                      </td>
                      <td>
                        <span className="cell-icon-label">
                          {s.status === "failed" ? (
                            <span className="badge invalid">
                              <XCircle size={12} /> Failed
                            </span>
                          ) : (
                            <span className="badge valid">
                              <CheckCircle2 size={12} /> Reviewed
                            </span>
                          )}
                          {s.hasNameMismatch && (
                            <span
                              className="muted-icon"
                              title="Ada baris dengan NIK sama tapi nama berbeda dari submission sebelumnya — mohon verifikasi manual"
                              style={{ color: "var(--warning)" }}
                            >
                              <UserRoundX size={14} />
                            </span>
                          )}
                          {s.hasKabKotaAutoFix && (
                            <span
                              className="muted-icon"
                              title="Ada baris dengan Kota/Kabupaten diganti otomatis ke kab/kota PIC karena tidak sesuai Provinsi — mohon verifikasi manual"
                              style={{ color: "var(--warning)" }}
                            >
                              <MapPinX size={14} />
                            </span>
                          )}
                          {s.hasJobFallback && (
                            <span
                              className="muted-icon"
                              title="Ada baris dengan JOB tidak dikenali, otomatis diganti ke 'Lainnya' — mohon verifikasi manual"
                              style={{ color: "var(--warning)" }}
                            >
                              <Briefcase size={14} />
                            </span>
                          )}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${isSheetStatusDone(s.sheetStatus) ? "valid" : "warning"}`}>
                          {isSheetStatusDone(s.sheetStatus) ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                          {formatSheetStatusLabel(s.sheetStatus)}
                        </span>
                      </td>
                      <td>{s.validCount}</td>
                      <td>{s.invalidCount}</td>
                      <td>
                        {s.followedUpAt ? (
                          <span
                            style={{ color: "var(--valid)", display: "inline-flex" }}
                            title={`Sudah ditindaklanjuti: ${new Date(s.followedUpAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}`}
                          >
                            <CheckCircle2 size={15} />
                          </span>
                        ) : (
                          <span className="muted-icon" title="Belum ditindaklanjuti">
                            —
                          </span>
                        )}
                      </td>
                      <td>
                        <Link className="btn btn-sm" href={`/submissions/${s.id}?${searchParams.toString()}`}>
                          <Eye size={13} /> Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <span>
                Menampilkan {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} dari{" "}
                {filtered.length}
              </span>
              <div className="pages">
                <button disabled={currentPage <= 1} onClick={() => updateParams({ page: String(currentPage - 1) })}>
                  <ChevronLeft size={14} /> Sebelumnya
                </button>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => updateParams({ page: String(currentPage + 1) })}
                >
                  Selanjutnya <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
