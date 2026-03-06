import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { publishPost } from "@/lib/instagram";

const TG_API = "https://api.telegram.org/bot";

export async function getTelegramConfig() {
  const token = await getSetting("TELEGRAM_BOT_TOKEN");
  const chatId = await getSetting("TELEGRAM_CHAT_ID");
  if (!token || !chatId) return null;
  return { token, chatId };
}

export async function tgFetch(token: string, method: string, body: Record<string, unknown>) {
  const res = await fetch(`${TG_API}${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function sendPostForApproval(postId: number): Promise<boolean> {
  const config = await getTelegramConfig();
  if (!config) return false;

  const post = await db.query.posts.findFirst({
    where: eq(schema.posts.id, postId),
  });
  if (!post) return false;

  const product = post.productId
    ? await db.query.products.findFirst({ where: eq(schema.products.id, post.productId) })
    : null;

  const hashtags: string[] = post.hashtags ? JSON.parse(post.hashtags) : [];
  const hashtagStr = hashtags.length > 0 ? "\n\n" + hashtags.map((t: string) => `#${t}`).join(" ") : "";

  const truncatedContent = post.content.length > 800 ? post.content.slice(0, 800) + "..." : post.content;
  const caption = `New draft - ${product?.name || "Unknown"}\n\n${truncatedContent}${hashtagStr}`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "Post", callback_data: `approve:${postId}` },
        { text: "Delete", callback_data: `reject:${postId}` },
      ],
    ],
  };

  let result;
  if (post.publicMediaUrl && !post.publicMediaUrl.startsWith("/")) {
    result = await tgFetch(config.token, "sendPhoto", {
      chat_id: config.chatId,
      photo: post.publicMediaUrl,
      caption: caption.slice(0, 1024),
      reply_markup: keyboard,
    });
  } else {
    result = await tgFetch(config.token, "sendMessage", {
      chat_id: config.chatId,
      text: caption.slice(0, 4096),
      reply_markup: keyboard,
    });
  }

  if (result.ok && result.result?.message_id) {
    await db.update(schema.posts)
      .set({ telegramMessageId: String(result.result.message_id) })
      .where(eq(schema.posts.id, postId));
  } else {
    console.error(`[Telegram] Failed to send post ${postId}:`, result);
  }

  return result.ok === true;
}

export async function updateApprovalMessage(
  token: string,
  chatId: string,
  messageId: number,
  status: "approved" | "rejected",
) {
  // Remove inline buttons
  await tgFetch(token, "editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] },
  });
}

/** Handle a callback query (button press) from Telegram */
export async function handleCallbackQuery(callback: {
  id: string;
  data?: string;
  message?: { message_id: number };
}) {
  const data = callback.data || "";
  const [action, postIdStr] = data.split(":");
  const postId = parseInt(postIdStr);
  const messageId = callback.message?.message_id;

  if (!postId || !["approve", "reject"].includes(action)) return;

  const config = await getTelegramConfig();
  if (!config) return;

  // Answer callback (removes loading spinner on button)
  await tgFetch(config.token, "answerCallbackQuery", {
    callback_query_id: callback.id,
  });

  if (action === "approve") {
    const result = await publishPost(postId);
    if (messageId) {
      await updateApprovalMessage(config.token, config.chatId, messageId, "approved");
      const statusText = result.success
        ? "Posted to Instagram"
        : `Failed: ${result.error}`;
      await tgFetch(config.token, "sendMessage", {
        chat_id: config.chatId,
        text: statusText,
        reply_to_message_id: messageId,
      });
    }
  } else {
    await db.delete(schema.posts).where(eq(schema.posts.id, postId));
    if (messageId) {
      await updateApprovalMessage(config.token, config.chatId, messageId, "rejected");
    }
  }
}

/** Poll Telegram for button presses (no webhook needed) */
let pollingActive = false;
let lastUpdateId = 0;

export async function startPolling() {
  if (pollingActive) return;
  pollingActive = true;
  console.log("[Telegram] Polling started");

  while (pollingActive) {
    try {
      const config = await getTelegramConfig();
      if (!config) {
        await new Promise((r) => setTimeout(r, 10000));
        continue;
      }

      // Delete any existing webhook so polling works
      await tgFetch(config.token, "deleteWebhook", {});

      const result = await tgFetch(config.token, "getUpdates", {
        offset: lastUpdateId + 1,
        timeout: 30,
        allowed_updates: ["callback_query"],
      });

      if (result.ok && result.result?.length > 0) {
        for (const update of result.result) {
          lastUpdateId = update.update_id;
          if (update.callback_query) {
            await handleCallbackQuery(update.callback_query);
          }
        }
      }
    } catch (err) {
      console.error("[Telegram] Polling error:", err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

export function stopPolling() {
  pollingActive = false;
}
