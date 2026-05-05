import { NextRequest, NextResponse } from "next/server";
import {
  getDiscordConfig,
  verifyDiscordSignature,
  handleComponentInteraction,
} from "@/lib/discord";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const rawBody = await req.text();

  if (!signature || !timestamp) {
    return NextResponse.json({ error: "missing signature" }, { status: 401 });
  }

  const config = await getDiscordConfig();
  if (!config) {
    return NextResponse.json({ error: "discord not configured" }, { status: 503 });
  }

  if (!verifyDiscordSignature(rawBody, signature, timestamp, config.publicKey)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const interaction = JSON.parse(rawBody);

  // PING
  if (interaction.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  // MESSAGE_COMPONENT (button click)
  if (interaction.type === 3) {
    handleComponentInteraction(interaction).catch((err) =>
      console.error("[Discord] interaction handler error:", err),
    );
    // DEFERRED_UPDATE_MESSAGE - acks click, allows async followup edit
    return NextResponse.json({ type: 6 });
  }

  return NextResponse.json({ type: 1 });
}
