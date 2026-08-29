"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Search, XCircle } from "lucide-react";
import type { ValidatedRow } from "../types/index";

type Filter = "all" | "valid" | "invalid";
const PAGE_SIZE = 25;

export function RowsReviewTable({ rows }: { rows: ValidatedRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const validCount = rows.filter((r) => r.status === "valid").length;
  const invalidCount = rows.length - validCount;

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      return r.nama.toLowerCase().includes(q) || r.nik.includes(q) || r.kotaKabupaten.toLowerCase().includes(q);
    });
  }, [rows, filter, query]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function changeFilter(next: Filter) {
    setFilter(next);
    setPage(1);
  }

  return (
    <div>
      <div className="toolbar-row">
        <div className="filter-tabs" style={{ margin: 0 }}>
          <button className={filter === "all" ? "active" : ""} onClick={() => changeFilter("all")}>
            Semua ({rows.length})
          </button>
          <button className={filter === "valid" ? "active" : ""} onClick={() => changeFilter("valid")}>
            <CheckCircle2 size={13} /> Valid ({validCount})
          </button>
          <button className={filter === "invalid" ? "active" : ""} onClick={() => changeFilter("invalid")}>
            <XCircle size={13} /> Tidak Valid ({invalidCount})
          </button>
        </div>
        <div className="search-box">
          <Search size={15} className="search-icon" />
          <input
            className="search-input"
            placeholder="Cari nama, NIK, atau kota..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Baris</th>
              <th>Nama</th>
              <th>NIK</th>
              <th>No WA</th>
              <th>JOB</th>
              <th>Kota/Kabupaten</th>
              <th>Status</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.rowNumber} className={row.status === "invalid" ? "row-invalid" : ""}>
                <td>{row.rowNumber}</td>
                <td>{row.nama}</td>
                <td>{row.nik}</td>
                <td>{row.noWa}</td>
                <td>{row.job}</td>
                <td>{row.kotaKabupaten}</td>
                <td>
                  <span className={`badge ${row.status}`}>
                    {row.status === "valid" ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {row.status === "valid" ? "Valid" : "Tidak Valid"}
                  </span>
                </td>
                <td>
                  {row.errors.length > 0 && (
                    <ul className="errors-list">
                      {row.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredRows.length === 0 && <p className="muted">Tidak ada baris untuk filter/pencarian ini.</p>}
      </div>

      {filteredRows.length > 0 && (
        <div className="pagination">
          <span>
            Menampilkan {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredRows.length)} dari{" "}
            {filteredRows.length}
          </span>
          <div className="pages">
            <button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
              <ChevronLeft size={14} /> Sebelumnya
            </button>
            <button disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
              Selanjutnya <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
