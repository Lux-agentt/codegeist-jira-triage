// Forge KVS helpers for the stored triage record (shown by the issue panel).
// The record is written by post-triage-comment and read by the panel resolver.

import { storage } from '@forge/api';

const triageKey = (issueKey) => `triage:${issueKey}`;

export async function saveTriage(issueKey, record) {
  await storage.set(triageKey(issueKey), {
    ...record,
    issueKey,
    updatedAt: new Date().toISOString(),
  });
}

export async function getTriage(issueKey) {
  if (!issueKey) return null;
  return (await storage.get(triageKey(issueKey))) || null;
}
