import { describe, it, expect } from "vitest";
import { translate, formatPrice, localeForRegion, resolveRegion } from "../i18n";

describe("i18n", () => {
  describe("translate", () => {
    it("returns English strings for en locale", () => {
      expect(translate("en", "home.greeting_morning")).toBe("Good morning");
      expect(translate("en", "home.request_mechanic")).toBe("Request a Mechanic");
      expect(translate("en", "common.refresh")).toBe("Refresh");
    });

    it("returns Spanish strings for es-MX locale", () => {
      expect(translate("es-MX", "home.greeting_morning")).toBe("Buenos días");
      expect(translate("es-MX", "home.request_mechanic")).toContain("Solicitar");
      expect(translate("es-MX", "common.refresh")).toBe("Actualizar");
    });

    it("handles string interpolation", () => {
      const result = translate("en", "mechanic.years_short", { years: 5 });
      expect(result).toContain("5");
    });

    it("returns the key if translation not found", () => {
      const result = translate("en", "nonexistent.key" as any);
      expect(result).toBe("nonexistent.key");
    });
  });

  describe("formatPrice", () => {
    it("formats USD prices with $ symbol for US region", () => {
      expect(formatPrice(50, "US")).toBe("$50.00");
      expect(formatPrice(99.99, "US")).toBe("$99.99");
    });

    it("applies 60% discount for MX region", () => {
      // $100 USD → 40% of original = $40 USD → ~$700 MXN
      const result100 = formatPrice(100, "MX");
      expect(result100).toContain("MXN");
      expect(result100).toContain("700");
      const result50 = formatPrice(50, "MX");
      expect(result50).toContain("MXN");
      expect(result50).toContain("350");
    });

    it("formats MX prices with MXN currency symbol", () => {
      const result = formatPrice(100, "MX");
      // Should contain MXN and be the discounted amount in pesos (~700)
      expect(result).toContain("MXN");
      expect(result).toContain("700");
    });
  });

  describe("localeForRegion", () => {
    it("returns es-MX for MX region", () => {
      expect(localeForRegion("MX")).toBe("es-MX");
    });

    it("returns en for US region", () => {
      expect(localeForRegion("US")).toBe("en");
    });
  });

  describe("resolveRegion", () => {
    it("returns preference if set to a region", () => {
      expect(resolveRegion("MX", "US")).toBe("MX");
      expect(resolveRegion("US", "MX")).toBe("US");
    });

    it("returns detected country if preference is auto", () => {
      expect(resolveRegion("auto", "MX")).toBe("MX");
      expect(resolveRegion("auto", "US")).toBe("US");
    });

    it("defaults to US if detected is undefined", () => {
      expect(resolveRegion("auto", undefined as any)).toBe("US");
    });
  });
});
