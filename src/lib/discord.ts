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

export async function sendPostForApproval(postId: number): Promise<boolean> {
  const config = await getDiscordConfig();
  if (!config) return false;

  const post = await db.query.posts.findFirst({
    where: eq(schema.posts.id, postId),
  });
  if (!post) return false;

  const product = post.productId
    ? await db.query.products.findFirst({ where: eq(schema.products.id, post.productId) })
    : null;

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
        { type: 2, style: 4, label: "Delete", custom_id: `reject:${postId}` },
      ],
    },
  ];

  const payload: Record<string, unknown> = {
    content: body.slice(0, 2000),
    components,
  };

  if (post.publicMediaUrl && !post.publicMediaUrl.startsWith("/")) {
    payload.embeds = [{ image: { url: post.publicMediaUrl } }];
  }

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
    await db.update(schema.posts)
      .set({ discordMessageId: String(data.id) })
      .where(eq(schema.posts.id, postId));
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
    await db.delete(schema.posts).where(eq(schema.posts.id, postId));
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
