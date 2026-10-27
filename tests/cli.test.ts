import { expect, it } from 'vitest';
import { runCli } from '../src/cli.js';
import { entity, userAgent } from './fixtures.js';
it('prints help without credentials, validates arguments, and writes Markdown or storage input', async () => {
  const output: string[] = [], errors: string[] = []; let written = '';
  const io = { stdout: (s: string) => { output.push(s); }, stderr: (s: string) => { errors.push(s); }, env: { WIKIDATA_USER_AGENT: userAgent }, writeFile: async (_path: string, body: string) => { written = body; }, fetch: async () => new Response(JSON.stringify({ entities: { Q100: entity } })) };
  expect(await runCli(['--help'], { ...io, env: {} })).toBe(0); expect(output.join('')).toContain('bearers'); output.length = 0;
  expect(await runCli(['entity', 'Q100', '--markdown'], io)).toBe(0); expect(output.join('')).toContain('Wikidata entity Q100');
  expect(await runCli(['entity', 'Q100', '--document', '--output', 'person.json'], io)).toBe(0); expect(JSON.parse(written).source.revision).toBe('123');
  for (const args of [['search', 'John', '--limit', 'NaN'], ['entity', 'Q100', '--surprise'], ['entity', 'Q100', '--markdown', '--document'], ['bad', 'Q100']]) expect(await runCli(args, io)).toBe(1);
  expect(await runCli(['search', 'John'], { ...io, env: {} })).toBe(1);
});
