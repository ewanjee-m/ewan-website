import { describe, expect, it } from "vitest";
import {
  analyzePngCrop,
  encodeSolidColorPng
} from "./fixtures/rpg-png-evidence";

describe("RPG PNG screenshot evidence", () => {
  it.each([0, 1, 2, 3, 4] as const)(
    "validates and reconstructs a bright RGBA PNG using filter %i",
    (filterType) => {
      const png = encodeSolidColorPng({
        width: 5,
        height: 4,
        color: [240, 180, 90, 255],
        filterType
      });

      expect(analyzePngCrop(png)).toEqual({
        width: 5,
        height: 4,
        blackPixelRatio: 0,
        sampledPixels: 20
      });
    }
  );

  it("classifies near-black and fully transparent pixels as black", () => {
    const nearBlack = encodeSolidColorPng({
      width: 3,
      height: 2,
      color: [16, 15, 0, 255]
    });
    const transparentBright = encodeSolidColorPng({
      width: 2,
      height: 2,
      color: [255, 255, 255, 0]
    });

    expect(analyzePngCrop(nearBlack).blackPixelRatio).toBe(1);
    expect(analyzePngCrop(transparentBright).blackPixelRatio).toBe(1);
  });

  it("rejects an invalid PNG signature", () => {
    const png = encodeSolidColorPng({
      width: 1,
      height: 1,
      color: [255, 255, 255, 255]
    });
    png[0] = 0;

    expect(() => analyzePngCrop(png)).toThrow("Invalid PNG signature");
  });

  it("rejects a chunk with a corrupted CRC", () => {
    const png = encodeSolidColorPng({
      width: 1,
      height: 1,
      color: [255, 255, 255, 255]
    });
    png[29] ^= 0xff;

    expect(() => analyzePngCrop(png)).toThrow(
      "PNG chunk CRC mismatch for IHDR"
    );
  });

  it("samples only the requested crop at the requested step", () => {
    const png = encodeSolidColorPng({
      width: 7,
      height: 6,
      color: [0, 0, 0, 255]
    });

    expect(
      analyzePngCrop(png, {
        x: 1,
        y: 1,
        width: 5,
        height: 4,
        sampleStep: 2
      })
    ).toEqual({
      width: 7,
      height: 6,
      blackPixelRatio: 1,
      sampledPixels: 6
    });
  });
});
