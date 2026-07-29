/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@multi-agent/shared"],
  experimental: {
    serverComponentsExternalPackages: [],
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
