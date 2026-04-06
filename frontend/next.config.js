/** @type {import('next').NextConfig} */
const path = require("path");

const nextConfig = {
  output: "standalone",
  // Ensure standalone output traces @swc/helpers (hoisted; Next resolves under next/node_modules/)
  outputFileTracingIncludes: {
    "/**": ["./node_modules/@swc/helpers/**/*"],
  },
  turbopack: {},
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.join(__dirname, "src"),
    };
    return config;
  },
};

module.exports = nextConfig;

