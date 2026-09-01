import { describe, expect, it } from "vitest";
import { findCityByNameAndProvince, findJobByName, findProvinceByName, normalizeName } from "./referenceData";

describe("normalizeName", () => {
  it("strips zero-width characters before comparing", () => {
    const withInvisibleChar = "⁠Pendamping PKH";
    expect(normalizeName(withInvisibleChar)).toBe("PENDAMPING PKH");
  });
});

describe("findJobByName", () => {
  it("matches 'Pendamping PKH' even with the zero-width character the template's dropdown injects", () => {
    const job = findJobByName("⁠Pendamping PKH");
    expect(job?.jobId).toBe("1");
  });

  it("resolves 'POLRI' (the institution's own name) to Bhabinkamtibmas (the actual position)", () => {
    const job = findJobByName("POLRI");
    expect(job?.jobName).toBe("Bhabinkamtibmas");
  });
});

describe("findProvinceByName", () => {
  it("resolves common short names/abbreviations to the official province name", () => {
    expect(findProvinceByName("DI Yogyakarta")?.provinceName).toBe("DAERAH ISTIMEWA YOGYAKARTA");
    expect(findProvinceByName("DIY")?.provinceName).toBe("DAERAH ISTIMEWA YOGYAKARTA");
    expect(findProvinceByName("Jogja")?.provinceName).toBe("DAERAH ISTIMEWA YOGYAKARTA");
    expect(findProvinceByName("NTB")?.provinceName).toBe("NUSA TENGGARA BARAT");
    expect(findProvinceByName("Jabar")?.provinceName).toBe("JAWA BARAT");
  });

  it("still matches the official name directly", () => {
    expect(findProvinceByName("Daerah Istimewa Yogyakarta")?.provinceName).toBe(
      "DAERAH ISTIMEWA YOGYAKARTA"
    );
  });
});

describe("findCityByNameAndProvince", () => {
  it("matches a DKI Jakarta city written with the natural 'Kota' prefix even though Master Data stores it bare", () => {
    const city = findCityByNameAndProvince("Kota Jakarta Selatan", "DKI Jakarta");
    expect(city?.cityName).toBe("JAKARTA SELATAN");
  });

  it("also matches the bare form directly", () => {
    const city = findCityByNameAndProvince("Jakarta Selatan", "DKI Jakarta");
    expect(city?.cityName).toBe("JAKARTA SELATAN");
  });

  it("resolves a province alias before matching the city", () => {
    const city = findCityByNameAndProvince("Gunungkidul", "DI Yogyakarta");
    expect(city?.cityName).toBe("GUNUNGKIDUL");
  });

  it("does not strip an input-side 'Kota' prefix outside DKI Jakarta, where Kota X and Kabupaten X can be different places", () => {
    // Real template data uses "KOTA BANDA ACEH" as the actual city name for Aceh, so this is a
    // direct exact match, not the DKI-only prefix-stripping fallback.
    const city = findCityByNameAndProvince("Kota Banda Aceh", "Aceh");
    expect(city?.cityName).toBe("KOTA BANDA ACEH");
  });

  it("matches a 'Kota X' entry when the PIC wrote the bare name without 'Kota', when unambiguous", () => {
    // Aceh has no separate "Sabang" kabupaten, so "SABANG" can only mean the city — this was
    // previously rejected as "Kota/Kabupaten tidak sesuai dengan Provinsi" despite being correct.
    const city = findCityByNameAndProvince("SABANG", "Aceh");
    expect(city?.cityName).toBe("KOTA SABANG");
  });

  it("does not let a bare name accidentally resolve to the wrong 'Kota X' when a same-named kabupaten already exists", () => {
    // Jawa Barat has both "KOTA BOGOR" and its own separate "BOGOR" kabupaten — the bare name must
    // keep meaning the kabupaten (its own exact entry), not get overwritten by the city alias.
    const city = findCityByNameAndProvince("Bogor", "Jawa Barat");
    expect(city?.cityName).toBe("BOGOR");
  });
});
