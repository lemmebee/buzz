/** @type {import('next').NextConfig} */
const nextConfig = {
  // Separate build dir per instance so the dev server (.next) and the
  // production server (.next-prod) don't clobber each other's build output.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: [
      "@xenova/transformers",
      "onnxruntime-node",
      "fluent-ffmpeg",
      "ffmpeg-static",
      "msedge-tts",
      "better-sqlite3",
      "sharp",
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        "@xenova/transformers",
        "onnxruntime-node",
        "fluent-ffmpeg",
        "ffmpeg-static",
        "msedge-tts",
      ];
    }
    return config;
  },
};

export default nextConfig;
