---
name: triage-playbook
description: Step-by-step procedure for triaging a Jira issue: gather the issue and project context, search for duplicates, rank assignees from resolved-issue history, draft a structured triage report, and apply it only after the user confirms (or return the structured output block when invoked by an Automation rule). Use whenever a user asks to triage an issue, find duplicates, suggest an assignee, or draft a fix plan for a Jira issue.
allowed-tools: get-issue search-duplicates assignee-history get-project-context post-triage-comment set-priority set-assignee
---

# Triage playbook

Triage one Jira issue in five steps. Work in order. Do not skip the evidence steps,
and do not apply anything before the user confirms (chat path) — or at all (Automation path).

## Step 1 — Gather the issue and the project context

1. Call `get-issue` with the issue key. Read the summary, description, status, current
   priority, labels, issue type, and project.
2. Call `get-project-context` with the project key. Note the available priorities and
   their **ids** (you need the id to set a priority — never guess an id), plus the open
   and recently-resolved counts, so you can calibrate how unusual this issue is.
3. If the issue is already resolved/closed, say so and stop — there is nothing to triage.

## Step 2 — Find duplicates

1. Call `search-duplicates` with the issue key. It returns ranked candidates with a
   0–1 overlap score and each candidate's key, summary, and status.
2. Judge each candidate yourself from its summary: a **duplicate** is the same bug or
   the same request, not just the same area. A candidate about the same feature with a
   different failure is **related**, not a duplicate.
3. Keep at most 3 candidates in the report, best first, each with your verdict
   (`duplicate` / `related` / `not-duplicate`) and one line of evidence.
4. If no candidate scores above ~0.3, report "no likely duplicates found". Never force
   a match.

## Step 3 — Rank assignees from past work

1. Call `assignee-history` with the project key, the issue type, and the component if
   the issue has one. It returns the top candidates ranked by similar issues they
   resolved, weighted by recency, with evidence (the issue keys they fixed).
2. Pick the top candidate as your recommendation and name one alternative. State the
   evidence: "Maya resolved 4 similar Checkout bugs in the last 90 days (DEMO-101,
   DEMO-118, …)".
3. If nobody has resolved a similar issue, say so and suggest the project's default
   assignee or the reporter — do not invent a person.

## Step 4 — Draft the triage report

Decide the priority from the issue's content, not from keywords alone:

- **Highest**: data loss, security breach, or the product is down for everyone.
- **High**: a core flow is broken for many users (e.g. checkout fails), or a deadline
  is at risk.
- **Medium**: a real bug with a workaround, or a feature request with clear value.
  **This is the default when the evidence is thin.**
- **Low**: cosmetic issues, edge cases affecting very few users, nice-to-have requests.

Write the report in this shape (Markdown):

```markdown
## Triage: <ISSUE-KEY> — <one-line summary>
**Priority:** <Name> — <one-line reason>
**Duplicates:** <KEY> (<verdict>, <evidence>) | none found
**Suggested assignee:** <Name> — <evidence>
**Fix plan:**
- <concrete first step>
- <concrete next step>
- <how to verify the fix>
```

The fix plan must be concrete: name the area of the code or the flow to check first,
what to reproduce, and how to verify. "Investigate the bug" is not a step.

## Step 5 — Apply, or return the structured block

**Chat path (a user asked you in Rovo chat):**

1. Show the report to the user and wait for confirmation.
2. After confirmation, in this order:
   - `post-triage-comment` with the report text (it also saves the triage for the
     issue panel). Pass `priorityName`, `assigneeName`, and `duplicateKeys`
     (comma-separated) too, so the panel can display them.
   - `set-priority` with the priority **id** from `get-project-context`.
   - `set-assignee` with the recommended assignee's **accountId** from
     `assignee-history`.
3. If the user changes anything (different priority, different assignee, "don't post
   the comment"), apply exactly what they said. Confirm the final state in one line.

**Automation path (invoked by a Jira Automation rule):**

1. Do NOT call `post-triage-comment`, `set-priority`, or `set-assignee` — the platform
   blocks write actions for automation invocations. Only the four GET actions run.
2. Reply with the structured output block exactly as defined in
   `references/output-contract.md` (first-line fields + fenced `triage-json` block).
   The Automation rule's native steps apply your triage from that block.
3. Do not apologise for not writing. This is the designed behaviour.

## Errors and edge cases

- An action returns an error or empty result: report it plainly ("I could not load the
  project context") and continue with what you have. A triage with partial evidence is
  better than no triage — but mark which parts are missing.
- The issue has no description: triage from the summary alone and note that the
  description is empty (suggest the reporter add reproduction steps).
- The same issue is triaged twice: re-run the steps fresh. Do not copy a previous
  triage — the project's state may have changed.
- A duplicate candidate is already resolved: say so. A resolved duplicate is still
  useful evidence — link to it in the report so the fixer can reuse the old fix.
