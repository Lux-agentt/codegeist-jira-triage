// Pure assignee-ranking helpers (no Forge imports — unit-tested with Jest).
// Ranks people by similar issues they actually resolved, weighted by recency.

const DAY_MS = 24 * 60 * 60 * 1000;

// Recency weight for a resolved date: recent work counts more.
export function recencyWeight(resolvedIso, nowMs = Date.now()) {
  if (!resolvedIso) return 1;
  const ageMs = nowMs - new Date(resolvedIso).getTime();
  if (Number.isNaN(ageMs) || ageMs < 0) return 1;
  if (ageMs <= 30 * DAY_MS) return 2;
  if (ageMs <= 90 * DAY_MS) return 1.5;
  return 1;
}

// Rank assignees from resolved issues.
// resolvedIssues: [{ key, assignee: { accountId, displayName }, issueType,
//                    components: [name], resolved: ISO date }]
// options: { issueType, component, maxResults = 3, nowMs }
// Returns [{ accountId, displayName, score, count, evidence: [issue keys] }]
// sorted by score desc. Score = sum over their resolved issues of
// recencyWeight * (1 + same-type bonus 1 + same-component bonus 1).
export function rankAssignees(resolvedIssues, options = {}) {
  const { issueType, component, maxResults = 3, nowMs = Date.now() } = options;
  const byAccount = new Map();

  for (const issue of resolvedIssues || []) {
    const assignee = issue.assignee;
    if (!assignee || !assignee.accountId) continue;
    let weight = recencyWeight(issue.resolved, nowMs);
    if (issueType && issue.issueType === issueType) weight += 1;
    if (component && (issue.components || []).includes(component)) weight += 1;

    const entry = byAccount.get(assignee.accountId) || {
      accountId: assignee.accountId,
      displayName: assignee.displayName || assignee.accountId,
      score: 0,
      count: 0,
      evidence: [],
    };
    entry.score += weight;
    entry.count += 1;
    entry.evidence.push(issue.key);
    byAccount.set(assignee.accountId, entry);
  }

  return [...byAccount.values()]
    .map((entry) => ({ ...entry, score: Math.round(entry.score * 10) / 10 }))
    .sort((a, b) => b.score - a.score || b.count - a.count)
    .slice(0, maxResults);
}
