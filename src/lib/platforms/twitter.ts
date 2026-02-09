const TWITTER_MAX_CHARS = 280;
const TWITTER_MAX_HASHTAGS = 2;

export function normalizeTwitterHashtags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  const normalized = input
    .map((tag) => String(tag).trim().replace(/^#/, ""))
    .filter(Boolean);

  // De-duplicate while preserving order.
  const unique = Array.from(new Set(normalized));
  return unique.slice(0, TWITTER_MAX_HASHTAGS);
}

export function buildTweetText(content: string, hashtags: string[]): string {
  const safeContent = String(content || "").trim();
  if (hashtags.length === 0) return safeContent;
  return `${safeContent}\n\n${hashtags.map((t) => `#${t}`).join(" ")}`;
}

export function enforceTwitterConstraints(content: string, rawHashtags: unknown): {
  content: string;
  hashtags: string[];
  tweetText: string;
  wasAdjusted: boolean;
} {
  let safeContent = String(content || "").trim();
  let hashtags = normalizeTwitterHashtags(rawHashtags);
  let wasAdjusted = false;

  // If still too long, reduce hashtag count before cutting caption.
  let tweetText = buildTweetText(safeContent, hashtags);
  while (tweetText.length > TWITTER_MAX_CHARS && hashtags.length > 0) {
    hashtags = hashtags.slice(0, hashtags.length - 1);
    wasAdjusted = true;
    tweetText = buildTweetText(safeContent, hashtags);
  }

  if (tweetText.length > TWITTER_MAX_CHARS) {
    const suffix = hashtags.length > 0 ? `\n\n${hashtags.map((t) => `#${t}`).join(" ")}` : "";
    const maxContentLen = Math.max(TWITTER_MAX_CHARS - suffix.length, 0);
    safeContent = safeContent.slice(0, maxContentLen).trimEnd();
    wasAdjusted = true;
    tweetText = buildTweetText(safeContent, hashtags);
  }

  // Final guard in case of edge-case spacing behavior.
  if (tweetText.length > TWITTER_MAX_CHARS) {
    safeContent = safeContent.slice(0, TWITTER_MAX_CHARS).trimEnd();
    hashtags = [];
    wasAdjusted = true;
    tweetText = buildTweetText(safeContent, hashtags);
  }

  return { content: safeContent, hashtags, tweetText, wasAdjusted };
}
