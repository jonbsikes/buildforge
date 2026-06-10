import fs from "fs";
import path from "path";

let cached: Buffer | null = null;

/**
 * Reads the company logo from /public and returns it as a Buffer, suitable
 * for @react-pdf/renderer v4's <Image src={buffer}> prop. (Data-URL strings
 * render as corrupt in v4 — Buffer is the working path.)
 *
 * Logo source: `public/prairie-sky-logo.png` — replace that file to change
 * the logo on every PDF. Cached per runtime for serverless performance.
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

/**
 * Async logo resolver with an HTTP fallback for serverless deploys where
 * /public may not be present on the function's filesystem (static assets are
 * always served over HTTP). Pass the request origin (e.g. from
 * `new URL(req.url).origin`). Returns undefined when no logo can be resolved —
 * PDF documents then fall back to the company-name wordmark in brand blue.
 */
export async function resolveLogo(origin?: string): Promise<Buffer | undefined> {
  const fromFs = getLogo();
  if (fromFs) return fromFs;
  if (!origin) return undefined;
  try {
    const res = await fetch(`${origin}/prairie-sky-logo.png`);
    if (!res.ok) return undefined;
    cached = Buffer.from(await res.arrayBuffer());
    return cached;
  } catch {
    return undefined;
  }
}

// Back-compat alias used in earlier commits — still returns Buffer now.
export const getLogoDataUrl = getLogo;
