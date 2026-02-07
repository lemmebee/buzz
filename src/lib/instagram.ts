import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export async function publishPost(
  postId: number
): Promise<{ success: boolean; error?: string; instagramId?: string }> {
  const post = await db.query.posts.findFirst({
    where: eq(schema.posts.id, postId),
  });

  if (!post) return { success: false, error: "Post not found" };
  if (post.status === "posted")
    return { success: false, error: "Already posted" };

  const product = post.productId
    ? await db.query.products.findFirst({
        where: eq(schema.products.id, post.productId),
      })
    : null;

  if (!product?.instagramAccountId)
    return { success: false, error: "No Instagram account linked to this product" };

  const account = await db.query.instagramAccounts.findFirst({
    where: eq(schema.instagramAccounts.id, product.instagramAccountId),
  });

  if (!account)
    return { success: false, error: "Linked Instagram account not found" };

  const imageUrl = post.publicMediaUrl;
  if (!imageUrl || imageUrl.startsWith("/"))
    return { success: false, error: "Missing public image URL. Re-generate this post to get one." };

  const accessToken = account.accessToken;
  const igUserId = account.instagramUserId;

  const hashtags = post.hashtags ? JSON.parse(post.hashtags) : [];
  const caption =
    hashtags.length > 0
      ? `${post.content}\n\n${hashtags.map((t: string) => `#${t}`).join(" ")}`
      : post.content;

  try {
    // Step 1: Create media container
    const containerRes = await fetch(
      `https://graph.facebook.com/v19.0/${igUserId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: imageUrl,
          caption,
          access_token: accessToken,
        }),
      }
    );

    const containerData = await containerRes.json();
    if (containerData.error) {
      console.error("Container creation error:", containerData.error);
      return { success: false, error: containerData.error.message };
    }

    // Step 2: Wait for container to be ready
    const containerId = containerData.id;
    for (let attempt = 0; attempt < 30; attempt++) {
      const statusRes = await fetch(
        `https://graph.facebook.com/v19.0/${containerId}?fields=status_code&access_token=${accessToken}`
      );
      const statusData = await statusRes.json();
      if (statusData.status_code === "FINISHED") break;
      if (statusData.status_code === "ERROR") {
        console.error("Container processing failed:", statusData);
        return { success: false, error: "Instagram failed to process the image" };
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Step 3: Publish the container
    const publishRes = await fetch(
      `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: containerData.id,
          access_token: accessToken,
        }),
      }
    );

    const publishData = await publishRes.json();
    if (publishData.error) {
      console.error("Publish error:", publishData.error);
      return { success: false, error: publishData.error.message };
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

    return { success: true, instagramId: publishData.id };
  } catch (error) {
    console.error("Instagram posting error:", error);
    return { success: false, error: "Failed to post to Instagram" };
  }
}
