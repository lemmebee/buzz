import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

// GET connected Instagram account
export async function GET() {
  const accounts = await db.select().from(schema.instagramAccounts);

  if (accounts.length === 0) {
    return NextResponse.json({ connected: false });
  }

  const account = accounts[0];
  return NextResponse.json({
    connected: true,
    username: account.username,
    expiresAt: account.tokenExpiresAt,
  });
}

// DELETE disconnect Instagram account
export async function DELETE() {
  await db.delete(schema.instagramAccounts);
  return NextResponse.json({ success: true });
}
