import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF.js loads a platform-specific canvas implementation at runtime. Keep
  // both packages external so Vercel's output tracer includes the native
  // module instead of dropping it as an optional Turbopack dependency.
  serverExternalPackages: ['pdfjs-dist', '@napi-rs/canvas'],
  outputFileTracingIncludes: {
    '/api/quote-imports/*/process': [
      './node_modules/@napi-rs/canvas/**/*',
      './node_modules/@napi-rs/canvas-*/**/*',
    ],
    '/api/quote-imports/batches/*/process': [
      './node_modules/@napi-rs/canvas/**/*',
      './node_modules/@napi-rs/canvas-*/**/*',
    ],
  },
};

export default nextConfig;
