import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { LogoutButton } from "../../components/LogoutButton";

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
        <LogoutButton />
      </header>
      <main>{children}</main>
    </div>
  );
}
