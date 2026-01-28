import type { Product } from "../../drizzle/schema";

export type ContentType = "reel" | "post" | "carousel";

interface PromptParams {
  product: Product;
  contentType: ContentType;
  count?: number;
}

export function buildGeneratePrompt({ product, contentType, count = 5 }: PromptParams): string {
  const typeInstructions: Record<ContentType, string> = {
    reel: "short, punchy captions for Instagram Reels (under 100 chars). Hook viewers in first line.",
    post: "engaging captions for Instagram posts (under 300 chars). Include call-to-action.",
    carousel: "educational carousel ideas with slide-by-slide breakdown (5-7 slides per idea).",
  };

  return `You are a social media marketer creating Instagram content.

PRODUCT INFO:
- Name: ${product.name}
- Description: ${product.description}
- Target Audience: ${product.audience || "General"}
- Brand Tone: ${product.tone || "Casual"}

TASK:
Generate ${count} ${contentType} ${typeInstructions[contentType]}

OUTPUT FORMAT:
Return a JSON array of objects with these fields:
- content: the caption text
- hashtags: array of relevant hashtags (without # symbol)

Example:
[
  {"content": "Your caption here", "hashtags": ["tag1", "tag2"]},
  ...
]

Only output valid JSON, no markdown code blocks or extra text.`;
}

export interface GeneratedPost {
  content: string;
  hashtags: string[];
}

export function parseGeneratedContent(response: string): GeneratedPost[] {
  const cleaned = response.replace(/```json\n?|\n?```/g, "").trim();
  return JSON.parse(cleaned);
}
