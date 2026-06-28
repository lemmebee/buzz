// pm2 config for the buzz PRODUCTION instance.
//   - Served at https://buzz.mrg.sh (cloudflared ingress -> localhost:3004)
//   - Runs the compiled Next.js build (`next start`), NOT the dev server.
//   - Loads env from .env.prod (separate DB, prod Instagram redirect, etc.)
// The dev server (`npm run dev` on port 3003) is independent of this.
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const dotenv = require("dotenv");

const cwd = __dirname;
const prodEnv = dotenv.parse(readFileSync(join(cwd, ".env.prod")));

module.exports = {
  apps: [
    {
      name: "buzz-prod",
      cwd,
      script: "./node_modules/.bin/next",
      args: "start -p 3004",
      env: {
        NODE_ENV: "production",
        ...prodEnv,
      },
    },
  ],
};
