---
name: new-product
description: Stand up a new JHD product remote on the fleet — vault trio, container clone, discipline sync, fleet register, Environment remotes. Trigger when creating a new GitHub product, "new app in the fleet", or standing up a new JHD remote. Not for Skillz curriculum/ADHD/directing-AI content (those live in Skillz the product), not for code inside an existing product, and not for vault-only notes without a repo.
---

# New Product — fleet standup playbook

One coherent slice: vault memory, GitHub remote, Mac container, discipline,
thin fleet wrapper, plugin registry, Environment card — same day.

Read `rules/invariants.mdc` (House system) and `skills/design-system` before
any **web** product ships UI. Do not invent a second visual language.

## When to use

- Operator asks for a **new JHD product**, new GitHub remote, or "new app in the fleet."
- A shape is approved and the next step is **repo + container + discipline**, not build.
- Registering a product that will consume `@jhd/design-system` (web) or bind Figma
  variables in Swift (native).

**Not this skill:** ADHD tooling, Skillz curriculum, "directing AI" — those belong
in **Skillz** (`MrJarrad/skillz`), not the discipline plugin.

## Playbook

Track plainly:

```
New product — <name>
- [ ] Vault trio + estate-map row
- [ ] GitHub remote (private; name clash check)
- [ ] Container clone → ~/JHD/<name>/main
- [ ] Discipline sync
- [ ] Thin fleet wrapper in product repo
- [ ] Register in jhd-cursor-discipline (config, infer tables)
- [ ] GitHub App can see the new remote (same day)
- [ ] Web: consume house package (no vendoring)
```

### 1. Vault new-project trio (`vault-write`)

Before or in parallel with the repo — durable memory, not chat:

| Artifact | Path |
|---|---|
| Project hub | `projects/<name>/<name>.md` |
| Handover tray | `projects/<name>/<name>-handover.md` |
| Living scope | `projects/<name>/<name>-scope.md` (unique name — not generic `SCOPE.md`) |
| Estate row | `estate/estate-map.md` — add container path + GitHub remote |
| Repo-docs mirror | As your estate layout requires |

**Unique note names** (ruling: handover-trays). Sidecar notes about *other*
products do **not** live in this product's plan — park them on those products'
hubs.

**Name clash:** **Skillz** = `MrJarrad/skillz` ≠ parked **`MrJarrad/skills`**
shared skills pack. Do not reuse parked remote names.

### 2. GitHub remote

```bash
gh repo create MrJarrad/<name> --private --description "<one line>" --add-readme
```

Pick a name that will not collide with parked fleet remotes (`config/jhd-repos.json`).

### 3. Container clone

```bash
bash ~/JHD/cursor-discipline/main/scripts/jhd-container-clone.sh \
  MrJarrad/<name> ~/JHD/<name>
```

**Workspace is always `~/JHD/<name>/main`.** Never edit the container root.
Never nest a worktree inside `main/` — use `~/JHD/<name>/worktrees/<slug>` for
long-lived branches.

If clone parks bare-only, finish `main/` after README exists on default branch.

### 4. Discipline sync

```bash
bash ~/JHD/cursor-discipline/main/scripts/sync-discipline-into-product.sh \
  ~/JHD/<name>/main <kind>
```

`<kind>` from `config/jhd-repos.json` (`product`, `portfolio`, `capture`, …).
First commit slice: `AGENTS.md` + `.cursor/rules/` + README + fleet wrapper.

### 5. Thin fleet wrapper (in the **product** repo)

Copy pattern from `~/JHD/portfolio/main`:

- `.cursor/environment.json` — `"name": "jhd-fleet"` with `repositoryDependencies`:
  vault + discipline (+ `jhd-design-system` for web products)
- `scripts/jhd-fleet-install.sh` — thin wrapper: set `JHD_FLEET_PRIMARY=<name>`,
  clone discipline only if SoT install missing, then `exec` discipline install

### 6. Register in `jhd-cursor-discipline`

PR on `~/JHD/cursor-discipline/main` — do not mix vault files into this commit:

| File | Add |
|---|---|
| `config/jhd-repos.json` | `environment_phase1`, `fleet_remotes`, `repos` |
| `docs/ENVIRONMENT.md` | Phase 1 table row |
| `scripts/jhd-fleet-install.sh` | `JHD_FLEET_PRIMARY` case, `member_state` echo (if new primary kind) |
| `rules/invariants.mdc` | Disk smell table row |
| `rules/routing.mdc` | Continuity infer + disk path |
| `templates/product-cloud/.cursor/rules/` | Mirror invariants/routing infer |
| Other template routing copies | portfolio-dot-cursor, capture-dot-cursor, … if they carry infer lines |
| `skills/wrap/SKILL.md` | Handover infer row |
| `skills/vault-recall/SKILL.md` | Product infer |
| `commands/handover.md` | Product infer |

Merge discipline PR after verify. Never force-push.

### 7. Environment (same day)

Repo-file `.cursor/environment.json` in the product lists vault + discipline
(+ design-system for web). Ensure the **GitHub App** can see the new remote —
do **not** add every product as a selected checkout on the Environment card.
`environment_must_include` stays vault + discipline only.

### 8. Web products — house system

- Consume `@jhd/design-system` from `~/JHD/design-system/main`.
- **Do not vendor** tokens or Action CSS into the app repo.
- Add `github.com/MrJarrad/jhd-design-system` to the product's
  `.cursor/environment.json` `repositoryDependencies` (portfolio and skillz overlays
  include it; generic `product` kind adds it when the app is web).
- Load **`skills/design-system`** in engineer/UX briefs for UI work.
- Consumers supply Suisse via `--font-suisse`.

Native products: bind the same Figma variables in Swift (Capture.app pattern).

### 9. Land the product repo

Branch in `~/JHD/<name>/main`, coherent first commit, push, `gh pr create`,
`gh pr merge --merge --delete-branch`. Hooks on; no skipped verify.

## Verification

- [ ] `~/JHD/<name>/main` exists with `AGENTS.md` + `.cursor/rules/`
- [ ] Discipline register PR merged
- [ ] GitHub App can see the new remote (repo-file env + dashboard token)
- [ ] Vault trio + estate-map row committed (separate vault PR if needed)
- [ ] Web product brief names `design-system` skill — no Geist starter path

## Related skills

- **`discover-scope` / `shape-stress`** — before standup when scope is still forming.
- **`design-system`** — when the new product is web UI.
- **`vault-write`** — landing vault artifacts.
- **`quality`** — verify before merge claims.
