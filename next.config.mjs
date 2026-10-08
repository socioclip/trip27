/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/trip27";

const nextConfig = {
  basePath: basePath || undefined,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  images: { unoptimized: true },
  poweredByHeader: false,
  async redirects() {
    // Send visitors of the bare domain to the site.
    return basePath ? [{ source: "/", destination: basePath, permanent: false, basePath: false }] : [];
  },
};
export default nextConfig;
