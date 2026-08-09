import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = dirname(fileURLToPath(import.meta.url));

const assets = [
  { file: "icon.png", width: 512, height: 512 },
  { file: "apple-icon.png", width: 180, height: 180 },
  { file: "opengraph-image.png", width: 1200, height: 630 },
  { file: "twitter-image.png", width: 1200, height: 630 }
] as const;

const faviconSizes = [16, 32, 48, 64, 128, 256];

describe("frontoffice metadata assets", () => {
  it.each(assets)("ships $file with the expected PNG dimensions", ({ file, width, height }) => {
    const assetPath = join(appRoot, file);

    expect(existsSync(assetPath)).toBe(true);
    const png = readFileSync(assetPath);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(width);
    expect(png.readUInt32BE(20)).toBe(height);
  });

  it("ships the supplied YS Heng logo as a multi-resolution favicon", () => {
    const favicon = readFileSync(join(appRoot, "favicon.ico"));

    expect(favicon.subarray(0, 6)).toEqual(Buffer.from([0, 0, 1, 0, faviconSizes.length, 0]));
    faviconSizes.forEach((size, index) => {
      const entryOffset = 6 + index * 16;
      const encodedSize = size === 256 ? 0 : size;
      expect(favicon[entryOffset]).toBe(encodedSize);
      expect(favicon[entryOffset + 1]).toBe(encodedSize);
      expect(favicon.readUInt16LE(entryOffset + 4)).toBe(1);
      expect(favicon.readUInt16LE(entryOffset + 6)).toBe(32);
    });
  });
});
