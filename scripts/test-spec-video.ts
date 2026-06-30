import "dotenv/config";
import { eq } from "drizzle-orm";
import { statSync } from "fs";
import { db, schema } from "../src/lib/db";
import { getTextProvider } from "../src/lib/settings";
import { resolveTextProvider, listImageProviderNames, imagesAvailable } from "../src/lib/providers";
import { authorBestSpec } from "../src/lib/video/spec-author";
import { renderSpecVideo } from "../src/lib/video/render-spec";

// Spike: the USER'S selected text provider acts as creative director, authors a
// best-of-N video spec (judged), then we render it through SpecVideo.
//   DATABASE_PATH=./data/buzz.prod.db npx tsx scripts/test-spec-video.ts "<vibe>"
async function main() {
  const vibe =
    process.argv[2] ||
    "bold, punchy, modern fintech energy — fast cuts, big confident typography, calm-but-premium";

  const product = await db.query.products.findFirst({ where: eq(schema.products.id, 1) });
  if (!product?.profile || !product.marketingStrategy) {
    throw new Error("product #1 needs profile + marketingStrategy");
  }

  const provider = await resolveTextProvider(product.textProvider);
  const imageNames = await listImageProviderNames(product.imageProvider);
  const imagesAvail = imagesAvailable(imageNames);

  console.log(`Product: ${product.name}`);
  console.log(`Creative director (text provider): ${provider.name} [setting: ${await getTextProvider()}]`);
  console.log(`Image providers: [${imageNames.join(", ")}] → available=${imagesAvail}`);
  console.log(`Vibe: ${vibe}\n`);

  console.log("1/2 Authoring spec (best-of-N + judge) via the selected provider...");
  const t0 = Date.now();
  const { spec, source, valid } = await authorBestSpec({
    provider,
    productName: product.name,
    profile: JSON.parse(product.profile),
    strategy: JSON.parse(product.marketingStrategy),
    vibe,
    aspectRatio: "9:16",
    durationSec: 15,
    imagesAvailable: imagesAvail,
    n: 3,
  });
  console.log(`✅ spec via ${source} (${valid} valid) in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${spec.scenes.length} scenes, palette=${JSON.stringify(spec.palette)}`);
  spec.scenes.forEach((s, i) => {
    const txt = s.layers.filter((l) => l.kind === "text").map((l) => `"${l.text}"`).join(" | ");
    console.log(`   scene ${i + 1}: ${s.durationInFrames}f bg=${s.bgKind} trans=${s.transition} text=${txt || "-"}`);
  });
  console.log(`   script: "${spec.script.slice(0, 120)}..."\n`);

  console.log("2/2 Rendering (images + TTS + captions + Remotion)...");
  const t1 = Date.now();
  const result = await renderSpecVideo(spec, { imageProviderName: product.imageProvider });
  const secs = ((Date.now() - t1) / 1000).toFixed(1);
  const size = statSync(result.localPath).size;

  console.log(`\n✅ Rendered in ${secs}s`);
  console.log(`   ${result.localPath} (${(size / 1024 / 1024).toFixed(1)} MB, ${result.width}x${result.height}, ${result.duration.toFixed(1)}s)`);
  console.log(`OUTPUT_PATH=${result.localPath}`);
}

main().catch((err) => {
  console.error("\n❌ spike failed:\n", err);
  process.exit(1);
});
