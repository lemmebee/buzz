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

function baseBoxStyle(el: SceneElement): Record<string, unknown> {
  const style: Record<string, unknown> = {
    position: "absolute",
    left: el.x,
    top: el.y,
    width: el.w,
    height: el.h,
  };
  if (el.rotation) style.transform = `rotate(${el.rotation}deg)`;
  return style;
}

const ALIGN_TO_ITEMS: Record<"left" | "center" | "right", string> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

function elementToNode(el: SceneElement): SatoriNode | null {
  switch (el.type) {
    case "text":
      return {
        type: "div",
        props: {
          style: {
            ...baseBoxStyle(el),
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            alignItems: ALIGN_TO_ITEMS[el.align],
            fontFamily: el.fontFamily,
            fontWeight: el.fontWeight,
            fontSize: el.size,
            color: el.color,
            lineHeight: el.lineHeight,
            textAlign: el.align,
            whiteSpace: "pre-wrap",
          },
          children: el.content,
        },
      };

    case "image":
      return {
        type: "img",
        props: {
          src: el.src,
          style: {
            ...baseBoxStyle(el),
            objectFit: el.fit,
            ...(el.radius != null ? { borderRadius: el.radius } : {}),
          },
        },
      };

    case "shape": {
      const style: Record<string, unknown> = { ...baseBoxStyle(el) };
      if (el.shape === "line") {
        style.backgroundColor = el.stroke ?? "#000000";
        style.height = el.strokeWidth ?? 1;
      } else {
        if (el.fill) style.backgroundColor = el.fill;
        if (el.radius != null) style.borderRadius = el.radius;
        if (el.stroke && el.strokeWidth) style.border = `${el.strokeWidth}px solid ${el.stroke}`;
      }
      return { type: "div", props: { style } };
    }

    case "pill":
      return {
        type: "div",
        props: {
          style: {
            ...baseBoxStyle(el),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: el.bg,
            color: el.color,
            fontFamily: el.fontFamily,
            fontSize: el.size,
            borderRadius: el.h / 2,
          },
          children: el.text,
        },
      };

    case "button":
      return {
        type: "div",
        props: {
          style: {
            ...baseBoxStyle(el),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: el.bg,
            color: el.color,
            fontFamily: el.fontFamily,
            fontSize: el.size,
            borderRadius: el.radius,
          },
          children: el.label,
        },
      };

    case "logo":
      return {
        type: "img",
        props: {
          src: el.src,
          style: { ...baseBoxStyle(el), objectFit: "contain" },
        },
      };

    case "icon":
      return {
        type: "div",
        props: {
          "data-icon": el.name,
          style: {
            ...baseBoxStyle(el),
            display: "flex",
            color: el.stroke,
          },
        },
      };

    case "chatBubble": {
      const radius =
        el.side === "left" ? "20px 20px 20px 4px" : "20px 20px 4px 20px";
      return {
        type: "div",
        props: {
          style: {
            ...baseBoxStyle(el),
            display: "flex",
            alignItems: "center",
            backgroundColor: el.bg,
            color: el.color,
            fontFamily: el.fontFamily,
            fontSize: el.size,
            borderRadius: radius,
            padding: 16,
          },
          children: el.text,
        },
      };
    }

    case "statBlock":
      return {
        type: "div",
        props: {
          style: {
            ...baseBoxStyle(el),
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            fontFamily: el.fontFamily,
          },
          children: [
            {
              type: "div",
              props: {
                style: { display: "flex", fontSize: el.valueSize, color: el.valueColor },
                children: el.value,
              },
            },
            {
              type: "div",
              props: {
                style: { display: "flex", fontSize: el.labelSize, color: el.labelColor },
                children: el.label,
              },
            },
          ],
        },
      };

    default: {
      const _exhaustive: never = el;
      return _exhaustive;
    }
  }
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
