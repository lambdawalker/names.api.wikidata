import { createHash } from 'node:crypto';
import { z } from 'zod';
import { EntitySchema, assertEntityCoherence, Qid, Language, type Entity, type Statement } from './schemas.js';
import type { SourceRecord } from './types.js';
import { SourceError } from './transport.js';
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(sort(value), null, 2);
}
const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
function validate(record: SourceRecord<unknown>): Entity {
  const entity = EntitySchema.parse(record.data);
  assertEntityCoherence(entity);
  if (record.source !== 'wikidata' || record.revision !== String(entity.lastrevid)) throw new TypeError('Wikidata entity revision/source mismatch');
  z.iso.datetime({ offset: true }).parse(record.retrievedAt);
  if (record.locator !== `https://www.wikidata.org/w/index.php?title=${entity.id}&oldid=${entity.lastrevid}`) throw new TypeError('Wikidata revision locator mismatch');
  return entity;
}
function sourceOf(record: SourceRecord<unknown>, entity: Entity) {
  return { id: 'wikidata:' + digest([entity.id, record.revision, record.retrievedAt, entity]), provider: 'wikidata', upstream_source: 'Wikidata structured data', url: record.locator, retrieved_at: record.retrievedAt, revision: record.revision!, license: { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' }, public_reuse: 'allowed' as const };
}
export function toDocumentInput(record: SourceRecord<unknown>) {
  const entity = validate(record); const json = canonicalJson(entity);
  const fence = '`'.repeat(Math.max(3, ...Array.from(json.matchAll(/`+/g), m => m[0].length + 1)));
  const content = `# Wikidata entity ${entity.id}\n\nSource: Wikidata contributors, revision ${entity.lastrevid}.\n\n${record.locator}\n\nStructured data: CC0 1.0. External reference text and media were not fetched.\n\n${fence}json\n${json}\n${fence}\n`;
  if (Buffer.byteLength(content) > 1048576) throw new SourceError('document_too_large', 'Entity Markdown exceeds 1 MiB');
  return { source: sourceOf(record, entity), locator: record.locator, content, format: 'markdown' as const, retention: 'allowed' as const };
}
/** Mirrors truthy best-rank selection, without flattening evidence in the original entity. */
export function bestRank(statements: Statement[] = []): Statement[] {
  const usable = statements.filter(s => s.rank !== 'deprecated'); return usable.some(s => s.rank === 'preferred') ? usable.filter(s => s.rank === 'preferred') : usable;
}
function pointsTo(statement: Statement, id: string) {
  const snak = statement.mainsnak;
  if (snak.snaktype !== 'value' || snak.datavalue.type !== 'wikibase-entityid') return false;
  const v = snak.datavalue.value; return !!v && typeof v === 'object' && !Array.isArray(v) && v.id === id;
}
const BearerFindingOptions = z.strictObject({ nameEntityId: Qid, kind: z.enum(['given_name', 'surname']), formIds: z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)).min(1).max(20), labelLanguage: Language.default('en'), documentId: z.string().regex(/^[a-f0-9]{64}$/).optional() });
export function toBearerFinding(record: SourceRecord<unknown>, input: z.input<typeof BearerFindingOptions>) {
  const args = BearerFindingOptions.parse(input); const entity = validate(record); const property = args.kind === 'given_name' ? 'P735' : 'P734';
  const human = bestRank(entity.claims.P31).filter(s => pointsTo(s, 'Q5'));
  const matching = bestRank(entity.claims[property]).filter(s => pointsTo(s, args.nameEntityId));
  if (!human.length || !matching.length) throw new TypeError('Current entity lacks a matching best-rank human/name statement');
  const name = entity.labels[args.labelLanguage]?.value;
  if (!name?.trim()) throw new TypeError('Requested-language person label is missing');
  const source = sourceOf(record, entity); const forms = [...new Set(args.formIds)];
  const identity = digest([source.id, args.nameEntityId, property, forms, args.labelLanguage, args.documentId ?? null]);
  const evidence = { id: 'wd-evidence-' + identity, source_id: source.id, locator: record.locator + '#' + property, ...(args.documentId ? { document_id: args.documentId } : {}), supporting_text: canonicalJson({ human_statements: human, name_statements: matching }), note: 'Wikidata bearer relationship; qualifiers and references retained. Form-to-entity mapping is caller supplied and candidate-only.' };
  const description = entity.descriptions[args.labelLanguage]?.value;
  const finding = { idempotency_key: 'wd-bearer-' + identity, sources: [source], evidence: [evidence], notable_bearers: [{ id: 'wd-bearer-' + identity, name, form_ids: forms, wikidata_id: entity.id, ...(description ? { description } : {}), status: 'candidate' as const, evidence_ids: [evidence.id], interpretation: `Current ${property} statement matches ${args.nameEntityId}; no claim of objective fame or population frequency.` }] };
  if (Buffer.byteLength(JSON.stringify(finding)) > 131072) throw new SourceError('response_too_large', 'Bearer finding exceeds 128 KiB');
  return finding;
}
