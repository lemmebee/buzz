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

    // Collect ALL page IDs from granular_scopes
    const granularScopes = debugTokenData.data?.granular_scopes || [];
    const pageIds: string[] = [];
    for (const scope of granularScopes) {
      if (scope.scope === "pages_show_list" && scope.target_ids?.length > 0) {
        pageIds.push(...scope.target_ids);
      }
    }

    if (pageIds.length === 0) {
      return NextResponse.redirect(new URL("/settings?error=no_pages", req.url));
    }

    // For each page, get page token + linked IG business account, upsert
    const upsertedAccountIds: number[] = [];

    for (const pageId of pageIds) {
      const pageRes = await fetch(
        `https://graph.facebook.com/v19.0/${pageId}?fields=access_token,instagram_business_account{id,username}&access_token=${accessToken}`
      );
      const pageData = await pageRes.json();

      if (pageData.error || !pageData.access_token) {
        console.error(`Page ${pageId} token error:`, pageData.error);
        continue;
      }

      const igBusiness = pageData.instagram_business_account;
      if (!igBusiness?.id) {
        continue;
      }

      const instagramUserId = igBusiness.id;
      const username = igBusiness.username || null;
      const pageToken = pageData.access_token;

      const existing = await db.query.instagramAccounts.findFirst({
        where: eq(schema.instagramAccounts.instagramUserId, instagramUserId),
      });

      let accountId: number;
      if (existing) {
        await db.update(schema.instagramAccounts)
          .set({
            username,
            accessToken: pageToken,
            tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          })
          .where(eq(schema.instagramAccounts.id, existing.id));
        accountId = existing.id;
      } else {
        const result = await db.insert(schema.instagramAccounts).values({
          instagramUserId,
          username,
          accessToken: pageToken,
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
        }).returning();
        accountId = result[0].id;
      }

      upsertedAccountIds.push(accountId);
    }

    if (upsertedAccountIds.length === 0) {
      return NextResponse.redirect(new URL("/settings?error=no_instagram", req.url));
    }

    // Link to product if productId provided
    if (productId && upsertedAccountIds.length === 1) {
      // Single account: auto-link
      await db.update(schema.products)
        .set({ instagramAccountId: upsertedAccountIds[0] })
        .where(eq(schema.products.id, productId));
      const res = NextResponse.redirect(new URL("/products?success=instagram_linked", req.url));
      res.cookies.delete("oauth_product_id");
      return res;
    }

    if (productId) {
      // Multiple accounts: let user pick via InstagramLinkModal
      const res = NextResponse.redirect(new URL("/products?success=instagram_connected", req.url));
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
