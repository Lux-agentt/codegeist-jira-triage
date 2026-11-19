// Unit tests for the pure logic (no Forge runtime needed).
// Forge integration (Jira calls, actions, panel) is tested live on the dev site
// in Phase 2/3 — see PLAN.md.

import {
  tokenize,
  extractKeywords,
  buildDuplicateJql,
  scoreSimilarity,
  rankDuplicates,
} from '../src/lib/duplicates.js';
import { recencyWeight, rankAssignees } from '../src/lib/assignees.js';
import { markdownToAdf, inlineToAdf } from '../src/lib/triage-format.js';

describe('tokenize / extractKeywords', () => {
  test('extracts frequent meaningful keywords, drops stopwords', () => {
    const keywords = extractKeywords('Checkout fails on Visa card at checkout, Visa payment rejected');
    expect(keywords).toContain('checkout');
    expect(keywords).toContain('visa');
    expect(keywords).not.toContain('on');
    expect(keywords).not.toContain('at');
    expect(keywords.length).toBeLessThanOrEqual(8);
  });

  test('short tokens are dropped', () => {
    expect(tokenize('a ab abc abcd')).toEqual(['a', 'ab', 'abc', 'abcd']);
    expect(extractKeywords('a ab abc abcd')).toEqual(['abc', 'abcd']);
  });

  test('empty text yields no keywords', () => {
    expect(extractKeywords('')).toEqual([]);
    expect(extractKeywords('the and of to')).toEqual([]);
  });
});

describe('buildDuplicateJql', () => {
  test('builds an OR text search excluding the issue itself', () => {
    const jql = buildDuplicateJql('DEMO', ['visa', 'checkout'], 'DEMO-123');
    expect(jql).toBe(
      'project = "DEMO" AND (text ~ "visa" OR text ~ "checkout") AND key != "DEMO-123" ORDER BY updated DESC',
    );
  });
});

describe('scoreSimilarity / rankDuplicates', () => {
  test('identical summaries score 1, disjoint score 0', () => {
    expect(scoreSimilarity(tokenize('checkout fails visa'), tokenize('checkout fails visa'))).toBe(1);
    expect(scoreSimilarity(tokenize('checkout fails visa'), tokenize('dark mode toggle'))).toBe(0);
  });

  test('rankDuplicates sorts best first and keeps keys', () => {
    const issue = { summary: 'Checkout fails on Visa card', description: 'Payment rejected at checkout' };
    const candidates = [
      { key: 'DEMO-9', summary: 'Dark mode toggle missing', status: 'To Do' },
      { key: 'DEMO-101', summary: 'Visa payment rejected at checkout', status: 'Done' },
    ];
    const ranked = rankDuplicates(issue, candidates);
    expect(ranked[0].key).toBe('DEMO-101');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked[1].key).toBe('DEMO-9');
  });
});

describe('recencyWeight / rankAssignees', () => {
  const NOW = new Date('2026-11-18T00:00:00Z').getTime();

  test('recency: <=30d scores 2, <=90d scores 1.5, older scores 1', () => {
    expect(recencyWeight('2026-11-08T00:00:00Z', NOW)).toBe(2);
    expect(recencyWeight('2026-09-19T00:00:00Z', NOW)).toBe(1.5);
    expect(recencyWeight('2026-01-01T00:00:00Z', NOW)).toBe(1);
  });

  test('ranks by resolved similar issues, same type/component boost', () => {
    const resolved = [
      { key: 'DEMO-101', assignee: { accountId: 'u-maya', displayName: 'Maya' }, issueType: 'Bug', components: ['Checkout'], resolved: '2026-11-10T00:00:00Z' },
      { key: 'DEMO-102', assignee: { accountId: 'u-maya', displayName: 'Maya' }, issueType: 'Bug', components: ['Checkout'], resolved: '2026-11-01T00:00:00Z' },
      { key: 'DEMO-103', assignee: { accountId: 'u-maya', displayName: 'Maya' }, issueType: 'Bug', components: ['Checkout'], resolved: '2026-10-20T00:00:00Z' },
      { key: 'DEMO-104', assignee: { accountId: 'u-maya', displayName: 'Maya' }, issueType: 'Bug', components: ['Checkout'], resolved: '2026-08-01T00:00:00Z' },
      { key: 'DEMO-110', assignee: { accountId: 'u-budi', displayName: 'Budi' }, issueType: 'Task', components: ['Search'], resolved: '2026-11-15T00:00:00Z' },
      { key: 'DEMO-111', assignee: null, issueType: 'Bug', components: ['Checkout'], resolved: '2026-11-15T00:00:00Z' },
    ];
    const ranked = rankAssignees(resolved, { issueType: 'Bug', component: 'Checkout', nowMs: NOW });
    expect(ranked[0].accountId).toBe('u-maya');
    expect(ranked[0].count).toBe(4);
    expect(ranked[0].evidence).toContain('DEMO-101');
    expect(ranked[1].accountId).toBe('u-budi');
    expect(ranked.length).toBe(2); // unassigned issue is skipped
  });

  test('empty history yields no candidates', () => {
    expect(rankAssignees([], { nowMs: NOW })).toEqual([]);
  });
});

describe('markdownToAdf', () => {
  test('heading, bold paragraph, bullet list', () => {
    const adf = markdownToAdf('## Triage: DEMO-123\n**Priority:** High — checkout down\n- Reproduce on staging\n- Check gateway logs');
    expect(adf.type).toBe('doc');
    expect(adf.content[0]).toEqual({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Triage: DEMO-123' }],
    });
    expect(adf.content[1].type).toBe('paragraph');
    expect(adf.content[1].content[0]).toEqual({
      type: 'text',
      text: 'Priority:',
      marks: [{ type: 'strong' }],
    });
    expect(adf.content[2].type).toBe('bulletList');
    expect(adf.content[2].content).toHaveLength(2);
  });

  test('inlineToAdf leaves plain text untouched', () => {
    expect(inlineToAdf('plain text')).toEqual([{ type: 'text', text: 'plain text' }]);
  });

  test('empty input yields an empty doc', () => {
    expect(markdownToAdf('')).toEqual({ version: 1, type: 'doc', content: [] });
  });
});
