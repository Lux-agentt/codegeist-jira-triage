# Jira Triage Agent — Codegeist 2026

A Forge app with a **Rovo agent** that triages new Jira issues:

1. **Classifies priority** — Highest / High / Medium / Low, with a one-line reason.
2. **Detects duplicate issues** — JQL search + text-overlap scoring, judged by the agent.
3. **Suggests an assignee from past work** — ranks people by similar issues they actually resolved.
4. **Drafts a fix plan as a comment** — posted on the issue after the user confirms; the last triage is also shown in an issue panel.

Category: **Apps for Software Teams**. Bonus target: **Best Agents**
(`rovo:agent` + reusable `rovo:skill` + `rovo:action`).

## How it works (the honest version)

There are two paths, and they follow different rules:

- **Rovo chat (interactive):** ask "Triage this issue". The agent gathers evidence with
  GET actions, presents the triage report, and — after you confirm on Rovo's review card —
  posts the comment, sets priority, and sets the assignee.
- **Jira Automation (automatic):** a rule triggers on *issue created*, invokes the agent,
  and the agent's structured reply comes back via smart values. Agents triggered by
  automation **cannot call CREATE/UPDATE/DELETE actions — only GET** (Forge platform rule).
  So in this path the agent only analyses; the **native Automation steps** post the comment
  and set the fields from the agent's output. See `skills/triage-playbook/references/output-contract.md`.

The agent's intelligence comes from Atlassian's own platform (Rovo / Atlassian
Intelligence). No external LLM API, no paid service. Total cost: **$0**.

## Repo layout

```
manifest.yml                  Forge manifest (app id is a PLACEHOLDER until `forge create`)
package.json
prompts/agent-prompt.md       Agent prompt (role + orchestration only — detail lives in the skill)
skills/triage-playbook/       Reusable triage procedure (SKILL.md + output contract)
src/index.js                  Action handlers + issue-panel resolver
src/lib/jira.js               Jira REST helpers (asUser)
src/lib/duplicates.js         Keyword extraction + duplicate scoring (pure, tested)
src/lib/assignees.js          Assignee ranking from resolved history (pure, tested)
src/lib/triage.js             Markdown→ADF conversion + KVS triage store
src/panel/index.jsx           UI Kit issue panel (shows the last triage)
tests/lib.test.js             Jest unit tests for the pure functions
PLAN.md                       Full build plan, dated phases, open unknowns
```

## Getting started (needs an Atlassian account — see PLAN.md §8)

```bash
npm install
npm test                 # unit tests for the pure logic
forge register           # assigns the real app id into manifest.yml
forge deploy             # deploy to the dev site
forge install --product jira --site <your-site>.atlassian.net
```

Then create a Jira Automation rule: **When issue created → Rovo agent (Triage Agent,
additional prompt: "Triage this issue and reply with the triage-json block") → then
native steps: add comment (agent output), edit issue priority, assign issue** — using
the first-line fields from the agent's reply (see the output contract).

## Demo data (for judges)

Seed a project `DEMO` with a few realistic bugs, including one near-duplicate pair
(e.g. "Checkout fails on Visa" vs "Payment error with Visa card at checkout") so the
duplicate detection has something real to find, and a few resolved bugs assigned to
different people so the assignee ranking has real history.

## Cost

$0 — free Atlassian Cloud Developer License, Forge platform, Rovo on the dev site,
Remotion + screen recording for the video, YouTube upload. See PLAN.md §12.
