import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image Docker memakai keluaran "standalone" (server minimal + only dependensi yang used).
  // Sengaja not active di luar Docker agar `npm start` biasa tetap inProgress normal.
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  // PGlite memuat file WASM lewat fs, jadi not boleh dibundel.
  // pdfkit/fontkit: fontkit's nested @swc/helpers (0.3.x, the version it actually needs) gets shadowed by
  // Next's own top-level @swc/helpers (0.5.x, a breaking rename) when Turbopack bundles it — external skips
  // that and lets Node's own require() walk node_modules correctly instead.
  serverExternalPackages: ["@electric-sql/pglite", "pg", "pdfkit", "fontkit"],
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
