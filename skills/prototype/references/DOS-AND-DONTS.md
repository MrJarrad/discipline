# Do's and Don'ts — prototype

Read [GLOSSARY.md](GLOSSARY.md) first.

---

## Do

| Do | Why |
|----|-----|
| **Pick a branch** (logic vs UI) from the question | Wrong branch wastes the whole effort |
| Mark the code **throwaway** in name/path | Prevents accidental ship |
| **One command** to run | Friction kills exploration |
| Keep logic **pure** (logic branch) | Portable module absorbs later |
| **Surface state** after every action | Requester sees wrong assumptions immediately |
| Capture the **verdict** in NOTES.md / an ADR / an issue | Only durable output |

---

## Don't

| Don't | Why |
|-------|-----|
| Add **tests** to the prototype | Becomes a mini-product |
| Wire a **real database** unless persistence *is* the question | Noise |
| **Generalise** for future features | One question only |
| **Ship** the prototype UI bar to production | Gate on the environment, e.g. `NODE_ENV` |
| Use a prototype when **`shape-stress`'s interview mode** (conversation) suffices | Conversation vs runnable — pick the cheaper tool |
| Leave a prototype **rotting** without a verdict | Confuses the next reader |

---

## Branch-specific

### Logic

**Do:** TUI shell imports the pure module; delete the shell on absorb.

### UI

**Do:** Prefer sub-shape A (variants on the existing route); use structurally different layouts, not colour tweaks.

---

## Examples

**Good:** "Does the refund state machine handle partial refunds?" → terminal prototype → verdict captured in NOTES → deleted → handed to `shape-stress`.

**Bad:** Full settings-page rewrite with tests "because we might need it later."
