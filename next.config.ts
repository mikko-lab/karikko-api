import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "host", value: "demo.nordicmarinedata.com" }],
        destination: "/demo",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
