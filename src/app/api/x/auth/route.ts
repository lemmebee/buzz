import { randomBytes, createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const X_CLIENT_ID = process.env.X_CLIENT_ID;
const X_REDIRECT_URI = process.env.X_REDIRECT_URI;

function base64UrlSha256(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

export async function GET(req: NextRequest) {
  if (!X_CLIENT_ID || !X_REDIRECT_URI) {
    return NextResponse.json({ error: "Missing X OAuth env vars" }, { status: 500 });
  }

  const productId = req.nextUrl.searchParams.get("productId");
  const state = randomBytes(24).toString("hex");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = base64UrlSha256(codeVerifier);

  const authUrl = new URL("https://twitter.com/i/oauth2/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", X_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", X_REDIRECT_URI);
  authUrl.searchParams.set("scope", "tweet.read tweet.write users.read offline.access media.write");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const res = NextResponse.redirect(authUrl.toString());
  res.cookies.set("x_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  res.cookies.set("x_oauth_verifier", codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  if (productId) {
    res.cookies.set("x_oauth_product_id", productId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
  }

  return res;
}
