"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { ThemeToggle } from "../../components/ThemeToggle";
import type { PublicSubmissionStatus } from "../../lib/publicStatus";

type LookupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "not-found" }
  | { kind: "found"; results: PublicSubmissionStatus[] };

interface Captcha {
  question: string;
  token: string;
}

export function PublicStatusLookup() {
  const [email, setEmail] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const [state, setState] = useState<LookupState>({ kind: "idle" });

  async function refreshCaptcha() {
    try {
      const res = await fetch("/api/public-status/captcha");
      const data = await res.json();
      setCaptcha(data);
      setCaptchaAnswer("");
    } catch {
      setCaptcha(null);
    }
  }

  useEffect(() => {
    refreshCaptcha();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!captcha) return;
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/public-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, captchaToken: captcha.token, captchaAnswer }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: data.error ?? "Terjadi kesalahan, silakan coba lagi." });
      } else {
        const results: PublicSubmissionStatus[] = data.results ?? [];
        setState(results.length === 0 ? { kind: "not-found" } : { kind: "found", results });
      }
    } catch {
      setState({ kind: "error", message: "Gagal terhubung ke server, silakan coba lagi." });
    } finally {
      refreshCaptcha();
    }
  }

  return (
    <div className="login-shell">
      <div style={{ position: "fixed", top: 20, right: 20 }}>
        <ThemeToggle />
      </div>

      <div className="login-card" style={{ maxWidth: 480 }}>
        <div className="login-brand">
          <span className="login-brand-icon">
            <ShieldCheck size={22} />
          </span>
          <div>
            <div className="login-brand-title">Dashboard Publik Agen Perlinsos</div>
            <div className="login-brand-subtitle">
              Cek status submission Anda tanpa perlu menghubungi admin
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label className="login-field-label" htmlFor="email">
              Email (sesuai yang diisi di Form)
            </label>
            <div className="login-input-wrap">
              <span className="login-input-icon">
                <Mail size={15} />
              </span>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                required
              />
            </div>
          </div>

          <div className="login-field">
            <label className="login-field-label" htmlFor="captchaAnswer">
              Berapa hasil dari {captcha ? captcha.question : "..."}?
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <div className="login-input-wrap" style={{ flex: 1 }}>
                <input
                  id="captchaAnswer"
                  type="text"
                  inputMode="numeric"
                  value={captchaAnswer}
                  onChange={(e) => setCaptchaAnswer(e.target.value)}
                  placeholder="Jawaban"
                  style={{ paddingLeft: 12 }}
                  required
                />
              </div>
              <button
                type="button"
                className="btn-sm"
                onClick={refreshCaptcha}
                title="Ganti pertanyaan"
                aria-label="Ganti pertanyaan captcha"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          <button className="primary login-submit" type="submit" disabled={state.kind === "loading" || !captcha}>
            {state.kind === "loading" ? (
              <>
                <Loader2 size={15} className="spin" /> Mencari...
              </>
            ) : (
              <>
                <Search size={15} /> Cek Status
              </>
            )}
          </button>
        </form>

        <p className="login-footnote" style={{ marginTop: 14 }}>
          Email harus persis sama dengan yang Anda isi saat submit data melalui Google Form. Data
          ini hanya menampilkan status submission Anda sendiri.
        </p>
      </div>

      {state.kind === "error" && (
        <div className="login-card" style={{ maxWidth: 480, marginTop: 16 }}>
          <p className="login-error">
            <AlertCircle size={15} /> {state.message}
          </p>
        </div>
      )}

      {state.kind === "not-found" && (
        <div className="login-card" style={{ maxWidth: 480, marginTop: 16 }}>
          <p className="login-error">
            <AlertCircle size={15} /> Tidak ditemukan submission dengan email tersebut. Pastikan
            email persis sama dengan yang diisi di Form, atau hubungi admin kalau merasa ini keliru.
          </p>
        </div>
      )}

      {state.kind === "found" && (
        <div style={{ width: "100%", maxWidth: 560, marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {state.results.map((r) => (
            <div className="panel" key={r.submissionId} style={{ margin: 0 }}>
              <div className="toolbar-row" style={{ marginBottom: 8 }}>
                <span className="muted">Submission {r.timestamp}</span>
                {r.status === "failed" ? (
                  <span className="badge invalid">
                    <XCircle size={12} /> Gagal Diproses
                  </span>
                ) : r.invalidCount === 0 ? (
                  <span className="badge valid">
                    <CheckCircle2 size={12} /> Aktif
                  </span>
                ) : (
                  <span className="badge warning">
                    <AlertTriangle size={12} /> Perlu Perbaikan Data
                  </span>
                )}
              </div>

              {r.status === "failed" ? (
                <p className="alert danger">{r.errorMessage ?? "Penyebab tidak diketahui."}</p>
              ) : (
                <>
                  <div className="summary-grid">
                    <div className="summary-item accent-valid compact-value">
                      <div className="value">{r.validCount}</div>
                      <div className="label">Baris Valid (Aktif)</div>
                    </div>
                    <div className="summary-item accent-invalid compact-value">
                      <div className="value">{r.invalidCount}</div>
                      <div className="label">Baris Tidak Valid</div>
                    </div>
                  </div>

                  {r.locationMismatch && (
                    <p className="alert warning" style={{ marginTop: 10 }}>
                      Provinsi di dalam file tidak sesuai dengan yang didaftarkan di Form.
                    </p>
                  )}

                  {r.invalidCategories.length > 0 && (
                    <div className="notes-section">
                      <h3>Ringkasan Penyebab Tidak Valid</h3>
                      <ul className="errors-list">
                        {r.invalidCategories.map((c) => (
                          <li key={c.category}>
                            {c.category}: {c.count} baris
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {r.invalidCount === 0 && (
                    <p className="muted" style={{ marginTop: 10 }}>
                      Semua data pada submission ini sudah aktif sebagai Agen Perlinsos.
                    </p>
                  )}

                  {r.validCount > 0 && (
                    <div className="toolbar" style={{ marginTop: 14 }}>
                      <a
                        className="btn secondary btn-sm"
                        href={`/api/public-status/download?submissionId=${encodeURIComponent(r.submissionId)}&email=${encodeURIComponent(email)}`}
                      >
                        <Download size={13} /> Download Data Bersih
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
