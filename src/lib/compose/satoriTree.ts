import {
  type Scene,
  type Background,
  type SceneElement,
  SCENE_W,
  SCENE_H,
} from "@/lib/compose/scene";

type SatoriNode = { type: string; props: Record<string, unknown> };

const treatmentOverlay: Record<"warm" | "duotone", string | null> = {
  warm: "rgba(255,170,90,0.18)",
  duotone: "rgba(20,20,60,0.35)",
};

function backgroundLayers(bg: Background): {
  rootStyle: Record<string, unknown>;
  layers: SatoriNode[];
} {
  if (bg.kind === "solid") {
    return { rootStyle: { backgroundColor: bg.color }, layers: [] };
  }
  if (bg.kind === "gradient") {
    return {
      rootStyle: {
        backgroundImage: `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})`,
      },
      layers: [],
    };
  }
  // image
  const layers: SatoriNode[] = [
    {
      type: "img",
      props: {
        src: bg.src,
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          width: SCENE_W,
          height: SCENE_H,
          objectFit: bg.fit,
        },
      },
    },
  ];
  const overlayColor =
    bg.treatment && bg.treatment !== "none" ? treatmentOverlay[bg.treatment] : null;
  if (overlayColor) {
    layers.push({
      type: "div",
      props: {
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          width: SCENE_W,
          height: SCENE_H,
          backgroundColor: overlayColor,
        },
      },
    });
  }
  return { rootStyle: {}, layers };
}

// element -> node mapping added in B.3
function elementToNode(_el: SceneElement): SatoriNode | null {
  return null;
}

export function sceneToSatori(scene: Scene): SatoriNode {
  const { rootStyle, layers } = backgroundLayers(scene.background);
  const elementNodes = scene.elements
    .slice()
    .sort((a, b) => a.z - b.z)
    .map(elementToNode)
    .filter((n): n is SatoriNode => n !== null);
  return {
    type: "div",
    props: {
      style: {
        position: "relative",
        display: "flex",
        width: scene.w,
        height: scene.h,
        overflow: "hidden",
        ...rootStyle,
      },
      children: [...layers, ...elementNodes],
    },
  };
}
