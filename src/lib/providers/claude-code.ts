import { spawn } from "child_process";
import type { TextProvider, TextGenerationInput, TextGenerationOutput, ProviderConfig } from "./types";
import { materializeToFile, parentDirs } from "./image-input";

const DEFAULT_BIN = "/home/mrg/.local/bin/claude";
const DEFAULT_MODEL = "sonnet";
const DEFAULT_TIMEOUT = 120_000;

// Known model aliases the Claude Code CLI accepts for --model. These are
// aliases (latest-of-family) rather than pinned ids, matching how the CLI
// resolves them; full ids also work if a user types one.
const KNOWN_MODELS = ["sonnet", "opus", "haiku"];

export function createClaudeCodeTextProvider(config: ProviderConfig = {}): TextProvider {
  const bin = config.baseUrl || process.env.CLAUDE_CODE_BIN || DEFAULT_BIN;
  const model = config.model || process.env.CLAUDE_CODE_MODEL || DEFAULT_MODEL;

  return {
    name: `claude-code/${model}`,

    async generate(input: TextGenerationInput): Promise<TextGenerationOutput> {
      // The CLI reads images referenced as @<abs-path> in the prompt.
      const imagePaths = (input.images ?? [])
        .map(materializeToFile)
        .filter((p): p is string => p !== null);

      const attachments = imagePaths.length
        ? `\n\nIMAGES — look at each one:\n${imagePaths.map((p) => `@${p}`).join("\n")}`
        : "";

      const combined = `${input.systemPrompt}\n\n---\n\n${input.userPrompt}${attachments}`;

      const args = [
        "--print",
        "--model", model,
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
          reject(new Error(`Claude Code CLI error: ${error.message}`));
        });

        child.on("close", (code) => {
          if (code !== 0) {
            reject(new Error(`Claude Code CLI exited with code ${code}: ${stderr}`));
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

export async function listClaudeCodeModels(): Promise<string[]> {
  // The Claude Code CLI has no "list models" command; expose the known aliases.
  return KNOWN_MODELS;
}
