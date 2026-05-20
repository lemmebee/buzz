import { eq } from "drizzle-orm";
import crypto from "crypto";
import { db, schema } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { publishPost } from "@/lib/instagram";

const DISCORD_API = "https://discord.com/api/v10";

export interface DiscordConfig {
  token: string;
  channelId: string;
  publicKey: string;
}

export async function getDiscordConfig(): Promise<DiscordConfig | null> {
  const token = await getSetting("DISCORD_BOT_TOKEN");
  const channelId = await getSetting("DISCORD_CHANNEL_ID");
  const publicKey = await getSetting("DISCORD_PUBLIC_KEY");
  if (!token || !channelId || !publicKey) return null;
  return { token, channelId, publicKey };
}

export async function discordFetch(token: string, path: string, init?: RequestInit) {
  return fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
}

export function verifyDiscordSignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  publicKeyHex: string,
): boolean {
  try {
    const PREFIX = Buffer.from("302a300506032b6570032100", "hex");
    const der = Buffer.concat([PREFIX, Buffer.from(publicKeyHex, "hex")]);
    const key = crypto.createPublicKey({ key: der, format: "der", type: "spki" });
    return crypto.verify(
      null,
      Buffer.from(timestamp + rawBody),
      key,
      Buffer.from(signature, "hex"),
    );
  } catch (err) {
    console.error("[Discord] signature verification error:", err);
    return false;
  }
}

type ContentRow = typeof schema.content.$inferSelect;
type ProductRow = typeof schema.products.$inferSelect;

function buildDraftPayload(
  post: ContentRow,
  product: ProductRow | null | undefined,
  postId: number,
): Record<string, unknown> {
  const hashtags: string[] = post.hashtags ? JSON.parse(post.hashtags) : [];
  const hashtagStr = hashtags.length > 0
    ? "\n\n" + hashtags.map((t) => `#${t.replace(/^#+/, "")}`).join(" ")
    : "";

  const truncated = post.content.length > 1500 ? post.content.slice(0, 1500) + "..." : post.content;
  const body = `**New draft - ${product?.name || "Unknown"}**\n\n${truncated}${hashtagStr}`;

  const components = [
    {
      type: 1,
      components: [
        { type: 2, style: 3, label: "Post", custom_id: `approve:${postId}` },
        { type: 2, style: 1, label: "Edit", custom_id: `edit:${postId}` },
        { type: 2, style: 4, label: "Delete", custom_id: `reject:${postId}` },
      ],
    },
  ];

  const payload: Record<string, unknown> = {
    content: body.slice(0, 2000),
    components,
  };

  if (post.publicMediaUrl && !post.publicMediaUrl.startsWith("/")) {
    if (post.mediaType === "video") {
      // Discord auto-embeds raw video URLs appended to message content
      payload.content = `${body}\n${post.publicMediaUrl}`.slice(0, 2000);
    } else {
      payload.embeds = [{ image: { url: post.publicMediaUrl } }];
    }
  }

  return payload;
}

export async function sendPostForApproval(postId: number): Promise<boolean> {
  const config = await getDiscordConfig();
  if (!config) return false;

  const post = await db.query.content.findFirst({
    where: eq(schema.content.id, postId),
  });
  if (!post) return false;

  const product = post.productId
    ? await db.query.products.findFirst({ where: eq(schema.products.id, post.productId) })
    : null;

  const payload = buildDraftPayload(post, product, postId);

  const res = await discordFetch(config.token, `/channels/${config.channelId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error(`[Discord] Failed to send post ${postId}:`, res.status, txt);
    return false;
  }

  const data = await res.json();
  if (data.id) {
    await db.update(schema.content)
      .set({ discordMessageId: String(data.id) })
      .where(eq(schema.content.id, postId));
    return true;
  }
  return false;
}

interface ComponentInteraction {
  application_id: string;
  token: string;
  data: { custom_id: string };
  message?: { id: string; content?: string };
}

export async function handleComponentInteraction(interaction: ComponentInteraction) {
  const customId = interaction.data.custom_id;
  const [action, postIdStr] = customId.split(":");
  const postId = parseInt(postIdStr);

  if (!postId || !["approve", "reject"].includes(action)) return;

  let resultText = "";
  if (action === "approve") {
    const result = await publishPost(postId);
    resultText = result.success ? "Posted to Instagram" : `Failed: ${result.error}`;
  } else {
    await db.delete(schema.content).where(eq(schema.content.id, postId));
    resultText = "Draft deleted";
  }

  const original = interaction.message?.content || "";
  const followupRes = await fetch(
    `${DISCORD_API}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `${original}\n\n**${resultText}**`.slice(0, 2000),
        components: [],
      }),
    },
  );
  if (!followupRes.ok) {
    const txt = await followupRes.text();
    console.error("[Discord] followup edit failed:", followupRes.status, txt);
  }
}

export async function buildEditModalResponse(postId: number) {
  const post = await db.query.content.findFirst({
    where: eq(schema.content.id, postId),
  });
  if (!post) return null;

  const hashtags: string[] = post.hashtags ? JSON.parse(post.hashtags) : [];
  const hashtagStr = hashtags.length > 0
    ? "\n\n" + hashtags.map((t) => `#${t.replace(/^#+/, "")}`).join(" ")
    : "";
  const full = `${post.content}${hashtagStr}`.slice(0, 4000);

  return {
    type: 9, // MODAL
    data: {
      custom_id: `edit_modal:${postId}`,
      title: "Edit post",
      components: [
        {
          type: 1,
          components: [
            {
              type: 4, // TEXT_INPUT
              custom_id: "post_text",
              style: 2, // paragraph
              label: "Caption + hashtags",
              value: full,
              max_length: 4000,
              required: true,
            },
          ],
        },
      ],
    },
  };
}

interface ModalSubmitInteraction {
  application_id: string;
  token: string;
  data: {
    custom_id: string;
    components: Array<{
      components: Array<{ custom_id: string; value: string }>;
    }>;
  };
}

export interface ParsedEditModal {
  postId: number;
  text: string;
}

export function parseEditModalSubmit(
  interaction: ModalSubmitInteraction,
): ParsedEditModal | { error: string } {
  const customId = interaction.data?.custom_id ?? "";
  const [action, postIdStr] = customId.split(":");
  if (action !== "edit_modal") return { error: "unexpected modal" };

  const postId = parseInt(postIdStr);
  if (!postId || Number.isNaN(postId)) return { error: "invalid post id" };

  const rows = interaction.data?.components;
  if (!Array.isArray(rows)) return { error: "malformed modal payload" };

  let text: string | undefined;
  for (const row of rows) {
    if (!Array.isArray(row?.components)) continue;
    for (const c of row.components) {
      if (c?.custom_id === "post_text" && typeof c.value === "string") {
        text = c.value;
        break;
      }
    }
    if (text !== undefined) break;
  }

  if (text === undefined) return { error: "post_text missing" };
  const trimmed = text.trim();
  if (trimmed.length === 0) return { error: "caption cannot be empty" };
  if (trimmed.length > 4000) return { error: "caption too long" };

  return { postId, text };
}

export async function handleModalSubmit(
  interaction: ModalSubmitInteraction,
  parsed: ParsedEditModal,
) {
  const { postId, text } = parsed;

  await db
    .update(schema.content)
    .set({ content: text, hashtags: JSON.stringify([]) })
    .where(eq(schema.content.id, postId));

  const post = await db.query.content.findFirst({
    where: eq(schema.content.id, postId),
  });
  if (!post) return;

  const product = post.productId
    ? await db.query.products.findFirst({ where: eq(schema.products.id, post.productId) })
    : null;

  const payload = buildDraftPayload(post, product, postId);

  const followupRes = await fetch(
    `${DISCORD_API}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!followupRes.ok) {
    const txt = await followupRes.text();
    console.error("[Discord] modal edit followup failed:", followupRes.status, txt);
  }
}

