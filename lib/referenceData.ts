import type { CityRef, JobRef, ProvinceRef, ReferenceData } from "../types/index";
import referenceDataJson from "../data/referenceData.json" with { type: "json" };

const referenceData = referenceDataJson as ReferenceData;

// Zero-width/invisible unicode code points. The source template's Master Data sheet has one of
// these (U+2060 WORD JOINER) baked into the "Pendamping PKH" dropdown option, so any submitted
// file where a PIC picked that option from the dropdown carries the same invisible character —
// it must be stripped here (not just in the reference-data extraction script) or the two never
// match.
const INVISIBLE_CODE_POINTS = [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff];
const INVISIBLE_CHARS_RE = new RegExp(
  `[${INVISIBLE_CODE_POINTS.map((cp) => String.fromCharCode(cp)).join("")}]`,
  "g"
);

export function normalizeName(value: string): string {
  return value.replace(INVISIBLE_CHARS_RE, "").trim().toUpperCase().replace(/\s+/g, " ");
}

const provincesByName = new Map<string, ProvinceRef>();
for (const p of referenceData.provinces) {
  provincesByName.set(normalizeName(p.provinceName), p);
}

const citiesByNameAndProvince = new Map<string, CityRef>();
for (const c of referenceData.cities) {
  citiesByNameAndProvince.set(`${normalizeName(c.provinceName)}::${normalizeName(c.cityName)}`, c);
}

const jobsByName = new Map<string, JobRef>();
for (const j of referenceData.jobs) {
  jobsByName.set(normalizeName(j.jobName), j);
}

// PICs commonly write a province's everyday abbreviation/short name rather than the official
// BPS/Kemendagri name our Master Data uses verbatim (e.g. "DI Yogyakarta" vs "DAERAH ISTIMEWA
// YOGYAKARTA") — each alias maps to exactly one real province, so there's no ambiguity risk in
// resolving them before the exact-match lookup.
const PROVINCE_ALIASES: Record<string, string> = {
  "DI YOGYAKARTA": "DAERAH ISTIMEWA YOGYAKARTA",
  DIY: "DAERAH ISTIMEWA YOGYAKARTA",
  YOGYAKARTA: "DAERAH ISTIMEWA YOGYAKARTA",
  JOGJA: "DAERAH ISTIMEWA YOGYAKARTA",
  JOGJAKARTA: "DAERAH ISTIMEWA YOGYAKARTA",
  DKI: "DKI JAKARTA",
  JAKARTA: "DKI JAKARTA",
  NTB: "NUSA TENGGARA BARAT",
  NTT: "NUSA TENGGARA TIMUR",
  KEPRI: "KEPULAUAN RIAU",
  BABEL: "KEP. BANGKA BELITUNG",
  "BANGKA BELITUNG": "KEP. BANGKA BELITUNG",
  "KEPULAUAN BANGKA BELITUNG": "KEP. BANGKA BELITUNG",
  JABAR: "JAWA BARAT",
  JATENG: "JAWA TENGAH",
  JATIM: "JAWA TIMUR",
  SUMUT: "SUMATERA UTARA",
  SUMBAR: "SUMATERA BARAT",
  SUMSEL: "SUMATERA SELATAN",
  KALBAR: "KALIMANTAN BARAT",
  KALTENG: "KALIMANTAN TENGAH",
  KALSEL: "KALIMANTAN SELATAN",
  KALTIM: "KALIMANTAN TIMUR",
  KALTARA: "KALIMANTAN UTARA",
  SULUT: "SULAWESI UTARA",
  SULSEL: "SULAWESI SELATAN",
  SULTENG: "SULAWESI TENGAH",
  SULTRA: "SULAWESI TENGGARA",
  SULBAR: "SULAWESI BARAT",
  MALUT: "MALUKU UTARA",
};

function resolveProvinceName(provinceName: string): string {
  const normalized = normalizeName(provinceName);
  return PROVINCE_ALIASES[normalized] ?? normalized;
}

export function findProvinceByName(provinceName: string): ProvinceRef | undefined {
  return provincesByName.get(resolveProvinceName(provinceName));
}

export function findCityByNameAndProvince(
  cityName: string,
  provinceName: string
): CityRef | undefined {
  const canonicalProvince = resolveProvinceName(provinceName);
  const normalizedCity = normalizeName(cityName);

  const direct = citiesByNameAndProvince.get(`${canonicalProvince}::${normalizedCity}`);
  if (direct) return direct;

  // DKI Jakarta's 5 administrative cities are stored in Master Data without a "Kota" prefix
  // (e.g. "JAKARTA SELATAN"), unlike most other regions ("KOTA BANDA ACEH") — a PIC writing the
  // more natural "Kota Jakarta Selatan" otherwise never matches. Safe to strip only for DKI
  // Jakarta specifically: its one regency is "Kepulauan Seribu", so there's no bare-name Kota vs
  // Kabupaten pair here that stripping could confuse (unlike e.g. "Bogor", which is both a Kota
  // and a separate Kabupaten in Jawa Barat).
  if (canonicalProvince === "DKI JAKARTA" && normalizedCity.startsWith("KOTA ")) {
    return citiesByNameAndProvince.get(`${canonicalProvince}::${normalizedCity.slice(5)}`);
  }

  return undefined;
}

export function findJobByName(jobName: string): JobRef | undefined {
  return jobsByName.get(normalizeName(jobName));
}

export function listJobNames(): string[] {
  return referenceData.jobs.map((j) => j.jobName);
}

export { referenceData };
