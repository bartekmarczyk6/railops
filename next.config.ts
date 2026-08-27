import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@boundaryml/baml"],
  webpack(config) {
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".js", ".ts"],
      ".mjs": [".mjs", ".mts"],
    };
    return config;
  },
};

export default nextConfig;