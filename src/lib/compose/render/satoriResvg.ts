import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { sceneToSatori } from "@/lib/compose/satoriTree";
import { SCENE_W, SCENE_H } from "@/lib/compose/scene";
import type {
  SceneRenderer,
  SceneRenderInput,
  SceneRenderOutput,
} from "@/lib/providers/types";

export function createSatoriResvgRenderer(): SceneRenderer {
  return {
    name: "satori/resvg",

    async generate(input: SceneRenderInput): Promise<SceneRenderOutput> {
      if (!input.fonts || input.fonts.length === 0) {
        throw new Error("createSatoriResvgRenderer requires at least one font");
      }

      const width = input.scene.w || SCENE_W;
      const height = input.scene.h || SCENE_H;

      const tree = sceneToSatori(input.scene);

      const svg = await satori(tree as Parameters<typeof satori>[0], {
        width,
        height,
        fonts: input.fonts.map((f) => ({
          name: f.name,
          data: f.data,
          weight: (f.weight ?? 400) as number,
          style: f.style ?? "normal",
        })) as Parameters<typeof satori>[1]["fonts"],
      });

      // satori emits text as <path> glyphs, so resvg needs no fonts loaded.
      const resvg = new Resvg(svg, {
        font: { loadSystemFonts: false },
        fitTo: { mode: "width", value: width },
      });
      const png = resvg.render().asPng();

      const mediaDir = join(process.cwd(), "public", "media");
      mkdirSync(mediaDir, { recursive: true });
      const filename = `render-${Date.now()}.png`;
      writeFileSync(join(mediaDir, filename), png);

      const apiPath = `/api/media/${filename}`;
      return { url: apiPath, localPath: apiPath, svg };
    },
  };
}
