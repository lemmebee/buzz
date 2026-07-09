import { spawn } from "child_process";
import type { TextProvider, TextGenerationInput, TextGenerationOutput, ProviderConfig } from "./types";
import { materializeToFile, parentDirs } from "./image-input";

const DEFAULT_BIN = "/home/mrg/.local/bin/agy";
const DEFAULT_MODEL = "GPT-OSS 120B (Medium)";
const DEFAULT_TIMEOUT = 120_000;

export function createAntigravityTextProvider(config: ProviderConfig = {}): TextProvider {
  const bin = config.baseUrl || process.env.ANTIGRAVITY_BIN || DEFAULT_BIN;
  const model = config.model || process.env.ANTIGRAVITY_MODEL || DEFAULT_MODEL;

  return {
    name: `antigravity/${model}`,

    async generate(input: TextGenerationInput): Promise<TextGenerationOutput> {
      // agy has no image flag; it opens files itself when granted the directory.
      const imagePaths = (input.images ?? [])
        .map(materializeToFile)
        .filter((p): p is string => p !== null);

      const attachments = imagePaths.length
        ? `\n\nIMAGES — read each file with your Read tool and look at it:\n${imagePaths.join("\n")}`
        : "";

      const combined = `${input.systemPrompt}\n\n---\n\n${input.userPrompt}${attachments}`;

      const args = [
        "--print",
        "--model", model,
        "--print-timeout", `${Math.ceil(DEFAULT_TIMEOUT / 1000)}s`,
        ...parentDirs(imagePaths).flatMap((d) => ["--add-dir", d]),
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
