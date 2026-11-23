# State (untrusted draft; verify)

Moved verbatim from `skills/dispatch-brief/SKILL.md` (DISC-351 step 8); the skill points here.

**Every continuation or slice brief carries `## State (untrusted draft; verify)`.** It
lists what prior slices claim landed — sha, mechanism, values — marked as claims.
Prior-slice implementation choices are never passed forward as fact: the doer reproduces each
claim **on the running build**, never by reading the code — a claim true in the diff and false
on screen is the exact failure this rule exists to catch. A wrong mechanism inherited
from slice 1 is slice 2's red finding, not its baseline. **A continuation slice is a fresh agent, not a resume** (`routing` § Resume vs fresh); artefacts named **by path**, never carried as context. **Lock widened, doer unreachable → continuation slice, not a new lane.** When the lock widens mid-flight and the running doer cannot be reached, let the lane land, then brief a continuation slice on the same branch carrying the widened rows; review once, after the last slice.
