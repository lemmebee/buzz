import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { postId } = await req.json();

  if (!postId) {
    return NextResponse.json({ error: "postId required" }, { status: 400 });
  }

  // Get post
  const post = await db.query.posts.findFirst({
    where: eq(schema.posts.id, postId),
  });

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (post.status === "posted") {
    return NextResponse.json({ error: "Already posted" }, { status: 400 });
  }

  // Get product to find linked Instagram account
  const product = post.productId
    ? await db.query.products.findFirst({
        where: eq(schema.products.id, post.productId),
      })
    : null;

  if (!product?.instagramAccountId) {
    return NextResponse.json(
      { error: "No Instagram account linked to this product" },
      { status: 400 }
    );
  }

  // Get the linked account
  const account = await db.query.instagramAccounts.findFirst({
    where: eq(schema.instagramAccounts.id, product.instagramAccountId),
  });

  if (!account) {
    return NextResponse.json(
      { error: "Linked Instagram account not found" },
      { status: 400 }
    );
  }

  const accessToken = account.accessToken;
  const igUserId = account.instagramUserId;

  // Build caption with hashtags
  const hashtags = post.hashtags ? JSON.parse(post.hashtags) : [];
  const caption = hashtags.length > 0
    ? `${post.content}\n\n${hashtags.map((t: string) => `#${t}`).join(" ")}`
    : post.content;

  try {
    // For posts/carousels with images
    if (post.mediaUrl) {
      // Step 1: Create media container
      const containerRes = await fetch(
        `https://graph.facebook.com/v19.0/${igUserId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: post.mediaUrl,
            caption,
            access_token: accessToken,
          }),
        }
      );

      const containerData = await containerRes.json();

      if (containerData.error) {
        console.error("Container creation error:", containerData.error);
        return NextResponse.json(
          { error: containerData.error.message },
          { status: 500 }
        );
      }

      const containerId = containerData.id;

      // Step 2: Publish the container
      const publishRes = await fetch(
        `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: containerId,
            access_token: accessToken,
          }),
        }
      );

      const publishData = await publishRes.json();

      if (publishData.error) {
        console.error("Publish error:", publishData.error);
        return NextResponse.json(
          { error: publishData.error.message },
          { status: 500 }
        );
      }

      // Update post status
      await db
        .update(schema.posts)
        .set({
          status: "posted",
          instagramId: publishData.id,
          postedAt: new Date(),
        })
        .where(eq(schema.posts.id, postId));

      return NextResponse.json({
        success: true,
        instagramId: publishData.id,
      });
    } else {
      // Text-only posts not supported by Instagram API
      // Instagram requires an image for all posts
      return NextResponse.json(
        { error: "Media URL required for Instagram posts" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Instagram posting error:", error);
    return NextResponse.json(
      { error: "Failed to post to Instagram" },
      { status: 500 }
    );
  }
}
