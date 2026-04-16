import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // iPhone photos uploaded to field logs are commonly 2–5 MB;
      // the default 1 MB limit rejected them before they reached Supabase Storage.
      bodySizeLimit: "25mb",
    },
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
