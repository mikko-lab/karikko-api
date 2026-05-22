import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/",
        has: [{ type: "host", value: "demo.nordicmarinedata.com" }],
        destination: "/demo",
      },
    ];
  },
};

export default nextConfig;
