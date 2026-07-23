import { describe, expect, it } from "vitest";
import { GET } from "../app/favicon.ico/route";

describe("festival favicon", () => {
  it("serves a cacheable Japanese festival SVG from the conventional favicon URL", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "image/svg+xml; charset=utf-8"
    );
    expect(response.headers.get("cache-control")).toContain("max-age=86400");

    const body = await response.text();
    const document = new DOMParser().parseFromString(body, "image/svg+xml");
    const svg = document.querySelector("svg");

    expect(document.querySelector("parsererror")).toBeNull();
    expect(svg?.getAttribute("viewBox")).toBe("0 0 64 64");
    expect(svg?.getAttribute("aria-label")).toBe("Hanabi festival torii");
  });
});
