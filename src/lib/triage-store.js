// Forge KVS helpers for the stored triage record (shown by the issue panel).
// The record is written by post-triage-comment and read by the panel resolver.

import { kvs } from '@forge/kvs';

const triageKey = (issueKey) => `triage:${issueKey}`;

export async function saveTriage(issueKey, record) {
  await kvs.set(triageKey(issueKey), {
    ...record,
    issueKey,
    updatedAt: new Date().toISOString(),
  });
}

export async function getTriage(issueKey) {
  if (!issueKey) return null;
  return (await kvs.get(triageKey(issueKey))) || null;
}
