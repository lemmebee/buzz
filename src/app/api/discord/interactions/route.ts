import { NextRequest, NextResponse } from "next/server";
import {
  getDiscordConfig,
  verifyDiscordSignature,
  handleComponentInteraction,
  buildEditModalResponse,
  handleModalSubmit,
  parseEditModalSubmit,
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
    const customId: string = interaction.data?.custom_id || "";
    const [action, postIdStr] = customId.split(":");

    if (action === "edit") {
      const postId = parseInt(postIdStr);
      const modal = postId ? await buildEditModalResponse(postId) : null;
      if (modal) return NextResponse.json(modal);
      return NextResponse.json({
        type: 4,
        data: { content: "Post not found", flags: 64 },
      });
    }

    handleComponentInteraction(interaction).catch((err) =>
      console.error("[Discord] interaction handler error:", err),
    );
    // DEFERRED_UPDATE_MESSAGE - acks click, allows async followup edit
    return NextResponse.json({ type: 6 });
  }

  // MODAL_SUBMIT
  if (interaction.type === 5) {
    const parsed = parseEditModalSubmit(interaction);
    if ("error" in parsed) {
      return NextResponse.json({
        type: 4,
        data: { content: parsed.error, flags: 64 },
      });
    }
    handleModalSubmit(interaction, parsed).catch((err) =>
      console.error("[Discord] modal handler error:", err),
    );
    return NextResponse.json({ type: 6 });
  }

  return NextResponse.json({ type: 1 });
}
