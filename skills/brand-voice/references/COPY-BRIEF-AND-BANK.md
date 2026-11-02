# Copy brief and exemplar bank — the two per-project vault files

Both live in the vault beside the project, one of each per project, and every copy lane reads both before drafting
(`brand-voice` § Drafting method, steps 0 and 3). They are the project's memory for copy: research done once,
and lines the operator approved, reused on every later job.

## Copy brief — `projects/<p>/copy/<p>-copy-brief.md`

Research on the client, read before any draft. Written once, extended when a new job finds more.

```markdown
---
name: <p>-copy-brief
kind: reference
project: <p>
status: current
up: "[[<p>]]"
---
# <Client> — copy brief

## Their own words
Lines from their site, about page or press, quoted verbatim, each with its URL and the date read.

## Names
Product, range and service names as they write them (spelling, capitals, ampersands).

## What they are known for
How others describe them (press, partners, reviews): one line each, with its URL. Checked against a second
source or the spec before any of it reaches copy.

## Facts not to use
Claims found on the web that the spec does not support, so no later draft picks them up.

## Sources
Every URL read, with the date.
```

Facts about the work (what was made, for whom, the scope) come from the project spec, never from this brief.
The brief supplies the client's vocabulary and how they are seen.

## Exemplar bank — `projects/<p>/copy/<p>-exemplar-bank.md`

Lines the operator approved, grouped by surface, each with his words and the source decision.

```markdown
---
name: <p>-exemplar-bank
kind: reference
project: <p>
status: current
up: "[[<p>]]"
---
# <Project> — exemplar bank

## <Surface> (e.g. short descriptions, meta descriptions, headlines)
| Line | Operator's words | Source |
| --- | --- | --- |
| <the approved line, verbatim> | "<what he said, verbatim>" | [[<decision or artifact>]] |
```

A line enters the bank the turn he approves it. A line he later replaces is struck, never deleted, with the
replacement row under it. The bank is read for its qualities (how a line opens, what it leads with, its
length and rhythm), never copied as a template.
