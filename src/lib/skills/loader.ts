import fs from "fs";
import path from "path";
import type { Pack } from "./types";

// Packs live on disk so they can be edited/diffed as plain markdown. Next runs
// `next start` from the project root (no standalone output), so src/ is present
// at runtime and process.cwd() resolves correctly in dev and prod alike.
const PACKS_DIR = path.join(process.cwd(), "src/lib/skills/packs");

// Packs are static files — read once, cache for the process lifetime.
const cache = new Map<string, Pack | null>();

/**
 * Read a knowledge pack by id. Returns null if the file does not exist, so engines
 * degrade gracefully while packs are still being authored (the composer skips nulls).
 */
export function readPack(id: string): Pack | null {
  if (cache.has(id)) return cache.get(id)!;

  let pack: Pack | null = null;
  try {
    const raw = fs.readFileSync(path.join(PACKS_DIR, `${id}.md`), "utf8");
    const { body, frontmatter } = splitFrontmatter(raw);
    pack = {
      id,
      body: body.trim(),
      tokenEstimate: parseTokenEstimate(frontmatter) ?? estimateTokens(body),
    };
  } catch {
    pack = null; // missing or unreadable — skip this pack
  }

  cache.set(id, pack);
  return pack;
}

function splitFrontmatter(raw: string): { frontmatter: string; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: "", body: raw };
  return { frontmatter: match[1], body: match[2] };
}

function parseTokenEstimate(frontmatter: string): number | null {
  const m = frontmatter.match(/token_estimate:\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/** Rough token estimate (~4 chars per token) for budget math. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
