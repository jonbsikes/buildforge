import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // iPhone photos uploaded to field logs are commonly 2–5 MB;
      // the default 1 MB limit rejected them before they reached Supabase Storage.
      bodySizeLimit: "25mb",
    },
    // Keep RSC payloads for visited dynamic routes warm so back/forward and
    // revisits feel instant. revalidatePath calls in src/lib/cache.ts still
    // bust the cache the moment a mutation changes data.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
    optimizePackageImports: ["lucide-react"],
  },
  serverExternalPackages: [
    "@react-pdf/renderer",
    "@react-pdf/reconciler",
    "@react-pdf/layout",
    "@react-pdf/pdfkit",
    "@react-pdf/render",
    "@react-pdf/font",
    "@react-pdf/fns",
    "@react-pdf/primitives",
    "@react-pdf/image",
    "@react-pdf/stylesheet",
    "@react-pdf/textkit",
    "@react-pdf/types",
  ],
};

export default nextConfig;
