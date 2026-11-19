// Action handlers for the Jira Triage Agent + the issue-panel resolver.
// Every action handler returns { ok: true, ...data } or { ok: false, error }
// so the agent can react to failures instead of hitting an opaque error.
// (Forge functions: handler is `src/index.<exportName>`.)

import Resolver from '@forge/resolver';
import { extractKeywords, buildDuplicateJql, rankDuplicates } from './lib/duplicates.js';
import { rankAssignees } from './lib/assignees.js';
import { markdownToAdf } from './lib/triage-format.js';
import { saveTriage, getTriage } from './lib/triage-store.js';
import * as jira from './lib/jira.js';

function fail(err) {
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}

export async function getIssue(payload) {
  try {
    const issue = await jira.getIssue(payload.issueKey);
    return { ok: true, issue };
  } catch (err) {
    return fail(err);
  }
}

export async function searchDuplicates(payload) {
  try {
    const issue = await jira.getIssue(payload.issueKey);
    const keywords = extractKeywords(`${issue.summary} ${issue.description}`, 8);
    if (keywords.length === 0) {
      return {
        ok: true,
        issueKey: payload.issueKey,
        keywords: [],
        candidates: [],
        note: 'No meaningful keywords in this issue, so no duplicate search was run.',
      };
    }
    const jql = buildDuplicateJql(issue.projectKey, keywords, payload.issueKey);
    const found = await jira.searchIssues(jql, ['summary', 'status'], payload.maxResults || 10);
    return {
      ok: true,
      issueKey: payload.issueKey,
      keywords,
      candidates: rankDuplicates(issue, found),
    };
  } catch (err) {
    return fail(err);
  }
}

export async function assigneeHistory(payload) {
  try {
    const days = payload.days || 90;
    const clauses = [
      `project = "${payload.projectKey}"`,
      'statusCategory = Done',
      `resolved >= -${days}d`,
    ];
    if (payload.issueType) clauses.push(`issuetype = "${payload.issueType}"`);
    if (payload.component) clauses.push(`component = "${payload.component}"`);
    const jql = `${clauses.join(' AND ')} ORDER BY resolved DESC`;
    const found = await jira.searchIssues(
      jql,
      ['assignee', 'issuetype', 'components', 'resolutiondate'],
      100,
    );
    return {
      ok: true,
      projectKey: payload.projectKey,
      candidates: rankAssignees(found, {
        issueType: payload.issueType,
        component: payload.component,
      }),
    };
  } catch (err) {
    return fail(err);
  }
}

export async function getProjectContext(payload) {
  try {
    const [project, priorities, openCount, resolvedLast90d] = await Promise.all([
      jira.getProject(payload.projectKey),
      jira.getPriorities(),
      jira.searchCount(`project = "${payload.projectKey}" AND statusCategory != Done`),
      jira.searchCount(`project = "${payload.projectKey}" AND statusCategory = Done AND resolved >= -90d`),
    ]);
    return { ok: true, project, priorities, openCount, resolvedLast90d };
  } catch (err) {
    return fail(err);
  }
}

export async function postTriageComment(payload) {
  try {
    const adf = markdownToAdf(payload.comment);
    const result = await jira.postComment(payload.issueKey, adf);
    await saveTriage(payload.issueKey, {
      report: payload.comment,
      priorityName: payload.priorityName || null,
      assigneeName: payload.assigneeName || null,
      duplicateKeys: payload.duplicateKeys
        ? payload.duplicateKeys.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      commentId: result.id,
    });
    return { ok: true, commentId: result.id };
  } catch (err) {
    return fail(err);
  }
}

export async function setPriority(payload) {
  try {
    await jira.setPriority(payload.issueKey, payload.priorityId);
    return { ok: true, issueKey: payload.issueKey, priorityId: String(payload.priorityId) };
  } catch (err) {
    return fail(err);
  }
}

export async function setAssignee(payload) {
  try {
    await jira.setAssignee(payload.issueKey, payload.accountId);
    return { ok: true, issueKey: payload.issueKey, accountId: payload.accountId };
  } catch (err) {
    return fail(err);
  }
}

// Issue-panel resolver: the UI Kit panel calls `getTriage` with the issue key
// and gets the last stored triage (or null when the issue was never triaged).
const resolver = new Resolver();

resolver.define('getTriage', async (req) => {
  const issueKey = req.payload?.issueKey || req.context?.extension?.issue?.key;
  const triage = await getTriage(issueKey);
  return { triage };
});

export const handler = resolver.getDefinitions();
