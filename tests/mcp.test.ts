import { afterEach, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { createWikidataMcpServer } from '../src/mcp.js';
import { WikidataClient } from '../src/client.js';
import { entity, userAgent } from './fixtures.js';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
const closes: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of closes.splice(0)) await close(); });
async function connect(options: Parameters<typeof createWikidataMcpServer>[0] = {}) {
  const server = createWikidataMcpServer({ clientOptions: { userAgent }, ...options });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' }); await server.connect(serverTransport); await client.connect(clientTransport);
  closes.push(async () => { await client.close(); await server.close(); }); return client;
}
function body(result: Awaited<ReturnType<Client['callTool']>>) { return JSON.parse((result.content as { text: string }[])[0]!.text); }
it('advertises exactly three read-only tools and preserves revision identity between JSON chunks', async () => {
  let calls = 0;
  const source = new WikidataClient({ userAgent, fetch: async () => { calls++; return new Response(JSON.stringify({ entities: { Q100: entity } })); } });
  const client = await connect({ client: source });
  const tools = await client.listTools(); expect(tools.tools.map(t => t.name).sort()).toEqual(['get_bearers', 'get_entity', 'search_names']);
  expect(tools.tools.every(t => t.annotations?.readOnlyHint)).toBe(true);
  const first = body(await client.callTool({ name: 'get_entity', arguments: { id: 'Q100', limit: 50 } }));
  const second = body(await client.callTool({ name: 'get_entity', arguments: { id: 'Q100', offset: 50, limit: 50, revision: 123 } }));
  expect(first.revision).toBe(123); expect(second.retrieved_at).toBe(first.retrieved_at); expect(calls).toBe(1);
  expect((await client.callTool({ name: 'get_entity', arguments: { id: 'Q100', offset: 50 } })).isError).toBe(true);
});
it('refuses stale revision paging after TTL rather than silently mixing snapshots', async () => {
  let now = 0, revision = 123;
  const source = new WikidataClient({ userAgent, intervalMs: 0, fetch: async () => new Response(JSON.stringify({ entities: { Q100: { ...entity, lastrevid: revision } } })) });
  const client = await connect({ client: source, now: () => now });
  await client.callTool({ name: 'get_entity', arguments: { id: 'Q100' } }); now = 300001; revision = 124;
  expect((await client.callTool({ name: 'get_entity', arguments: { id: 'Q100', offset: 50, revision: 123 } })).isError).toBe(true);
});
it('bounds the complete serialized result, including oversized discovery metadata', async () => {
  const source = new WikidataClient({ userAgent, fetch: async () => new Response(JSON.stringify({ search: [{ id: 'Q1', label: '漢'.repeat(100000) }] })) });
  const client = await connect({ client: source }); const result = await client.callTool({ name: 'search_names', arguments: { query: 'A' } });
  expect(result.isError).toBe(true); expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(65536);
  expect(body(result).code).toBe('response_too_large');
});
it('isolates language selections, bounds cached entities and forwards cancellation', async () => {
  let calls = 0; let passedSignal: AbortSignal | undefined;
  const source = new WikidataClient({ userAgent, intervalMs: 0, fetch: async (url, init) => { calls++; passedSignal = init?.signal ?? undefined; const id = new URL(String(url)).searchParams.get('ids')!; return new Response(JSON.stringify({ entities: { [id]: { ...entity, id, claims: {} } } })); } });
  const client = await connect({ client: source });
  await client.callTool({ name: 'get_entity', arguments: { id: 'Q100', languages: ['en'] } });
  await client.callTool({ name: 'get_entity', arguments: { id: 'Q100', languages: ['es'] } });
  expect(calls).toBe(2); expect(passedSignal).toBeInstanceOf(AbortSignal);
  for (let i = 101; i < 109; i++) await client.callTool({ name: 'get_entity', arguments: { id: 'Q' + i } });
  const before = calls; await client.callTool({ name: 'get_entity', arguments: { id: 'Q100', languages: ['en'] } }); expect(calls).toBe(before + 1);
});
it('starts the built stdio server without corrupting protocol stdout', async () => {
  const client = new Client({ name: 'stdio-test', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/mcp-stdio.js'], env: { ...process.env as Record<string, string>, WIKIDATA_USER_AGENT: userAgent }, stderr: 'pipe' });
  try { await client.connect(transport); expect((await client.listTools()).tools).toHaveLength(3); } finally { await client.close(); }
});
it('bounds SDK validation failures without echoing huge unknown argument names', async () => {
  let requests = 0; const source = new WikidataClient({ userAgent, fetch: async () => { requests++; throw Error('must not call'); } });
  const client = await connect({ client: source });
  for (const extra of [{ ['x'.repeat(100000)]: 1 }, Object.fromEntries(Array.from({ length: 1000 }, (_, i) => ['unknown_' + i + 'x'.repeat(100), 1]))]) {
    for (const [name, args] of [['search_names', { query: 'John' }], ['get_entity', { id: 'Q100' }], ['get_bearers', { nameEntityId: 'Q1', kind: 'given_name' }]] as const) {
      const result = await client.callTool({ name, arguments: { ...args, ...extra } });
      expect(result.isError).toBe(true); expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(65536);
    }
  }
  expect(requests).toBe(0);
});
