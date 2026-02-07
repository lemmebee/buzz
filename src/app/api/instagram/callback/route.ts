import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID!;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET!;
const REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI!;

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const state = req.nextUrl.searchParams.get("state");
  const cookieProductId = req.cookies.get("oauth_product_id")?.value;
  const rawProductId = cookieProductId || state;
  const productId = rawProductId ? parseInt(rawProductId) : null;

  if (error || !code) {
    return NextResponse.redirect(new URL("/settings?error=oauth_denied", req.url));
  }

  try {
    // Exchange code for short-lived token
    const tokenUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", FACEBOOK_APP_ID);
    tokenUrl.searchParams.set("client_secret", FACEBOOK_APP_SECRET);
    tokenUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error("Token exchange error:", tokenData.error);
      return NextResponse.redirect(new URL("/settings?error=token_exchange", req.url));
    }

    const shortLivedToken = tokenData.access_token;

    // Exchange for long-lived token (60 days)
    const longTokenUrl = new URL("https://graph.facebook.com/v19.0/oauth/access_token");
    longTokenUrl.searchParams.set("grant_type", "fb_exchange_token");
    longTokenUrl.searchParams.set("client_id", FACEBOOK_APP_ID);
    longTokenUrl.searchParams.set("client_secret", FACEBOOK_APP_SECRET);
    longTokenUrl.searchParams.set("fb_exchange_token", shortLivedToken);

    const longTokenRes = await fetch(longTokenUrl.toString());
    const longTokenData = await longTokenRes.json();

    const accessToken = longTokenData.access_token;
    const expiresIn = longTokenData.expires_in || 5184000; // Default 60 days

    // Inspect token to get page/IG IDs from granular_scopes
    const debugTokenRes = await fetch(
      `https://graph.facebook.com/v19.0/debug_token?input_token=${accessToken}&access_token=${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`
    );
    const debugTokenData = await debugTokenRes.json();

    // Extract page and Instagram IDs from granular_scopes
    let pageId: string | null = null;
    let instagramUserId: string | null = null;

    const granularScopes = debugTokenData.data?.granular_scopes || [];
    for (const scope of granularScopes) {
      if (scope.scope === "pages_show_list" && scope.target_ids?.length > 0) {
        pageId = scope.target_ids[0];
      }
      if (scope.scope === "instagram_basic" && scope.target_ids?.length > 0) {
        instagramUserId = scope.target_ids[0];
      }
    }

    if (!pageId || !instagramUserId) {
      return NextResponse.redirect(new URL("/settings?error=no_pages", req.url));
    }

    // Get page access token
    const pageTokenRes = await fetch(
      `https://graph.facebook.com/v19.0/${pageId}?fields=access_token&access_token=${accessToken}`
    );
    const pageTokenData = await pageTokenRes.json();

    if (pageTokenData.error || !pageTokenData.access_token) {
      return NextResponse.redirect(new URL("/settings?error=no_page_token", req.url));
    }

    const pageToken = pageTokenData.access_token;

    // Get Instagram username
    const igUserRes = await fetch(
      `https://graph.facebook.com/v19.0/${instagramUserId}?fields=username&access_token=${pageToken}`
    );
    const igUserData = await igUserRes.json();

    // Upsert by instagramUserId
    const existing = await db.query.instagramAccounts.findFirst({
      where: eq(schema.instagramAccounts.instagramUserId, instagramUserId),
    });

    let accountId: number;
    if (existing) {
      await db.update(schema.instagramAccounts)
        .set({
          username: igUserData.username,
          accessToken: pageToken,
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
        })
        .where(eq(schema.instagramAccounts.id, existing.id));
      accountId = existing.id;
    } else {
      const result = await db.insert(schema.instagramAccounts).values({
        instagramUserId,
        username: igUserData.username,
        accessToken: pageToken,
        tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      }).returning();
      accountId = result[0].id;
    }

    // Link to product if productId provided via cookie or state
    if (productId) {
      await db.update(schema.products)
        .set({ instagramAccountId: accountId })
        .where(eq(schema.products.id, productId));
      const res = NextResponse.redirect(new URL(`/products?success=instagram_linked`, req.url));
      res.cookies.delete("oauth_product_id");
      return res;
    }

    const res = NextResponse.redirect(new URL("/settings?success=connected", req.url));
    res.cookies.delete("oauth_product_id");
    return res;
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(new URL("/settings?error=unknown", req.url));
  }
}
