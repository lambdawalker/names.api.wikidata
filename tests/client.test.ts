import { expect, it, vi } from 'vitest';
import { WikidataClient, buildBearerQuery } from '../src/client.js';
import { entity, userAgent } from './fixtures.js';
it('preserves entity revisions, unknown data, references, qualifiers and all snak/rank types', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ entities: { Q100: entity }, success: 1 })));
  const record = await new WikidataClient({ userAgent, fetch }).getEntity('Q100', { languages: ['en', 'es'] });
  expect(record.data).toEqual(entity); expect(record.revision).toBe('123');
  expect(record.locator).toBe('https://www.wikidata.org/w/index.php?title=Q100&oldid=123');
  const url = new URL(String(fetch.mock.calls[0]?.[0])); expect(url.searchParams.get('languages')).toBe('en|es');
  expect(url.searchParams.get('props')).toContain('claims');
});
it('normalizes only empty array-maps and refuses invalid, missing or redirected identities', async () => {
  const request = (e: unknown) => new WikidataClient({ userAgent, fetch: async () => new Response(JSON.stringify({ entities: { Q100: e }, success: 1 })) }).getEntity('Q100');
  expect((await request({ ...entity, aliases: [], sitelinks: [] })).data.aliases).toEqual({});
  await expect(request({ ...entity, claims: ['bad'] })).rejects.toMatchObject({ code: 'invalid_response' });
  await expect(request({ id: 'Q100', missing: '' })).rejects.toMatchObject({ code: 'not_found' });
  await expect(request({ ...entity, id: 'Q200' })).rejects.toMatchObject({ code: 'invalid_response' });
  await expect(request({ ...entity, lastrevid: undefined })).rejects.toMatchObject({ code: 'invalid_response' });
});
it('accepts legacy lowercase statement subject prefixes without rewriting GUID evidence', async () => {
  const raw = structuredClone(entity); raw.claims.P735[0]!.id = 'q100$legacy-guid';
  const client = new WikidataClient({ userAgent, fetch: async () => new Response(JSON.stringify({ entities: { Q100: raw } })) });
  expect((await client.getEntity('Q100')).data.claims.P735?.[0]?.id).toBe('q100$legacy-guid');
});
it('returns ambiguous search candidates with continuation without choosing a name', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('{"search":[{"id":"Q1","label":"John","description":"given name","future":true},{"id":"Q2","label":"John","description":"surname"}],"search-continue":2,"success":1}'));
  const record = await new WikidataClient({ userAgent, fetch }).searchNames('John', { language: 'es', limit: 2, continue: 0 });
  expect(record.data.results).toHaveLength(2); expect(record.data.nextContinue).toBe(2); expect(record.data.results[0]?.future).toBe(true);
  expect(new URL(String(fetch.mock.calls[0]?.[0])).searchParams.get('language')).toBe('es');
});
it('rejects invalid identifiers, endpoints and query injection before network access', async () => {
  const fetch = vi.fn(); const client = new WikidataClient({ userAgent, fetch });
  await expect(client.getEntity('Q1 } UNION { ?x ?y ?z')).rejects.toThrow();
  await expect(client.searchNames('John', { language: 'en" }' })).rejects.toThrow();
  expect(() => new WikidataClient({ userAgent, apiUrl: 'http://example.org/w/api.php' })).toThrow();
  expect(() => buildBearerQuery('Q1', { kind: 'other' as 'given_name' })).toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it('uses given-name/surname truthy properties and bounded deterministic query pagination', async () => {
  const q = buildBearerQuery('Q4925477', { kind: 'given_name', language: 'en', limit: 2, offset: 4 });
  expect(q).toContain('wdt:P735 wd:Q4925477'); expect(q).toContain('wdt:P31 wd:Q5'); expect(q).toContain('LIMIT 3 OFFSET 4');
  expect(buildBearerQuery('Q2', { kind: 'surname' })).toContain('wdt:P734 wd:Q2');
  const binding = (id: string, n: number) => ({ person: { type: 'uri', value: 'http://www.wikidata.org/entity/' + id }, personLabel: { type: 'literal', value: id + ' label' }, sitelinks: { type: 'literal', value: String(n) } });
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ head: { vars: ['person', 'personLabel', 'sitelinks'] }, results: { bindings: [binding('Q100', 20), binding('Q101', 10), binding('Q102', 2)] } })));
  const record = await new WikidataClient({ userAgent, fetch }).getBearers('Q4925477', { kind: 'given_name', limit: 2, offset: 4 });
  expect(record.data.results.map(r => r.id)).toEqual(['Q100', 'Q101']); expect(record.data.nextOffset).toBe(6);
  expect(record.revision).toBeUndefined(); expect(record.data.ranking).toBe('sitelink_count_proxy');
  expect(new URL(String(fetch.mock.calls[0]?.[0])).searchParams.get('timeout')).toBe('10000');
});
it('refuses malformed bearer URIs and numeric values rather than returning false empty success', async () => {
  const client = new WikidataClient({ userAgent, fetch: async () => new Response('{"results":{"bindings":[{"person":{"type":"uri","value":"https://evil.org/Q1"},"sitelinks":{"type":"literal","value":"NaN"}}]}}') });
  await expect(client.getBearers('Q1', { kind: 'surname' })).rejects.toMatchObject({ code: 'invalid_response' });
});
it('distinguishes the offset safety cap from source exhaustion', async () => {
  const rows = ['Q1', 'Q2'].map(id => ({ person: { type: 'uri', value: 'http://www.wikidata.org/entity/' + id }, sitelinks: { type: 'literal', value: '1' } }));
  const client = new WikidataClient({ userAgent, fetch: async () => new Response(JSON.stringify({ results: { bindings: rows } })) });
  const record = await client.getBearers('Q9', { kind: 'surname', limit: 1, offset: 1000 });
  expect(record.data.nextOffset).toBeNull(); expect(record.data.hasMore).toBe(true); expect(record.data.stopReason).toBe('offset_limit');
});
it('rejects contradictory item-reference metadata from the entity API', async () => {
  const e = structuredClone(entity); e.claims.P31[0]!.mainsnak.datavalue.value['numeric-id'] = 999;
  const client = new WikidataClient({ userAgent, fetch: async () => new Response(JSON.stringify({ entities: { Q100: e } })) });
  await expect(client.getEntity('Q100')).rejects.toMatchObject({ code: 'invalid_response' });
});
