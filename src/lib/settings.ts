import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.query.settings.findFirst({
    where: eq(schema.settings.key, key),
  });
  return row?.value ?? null;
}

export async function getTextProvider(): Promise<string> {
  return (
    (await getSetting("TEXT_PROVIDER")) ||
    process.env.TEXT_PROVIDER ||
    "gemini"
  );
}
