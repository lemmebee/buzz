import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

interface ContainerParams {
  caption: string;
  access_token: string;
  image_url?: string;
  video_url?: string;
  media_type?: "REELS" | "STORIES" | "VIDEO";
  share_to_feed?: boolean;
}

function buildContainerParams(
  post: typeof schema.content.$inferSelect,
  mediaUrl: string,
  caption: string,
  accessToken: string
): ContainerParams | { error: string } {
  const params: ContainerParams = { caption, access_token: accessToken };
  const surface = post.targetSurface;
  const media = post.mediaType;

  if (media === "image") {
    if (surface === "post") {
      params.image_url = mediaUrl;
    } else if (surface === "story") {
      params.image_url = mediaUrl;
      params.media_type = "STORIES";
    } else if (surface === "reel") {
      return { error: "Cannot publish an image as a Reel. Choose Post or Story." };
    } else {
      return { error: `Surface "${surface}" not supported for image content yet.` };
    }
  } else if (media === "video") {
    if (surface === "reel") {
      params.video_url = mediaUrl;
      params.media_type = "REELS";
      params.share_to_feed = true;
    } else if (surface === "post") {
      params.video_url = mediaUrl;
      params.media_type = "VIDEO";
    } else if (surface === "story") {
      params.video_url = mediaUrl;
      params.media_type = "STORIES";
    } else {
      return { error: `Surface "${surface}" not supported for video content yet.` };
    }
  } else {
    return { error: `Unknown media type: ${media}` };
  }

  return params;
}

export async function publishPost(
  postId: number
): Promise<{ success: boolean; error?: string; instagramId?: string }> {
  const post = await db.query.content.findFirst({
    where: eq(schema.content.id, postId),
  });

  if (!post) return { success: false, error: "Post not found" };
  if (post.status === "posted") return { success: false, error: "Already posted" };

  const product = post.productId
    ? await db.query.products.findFirst({
        where: eq(schema.products.id, post.productId),
      })
    : null;

  if (!product?.instagramAccountId) {
    return { success: false, error: "No Instagram account linked to this product" };
  }

  const account = await db.query.instagramAccounts.findFirst({
    where: eq(schema.instagramAccounts.id, product.instagramAccountId),
  });

  if (!account) return { success: false, error: "Linked Instagram account not found" };

  const mediaUrl = post.publicMediaUrl;
  if (!mediaUrl || mediaUrl.startsWith("/")) {
    return { success: false, error: "Missing public media URL. Re-generate this post to get one." };
  }

  const accessToken = account.accessToken;
  const igUserId = account.instagramUserId;

  const hashtags = post.hashtags ? JSON.parse(post.hashtags) : [];
  const caption =
    hashtags.length > 0
      ? `${post.content}\n\n${hashtags.map((t: string) => `#${t.replace(/^#+/, "")}`).join(" ")}`
      : post.content;

  const params = buildContainerParams(post, mediaUrl, caption, accessToken);
  if ("error" in params) return { success: false, error: params.error };

  const isVideo = post.mediaType === "video";
  const maxPollAttempts = isVideo ? 90 : 30; // video processing is slower
  const pollIntervalMs = 2000;

  try {
    const containerRes = await fetch(
      `https://graph.facebook.com/v19.0/${igUserId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      }
    );

    const containerData = await containerRes.json();
    if (containerData.error) {
      console.error("Container creation error:", containerData.error);
      return { success: false, error: containerData.error.message };
    }

    const containerId = containerData.id;
    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
      const statusRes = await fetch(
        `https://graph.facebook.com/v19.0/${containerId}?fields=status_code&access_token=${accessToken}`
      );
      const statusData = await statusRes.json();
      if (statusData.status_code === "FINISHED") break;
      if (statusData.status_code === "ERROR") {
        console.error("Container processing failed:", statusData);
        return { success: false, error: "Instagram failed to process the media" };
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

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

    await db
      .update(schema.content)
      .set({
        status: "posted",
        instagramId: publishData.id,
        postedAt: new Date(),
      })
      .where(eq(schema.content.id, postId));

    return { success: true, instagramId: publishData.id };
  } catch (error) {
    console.error("Instagram posting error:", error);
    return { success: false, error: "Failed to post to Instagram" };
  }
}
