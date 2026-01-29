import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// GET all Instagram accounts with linked products
export async function GET() {
  const accounts = await db.select().from(schema.instagramAccounts);
  const products = await db.select().from(schema.products);

  // Map accounts with their linked products
  const accountsWithProducts = accounts.map((account) => {
    const linkedProducts = products.filter((p) => p.instagramAccountId === account.id);
    return {
      ...account,
      linkedProducts: linkedProducts.map((p) => ({ id: p.id, name: p.name })),
    };
  });

  return NextResponse.json(accountsWithProducts);
}

// POST link account to product
export async function POST(req: NextRequest) {
  const { productId, accountId } = await req.json();

  if (!productId || !accountId) {
    return NextResponse.json({ error: "productId and accountId required" }, { status: 400 });
  }

  const account = await db.query.instagramAccounts.findFirst({
    where: eq(schema.instagramAccounts.id, accountId),
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  await db.update(schema.products)
    .set({ instagramAccountId: accountId })
    .where(eq(schema.products.id, productId));

  return NextResponse.json({ success: true });
}

// DELETE unlink account from product
export async function DELETE(req: NextRequest) {
  const { productId } = await req.json();

  if (!productId) {
    return NextResponse.json({ error: "productId required" }, { status: 400 });
  }

  await db.update(schema.products)
    .set({ instagramAccountId: null })
    .where(eq(schema.products.id, productId));

  return NextResponse.json({ success: true });
}
