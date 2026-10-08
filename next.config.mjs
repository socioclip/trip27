/** @type {import('next').NextConfig} */
// Path the site is served under. Empty = site root (trip27.me).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig = {
  basePath: basePath || undefined,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  images: { unoptimized: true },
  poweredByHeader: false,
  async redirects() {
    if (basePath) return [{ source: "/", destination: basePath, permanent: false, basePath: false }];
    // The site used to live under /trip27; keep old links working.
    return [
      { source: "/trip27", destination: "/", permanent: true },
      { source: "/trip27/:path*", destination: "/:path*", permanent: true },
    ];
  },
};
export default nextConfig;
