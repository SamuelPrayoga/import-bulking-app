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

  it("does not strip 'Kota' outside DKI Jakarta, where Kota X and Kabupaten X can be different places", () => {
    // Real template data uses "KOTA BANDA ACEH" as the actual city name for Aceh, not a prefix to
    // strip — so this isn't testing a bug, just documenting the DKI-Jakarta-only scope.
    const city = findCityByNameAndProvince("Kota Banda Aceh", "Aceh");
    expect(city?.cityName).toBe("KOTA BANDA ACEH");
  });
});
