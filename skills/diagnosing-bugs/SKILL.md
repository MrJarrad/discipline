---
name: diagnosing-bugs
description: Diagnosis discipline for hard or intermittent bugs and performance regressions — build a tight, red-capable feedback loop before forming any theory. Use when a bug is explicitly flagged as hard to pin down, when a first fix attempt failed, or when a reproducible failure needs a real investigation rather than a guess. Not for typo fixes or obvious one-line errors — that's normal work.
---

# Diagnosing Bugs

Sits under `flux-quality` (the bar for verification, evidence, and honesty). This
skill doesn't restate that loop — it adds the one discipline hard bugs need on top
of it: **build a feedback loop before you theorize.**

Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) before applying this skill.

**Not for:** typo fixes, obvious one-line errors, or greenfield feature work — that's normal work.

---

## The core discipline

If you have a **tight, red-capable** pass/fail signal for the bug — one that goes
red on *this* bug, on the user's exact symptom — you will find the cause. If you
don't, no amount of reading code and theorizing will save you.

**No red-capable command, no theorizing.** If you catch yourself reading code to
build a theory before that command exists and you've watched it fail, stop. Go
build the loop instead.

Spend disproportionate effort here. Be aggressive, be creative, refuse to give up
before trying several of the options below.

---

## Building the loop — try roughly in this order

1. **Failing test** at whatever seam reaches the bug — unit, integration, e2e.
2. **Curl / HTTP script** against a running dev server.
3. **CLI invocation** with a fixture input, diffing output against a known-good snapshot.
4. **Headless browser script** (Playwright or similar) — drives the UI, asserts on DOM/console/network.
5. **Replay a captured trace** — save a real request/payload/event log; replay it through the code path in isolation.
6. **Throwaway harness** — minimal subset of the system (one service, mocked deps), single function call.
7. **Property / fuzz loop** — many random inputs, for "sometimes wrong output" bugs.
8. **Bisection harness** — automate boot-at-state-X when the bug appeared between two known commits/versions.
9. **Differential loop** — same input through old vs. new version, diff the outputs.
10. **Human-in-the-loop script** as last resort, when a human must click and no headless path exists yet — a small script that walks the human through repro steps and captures the output at each step for diffing. Still aim to automate it away as soon as a scripted path exists; delete it once you're done.

Once you have *a* loop, tighten it: make it faster (skip unrelated init), sharper
(assert the specific symptom, not "didn't crash"), and more deterministic (pin
time, seed RNG, isolate filesystem, freeze network). A 30-second flaky loop is
barely better than no loop; a 2-second deterministic one is a debugging
superpower.

**Non-deterministic bugs:** raise the reproduction rate — loop the trigger 100x,
parallelize, add stress, inject sleeps. A 50%-flake bug is debuggable; 1% is not.

**When you genuinely cannot build a loop:** stop and say so explicitly. List what
you tried. Ask for environment access, a captured artifact (HAR, log dump,
recording), or permission for temporary production instrumentation. Do not
proceed to hypothesize without a loop.

**Loop is done when it is:**
- **Red-capable** — drives the actual bug code path and asserts the user's exact symptom
- **Deterministic** — same verdict every run (or a pinned, high flake rate)
- **Fast** — seconds, not minutes
- **Already run** — you have the invocation and its output, not a plan to run it

---

## Reproduce, then minimize

Run the loop, watch it go red. Confirm the failure matches what the user actually
described — not a nearby failure that merely looks similar.

Then shrink to the smallest scenario that still goes red: cut inputs, callers,
config, data, steps one at a time, re-running after each cut. Done when every
remaining element is load-bearing — removing any one turns the loop green.

Do not fix before minimizing. Wrong bug in view, wrong fix ships.

---

## Hypothesize, then instrument

Generate 3–5 ranked hypotheses before testing any of them. Each must be
falsifiable: "if X is the cause, then Y will make the bug disappear / Z will make
it worse." Surface the ranked list before probing — a human or the wider team may
re-rank it instantly with context you don't have.

Instrument to test one hypothesis at a time, changing one variable per probe.
Prefer a debugger or REPL when the environment supports it; otherwise use
targeted logs at the boundaries that actually distinguish hypotheses. Never "log
everything and grep" — noise hides the signal.

**Tag every debug log** with a unique prefix (e.g. `[DEBUG-a4f2]`) so cleanup is
one grep.

**Performance regressions:** establish a baseline measurement first (timing
harness, profiler, query plan), then bisect. Measure first, fix second — logs are
usually wrong about where the time goes.

---

## Fix, regression-test, clean up

Write the regression test **before** the fix, from the minimized repro — but only
if a correct seam exists (a seam that exercises the real bug pattern at the
actual call site, not a shallow one that would give false confidence). If no
correct seam exists, that absence is itself a finding — note it for an
architecture follow-up rather than forcing a shallow test.

With a seam: turn the minimized repro into a failing test, watch it fail, apply
the fix, watch it pass, then re-run the Phase-1 loop against the original,
un-minimized scenario.

Before calling it done:
- Original repro no longer reproduces
- Regression test passes (or the absent seam is documented)
- All `[DEBUG-...]` instrumentation removed
- Throwaway harnesses/scripts deleted or clearly marked
- The winning hypothesis is stated in the commit/PR message, so the next debugger doesn't repeat the search

Then ask what would have prevented this bug. If the answer is architectural (no
test seam, tangled callers), flag it as a follow-up — after the fix ships, not
before. Diagnosis is not a license to refactor the surrounding system.
