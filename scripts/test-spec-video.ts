import "dotenv/config";
import { eq } from "drizzle-orm";
import { statSync } from "fs";
import { db, schema } from "../src/lib/db";
import { getApiKey, getTextProvider } from "../src/lib/settings";
import { authorVideoSpec } from "../src/lib/video/spec-author";
import { renderSpecVideo } from "../src/lib/video/render-spec";

// Spike: LLM authors a creative video spec for a real product, then we render
// it through the flexible SpecVideo composition.
//   DATABASE_PATH=./data/buzz.prod.db npx tsx scripts/test-spec-video.ts "<vibe>"
async function main() {
  const vibe =
    process.argv[2] ||
    "bold, punchy, modern fintech energy — fast cuts, big confident typography, calm-but-premium";

  const product = await db.query.products.findFirst({ where: eq(schema.products.id, 1) });
  if (!product?.profile || !product.marketingStrategy) {
    throw new Error("product #1 needs profile + marketingStrategy");
  }
  const apiKey = await getApiKey("GOOGLE_AI_API_KEY");
  if (!apiKey) throw new Error("no GOOGLE_AI_API_KEY in settings (use DATABASE_PATH=./data/buzz.prod.db)");

  console.log(`Product: ${product.name}`);
  console.log(`Text provider setting: ${await getTextProvider()}`);
  console.log(`Vibe: ${vibe}\n`);

  console.log("1/2 Authoring spec with Gemini (structured JSON)...");
  const authored = await authorVideoSpec({
    apiKey,
    productName: product.name,
    profile: JSON.parse(product.profile),
    strategy: JSON.parse(product.marketingStrategy),
    vibe,
    aspectRatio: "9:16",
    durationSec: 15,
  });

  if (!authored.spec) {
    console.error("❌ authoring failed:", authored.error);
    console.error("raw (first 600):", authored.raw.slice(0, 600));
    process.exit(1);
  }
  const spec = authored.spec;
  console.log(`✅ spec authored: ${spec.scenes.length} scenes, palette=${JSON.stringify(spec.palette)}`);
  spec.scenes.forEach((s, i) => {
    const txt = s.layers.filter((l) => l.kind === "text").map((l) => `"${l.text}"`).join(" | ");
    console.log(`   scene ${i + 1}: ${s.durationInFrames}f bg=${s.bgKind} trans=${s.transition} text=${txt || "-"}`);
  });
  console.log(`   script: "${spec.script.slice(0, 120)}..."\n`);

  console.log("2/2 Rendering (images + TTS + captions + Remotion)...");
  const t0 = Date.now();
  const result = await renderSpecVideo(spec, { imageProviderName: product.imageProvider });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const size = statSync(result.localPath).size;

  console.log(`\n✅ Rendered in ${secs}s`);
  console.log(`   ${result.localPath} (${(size / 1024 / 1024).toFixed(1)} MB, ${result.width}x${result.height}, ${result.duration.toFixed(1)}s)`);
  console.log(`OUTPUT_PATH=${result.localPath}`);
}

main().catch((err) => {
  console.error("\n❌ spike failed:\n", err);
  process.exit(1);
});
