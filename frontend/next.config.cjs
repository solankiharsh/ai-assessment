/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    const path = require("path");
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.join(__dirname, "src"),
    };
    return config;
  },
};

module.exports = nextConfig;
