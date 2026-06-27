import { spawn } from "child_process";
import type { TextProvider, TextGenerationInput, TextGenerationOutput, ProviderConfig } from "./types";

const DEFAULT_BIN = "/home/mrg/.local/bin/agy";
const DEFAULT_MODEL = "GPT-OSS 120B (Medium)";
const DEFAULT_TIMEOUT = 120_000;

export function createAntigravityTextProvider(config: ProviderConfig = {}): TextProvider {
  const bin = config.baseUrl || process.env.ANTIGRAVITY_BIN || DEFAULT_BIN;
  const model = config.model || process.env.ANTIGRAVITY_MODEL || DEFAULT_MODEL;

  return {
    name: `antigravity/${model}`,

    async generate(input: TextGenerationInput): Promise<TextGenerationOutput> {
      if (input.images?.length) {
        console.warn("[Antigravity] images not supported, ignoring");
      }

      const combined = `${input.systemPrompt}\n\n---\n\n${input.userPrompt}`;

      const args = [
        "--print",
        "--model", model,
        "--print-timeout", `${Math.ceil(DEFAULT_TIMEOUT / 1000)}s`,
      ];

      const text = await new Promise<string>((resolve, reject) => {
        const child = spawn(bin, args, {
          stdio: ["pipe", "pipe", "pipe"],
          timeout: DEFAULT_TIMEOUT,
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (d) => { stdout += d.toString(); });
        child.stderr.on("data", (d) => { stderr += d.toString(); });

        child.on("error", (error) => {
          reject(new Error(`Antigravity CLI error: ${error.message}`));
        });

        child.on("close", (code) => {
          if (code !== 0) {
            reject(new Error(`Antigravity CLI exited with code ${code}: ${stderr}`));
            return;
          }
          resolve(stdout.trim());
        });

        child.stdin.write(combined);
        child.stdin.end();
      });

      return { text };
    },
  };
}

export async function listAntigravityModels(bin?: string): Promise<string[]> {
  const binary = bin || process.env.ANTIGRAVITY_BIN || DEFAULT_BIN;

  return new Promise((resolve, reject) => {
    const child = spawn(binary, ["models"], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    child.on("error", (error) => {
      reject(new Error(`Failed to list models: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Failed to list models (exit ${code}): ${stderr}`));
        return;
      }
      const models = stdout.trim().split("\n").map((l) => l.trim()).filter(Boolean);
      resolve(models);
    });
  });
}
