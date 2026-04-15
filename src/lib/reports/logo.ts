import fs from "fs";
import path from "path";

let cached: Buffer | null = null;

/**
 * Reads the Prairie Sky logo from /public and returns it as a Buffer,
 * suitable for @react-pdf/renderer v4's <Image src={buffer}> prop.
 * (Data-URL strings render as corrupt in v4 — Buffer is the working path.)
 * Cached per runtime for serverless performance.
 */
export function getLogo(): Buffer | undefined {
  if (cached) return cached;
  try {
    const p = path.join(process.cwd(), "public", "prairie-sky-logo.png");
    cached = fs.readFileSync(p);
    return cached;
  } catch {
    return undefined;
  }
}

// Back-compat alias used in earlier commits — still returns Buffer now.
export const getLogoDataUrl = getLogo;
