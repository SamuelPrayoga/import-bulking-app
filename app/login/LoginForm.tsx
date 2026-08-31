"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "../../components/ThemeToggle";

// Total time the loading screen holds before navigating, and the status-text beats within it.
const LOADING_DURATION_MS = 2000;
const LOADING_STEPS = [
  { at: 0, text: "Memverifikasi kredensial..." },
  { at: 700, text: "Menyiapkan dashboard..." },
  { at: 1400, text: "Hampir selesai..." },
];

function LoginLoadingScreen({ onDone }: { onDone: () => void }) {
  const [stepText, setStepText] = useState(LOADING_STEPS[0].text);
  const [progressActive, setProgressActive] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Flip on the next frame so the width transition (0 -> 100%) actually animates instead of
    // snapping straight to full — a CSS transition only plays across two separate render passes.
    const raf = requestAnimationFrame(() => setProgressActive(true));

    const stepTimers = LOADING_STEPS.slice(1).map(({ at, text }) =>
      setTimeout(() => setStepText(text), at)
    );
    const doneTimer = setTimeout(() => setDone(true), LOADING_DURATION_MS - 200);
    const navigateTimer = setTimeout(onDone, LOADING_DURATION_MS);

    return () => {
      cancelAnimationFrame(raf);
      stepTimers.forEach(clearTimeout);
      clearTimeout(doneTimer);
      clearTimeout(navigateTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="login-loading">
      <div className={`login-loading-icon ${done ? "is-done" : ""}`}>
        {done ? <CheckCircle2 size={26} /> : <ShieldCheck size={26} />}
        {!done && <span className="login-loading-ring" />}
      </div>
      <div className="login-loading-text">{done ? "Berhasil masuk" : stepText}</div>
      <div className="login-progress-track">
        <div
          className="login-progress-fill"
          style={{
            width: progressActive ? "100%" : "0%",
            transitionDuration: `${LOADING_DURATION_MS - 100}ms`,
          }}
        />
      </div>
    </div>
  );
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Gagal masuk. Coba lagi.");
        setLoading(false);
        return;
      }
      setSuccess(true);
      // Fetch the destination's data in the background while the loading screen plays, so the
      // router.push() at the end of it (see handleLoadingDone) can resolve near-instantly instead
      // of stacking a full RSC round-trip on top of the 1.5s the loading screen already takes.
      router.prefetch(searchParams.get("next") || "/");
    } catch {
      setError("Tidak bisa terhubung ke server. Coba lagi.");
      setLoading(false);
    }
  }

  function handleLoadingDone() {
    router.push(searchParams.get("next") || "/");
  }

  return (
    <div className="login-shell">
      <div style={{ position: "fixed", top: 20, right: 20 }}>
        <ThemeToggle />
      </div>
      <div className="login-card">
        {success ? (
          <LoginLoadingScreen onDone={handleLoadingDone} />
        ) : (
          <>
            <div className="login-brand">
              <span className="login-brand-icon">
                <ShieldCheck size={22} />
              </span>
              <div>
                <div className="login-brand-title">Cleansing Data Agen Perlinsos</div>
                <div className="login-brand-subtitle">Masuk untuk mengakses data submission</div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
              {error && (
                <div className="login-error">
                  <AlertCircle size={15} />
                  <span>{error}</span>
                </div>
              )}

              <label className="login-field">
                <span className="login-field-label">Email</span>
                <div className="login-input-wrap">
                  <Mail size={16} className="login-input-icon" />
                  <input
                    type="email"
                    autoComplete="username"
                    placeholder="admin@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </label>

              <label className="login-field">
                <span className="login-field-label">Password</span>
                <div className="login-input-wrap">
                  <Lock size={16} className="login-input-icon" />
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="login-toggle-visibility"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>

              <button type="submit" className="primary login-submit" disabled={loading}>
                {loading ? "Memproses..." : "Masuk"}
              </button>
            </form>
          </>
        )}
      </div>
      <p className="login-footnote">Akses terbatas untuk operator internal</p>
    </div>
  );
}
