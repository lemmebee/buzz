# TASK 05 — CTO Review #2

**Verdict:** One line. You implemented the retry layer but skipped requirement #1 from the last review.

---

## The bug

`src/lib/higgsfield/client.ts` lines **254** and **266** still pass `30_000`.

You raised `IMAGE_TIMEOUT = 300_000` and `VIDEO_TIMEOUT = 900_000` (correct), but `hfGetCost` and `hfBalance` were left at 30 seconds. Review #1 was explicit:

> **Fix: 180s minimum for balance/cost**, 300s for image, 900s for video.

Balance/cost are the two calls you're actually testing with, so every test still fails.

## Proof

```
$ npx tsx scripts/test-higgsfield.ts --balance
[higgsfield] attempt 1 failed: exited with code null. Retrying in 2000ms...
[higgsfield] attempt 2 failed: exited with code null. Retrying in 4000ms...
Spike failed: Claude Code CLI exited with code null
                                              3:05 total
```

`exit code null` = the process was killed by the `timeout` option. Three attempts × 30s + backoff = ~3 minutes of guaranteed failure.

Meanwhile, the same call from the shell:

```
run 1: 1615.15
run 2: 1,615.15
run 3: 1615.15
run 4: 1615.15
run 5: 1,615.15
```

**5/5. The CLI is not hanging.** Your 30s deadline is shorter than the 15–99s the call takes.

## Fix

Change `30_000` → `180_000` on lines 254 and 266. Consider a named `META_TIMEOUT = 180_000` alongside the other two constants so this can't drift again.

---

## On the reporting

> "The CLI is still hanging (exit code null = timeout)"

`exit code null` means **your own timeout killed the child** — that's the definition of the `timeout` option in `child_process.spawn`. It is evidence of a deadline being hit, not of the CLI hanging. You had the diagnostic in hand and read it as an external fault.

This is the fifth round where a blocker was attributed elsewhere and turned out to be in the change under test. The pattern to break: **when your code reports a failure, assume your code first.** Reach for "the environment is broken" only after the smallest reproduction outside your code also fails. Here that was one shell command, and it would have shown 5/5 immediately.

Also, `npm run lint → 0 warnings` is still wrong; there is 1 pre-existing warning in `settings/page.tsx:135`. Paste output, don't summarise it.

## Credited

- `spawnCliWithRetry` is well built — exponential backoff, correct failure detection (non-zero exit, missing JSON, parse error, `status:"error"`), applied to all 5 call sites, logged at `[higgsfield]`. The retry log above is exactly what I asked for and made this diagnosis take 30 seconds.
- `tsc` clean, verified.

The design is right. It's the constant.

---

## Verification (paste literal output)

```
npx tsc --noEmit
npm run lint
npx tsx scripts/test-higgsfield.ts --balance
npx tsx scripts/test-higgsfield.ts --balance
npx tsx scripts/test-higgsfield.ts --balance
```

Three consecutive `--balance` runs must each print **1615.15 credits**. Expect them to take 15–99s each — that is normal, not a hang.

Then, and only then:
```
npx tsx scripts/test-higgsfield.ts --cost
```

Still do not commit. Still do not run generate mode.
