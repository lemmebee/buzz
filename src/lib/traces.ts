import { db, schema } from "@/lib/db";
import type { NewGenerationTrace } from "../../drizzle/schema";

const SECRET_PATTERN = /(_API_KEY|SECRET|TOKEN|PASSWORD|CREDENTIALS)$/i;

function redactSecrets(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    if (SECRET_PATTERN.test(obj)) return "•••• redacted";
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(redactSecrets);
  }
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (SECRET_PATTERN.test(key)) {
        result[key] = "•••• redacted";
      } else {
        result[key] = redactSecrets(value);
      }
    }
    return result;
  }
  return obj;
}

export async function trace(entry: NewGenerationTrace): Promise<void> {
  try {
    const redactedInput = entry.input ? redactSecrets(JSON.parse(entry.input)) : undefined;
    const redactedOutput = entry.output ? redactSecrets(JSON.parse(entry.output)) : undefined;
    
    await db.insert(schema.generationTraces).values({
      ...entry,
      input: redactedInput ? JSON.stringify(redactedInput) : entry.input,
      output: redactedOutput ? JSON.stringify(redactedOutput) : entry.output,
    });
  } catch (err) {
    // Tracing must never break generation
    console.warn("[traces] failed to write trace:", err instanceof Error ? err.message : err);
  }
}

/**
 * Time a call and record it as ONE trace holding both sides of the exchange.
 *
 * `serializeOutput` turns the result into the recorded output. Without it the
 * output is left empty rather than filled with a placeholder — a row claiming
 * "success" with no payload is worse than an honest blank, and splitting input
 * and output across two rows makes a single call look like two steps.
 */
export async function timed<T>(
  entry: Omit<NewGenerationTrace, "durationMs" | "status" | "error">,
  fn: () => Promise<T>,
  serializeOutput?: (result: T) => unknown
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - startTime;

    await trace({
      ...entry,
      durationMs,
      status: "ok",
      output: serializeOutput ? JSON.stringify(serializeOutput(result)) : entry.output ?? null,
    });

    return result;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);
    
    await trace({
      ...entry,
      durationMs,
      status: "error",
      error: errorMessage,
    });
    
    throw err;
  }
}
