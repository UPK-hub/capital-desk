/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { dev }) => {
    // In Windows dev environments we have seen intermittent ENOENT on
    // .next/server/vendor-chunks from webpack filesystem cache.
    // Disabling cache in dev avoids those noisy warnings and stale entries.
    if (dev && process.platform === "win32") {
      config.cache = false;
    }
    return config;
  },
};

module.exports = nextConfig;
