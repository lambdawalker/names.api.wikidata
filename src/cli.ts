#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WikidataClient } from './client.js';
import { toDocumentInput } from './evidence.js';
import { SourceError } from './transport.js';
const HELP = `Usage:
  names-wikidata search TEXT [--language en] [--limit 10] [--continue N]
  names-wikidata entity QID [--languages en,es] [--markdown | --document]
  names-wikidata bearers NAME_QID --kind given_name|surname [--language en] [--limit 10] [--offset 0]
  All commands accept --output FILE (exclusive creation); otherwise write stdout.
Set WIKIDATA_USER_AGENT to an informative application/contact string. No API key is needed.
`;
interface CliIO { stdout?: (text: string) => void; stderr?: (text: string) => void; env?: Record<string, string | undefined>; writeFile?: (path: string, body: string) => Promise<void>; fetch?: typeof fetch; signal?: AbortSignal }
export async function runCli(args: string[], io: CliIO = {}) {
  const stdout = io.stdout ?? (s => { process.stdout.write(s); }); const stderr = io.stderr ?? (s => { process.stderr.write(s); });
  try {
    const { values: v, positionals: p } = parseArgs({ args, allowPositionals: true, strict: true, options: { language: { type: 'string' }, languages: { type: 'string' }, kind: { type: 'string' }, limit: { type: 'string' }, offset: { type: 'string' }, continue: { type: 'string' }, markdown: { type: 'boolean' }, document: { type: 'boolean' }, output: { type: 'string' }, help: { type: 'boolean' } } });
    if (v.help) { stdout(HELP); return 0; }
    if (p.length !== 2 || !['search', 'entity', 'bearers'].includes(p[0]!)) throw Error('Expected search, entity or bearers; use --help');
    if (v.markdown && v.document) throw Error('Choose --markdown or --document');
    const valid: Record<string, string[]> = { search: ['language', 'limit', 'continue', 'output'], entity: ['languages', 'markdown', 'document', 'output'], bearers: ['kind', 'language', 'limit', 'offset', 'output'] };
    if (Object.keys(v).some(k => !valid[p[0]!]!.includes(k))) throw Error('Option is not valid for this command');
    const number = (key: 'limit' | 'offset' | 'continue') => { const s = v[key]; if (s === undefined) return; if (!/^\d+$/.test(s) || !Number.isSafeInteger(Number(s))) throw Error(`Invalid --${key}`); return Number(s); };
    // Validate numeric syntax before any transport can run.
    const limit = number('limit'), offset = number('offset'), next = number('continue');
    const userAgent = (io.env ?? process.env).WIKIDATA_USER_AGENT; if (!userAgent?.trim()) throw Error('Set WIKIDATA_USER_AGENT to an application name and contact URL');
    const client = new WikidataClient({ userAgent, ...(io.fetch ? { fetch: io.fetch } : {}) }); let output: string;
    if (p[0] === 'entity') { const record = await client.getEntity(p[1]!, { languages: v.languages?.split(','), signal: io.signal }); output = v.markdown ? toDocumentInput(record).content : JSON.stringify(v.document ? toDocumentInput(record) : record, null, 2) + '\n'; }
    else if (p[0] === 'search') output = JSON.stringify(await client.searchNames(p[1]!, { language: v.language, limit, continue: next, signal: io.signal }), null, 2) + '\n';
    else { if (!['given_name', 'surname'].includes(v.kind ?? '')) throw Error('--kind must be given_name or surname'); output = JSON.stringify(await client.getBearers(p[1]!, { kind: v.kind as 'given_name' | 'surname', language: v.language, limit, offset, signal: io.signal }), null, 2) + '\n'; }
    if (v.output) await (io.writeFile ?? ((path, body) => writeFile(path, body, { flag: 'wx', mode: 0o600, encoding: 'utf8' })))(v.output, output); else stdout(output);
    return 0;
  } catch (error) { stderr(`ERROR: ${error instanceof SourceError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : 'Command failed'}\n`); return 1; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController(); const cancel = () => controller.abort(); process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  process.exitCode = await runCli(process.argv.slice(2), { signal: controller.signal }); process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
}
