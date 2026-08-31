import Link from "next/link";
import { BarChart3, DatabaseBackup, History, MessageCircle, ShieldCheck } from "lucide-react";
import { LogoutButton } from "../../components/LogoutButton";
import { ThemeToggle } from "../../components/ThemeToggle";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link href="/" className="app-brand">
          <span className="app-brand-icon">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h1>Cleansing Data Agen Perlinsos</h1>
            <div className="subtitle">Tarik, validasi, dan review data agen dari respons Google Form</div>
          </div>
        </Link>
        <div className="app-header-actions">
          <Link className="btn secondary btn-sm" href="/tindak-lanjut">
            <MessageCircle size={13} /> Tindak Lanjut
          </Link>
          <Link className="btn secondary btn-sm" href="/dashboard">
            <BarChart3 size={13} /> Dashboard
          </Link>
          <Link className="btn secondary btn-sm" href="/backups">
            <DatabaseBackup size={13} /> Backup
          </Link>
          <Link className="btn secondary btn-sm" href="/audit-log">
            <History size={13} /> Log Aktivitas
          </Link>
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
