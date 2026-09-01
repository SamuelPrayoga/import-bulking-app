import type { Metadata } from "next";
import { PublicStatusLookup } from "./PublicStatusLookup";

export const metadata: Metadata = {
  title: "Dashboard Publik — Cleansing Data Agen Perlinsos",
};

export const dynamic = "force-dynamic";

export default function DashboardPublikPage() {
  return <PublicStatusLookup />;
}
