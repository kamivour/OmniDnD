// Reports dead links in data/content/tools.json. Run by hand: npm run check:tools
// Some sites block scripts (403, 429) or need a login; those are listed as "unsure", not dead.
import { readFileSync } from 'node:fs';

interface Entry {
  id: string;
  name: string;
  url: string;
}

const tools = JSON.parse(
  readFileSync(new URL('../data/content/tools.json', import.meta.url), 'utf8'),
) as Entry[];

type Verdict = 'ok' | 'unsure' | 'dead';

async function check(url: string): Promise<{ verdict: Verdict; note: string }> {
  for (const method of ['HEAD', 'GET']) {
    try {
      const response = await fetch(url, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
        headers: { 'user-agent': 'OmniDnD link check (manual run)' },
      });
      if (response.ok) return { verdict: 'ok', note: String(response.status) };
      if (method === 'HEAD') continue;
      if ([401, 403, 429, 999].includes(response.status)) {
        return { verdict: 'unsure', note: String(response.status) };
      }
      return { verdict: 'dead', note: String(response.status) };
    } catch (error) {
      if (method === 'HEAD') continue;
      return { verdict: 'dead', note: error instanceof Error ? error.message : String(error) };
    }
  }
  return { verdict: 'dead', note: 'no response' };
}

const results: { tool: Entry; verdict: Verdict; note: string }[] = [];
const queue = [...tools];
await Promise.all(
  Array.from({ length: 6 }, async () => {
    for (let tool = queue.shift(); tool; tool = queue.shift()) {
      results.push({ tool, ...(await check(tool.url)) });
    }
  }),
);

for (const verdict of ['dead', 'unsure'] as const) {
  const rows = results.filter((result) => result.verdict === verdict);
  if (rows.length === 0) continue;
  console.log(`\n${verdict.toUpperCase()} (${rows.length})`);
  for (const { tool, note } of rows) console.log(`  ${tool.name}: ${tool.url} (${note})`);
}
const ok = results.filter((result) => result.verdict === 'ok').length;
console.log(`\n${ok} of ${tools.length} links ok.`);
process.exitCode = results.some((result) => result.verdict === 'dead') ? 1 : 0;
