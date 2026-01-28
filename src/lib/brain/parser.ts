import type { ProductPlan } from "./types";

type ParseResult =
  | { success: true; plan: ProductPlan }
  | { success: false; error: string };

export function parseProductPlan(markdown: string): ParseResult {
  const lines = markdown.split("\n");
  const sections: Record<string, string[]> = {};
  let currentSection = "";

  for (const line of lines) {
    const headerMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headerMatch) {
      currentSection = headerMatch[1].toLowerCase().trim();
      sections[currentSection] = [];
    } else if (currentSection && line.trim()) {
      sections[currentSection].push(line);
    }
  }

  const name = extractSingle(sections, ["name", "product", "product name"]);
  const description = extractMultiline(sections, ["description", "about", "overview", "vision statement", "vision"]);

  if (!name) {
    return { success: false, error: "Missing product name" };
  }
  if (!description) {
    return { success: false, error: "Missing product description" };
  }

  const plan: ProductPlan = {
    name,
    description,
    features: extractList(sections, ["features", "key features", "benefits"]),
    audience: extractSingle(sections, ["audience", "target audience", "target market"]) || "",
    tone: extractSingle(sections, ["tone", "voice", "brand tone", "brand voice"]) || "casual",
    themes: extractList(sections, ["themes", "content themes", "topics"]),
    visualStyle: extractSingle(sections, ["visual style", "style", "visuals", "aesthetic"]),
  };

  return { success: true, plan };
}

function extractSingle(sections: Record<string, string[]>, keys: string[]): string | undefined {
  for (const key of keys) {
    if (sections[key]?.length) {
      return sections[key].join(" ").trim();
    }
  }
  return undefined;
}

function extractMultiline(sections: Record<string, string[]>, keys: string[]): string | undefined {
  for (const key of keys) {
    if (sections[key]?.length) {
      return sections[key].join("\n").trim();
    }
  }
  return undefined;
}

function extractList(sections: Record<string, string[]>, keys: string[]): string[] {
  for (const key of keys) {
    if (sections[key]?.length) {
      return sections[key]
        .map((line) => line.replace(/^[-*]\s*/, "").trim())
        .filter(Boolean);
    }
  }
  return [];
}
