import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { enforceTwitterConstraints } from "@/lib/platforms/twitter";

async function uploadMediaToX(accessToken: string, mediaUrl: string): Promise<string> {
  const mediaRes = await fetch(mediaUrl);
  if (!mediaRes.ok) {
    throw new Error("Failed to download media URL");
  }

  const contentType = mediaRes.headers.get("content-type") || "image/jpeg";
  const mediaBuffer = Buffer.from(await mediaRes.arrayBuffer());

  const form = new FormData();
  form.append("media", new Blob([mediaBuffer], { type: contentType }), "upload.jpg");

  const uploadRes = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  const uploadData = await uploadRes.json();
  if (!uploadRes.ok || !uploadData.media_id_string) {
    throw new Error(uploadData?.error || uploadData?.detail || "Failed to upload media to X");
  }

  return uploadData.media_id_string as string;
}

export async function POST(req: NextRequest) {
  const { postId } = await req.json();
  const parsedPostId = Number(postId);

  if (!postId || !Number.isInteger(parsedPostId)) {
    return NextResponse.json({ error: "postId required" }, { status: 400 });
  }

  const post = await db.query.posts.findFirst({
    where: eq(schema.posts.id, parsedPostId),
  });

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (post.status === "posted") {
    return NextResponse.json({ error: "Already posted" }, { status: 400 });
  }

  if (post.platform !== "twitter") {
    return NextResponse.json({ error: "This post is not set to X platform" }, { status: 400 });
  }

  const product = post.productId
    ? await db.query.products.findFirst({ where: eq(schema.products.id, post.productId) })
    : null;

  if (!product?.xAccountId) {
    return NextResponse.json({ error: "No X account linked to this product" }, { status: 400 });
  }

  const account = await db.query.xAccounts.findFirst({
    where: eq(schema.xAccounts.id, product.xAccountId),
  });

  if (!account) {
    return NextResponse.json({ error: "Linked X account not found" }, { status: 400 });
  }

  let parsedHashtags: unknown = [];
  try {
    parsedHashtags = post.hashtags ? JSON.parse(post.hashtags) : [];
  } catch {
    parsedHashtags = [];
  }
  const constrained = enforceTwitterConstraints(post.content, parsedHashtags);
  const tweetText = constrained.tweetText;

  if (tweetText.length > 280) {
    return NextResponse.json(
      { error: "Post exceeds 280 characters after hashtags. Shorten content or hashtags." },
      { status: 400 }
    );
  }

  try {
    let mediaId: string | undefined;
    if (post.mediaUrl) {
      mediaId = await uploadMediaToX(account.accessToken, post.mediaUrl);
    }

    const createRes = await fetch("https://api.x.com/2/tweets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${account.accessToken}`,
      },
      body: JSON.stringify(
        mediaId
          ? {
              text: tweetText,
              media: { media_ids: [mediaId] },
            }
          : {
              text: tweetText,
            }
      ),
    });

    const createData = await createRes.json();
    if (!createRes.ok || !createData?.data?.id) {
      console.error("X post creation error:", createData);
      return NextResponse.json({ error: createData?.detail || "Failed to post to X" }, { status: 500 });
    }

    const xPostId = createData.data.id as string;

    await db
      .update(schema.posts)
      .set({
        status: "posted",
        postedAt: new Date(),
        xPostId,
      })
      .where(eq(schema.posts.id, parsedPostId));

    return NextResponse.json({ success: true, xPostId });
  } catch (error) {
    console.error("X posting error:", error);
    return NextResponse.json({ error: "Failed to post to X" }, { status: 500 });
  }
}
