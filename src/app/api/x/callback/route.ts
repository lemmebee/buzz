import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const X_CLIENT_ID = process.env.X_CLIENT_ID;
const X_CLIENT_SECRET = process.env.X_CLIENT_SECRET;
const X_REDIRECT_URI = process.env.X_REDIRECT_URI;

function clearOAuthCookies(res: NextResponse): void {
  const options = { path: "/", maxAge: 0 };
  res.cookies.set("x_oauth_state", "", options);
  res.cookies.set("x_oauth_verifier", "", options);
  res.cookies.set("x_oauth_product_id", "", options);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const state = req.nextUrl.searchParams.get("state");

  const storedState = req.cookies.get("x_oauth_state")?.value;
  const codeVerifier = req.cookies.get("x_oauth_verifier")?.value;
  const productIdRaw = req.cookies.get("x_oauth_product_id")?.value;
  const productId = productIdRaw ? parseInt(productIdRaw, 10) : null;

  if (error || !code || !state || !storedState || state !== storedState || !codeVerifier) {
    const denied = NextResponse.redirect(new URL("/products?error=x_oauth_denied", req.url));
    clearOAuthCookies(denied);
    return denied;
  }

  if (!X_CLIENT_ID || !X_CLIENT_SECRET || !X_REDIRECT_URI) {
    const missing = NextResponse.redirect(new URL("/products?error=x_oauth_env", req.url));
    clearOAuthCookies(missing);
    return missing;
  }

  try {
    const tokenRes = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: X_REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("X token exchange error:", tokenData);
      const failure = NextResponse.redirect(new URL("/products?error=x_token_exchange", req.url));
      clearOAuthCookies(failure);
      return failure;
    }

    const meRes = await fetch("https://api.x.com/2/users/me?user.fields=username", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });
    const meData = await meRes.json();

    if (!meRes.ok || !meData?.data?.id) {
      console.error("X me endpoint error:", meData);
      const failure = NextResponse.redirect(new URL("/products?error=x_user_fetch", req.url));
      clearOAuthCookies(failure);
      return failure;
    }

    const xUserId = meData.data.id as string;
    const username = (meData.data.username || "") as string;
    const expiresIn = typeof tokenData.expires_in === "number" ? tokenData.expires_in : null;

    const existing = await db.query.xAccounts.findFirst({
      where: eq(schema.xAccounts.xUserId, xUserId),
    });

    let accountId: number;
    if (existing) {
      await db
        .update(schema.xAccounts)
        .set({
          username,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || null,
          tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
        })
        .where(eq(schema.xAccounts.id, existing.id));
      accountId = existing.id;
    } else {
      const inserted = await db
        .insert(schema.xAccounts)
        .values({
          xUserId,
          username,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || null,
          tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
        })
        .returning();
      accountId = inserted[0].id;
    }

    if (productId) {
      await db
        .update(schema.products)
        .set({ xAccountId: accountId })
        .where(eq(schema.products.id, productId));
    }

    const success = NextResponse.redirect(new URL("/products?success=x_linked", req.url));
    clearOAuthCookies(success);
    return success;
  } catch (err) {
    console.error("X OAuth callback error:", err);
    const failed = NextResponse.redirect(new URL("/products?error=x_oauth_unknown", req.url));
    clearOAuthCookies(failed);
    return failed;
  }
}
