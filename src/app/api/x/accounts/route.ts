import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export async function GET() {
  const accounts = await db.select().from(schema.xAccounts);
  const products = await db.select().from(schema.products);

  const accountsWithProducts = accounts.map((account) => {
    const linkedProducts = products.filter((p) => p.xAccountId === account.id);
    return {
      ...account,
      linkedProducts: linkedProducts.map((p) => ({ id: p.id, name: p.name })),
    };
  });

  return NextResponse.json(accountsWithProducts);
}

export async function POST(req: NextRequest) {
  const { productId, accountId } = await req.json();
  const parsedProductId = Number(productId);
  const parsedAccountId = Number(accountId);

  if (!Number.isInteger(parsedProductId) || !Number.isInteger(parsedAccountId)) {
    return NextResponse.json({ error: "productId and accountId required" }, { status: 400 });
  }

  const account = await db.query.xAccounts.findFirst({
    where: eq(schema.xAccounts.id, parsedAccountId),
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  await db
    .update(schema.products)
    .set({ xAccountId: parsedAccountId })
    .where(eq(schema.products.id, parsedProductId));

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const { productId } = await req.json();
  const parsedProductId = Number(productId);

  if (!Number.isInteger(parsedProductId)) {
    return NextResponse.json({ error: "productId required" }, { status: 400 });
  }

  await db
    .update(schema.products)
    .set({ xAccountId: null })
    .where(eq(schema.products.id, parsedProductId));

  return NextResponse.json({ success: true });
}
