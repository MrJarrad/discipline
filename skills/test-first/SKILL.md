---
name: test-first
description: Build features one failing test at a time through public interfaces — red-green-refactor via vertical slices (tracer bullets), never horizontal (all tests then all code). Use for test-first development, TDD, or any request for integration-style tests that should survive refactors.
---

# Test First

Extends `quality`'s Build/review discipline with the specific mechanics of test-driven development: tests verify behavior through public interfaces, not implementation details, and they're written one at a time — never in bulk.

Read [references/DOS-AND-DONTS.md](references/DOS-AND-DONTS.md) when applying this skill.

## Core principle

Tests should verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't.

**Good tests** are integration-style: they exercise real code paths through public APIs (an HTTP handler, a CLI command, a module's exported method) and read like a specification — "user can checkout with valid cart" tells you exactly what capability exists. They survive refactors because they don't care about internal structure.

**Bad tests** are coupled to implementation: they mock internal collaborators, assert on private state or call counts, or verify through a side channel (querying a database directly instead of through the interface). Warning sign: the test breaks when you rename an internal function, even though behavior didn't change.

Mock only at system boundaries — external APIs, databases, time/randomness, filesystem. Never mock your own classes, internal collaborators, or anything you control. Design for this with dependency injection and SDK-style per-operation interfaces rather than one generic fetcher with conditional mock logic.

## The discipline this skill adds: vertical slices, not horizontal

**Never write all the tests first, then all the implementation.** That's horizontal slicing — treating "red" as "write every test" and "green" as "write all the code." It produces tests for *imagined* behavior instead of *actual* behavior: they test the shape of data structures and function signatures rather than what a caller observes, and they go insensitive — passing when behavior breaks, failing when it's fine. It also commits you to a test structure before you've learned anything from writing the code.

```
WRONG (horizontal):
  RED:   test1, test2, test3, test4, test5
  GREEN: impl1, impl2, impl3, impl4, impl5

RIGHT (vertical — tracer bullets):
  RED -> GREEN: test1 -> impl1
  RED -> GREEN: test2 -> impl2
  RED -> GREEN: test3 -> impl3
  ...
```

Each test responds to what the previous cycle taught you. Because you just wrote the code, you know exactly what behavior matters and how to verify it next.

## Workflow

### 1. Plan the behaviors, not the implementation

Before writing any code, confirm with the user (or state plainly, in an autonomous run):
- What the public interface should look like.
- Which behaviors matter most — you can't test everything, so name what you'll cover and what you're deferring.

Match test names and vocabulary to the project's own domain language (check for a CONTEXT.md or equivalent, and respect existing architectural decisions in the area you're touching).

### 2. Tracer bullet

Write ONE test for ONE behavior. Watch it fail (red) — a test that passes immediately isn't testing anything. Then write the minimal code to pass it (green). This proves the path works end-to-end and is your first real test, not a throwaway spike.

### 3. Incremental loop

Repeat, one behavior at a time:
- **RED** — write the next test; confirm it fails.
- **GREEN** — write only enough code to pass it. No speculative features, no anticipating tests you haven't written yet.

### 4. Refactor only when green

Once the relevant tests pass, look for duplication to extract, shallow modules to deepen, or structure the new code revealed as wrong in the old code. Run the tests after every refactor step. **Never refactor while red** — get to green first, every time.

## Checklist per cycle

```
[ ] Test describes behavior, not implementation
[ ] Test uses the public interface only
[ ] Test would survive an internal refactor
[ ] Code is minimal for this test — nothing speculative
[ ] Refactor (if any) happened only after green, with tests re-run
```

## When not to apply this

Trivial, non-behavioral edits (typo fixes, comment changes, formatting) don't need red-green ceremony — fix them directly. Forcing TDD on non-behavior changes is the wrong tool, not rigor.
