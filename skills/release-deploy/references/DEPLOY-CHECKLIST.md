# Flag-gated deploy checklist

Copy this whole block onto the deploy issue. Tick each line **with its evidence** (command output,
version/tag, dashboard link, flag state) as you go. Attach the ticked copy as the release work
product. An unticked line is an unmet acceptance criterion — do not mark the deploy `done`.

Parent procedure: [`skills/release-deploy/SKILL.md`](../SKILL.md).

---

**Release:** `<product>` · **Version/tag:** `<artifact id>` · **Flag:** `<flag name>` ·
**Date:** `<yyyy-mm-dd>` · **Operator:** `<agent>`

### 0. Pre-flight
- [ ] PR merged, green, and **reviewed** — deploy is downstream of the review gate, not a substitute.
- [ ] Change is **flag-gated**, or the reason it can't be is stated and its full-blast-radius risk accepted.
- [ ] **Last-known-good version recorded:** `<prev artifact id>` — this is the rollback target.
- [ ] Rollback lever chosen and **confirmed reachable** (flag-off / redeploy-prev / forward-fix).

### 1. Build — ship an artifact, not a working tree
- [ ] Built from a **clean, tagged commit** on the release ref (no uncommitted state). Tag: `<tag>`
- [ ] **Typecheck** green on the artifact — evidence: `<output>`
- [ ] **Build** green — evidence: `<output>`
- [ ] **Tests** green — evidence: `<output>`
- [ ] Artifact is immutable + identifiable: `<version/hash>`

### 2. Deploy — dark, flag OFF
- [ ] Deployed to production with flag **defaulting to off** — nothing user-visible changed.
- [ ] Health check green **at flag-off** — evidence: `<url/output>`
- [ ] Error rate / latency **unchanged** vs baseline at flag-off — evidence: `<dashboard>`
- [ ] Confirmed the flag actually gates the change (off = old behaviour, verified).

### 3. Observability — thresholds written BEFORE the flip
- [ ] Signals identified: error rate, latency, and product metric(s): `<list>`
- [ ] **Abort thresholds written down** *before* ramping: `<e.g. error rate >1% over 5m>`
- [ ] Dashboard / logs link for the release window: `<url>`

### 4. Release — ramp the flag, smoke at each step
- [ ] **Smoke test defined** — the golden path that proves the feature end-to-end: `<what>`
- [ ] Ramp step 1 (internal/operator) → smoke **passed**, signals clean over hold window — evidence: `<...>`
- [ ] Ramp step 2 (small %) → smoke **passed**, signals clean — evidence: `<...>`
- [ ] Ramp step 3 (wider / 100%) → smoke **passed**, signals clean — evidence: `<...>`
- [ ] **User-visible** flag flip? → routed for **operator sign-off** (visual/creative gate), not self-flipped.

### 5. Rollback readiness (fill even on a clean release)
- [ ] Flag-off tested to instantly revert behaviour — evidence: `<...>`
- [ ] For non-flag-isolatable changes (migrations/deps): rollback **rehearsed** before ship — evidence: `<...>`
- [ ] Irreversible step (data loss / one-way migration)? → surfaced to operator as **destructive**, not decided solo.

### 6. Close-out
- [ ] Final flag state recorded: `<on 100% / off / n%>`
- [ ] Release notes / version bump landed: `<link>`
- [ ] Handed to Reviewer with this ticked checklist + smoke/observability evidence.
- [ ] Disposition: `done` (clean release) · `rolled back` (with the signal that triggered it) · `blocked`.

---

**If any signal crossed its threshold:** roll back **first** (flip the flag off), diagnose second.
The flag-off is free; a lingering regression is not.
