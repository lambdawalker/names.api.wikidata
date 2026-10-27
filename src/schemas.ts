import { z } from 'zod';
export const Qid = z.string().regex(/^Q[1-9][0-9]*$/).max(32);
export const Pid = z.string().regex(/^P[1-9][0-9]*$/).max(32);
export const Language = z.string().regex(/^[a-z]{2,12}(?:-[a-z0-9]{1,12})*$/).max(64);
export const InputText = z.string().trim().min(1).max(256).refine(v => !/[\u0000-\u001f\u007f]/u.test(v)).transform(v => v.normalize('NFC'));
export const TextValue = z.looseObject({ language: z.string(), value: z.string() });
const map = <T extends z.ZodType>(schema: T) => z.preprocess(value => Array.isArray(value) && value.length === 0 ? {} : value, z.record(z.string(), schema));
export const SnakSchema = z.discriminatedUnion('snaktype', [
  z.looseObject({ snaktype: z.literal('value'), property: Pid, datatype: z.string().optional(), datavalue: z.looseObject({ type: z.string(), value: z.json() }) }),
  z.looseObject({ snaktype: z.enum(['novalue', 'somevalue']), property: Pid, datatype: z.string().optional() }),
]);
export const StatementSchema = z.looseObject({
  id: z.string().min(1), type: z.literal('statement'), rank: z.enum(['normal', 'preferred', 'deprecated']), mainsnak: SnakSchema,
  qualifiers: map(z.array(SnakSchema)).optional(),
  references: z.array(z.looseObject({ hash: z.string().min(1), snaks: map(z.array(SnakSchema)), 'snaks-order': z.array(Pid).optional() })).optional(),
});
export const EntitySchema = z.looseObject({ id: Qid, type: z.literal('item'), lastrevid: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), modified: z.iso.datetime().optional(), labels: map(TextValue), descriptions: map(TextValue), aliases: map(z.array(TextValue)), claims: map(z.array(StatementSchema)), sitelinks: map(z.looseObject({ site: z.string(), title: z.string(), badges: z.array(z.string()).optional(), url: z.url().optional() })) });
export type Entity = z.infer<typeof EntitySchema>;
export type Statement = z.infer<typeof StatementSchema>;
export function assertEntityCoherence(entity: Entity) {
  for (const values of [entity.labels, entity.descriptions]) for (const [language, text] of Object.entries(values)) {
    if (text.language !== language) throw new TypeError('Inconsistent Wikidata text language');
  }
  for (const [language, aliases] of Object.entries(entity.aliases)) if (aliases.some(text => text.language !== language)) throw new TypeError('Inconsistent Wikidata alias language');
  for (const [property, statements] of Object.entries(entity.claims)) for (const statement of statements) {
    // Older live statements may use a lowercase q prefix. Preserve the GUID;
    // only its owning item prefix is compared case-insensitively.
    const separator = statement.id.indexOf('$');
    if (statement.mainsnak.property !== property || separator < 1 || statement.id.slice(0, separator).toUpperCase() !== entity.id || !statement.id.slice(separator + 1)) throw new TypeError('Inconsistent Wikidata statement identity');
    const snak = statement.mainsnak;
    if (snak.snaktype === 'value' && snak.datavalue.type === 'wikibase-entityid') {
      const value = snak.datavalue.value;
      if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.id === 'string' && /^Q[1-9][0-9]*$/.test(value.id)) {
        if (!Qid.safeParse(value.id).success) throw new TypeError('Invalid Wikidata item reference identity');
        if (value['entity-type'] !== undefined && value['entity-type'] !== 'item') throw new TypeError('Inconsistent Wikidata item reference type');
        const numeric = value['numeric-id'];
        if (numeric !== undefined && (typeof numeric !== 'number' || !Number.isSafeInteger(numeric) || numeric < 1 || BigInt(numeric) !== BigInt(value.id.slice(1)))) throw new TypeError('Inconsistent Wikidata item reference numeric identity');
        if (snak.datatype !== undefined && snak.datatype !== 'wikibase-item') throw new TypeError('Inconsistent Wikidata item reference datatype');
      }
    }
  }
}
export const SearchItemSchema = z.looseObject({ id: Qid, label: z.string().optional(), description: z.string().optional() });
export const SearchEnvelope = z.looseObject({ search: z.array(SearchItemSchema), 'search-continue': z.number().int().nonnegative().optional(), success: z.literal(1).optional() });
export const SearchOptionsSchema = z.strictObject({ language: Language.default('en'), limit: z.number().int().min(1).max(20).default(10), continue: z.number().int().min(0).max(10000).optional() });
export const EntityOptionsSchema = z.strictObject({ languages: z.array(Language).min(1).max(10).default(['en']) });
export const BearerOptionsSchema = z.strictObject({ kind: z.enum(['given_name', 'surname']), language: Language.default('en'), limit: z.number().int().min(1).max(20).default(10), offset: z.number().int().min(0).max(1000).default(0) });
export type SearchOptions = z.input<typeof SearchOptionsSchema> & { signal?: AbortSignal };
export type EntityOptions = z.input<typeof EntityOptionsSchema> & { signal?: AbortSignal };
export type BearerOptions = z.input<typeof BearerOptionsSchema> & { signal?: AbortSignal };
export interface SearchData { results: z.infer<typeof SearchItemSchema>[]; nextContinue: number | null }
export interface BearerCandidate { id: string; label?: string; description?: string; sitelinkCount: number }
export interface BearerPage { nameEntityId: string; kind: 'given_name' | 'surname'; property: 'P735' | 'P734'; language: string; query: string; endpoint: string; ranking: 'sitelink_count_proxy'; results: BearerCandidate[]; hasMore: boolean; stopReason: 'source_exhausted' | 'offset_limit' | 'more_available'; nextOffset: number | null }
