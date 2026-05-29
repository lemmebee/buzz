import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import satori from "satori";

async function main() {
  // 1. fontsource ships .woff (satori-compatible), not raw TTF
  const woffPath = resolve(
    "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff",
  );
  const data = readFileSync(woffPath);
  assert.ok(data.length > 1000, "fontsource woff should be non-empty");
  // woff magic number 'wOFF'
  assert.equal(data.toString("ascii", 0, 4), "wOFF", "expected WOFF magic");

  // 2. satori must accept this buffer and emit SVG
  const svg = await satori(
    {
      type: "div",
      props: {
        style: { display: "flex", fontFamily: "Inter", fontSize: 48 },
        children: "Buzz",
      },
    },
    {
      width: 200,
      height: 100,
      fonts: [{ name: "Inter", data, weight: 400, style: "normal" }],
    },
  );
  assert.ok(svg.startsWith("<svg"), "satori should emit svg");
  assert.ok(svg.includes("<path"), "rendered text should produce glyph paths");

  // 3. confirm woff2 is NOT satori-feedable directly (justifies decompress path)
  const woff2 = readFileSync(
    resolve("node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2"),
  );
  assert.equal(woff2.toString("ascii", 0, 4), "wOF2", "expected WOFF2 magic");

  console.log("SPIKE PASS: fontsource .woff renders in satori; .woff2 is wOF2 (needs decompress for URL path)");
}

main().catch((e) => {
  console.error("SPIKE FAIL:", e);
  process.exit(1);
});
