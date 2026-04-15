import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
