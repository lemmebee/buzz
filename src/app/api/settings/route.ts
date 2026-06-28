import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

const SECRET_PATTERN = /(_API_KEY|SECRET|TOKEN|PASSWORD)$/i;

function maskSecret(value: string): string {
  if (value.length >= 4) {
    return `••••${value.slice(-4)}`;
  }
  return "•••• set";
}

export async function GET() {
  const rows = await db.select().from(schema.settings);
  const result: Record<string, string> = {};
  for (const row of rows) {
    if (row.value !== null) {
      if (SECRET_PATTERN.test(row.key)) {
        result[row.key] = maskSecret(row.value);
      } else {
        result[row.key] = row.value;
      }
    }
  }
  return NextResponse.json(result);
}

export async function PUT(req: NextRequest) {
  const { key, value } = await req.json();
  if (!key || typeof key !== "string") {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });

  return NextResponse.json({ ok: true });
}
