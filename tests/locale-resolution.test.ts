import { describe, expect, it } from "vitest";
import { resolveInitialLocale } from "../app/i18n/resolveLocale";

describe("initial language resolution", () => {
  it("prefers the saved choice, then browser languages, then English", () => {
    expect(
      resolveInitialLocale({
        savedLocale: "ja",
        acceptedLanguages: ["ko-KR", "en-US"]
      })
    ).toBe("ja");

    expect(
      resolveInitialLocale({
        savedLocale: "unsupported",
        acceptedLanguages: ["fr-FR", "ko-KR", "ja-JP"]
      })
    ).toBe("ko");

    expect(
      resolveInitialLocale({
        savedLocale: null,
        acceptedLanguages: ["fr-FR"]
      })
    ).toBe("en");
  });
});
