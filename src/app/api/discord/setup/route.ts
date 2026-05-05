import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { discordFetch } from "@/lib/discord";

async function upsertSetting(key: string, value: string) {
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

export async function POST(req: NextRequest) {
  const { botToken, publicKey, channelId } = await req.json();

  if (!botToken || !publicKey || !channelId) {
    return NextResponse.json(
      { error: "botToken, publicKey, channelId required" },
      { status: 400 },
    );
  }

  const me = await discordFetch(botToken, "/users/@me");
  if (!me.ok) {
    return NextResponse.json({ error: "Invalid bot token" }, { status: 400 });
  }
  const meData = await me.json();

  await upsertSetting("DISCORD_BOT_TOKEN", botToken);
  await upsertSetting("DISCORD_PUBLIC_KEY", publicKey);
  await upsertSetting("DISCORD_CHANNEL_ID", channelId);

  const test = await discordFetch(botToken, `/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: "Buzz connected. You'll receive content drafts for approval here.",
    }),
  });
  if (!test.ok) {
    const err = await test.text();
    return NextResponse.json(
      { error: "Bot cannot post to channel", details: err },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, botName: meData.username });
}
