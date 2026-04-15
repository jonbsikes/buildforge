import fs from "fs";
import path from "path";

let cached: string | null = null;

/**
 * Reads the Prairie Sky logo from /public and returns it as a data URL
 * suitable for @react-pdf/renderer's <Image src=...> prop.
 * Cached per runtime for serverless performance.
 */
export function getLogoDataUrl(): string | undefined {
  if (cached) return cached;
  try {
    const p = path.join(process.cwd(), "public", "prairie-sky-logo.png");
    const bytes = fs.readFileSync(p);
    cached = `data:image/png;base64,${bytes.toString("base64")}`;
    return cached;
  } catch {
    return undefined;
  }
}
