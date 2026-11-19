// Pure duplicate-detection helpers (no Forge imports — unit-tested with Jest).
// The agent judges true duplicates; these functions only gather and rank evidence.

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'when', 'after', 'before', 'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its',
  'this', 'that', 'these', 'those', 'i', 'we', 'you', 'he', 'she', 'they', 'them',
  'not', 'no', 'yes', 'if', 'then', 'than', 'so', 'as', 'at', 'by', 'from', 'into',
  'does', 'do', 'did', 'can', 'could', 'should', 'would', 'will', 'just', 'also',
  'very', 'more', 'most', 'some', 'any', 'all', 'each', 'other', 'new', 'old',
  'error', 'issue', 'bug', 'problem', 'please', 'help', 'using', 'use', 'used',
  'get', 'gets', 'got', 'via', 'per', 'etc',
]);

// Split text into lowercase alphanumeric tokens.
export function tokenize(text) {
  if (!text) return [];
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []);
}

// Extract the most frequent meaningful keywords from a text (summary + description).
// Returns up to maxKeywords tokens, most frequent first.
export function extractKeywords(text, maxKeywords = 8) {
  const counts = new Map();
  for (const token of tokenize(text)) {
    if (token.length < 3 || STOPWORDS.has(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxKeywords)
    .map(([token]) => token);
}

// Build a JQL query that finds issues whose text mentions any of the keywords.
// JQL `text ~ "word"` is a full-text search; multiple terms are OR-ed explicitly
// (a quoted multi-word string would be a phrase search, which is not what we want).
export function buildDuplicateJql(projectKey, keywords, excludeKey) {
  const terms = keywords.map((k) => `text ~ "${k}"`).join(' OR ');
  const parts = [`project = "${projectKey}"`];
  if (terms) parts.push(`(${terms})`);
  if (excludeKey) parts.push(`key != "${excludeKey}"`);
  return `${parts.join(' AND ')} ORDER BY updated DESC`;
}

// Jaccard similarity between two token sets, 0–1.
export function scoreSimilarity(tokensA, tokensB) {
  const a = new Set(tokensA.filter((t) => !STOPWORDS.has(t) && t.length >= 3));
  const b = new Set(tokensB.filter((t) => !STOPWORDS.has(t) && t.length >= 3));
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

// Rank duplicate candidates for an issue. `issue` has summary/description;
// each candidate has key/summary/status. Returns candidates sorted by score desc.
export function rankDuplicates(issue, candidates) {
  const issueTokens = tokenize(`${issue.summary || ''} ${issue.description || ''}`);
  return candidates
    .map((candidate) => ({
      key: candidate.key,
      summary: candidate.summary,
      status: candidate.status,
      score: Math.round(scoreSimilarity(issueTokens, tokenize(candidate.summary || '')) * 100) / 100,
    }))
    .sort((a, b) => b.score - a.score);
}
