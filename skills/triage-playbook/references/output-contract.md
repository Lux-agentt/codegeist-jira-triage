# Output contract — structured triage block (Automation path)

When the agent is invoked by a Jira Automation rule it cannot call write actions
(platform rule: automation-triggered agents may only call GET actions). It must
therefore return its triage as a **structured, machine-readable block** so the
Automation rule's native steps can apply it. This document defines that block.

## Format

The reply ends with two parts, in this order:

### 1. First-line fields (for Automation smart values)

Plain lines at the end of the reply, one per field, exactly in this format:

```
PRIORITY: High
PRIORITY_ID: 2
ASSIGNEE: 557058:5f8d2e1a-0000-0000-0000-000000000000
DUPLICATES: DEMO-101, DEMO-118
```

- `PRIORITY` — the priority **name**: `Highest`, `High`, `Medium`, or `Low`.
- `PRIORITY_ID` — the priority **id** from `get-project-context`. Never guess an id;
  if the context call failed, write `PRIORITY_ID: UNKNOWN`.
- `ASSIGNEE` — the recommended assignee's **accountId** from `assignee-history`.
  If no candidate exists, write `ASSIGNEE: NONE`.
- `DUPLICATES` — comma-separated keys of candidates the agent judged `duplicate`
  (not merely `related`). If none, write `DUPLICATES: NONE`.

Automation extracts these with text functions (e.g. a regex or split on the first
line) — no JSON parsing is required for the native steps. This is deliberately
redundant with part 2 so the rule works even if JSON parsing is unavailable.

### 2. Fenced `triage-json` block (full report, for humans and for logging)

```json
{
  "issueKey": "DEMO-123",
  "priority": { "id": "2", "name": "High" },
  "priorityReason": "Checkout fails for all Visa payments; no workaround.",
  "duplicates": [
    { "key": "DEMO-101", "score": 0.72, "verdict": "duplicate",
      "evidence": "Same failure: Visa payment rejected at checkout." },
    { "key": "DEMO-118", "score": 0.41, "verdict": "related",
      "evidence": "Same area (checkout) but a different failure (timeout)." }
  ],
  "assignee": {
    "accountId": "557058:5f8d2e1a-0000-0000-0000-000000000000",
    "displayName": "Maya",
    "reason": "Resolved 4 similar Checkout bugs in the last 90 days (DEMO-101, DEMO-118)."
  },
  "fixPlan": [
    "Reproduce with a Visa test card on the staging checkout.",
    "Check the payment-gateway error log for the rejection code.",
    "Verify the fix with a Visa + Mastercard test purchase."
  ],
  "commentMarkdown": "## Triage: DEMO-123 — Checkout fails on Visa\n**Priority:** High — ...\n..."
}
```

Field rules:

- `priority.id` is a **string** (Jira returns ids as strings).
- `duplicates[].score` is the 0–1 overlap score from `search-duplicates`.
- `duplicates[].verdict` is one of `duplicate`, `related`, `not-duplicate`.
- `assignee` is `null` when no candidate exists.
- `commentMarkdown` is the full report text from step 4 of the playbook, so the
  Automation rule can post it verbatim as the issue comment.

## Example Automation rule (Jira Automation)

1. **When:** Issue created (project = DEMO).
2. **Then:** Rovo agent — Triage Agent — additional prompt:
   `Triage this issue and reply with the triage-json block.`
3. **Then:** Add comment — `{{agentResponse}}` (or the stored `commentMarkdown`).
4. **Then:** Edit issue — Priority = `{{PRIORITY_ID}}` (parsed from the reply).
5. **Then:** Assign issue — `{{ASSIGNEE}}` (parsed from the reply; skip if `NONE`).

> NOTE (open unknown U3 in PLAN.md): the exact smart-value syntax for parsing the
> agent's reply must be verified on the live dev site in Phase 3. The first-line
> fields exist precisely so the rule can use simple text extraction if structured
> parsing is unavailable.
