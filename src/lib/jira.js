// Jira REST helpers via @forge/api (runs as the invoking user — asUser()).
// All calls go through requestJira; errors throw with the Jira status + message.

import api, { route } from '@forge/api';

async function jiraRequest(method, path, body) {
  const options = { method, headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await api.asUser().requestJira(route`${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  // 204 No Content (e.g. some PUTs) has no body.
  if (res.status === 204) return null;
  return res.json();
}

// Recursively collect plain text from an ADF (Atlassian Document Format) node.
export function adfToText(adf) {
  if (!adf) return '';
  if (typeof adf === 'string') return adf;
  const parts = [];
  const walk = (node) => {
    if (!node) return;
    if (node.type === 'text' && typeof node.text === 'string') {
      parts.push(node.text);
      return;
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
    if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'listItem') {
      parts.push('\n');
    }
  };
  walk(adf);
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
}

export async function getIssue(issueKey) {
  const fields = [
    'summary', 'description', 'status', 'priority', 'labels',
    'assignee', 'reporter', 'created', 'issuetype', 'project', 'components',
  ].join(',');
  const data = await jiraRequest(
    'GET',
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${fields}`,
  );
  const f = data.fields || {};
  return {
    key: data.key,
    summary: f.summary || '',
    description: adfToText(f.description),
    status: f.status ? f.status.name : null,
    priority: f.priority ? { id: f.priority.id, name: f.priority.name } : null,
    labels: f.labels || [],
    assignee: f.assignee
      ? { accountId: f.assignee.accountId, displayName: f.assignee.displayName }
      : null,
    reporter: f.reporter ? f.reporter.displayName : null,
    created: f.created || null,
    issueType: f.issuetype ? f.issuetype.name : null,
    projectKey: f.project ? f.project.key : null,
    components: (f.components || []).map((c) => c.name),
  };
}

export async function searchIssues(jql, fields, maxResults = 10) {
  const data = await jiraRequest(
    'GET',
    `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=${fields.join(',')}&maxResults=${maxResults}`,
  );
  return (data.issues || []).map((issue) => {
    const f = issue.fields || {};
    return {
      key: issue.key,
      summary: f.summary || '',
      status: f.status ? f.status.name : null,
      assignee: f.assignee
        ? { accountId: f.assignee.accountId, displayName: f.assignee.displayName }
        : null,
      issueType: f.issuetype ? f.issuetype.name : null,
      components: (f.components || []).map((c) => c.name),
      resolved: f.resolutiondate || null,
    };
  });
}

export async function searchCount(jql) {
  const data = await jiraRequest(
    'GET',
    `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=0`,
  );
  return typeof data.total === 'number' ? data.total : 0;
}

export async function getProject(projectKey) {
  const data = await jiraRequest('GET', `/rest/api/3/project/${encodeURIComponent(projectKey)}`);
  return { key: data.key, name: data.name, projectTypeKey: data.projectTypeKey || null };
}

export async function getPriorities() {
  const data = await jiraRequest('GET', '/rest/api/3/priority');
  return (data || []).map((p) => ({ id: p.id, name: p.name }));
}

export async function postComment(issueKey, adfBody) {
  const data = await jiraRequest(
    'POST',
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
    { body: adfBody },
  );
  return { id: data.id };
}

export async function setPriority(issueKey, priorityId) {
  await jiraRequest(
    'PUT',
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
    { fields: { priority: { id: String(priorityId) } } },
  );
  return { ok: true };
}

export async function setAssignee(issueKey, accountId) {
  await jiraRequest(
    'PUT',
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/assignee`,
    { accountId },
  );
  return { ok: true };
}
