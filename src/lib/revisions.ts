import { db, schema } from "@/lib/db";
import type { Product } from "../../drizzle/schema";

const VERSIONED_FIELDS = ["planFile", "profile", "marketingStrategy"] as const;
type VersionedField = (typeof VERSIONED_FIELDS)[number];

export async function snapshotChangedFields(
  existing: Product,
  updates: Partial<Record<VersionedField, string | null>>,
  source: "manual" | "extraction",
) {
  const rows = [];
  for (const field of VERSIONED_FIELDS) {
    const oldVal = existing[field];
    const newVal = updates[field];
    // Only snapshot if: field is being updated, old value exists, and value actually changed
    if (newVal !== undefined && oldVal && oldVal !== newVal) {
      rows.push({
        productId: existing.id,
        field,
        content: oldVal,
        textProvider: existing.textProvider,
        source,
      });
    }
  }
  if (rows.length > 0) {
    await db.insert(schema.productRevisions).values(rows);
  }
}
