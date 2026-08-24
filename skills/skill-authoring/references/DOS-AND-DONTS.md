# Do's and Don'ts — skill-authoring

---

## Do

| Do | Why |
| --- | --- |
| Front-load **triggers** in the description | Invocation happens in the pointer, not the body |
| **Disclose** branch-specific reference to sibling files | Keeps the top legible |
| Write **completion criteria** on every step | Prevents premature "done" |
| Use **leading words** (_frontier_, _seam_, _red_) | Fewer tokens, sharper hooks |
| **Compose** primitives — point at `grilling`, don't copy it | One source of truth |
| Prompt the **positive** behaviour | Negation activates the forbidden thing |
| Match **invocation** to how work arrives | Model vs operator-only |

---

## Don't

| Don't | Why |
| --- | --- |
| Put **procedure in the description** | Steers every turn; bloats context |
| **Duplicate** another skill's workflow | Drift on the next edit |
| Restate **environment facts** (scripts, paths) | Goes stale; lookup is cheap |
| Create a **second router** next to `routing` | Parallel systems |
| Use **vague done** ("understanding reached") | Agent stops early |
| **Vendor** external skill packs wholesale | ADAPT ideas; own the words |

---

## Branch-specific

### Editing an existing skill that never fires

**Do:** Sharpen description triggers first; split by branch if sprawl hides the path.

**Don't:** Fatten the body — weak trigger is the usual cause.

### Writing always-on rules

**Do:** Minimum tokens; token + rule at the altitude it applies.

**Don't:** Essay-length rules — that's over-explain per operator-voice.

### AGENTS.md

**Do:** Pointers to skills/rules; repo-specific facts only agents can't infer.

**Don't:** Duplicate the plugin's full skill catalog.
