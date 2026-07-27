# TASK 05 — CTO Review

**Verdict:** Changes requested. Your diagnosis was wrong, but while disproving it I found a real problem you couldn't have known about.

---

## 1. The CLI does not hang

You reported: *"even `echo "Hello" | claude --print` times out"*. I ran exactly that:

```
$ echo "Hello" | timeout 120 /home/mrg/.local/bin/claude --print --model haiku
Hey! What can I help you with?
--- exit: 0 ---
```

Works. Seconds. This is the **fourth** round where a claimed blocker didn't survive checking, and the second time "it hangs" was reported for something that runs fine. Before concluding a tool is broken, run the smallest possible version of it and paste the output. If that had happened here, the next 20 minutes of "CLI needs investigation" wouldn't have existed.

## 2. Your actual bug: a 30-second timeout

`client.ts:229` and `client.ts:241` pass `30_000` to `spawnCli`.

I ran your `--balance` mode:
```
Spike failed: Claude Code CLI exited with code 143
```
**143 = 128 + 15 = SIGTERM.** That's your own `timeout` option killing the child. Not a hang — a deadline.

Measured reality of a CLI + MCP round trip:
- fastest observed: ~15s
- slowest observed: **99s**

30s was never going to work. **Fix: 180s minimum for balance/cost, 300s for image, 900s for video.**

## 3. The real discovery: MCP availability is intermittent

This is the important part, and it's not your fault.

I ran the identical balance command five times. Results:

| Run | Outcome |
|---|---|
| 1 | ✅ `1615.15 credits, plus` |
| 2 | ❌ tool not available — "Do you have an MCP server for HiggsField?" |
| 3 | ❌ tool not available |
| 4 | ✅ `1,615.15 credits, Plus` |
| 5 | ✅ `1,615.15 credits` |

**~60% success rate.** Same command, same machine, same session. When it fails, the CLI doesn't error — the model cheerfully explains it can't find the tool and exits **0**. Silent, plausible, wrong: the failure mode I've been flagging all along.

This matches the documented caveat that interactively-authenticated MCP servers (claude.ai) may be absent in headless runs. It is a property of the transport, not of your code.

### Required: treat a missing tool as a retryable failure

1. **Detect it.** A run that exits 0 without parseable JSON is a **failure**, not success. Never let prose fall through as a result.
2. **Retry with backoff** — 3 attempts. At 60% per attempt that's ~94% overall.
3. **Log each attempt** at `[higgsfield]` so flakiness is visible rather than mysterious.
4. **Exhausted retries → a clear terminal error**: "Higgsfield MCP was not available to the Claude Code CLI after 3 attempts."

Reuse the existing backoff style rather than inventing one.

---

## 4. Report accuracy

> `npm run lint → 0 errors, 0 warnings`

There is still 1 warning (`settings/page.tsx:135`, pre-existing, not yours). I checked you hadn't modified that file — you hadn't, which is correct scope discipline. But this is the third time a number in a report hasn't matched what the command prints. Paste the output; don't summarise it.

---

## Credited

- `spawnCli` structure correctly mirrors `claude-code.ts` — stdin-piped prompt, scoped `--allowedTools`, stdout collected. The shape is right.
- S5 and S6 done.
- `tsc` clean, verified independently.
- Keeping `hf_url` alongside `hf_media_id` instead of renaming: I asked for a rename, but your additive approach is **safer** on SQLite and matches the codebase's nullable-add convention. Good call — keep it.

---

## Work

1. Timeouts → 180s (balance/cost), 300s (image), 900s (video).
2. Missing-tool detection + 3-attempt retry with backoff + `[higgsfield]` logging.
3. Exit-0-without-valid-JSON must be treated as failure.

## Verification (paste literal output)

```
npx tsc --noEmit
npm run lint
npx tsx scripts/test-higgsfield.ts --balance
npx tsx scripts/test-higgsfield.ts --balance
npx tsx scripts/test-higgsfield.ts --balance
```

Run `--balance` **three times**. Expected: 1615.15 credits every time, with retry lines visible in the log on the attempts that needed them. That is the proof the retry layer works — a single green run proves nothing on a 60%-reliable transport.

Do not run generate mode yet.

Still do not commit.
