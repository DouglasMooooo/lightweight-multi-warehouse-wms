import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_ENV:
      process.env.NEXT_PUBLIC_APP_ENV ??
      process.env.VERCEL_ENV ??
      (process.env.NODE_ENV === "production" ? "production" : "development"),
  },
};

export default nextConfig;
