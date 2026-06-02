import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));
const isStaticExport = process.env.NEXT_STATIC_EXPORT === "true";
const staticBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/yhs";

const nextConfig = {
  output: isStaticExport ? "export" : "standalone",
  ...(isStaticExport ? { basePath: staticBasePath, assetPrefix: `${staticBasePath}/` } : {}),
  outputFileTracingRoot: resolve(appDir, "../.."),
  turbopack: {
    root: resolve(appDir, "../..")
  },
  ...(isStaticExport ? { trailingSlash: true, images: { unoptimized: true } } : {}),
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000",
    NEXT_PUBLIC_BASE_PATH: isStaticExport ? staticBasePath : ""
  }
};

export default nextConfig;
