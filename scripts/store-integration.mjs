// Synthetic compatibility check against the real authenticated HTTP/SQLite service.
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { WikidataClient, toDocumentInput, toBearerFinding } from '../dist/index.js';
assert(process.env.STORE_CHECKOUT, 'Set STORE_CHECKOUT to a built names.research.store checkout');
const { Store, createApi } = await import(pathToFileURL(resolve(process.env.STORE_CHECKOUT, 'dist/index.js')).href);
const statement = (property, target) => ({ id: 'Q100$' + property, type: 'statement', rank: 'normal', mainsnak: { snaktype: 'value', property, datavalue: { type: 'wikibase-entityid', value: { id: target } } }, references: [{ hash: 'synthetic-ref', snaks: { P248: [{ snaktype: 'value', property: 'P248', datavalue: { type: 'wikibase-entityid', value: { id: 'Q200' } } }] } }] });
const entity = { id: 'Q100', type: 'item', lastrevid: 123, labels: { en: { language: 'en', value: 'Synthetic Example Person' } }, descriptions: {}, aliases: {}, sitelinks: {}, claims: { P31: [statement('P31', 'Q5')], P735: [statement('P735', 'Q4925477')] } };
const record = await new WikidataClient({ userAgent: 'NamesCompatibility/1 (https://github.com/lambdawalker/names.api.wikidata)', fetch: async () => new Response(JSON.stringify({ entities: { Q100: entity } })) }).getEntity('Q100');
const directory = await mkdtemp(join(tmpdir(), 'wikidata-store-')); const token = randomBytes(32).toString('hex');
let store = new Store(directory); const api = createApi(store, token);
try {
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${api.address().port}`;
  const call = async (name, input) => { const response = await fetch(`${base}/v1/operations/${name}`, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result; };
  await call('record_finding', { idempotency_key: 'seed-form', forms: [{ id: 'form-john', spelling: 'John', language: { code: 'en', name: 'English' }, script: 'Latn', kind: 'given_name', reconstructed: false, transliterations: [] }] });
  const input = toDocumentInput(record); const doc = await call('store_document', input);
  const sameBody = toDocumentInput({ ...record, retrievedAt: new Date(Date.parse(record.retrievedAt) + 1000).toISOString() });
  await call('store_document', sameBody); assert.equal((await readdir(join(directory, 'documents'))).length, 1);
  const finding = toBearerFinding(record, { nameEntityId: 'Q4925477', kind: 'given_name', formIds: ['form-john'], documentId: doc.document_id });
  const first = await call('record_finding', finding); const retry = await call('record_finding', finding); assert.equal(first.finding_id, retry.finding_id);
  await new Promise(resolve => api.close(resolve)); store.close(); store = new Store(directory);
  const bearer = store.readEntity('notable_bearers', finding.notable_bearers[0].id).entity;
  assert.equal(bearer.status, 'candidate'); assert.equal(bearer.wikidata_id, 'Q100');
  assert(store.readDocument({ document_id: doc.document_id }).text.includes('Wikidata entity Q100'));
  console.log(JSON.stringify({ compatible: true, candidatePersisted: true, replayIdempotent: true, markdownBodies: 1, survivedRestart: true }));
} finally { if (api.listening) await new Promise(resolve => api.close(resolve)); store.close(); await rm(directory, { recursive: true, force: true }); }
