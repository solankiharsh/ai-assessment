/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbo: {
      resolveAlias: {
        // Map the @ alias for Turbopack resolution
        "@/*": "./src/*",
      },
    },
  },
};

module.exports = nextConfig;

