/** @type {import('next').NextConfig} */
const nextConfig = {
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
      "@resvg/resvg-js",
      "@woff2/woff2-rs",
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
        "@resvg/resvg-js",
        "@woff2/woff2-rs",
      ];
    }
    return config;
  },
};

export default nextConfig;
