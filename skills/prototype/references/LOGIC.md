# Logic Prototype

A terminal app that lets the requester drive a state model by hand. Use when the question is **business logic, state transitions, or data shape**.

## When this is the right shape

- State-machine edge cases hard to reason about on paper
- Data-model representation questions
- API shape before writing production code

If the question is "what should this look like" — use [UI.md](UI.md).

## Process

### 1. State the question

One paragraph at the top of the file or a README — what state model, and what question it answers.

### 2. Pick the language

Match the host project's runtime and task runner.

### 3. Isolate logic in a portable module

A pure reducer, state machine, or function set — **no I/O in the logic module**. The TUI imports it.

### 4. Build the smallest TUI

- Clear the screen each tick; render full state (pretty-printed)
- List keyboard shortcuts at the bottom
- Loop until quit

### 5. One command to run

Add a script to the project's task runner.

### 6. Capture the answer

A `NOTES.md` with the question + verdict, written before delete. The snippet may feed the shaped project or a follow-on task.

## Anti-patterns

- Tests, a real database, a generalised framework
- The logic module referencing `console.log` or terminal codes
- Shipping the TUI shell to production
