import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Lets a phone on your home or office Wi-Fi load the app while it runs on your computer (development only).
  // Without this, Next.js blocks requests that come from any address other than localhost.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
