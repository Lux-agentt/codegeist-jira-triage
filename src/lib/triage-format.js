// Pure Markdown -> Jira ADF (Atlassian Document Format) conversion.
// No Forge imports — unit-tested with Jest. Supports headings (#, ##, ###),
// bullet lists (- ), and **bold** inline text. Everything else is a paragraph.

// Parse **bold** segments into ADF inline nodes.
export function inlineToAdf(text) {
  const nodes = [];
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      nodes.push({ type: 'text', text: part.slice(2, -2), marks: [{ type: 'strong' }] });
    } else {
      nodes.push({ type: 'text', text: part });
    }
  }
  return nodes.length ? nodes : [{ type: 'text', text: '' }];
}

export function markdownToAdf(markdown) {
  const content = [];
  const lines = String(markdown || '').split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headings: #, ##, ###
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      content.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        content: inlineToAdf(heading[2]),
      });
      i += 1;
      continue;
    }

    // Bullet list: consecutive "- " lines become one bulletList node.
    if (line.startsWith('- ')) {
      const items = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: inlineToAdf(lines[i].slice(2)) }],
        });
        i += 1;
      }
      content.push({ type: 'bulletList', content: items });
      continue;
    }

    // Blank line: paragraph break, skip.
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // Plain paragraph.
    content.push({ type: 'paragraph', content: inlineToAdf(line) });
    i += 1;
  }

  return { version: 1, type: 'doc', content };
}
