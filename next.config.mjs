/** @type {import('next').NextConfig} */
const nextConfig = {
  // Separate build dir per instance so the dev server (.next) and the
  // production server (.next-prod) don't clobber each other's build output.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: [
      "better-sqlite3",
      "sharp",
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        // Remotion's renderer spawns a headless browser and bundler runs its own
        // webpack — neither can be bundled by Next. Lazy-imported by the video
        // provider, so they only load at render time.
      ];
    }
    return config;
  },
};

export default nextConfig;
