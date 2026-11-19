# Codegeist 2026 — Jira Triage Agent: Build Plan

**Competition:** Codegeist 2026 (Atlassian / Devpost) — $120,000 total, 33 paid places.
**Category:** Apps for Software Teams. **Bonus target:** Best Agents (rovo:agent + reusable rovo:skill + rovo:action).
**Deadline:** submit before **23 Dec 2026 03:00 WIB** (22 Dec 2026 12:00 PT).
**Budget:** ZERO cost only — free Atlassian Cloud Developer License, no paid APIs, no paid services.
**Intelligence:** Atlassian's own platform only (Rovo / Atlassian Intelligence). No external LLM API.
**Devpost registration:** DONE 2026-11-18 23:22 WIB ("Thanks for registering!", participant "Lux-Agent Akbar P", 4,160 participants).
**Owner:** Rizqi (21, cannot code — all building by lux-agent; user handles human-only steps only).

---

## 1. What the app does (v1 feature set — focused)

**Jira Triage Agent** — a Forge app with a Rovo agent that triages Jira issues.

When a **new Jira issue** arrives, the agent:

1. **Classifies priority** — reads summary + description, decides Highest / High / Medium / Low
   with a one-line reason (crash, data loss, security, blocked users → High; cosmetic → Low).
   The decision is the model's judgement on evidence gathered by deterministic actions —
   no hard-coded keyword rules.
2. **Detects duplicate issues** — extracts keywords from the new issue, runs a JQL
   `text ~` search over the project, scores candidates by token overlap, and the agent
   judges which are true duplicates vs merely related. Never auto-closes anything.
3. **Suggests an assignee from past work** — searches recently resolved issues of the same
   type/component, ranks people by how many similar issues they actually resolved
   (recency-weighted), returns top 3 with evidence (issue keys they fixed).
4. **Drafts a fix plan as a comment** — a structured triage report (priority + reason,
   duplicates, suggested assignee, fix plan with concrete first steps) posted as an
   issue comment, and the last triage is shown in an issue panel on the issue itself.

**Explicit non-goals for v1:** no auto-closing of duplicates, no auto-assigning without
confirmation, no SLA/escalation logic, no Confluence/Bitbucket/JSM integration, no
Teamwork Graph in v1 (stretch, see §7).

---

## 2. How it actually works — the honest architecture

This is the single most important design fact, verified from the Forge docs. There are
**two interaction paths, and they have different rules about writing**:

### Path A — Interactive (Rovo chat) — the primary demo path
User opens Rovo chat on a Jira issue and asks "Triage this issue". The agent calls the
GET actions to gather evidence, reasons, and presents the triage report. **After the user
confirms**, it calls the CREATE/UPDATE actions to post the comment, set priority, and set
the assignee. In Rovo chat, write actions are allowed and are gated by Rovo's own review
card (the user sees exactly what will change before it happens).

### Path B — Automatic (Jira Automation rule) — the "on new issue" flow
A Jira Automation rule (configured by the admin in the Jira UI, documented in
`README.md` → Testing instructions) triggers on **issue created**, invokes the agent
with an additional prompt, and the agent's response comes back via smart values.
**Critical constraint (verified from the `action` module docs): agents triggered by
automation rules will NOT invoke actions with actionVerb CREATE, UPDATE, DELETE, or
TRIGGER — only GET.** So in Path B the agent only *analyses* (GET actions) and returns
a structured triage block; the **native Automation steps** then post the comment, set
priority, and set the assignee using the agent's output. The writes happen in Automation,
not in the agent. The agent's output contract (first-line fields + fenced `triage-json`
block) is defined in `skills/triage-playbook/references/output-contract.md` so Automation
smart values can consume it.

**No Forge function can invoke the Rovo agent programmatically** — the documented
invocation points are: Rovo chat sidebar, the `/ai` toolbar in Jira/Confluence editors,
Automation rules, and the Forge bridge rovo API (opens a chat with the agent from a
frontend). Path B exists because Automation is a documented invocation point.

### Where the triage result lives
Every applied triage is stored in Forge KVS (`storage` API, key `triage:<issueKey>`).
The `jira:issuePanel` reads it and shows the last triage on the issue view. KVS needs no
extra OAuth scope.

### Auth model
Actions use `api.asUser()` — every Jira call runs as the person invoking the agent, so
the agent can only see/change what that user can. `api.asApp()` is the fallback if
`asUser()` turns out unavailable in the automation-invoked context (open unknown U2).

---

## 3. Forge modules

| Module | Key | What it does |
|---|---|---|
| `rovo:agent` | `triage-agent` | The agent. Name "Jira Triage Agent" (18 chars, limit 30). Prompt in `prompts/agent-prompt.md` (resource, keeps manifest small — manifest limit 200 KB). 4 conversation starters. |
| `rovo:skill` (Preview) | `triage-playbook` | Reusable triage procedure in `skills/triage-playbook/SKILL.md` + `references/output-contract.md`. Depends on all 7 actions. This + the agent + actions is what qualifies for the **Best Agents** bonus. |
| `action` (GET) | `get-issue` | Fetch one issue: summary, description (ADF→text), status, priority, labels, assignee, reporter, created, type, project. |
| `action` (GET) | `search-duplicates` | Keyword extraction (pure JS) → JQL `text ~` OR-search → token-overlap scoring → ranked candidates. |
| `action` (GET) | `assignee-history` | JQL: recently resolved issues, same project/type/component → recency-weighted ranking, top 3 + evidence. |
| `action` (GET) | `get-project-context` | Project info + available priorities (id + name) + open/resolved counts. The agent must call this before setting a priority (priority ids vary per site). |
| `action` (CREATE) | `post-triage-comment` | Posts the triage report as an issue comment (markdown→ADF conversion in code) + saves the report to KVS for the panel. |
| `action` (UPDATE) | `set-priority` | Sets issue priority by priority id. |
| `action` (UPDATE) | `set-assignee` | Sets issue assignee by accountId. |
| `jira:issuePanel` | `triage-panel` | UI Kit (native render) panel on the issue view: shows the last triage from KVS, or "not triaged yet" guidance. |
| `function` | 8 handlers | One function key per action handler + `panel-resolver` for the issue panel (`src/index.js`, handlers named `src/index.<export>`). |

**Scopes** (`permissions.scopes`): `read:jira-work`, `read:jira-user`, `write:jira-work`.
**Runtime:** `nodejs22.x`. **Forge CLI:** 15.1.0. **@forge/api:** 8.5.0. **@forge/react:** 12.5.0.
**App id:** PLACEHOLDER in `manifest.yml` — `forge create` / `forge register` assigns the
real id once the Atlassian account exists. Do not invent one.

---

## 4. Agent prompt design

- **Agent prompt** (`prompts/agent-prompt.md`, ~60 lines): role, boundaries, orchestration
  only — *when* to use each action, the two paths (chat vs automation), the golden rules
  (never change anything before the user confirms in chat; never auto-close duplicates;
  always cite evidence — issue keys, counts, names; if evidence is thin, say so and
  recommend Medium priority).
- **Skill** (`skills/triage-playbook/SKILL.md`, ≤500 lines per the spec): the full
  step-by-step procedure — gather → duplicates → assignee → draft → confirm → apply —
  plus how to interpret each action's output and handle errors (e.g. no duplicates found,
  no resolved history, missing priority id).
- **Output contract** (`skills/triage-playbook/references/output-contract.md`): the exact
  machine-readable reply shape for the Automation path — first-line fields
  (`PRIORITY: High`, `ASSIGNEE: <accountId>`, `DUPLICATES: KEY-1, KEY-2`) + a fenced
  `triage-json` block with the full report. Automation smart values consume the first
  lines; humans read the rest.
- **Prompt size discipline:** manifest best-practices doc says keep the agent prompt short
  and move detail into skills — that is exactly this split.

---

## 5. Demo script (video < 5 min, target ~4:30)

| Time | Scene |
|---|---|
| 0:00–0:20 | Problem: triage eats the morning — every new bug needs a priority, a duplicate check, and an owner. (Remotion title card.) |
| 0:20–1:00 | Create a new Jira issue live (a real bug report, slightly vague — the realistic case). |
| 1:00–2:30 | Open Rovo chat → "Triage this issue". Agent fetches the issue, finds 2 duplicate candidates, ranks 3 assignees with evidence, drafts the fix plan. Show the report. |
| 2:30–3:30 | Confirm on Rovo's review card → comment posted, priority set, assignee set. Show the updated issue. |
| 3:30–4:10 | The automatic path: a second issue arrives → Automation rule fires → agent analyses (GET-only) → native steps post the comment + set priority/assignee. Show the rule + the result. Issue panel shows the triage summary. |
| 4:10–4:30 | Recap: what it is, install link, category (Software Teams) + Best Agents bonus. (Remotion outro card.) |

Video production: Remotion for title/outro cards + captions/framing; **real screen recordings**
for the Jira/Rovo footage (Remotion cannot screen-record — the video is a mix, edited
together). All narration/submission text gets a humanizer pass before publishing.

---

## 6. Dated phases (18 Nov → 23 Dec 2026)

| Phase | Dates | Work | Exit criteria |
|---|---|---|---|
| **0 — Research + scaffold** | 18–19 Nov | This plan + repo scaffold (manifest, actions, prompt, skill, panel, unit tests). Forge CLI installed (15.1.0). | Scaffold validates: YAML parses, `node --check` clean, Jest tests pass. **Done by this task.** |
| **1 — Accounts + Rovo spike** | 19–20 Nov | **USER STEPS:** Atlassian account + free Cloud Developer License + email verification (§8). Then: `forge create` (real app id), `forge login` (API token via Secure Vault), `forge deploy` to the dev site. **Spike the #1 unknown:** does the free dev site include Rovo? | App deployed on the dev site; Rovo availability confirmed YES/NO. If NO → fallback: 30-day Standard trial site (still $0) for the demo video. |
| **2 — Core agent** | 21–26 Nov | Implement + test the 4 GET actions and the prompt/skill end-to-end in Rovo chat on seeded demo issues. Unit tests for pure logic (keyword extraction, duplicate scoring, assignee ranking). | Agent triages a seeded issue in chat with correct evidence (real duplicate found, real assignee ranked). |
| **3 — Jira integration** | 27 Nov–2 Dec | Write actions (comment/priority/assignee) + KVS + issue panel. Document + test the Automation rule (issue created → agent → native steps). | Both paths work on the dev site: chat path applies changes after confirm; automation path applies them via native steps. |
| **4 — Install-link test** | 3–8 Dec | Production deploy, Distribution → Sharing, install link. Install on a **second clean site** (judge simulation) and fix any install friction. **Teamwork Graph go/no-go (5 Dec):** only if Phase 1–3 are solid and the graph scopes work on the dev site. | A fresh site installs from the link and the agent works there. |
| **5 — Video** | 9–14 Dec | Record demo flows, Remotion titles/captions, edit, upload to YouTube as **public**, < 5 min. Humanizer pass on the script. | Video public on YouTube, < 5 min, shows both paths + install link in description. |
| **6 — Submission materials** | 15–20 Dec | Devpost submission: description, testing instructions (report-guide discipline: exact steps a judge repeats, seeded demo data, expected results), install link, category + bonus selection. Humanizer pass on all text. Submit a **draft** on Devpost. | Draft submission complete on Devpost with install link + video + testing instructions. |
| **7 — Buffer + final submit** | 21–22 Dec | Final checks (repo public, license at root, install link still works, video still public). Submit final. **Never later than 22 Dec WIB evening.** | Submitted. Deadline is 23 Dec 03:00 WIB — no last-minute rush. |

---

## 7. Stretch (only after Phase 3 is solid)

- **Teamwork Graph bonus** ("Best apps with Teamwork Graph integration"): use the curated
  query `atlassianUserAssignedJiraWorkItems` to check a candidate assignee's *current*
  open workload before recommending them. Needs graph scopes
  (`read:graph:issue:jira`, `read:graph:user:atlassian`, …), an org admin grant on install,
  and the GraphQL schema (downloadable from the site). **Go/no-go 5 Dec.** Note: only one
  Grand + one Bonus can be won per entry — Best Agents is the primary bonus; the graph
  work only makes sense if it also makes the *product* better (it does — workload-aware
  assignment is genuinely useful).
- **`rovo:mcp` bonus** ("Best app with Atlassian MCP"): expose the same actions as MCP
  tools. Same actions, new surface — cheap after Phase 3, but only if time remains.
- **Marketplace bonus:** explicitly NOT pursued — apps submitted for Marketplace listing
  cannot be shared via installation link, which the judges need.

---

## 8. What still needs the user (human-only steps)

1. **Atlassian account signup** — atlassian.com, email + password (user's own credentials;
   never shared in chat). Then **free Atlassian Cloud Developer License** — create a site
   at developer.atlassian.com/cloud (or via the signup flow) and **verify the email**.
   Needed before Phase 1 can start (19–20 Nov). Without this, nothing can be deployed
   or tested — it is the critical path.
2. **Atlassian API token for `forge login`** — created at
   id.atlassian.com/manage-profile/security/api-tokens with the Forge app scope, delivered
   via **Secure Vault** (never pasted in chat). Needed in Phase 1.
3. **Devpost registration** — ✅ DONE 2026-11-18 23:22 WIB. Nothing needed.
4. **Demo-site admin consent** — when installing the app on the dev site, approve the
   requested scopes (read/write Jira). One click in the browser, user step.
5. **YouTube upload** — the demo video is uploaded from the user's Google/YouTube account
   (or the user grants access). Phase 5 (9–14 Dec).
6. **Final Devpost submit click** — the agent prepares everything; the user reviews and
   submits (or explicitly approves the agent submitting). Phase 7.

---

## 9. Open unknowns (honest list)

- **U1 — Rovo on the free developer site (BIGGEST RISK).** Docs and community sources say
  Rovo is paid-only and a Standard/Premium trial includes it; whether the free Atlassian
  Cloud Developer License site includes Rovo is **unverified**. Phase 1 spike decides it.
  Fallback: 30-day Standard trial site ($0) — only needs to last through the video
  recording in mid-December.
- **U2 — `api.asUser()` in automation-invoked actions.** Verified working in chat-invoked
  actions (MCP tutorial, ReadyGate). Whether user context exists when the agent is
  invoked by an Automation rule is unverified — fallback is `api.asApp()`. Test in Phase 3.
- **U3 — Automation smart values vs the agent's structured output.** The exact smart-value
  syntax for consuming the agent's reply (and whether JSON can be parsed) is unverified
  until tested on the dev site in Phase 3. The output contract is designed defensively
  (first-line fields + JSON block) so a regex/text extraction fallback exists.
- **U4 — Forge bridge rovo API from the issue panel.** Whether the panel can open a Rovo
  chat with this specific agent (method name/signature) is unverified. V1 panel does not
  depend on it — it only displays the stored triage.
- **U5 — Teamwork Graph curated query fields.** Query names (e.g.
  `atlassianUserAssignedJiraWorkItems`) are documented, but exact fields/arguments need the
  schema download from a live site (needs the account). Only matters for the stretch.
- **U6 — `forge` CLI on this VM (SOLVED 2026-11-19 ~10:22 WIB).** The CLI
  postinstall `chown` fails on this VM (sandbox blocks chown), and every `forge`
  invocation also tries to chown its config file. **Workaround verified:** install
  with `npm install -g @forge/cli@15.1.0 --ignore-scripts`, then run all forge
  commands with `XDG_CONFIG_HOME=/tmp/forge-config FORGE_DISABLE_ANALYTICS=1
  FORGE_NON_INTERACTIVE=on` — the config dir on tmpfs accepts the chown, and the env
  vars skip the analytics prompt and non-TTY failures. (Note: /tmp is wiped on VM
  restart, so re-create `/tmp/forge-config` if it is gone.)
  **Binary:** `/usr/bin/forge` v15.1.0 — always use the absolute path on this VM;
  bare `forge` in PATH is Foundry's Solidity binary (`~/.foundry/bin/forge`). The
  CLI vanished once (a VM reset wiped the global install + `/tmp/forge-config`);
  reinstalled 2026-11-19 with `npm install -g @forge/cli@15.1.0 --ignore-scripts`
  (27s, 804 packages, $0).
  **`forge login` is DEAD on this VM:** credential storage needs keytar (OS keychain,
  service `Atlassian`), whose native binding is missing because `--ignore-scripts`
  skipped its build — `require('keytar')` fails and `LoginCommand` throws
  `NoKeytarError` after validating credentials. Do NOT use `forge login` here.
  **Working auth: env vars** `FORGE_EMAIL` + `FORGE_API_TOKEN` — `getCredentials()`
  checks env vars before keytar and validates them with a live `getUser` call
  (proven with dummy values: `forge whoami` returned `UserNotFoundError`, i.e. the
  CLI read the env vars and called Atlassian live). Env vars are per-process, so
  set them on every forge invocation; nothing is persisted. **Do NOT write the
  token into the config file** (`$XDG_CONFIG_HOME/@forge/cli-nodejs/config.json`):
  its legacy plaintext `forge-credentials` key is consumed and discarded when
  keytar is absent. **Token handover = GitHub Secrets** (`FORGE_EMAIL`,
  `FORGE_API_TOKEN`) + GitHub Actions deploy (`.github/workflows/deploy.yml`); the
  Secure Vault cannot be read back by tools, so it cannot feed the CLI. Dev site
  now known: `rizqi-akbarluxagent.atlassian.net` (orgId
  `9ab1c8ba-205f-499e-9857-3c7e7a9a5b4c`), account email `risyxieee123@gmail.com`.
  `forge lint` still reports "Not logged in" without the env vars — expected, not
  a CLI problem. `forge tunnel` (needs the cloudflared binary, skipped
  by --ignore-scripts) is untested — use `forge deploy` + test on the live dev site
  instead. `package.json` sets `"type": "module"` so local `node --check` and Jest
  ESM tests work; if `forge lint` ever complains about it in Phase 1, remove that
  one line (Forge bundles the source itself, it does not run it with node directly).
- **U7 — Rovo safety screening.** Atlassian screens Agents and may block/suspend
  non-compliant ones. Our agent is read-first, confirm-before-write, and only touches
  Jira issues — low risk, but a deploy-time block would surface in Phase 1/2.

---

## 10. Judging alignment (why this wins)

- **Stage One (pass/fail):** fits the theme (Forge app + Rovo agent + Jira), uses the
  required APIs/SDKs. ✅
- **Technological Implementation (20%):** real Forge modules (rovo:agent + rovo:skill +
  7 actions + issuePanel + KVS), deterministic evidence-gathering + LLM judgement split,
  correct handling of the automation GET-only constraint.
- **Design (20%):** two paths (chat + automatic), review-card confirmation before any
  write, visible panel on the issue, nothing auto-destructive.
- **Potential Impact (20%):** triage is the daily tax on every Jira team; duplicates and
  wrong assignees are the classic time sinks.
- **Innovation (20%):** workload-aware assignee suggestion from real resolution history
  (not a static round-robin); structured output contract so Automation can act on the
  agent's judgement.
- **Presentation (20%):** <5 min video showing both paths live + repeatable testing
  instructions written with the report-writing discipline (exact steps, expected results).

---

## 11. Verified facts (with sources)

- Getting started: Node 22.x/24.x, `npm install -g @forge/cli`, `forge login` (API token,
  Forge app scope), `forge create`, `forge deploy`, `forge install --demo-site` (90 days),
  `forge tunnel`.
  <https://developer.atlassian.com/platform/forge/getting-started>
- `rovo:agent`: key, name (≤30 chars), description, prompt (inline or resource — CLI
  10.6.0+ for resource), conversationStarters, actions, skills (Preview), followUpPrompt.
  <https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent/>
- `action`: key, name, function, actionVerb (GET/CREATE/UPDATE/DELETE/TRIGGER),
  description, inputs. **Automation-triggered agents will NOT invoke CREATE/UPDATE/
  DELETE/TRIGGER actions — only GET.** Data limit 5 MB.
  <https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-action/>
- `rovo:skill` (Preview): `source.dir` + optional `dependencies.tools` (action keys);
  SKILL.md with frontmatter (name, description, allowed-tools), body ≤500 lines;
  referenced from the agent's `skills` property; skills are selected by description.
  <https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-skill/>
- Triggers: `avi:jira:created:issue`, `avi:jira:updated:issue`; scopes `read:jira-work` /
  `write:jira-work`; 55s invocation limit (community source, treat as approximate).
  <https://developer.atlassian.com/platform/forge/automate-jira-using-triggers/>
- `jira:issuePanel`: panel above Activity, resolver function, `render: native`, UI Kit or
  Custom UI, only users with edit permission see the button, new issue view only.
  <https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-issue-panel/>
- Teamwork Graph API: Preview since 15 Oct 2026; curated GraphQL queries only; per-object
  scopes `read:graph:<object>:<product>`; endpoint
  `POST https://<site>.atlassian.net/gateway/api/graphql/twg`; max 25 rows/page; missing
  scope silently omits rows; org admin must grant scopes.
  <https://developer.atlassian.com/platform/teamwork-graph/scopes/>
  <https://developer.atlassian.com/platform/forge/call-the-teamwork-graph-api/>
- `@forge/api`: `api.asApp()` / `asUser()` `.requestJira(route\`/rest/api/3/...\`)`;
  `asUser()` only in UI Kit modules; `asApp()` works regardless of user.
  <https://developer.atlassian.com/platform/forge/apis-reference/fetch-api-product.requestjira/>
- Reference architecture (ReadyGate, Devpost): 1 rovo:agent + 4 actions + jira:issuePanel
  + KVS + `api.asUser()`; agent never writes before user confirms; Rovo's review card
  gates every UPDATE/CREATE action. <https://devpost.com/software/readygate>
- Distribution: `forge deploy -e production` → Developer console → Distribution →
  Sharing (NOT "Sharing within organization") → copy installation link. Apps submitted
  for Marketplace listing CANNOT be shared via installation link.
  (Dev.to Codegeist 2026 tutorial: https://dev.to/mihai_leanzero/atlassian-teamwork-graph-api-forge-rovo-agent-3mcc)
- Manifest limit: 200 KB; keep agent prompts short, move detail into `rovo:skill`.
  <https://developer.atlassian.com/platform/forge/manifest-reference/manifest-size-best-practices/>
- Versions verified live 2026-11-18: `@forge/cli` **15.1.0**, `@forge/api` **8.5.0**,
  `@forge/react` **12.5.0**, `@forge/bridge` **7.3.0**, `@forge/resolver` **2.0.2**,
  Node **v24.22.1**. CLI installed globally with `--ignore-scripts` (postinstall `chown`
  fails on this VM — see U6).

## 12. Cost ledger (must stay $0)

| Item | Cost |
|---|---|
| Atlassian Cloud Developer License | $0 (free) |
| Forge CLI / Forge platform | $0 |
| Rovo / Atlassian Intelligence (on the dev site) | $0 if included (see U1); fallback Standard trial $0 for 30 days |
| Demo site data | seeded demo issues, $0 |
| Video (Remotion + screen recording) | $0 (local tools) |
| YouTube upload | $0 |
| **Total** | **$0** |
