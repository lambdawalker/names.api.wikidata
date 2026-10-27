import { z } from 'zod';
import { JsonTransport, SourceError } from './transport.js';
import { endpoint, type ClientOptions, type SourceRecord } from './types.js';
import { Qid, InputText, EntitySchema, assertEntityCoherence, SearchEnvelope, SearchOptionsSchema, EntityOptionsSchema, BearerOptionsSchema, type Entity, type SearchOptions, type EntityOptions, type BearerOptions, type SearchData, type BearerPage } from './schemas.js';

export function buildBearerQuery(id: string, options: Omit<BearerOptions, 'signal'>): string {
  const qid = Qid.parse(id); const args = BearerOptionsSchema.parse(options); const property = args.kind === 'given_name' ? 'P735' : 'P734';
  return `PREFIX wd: <http://www.wikidata.org/entity/>\nPREFIX wdt: <http://www.wikidata.org/prop/direct/>\nPREFIX wikibase: <http://wikiba.se/ontology#>\nPREFIX bd: <http://www.bigdata.com/rdf#>\nSELECT ?person ?personLabel ?personDescription ?sitelinks WHERE {\n { SELECT DISTINCT ?person ?sitelinks WHERE { ?person wdt:${property} wd:${qid}; wdt:P31 wd:Q5; wikibase:sitelinks ?sitelinks. } ORDER BY DESC(?sitelinks) ?person LIMIT ${args.limit + 1} OFFSET ${args.offset} }\n SERVICE wikibase:label { bd:serviceParam wikibase:language "${args.language}". }\n} ORDER BY DESC(?sitelinks) ?person`;
}
const Binding = z.looseObject({ type: z.string(), value: z.string() });
const Sparql = z.object({ results: z.object({ bindings: z.array(z.object({ person: Binding, sitelinks: Binding, personLabel: Binding.optional(), personDescription: Binding.optional() })) }) });
export class WikidataClient {
  private readonly transport: JsonTransport;
  private readonly api: URL;
  private readonly query: URL;
  constructor(options: ClientOptions & { apiUrl?: string; queryUrl?: string }) {
    this.api = endpoint(options.apiUrl ?? 'https://www.wikidata.org/w/api.php');
    this.query = endpoint(options.queryUrl ?? 'https://query.wikidata.org/sparql');
    this.transport = new JsonTransport(options);
  }
  async searchNames(query: string, options: SearchOptions = {}): Promise<SourceRecord<SearchData>> {
    const { signal, ...rest } = options; const args = SearchOptionsSchema.parse(rest); const url = this.apiUrl({ action: 'wbsearchentities', search: InputText.parse(query), language: args.language, uselang: args.language, type: 'item', limit: String(args.limit), ...(args.continue === undefined ? {} : { continue: String(args.continue) }) });
    const result = await this.transport.get(url, signal); const parsed = SearchEnvelope.safeParse(result.data);
    if (!parsed.success || parsed.data.search.length > args.limit) throw new SourceError('invalid_response', 'Invalid Wikidata search response');
    return { source: 'wikidata', upstreamSource: 'Wikidata structured data', locator: url.href, retrievedAt: result.fetchedAt, cacheControl: result.cacheControl, data: { results: parsed.data.search, nextContinue: parsed.data['search-continue'] ?? null } };
  }
  async getEntity(id: string, options: EntityOptions = {}): Promise<SourceRecord<Entity>> {
    const qid = Qid.parse(id); const { signal, ...rest } = options; const args = EntityOptionsSchema.parse(rest);
    const url = this.apiUrl({ action: 'wbgetentities', ids: qid, props: 'info|labels|descriptions|aliases|claims|sitelinks', languages: [...new Set(args.languages)].join('|') });
    const result = await this.transport.get(url, signal);
    const envelope = z.object({ entities: z.record(z.string(), z.unknown()), success: z.literal(1).optional() }).safeParse(result.data);
    if (!envelope.success) throw new SourceError('invalid_response', 'Invalid Wikidata entity envelope');
    const raw = envelope.data.entities[qid];
    if (raw && typeof raw === 'object' && Object.hasOwn(raw, 'missing')) throw new SourceError('not_found', 'Wikidata item does not exist');
    const parsed = EntitySchema.safeParse(raw);
    if (!parsed.success || parsed.data.id !== qid) throw new SourceError('invalid_response', 'Missing, redirected or invalid Wikidata item');
    try { assertEntityCoherence(parsed.data); } catch { throw new SourceError('invalid_response', 'Inconsistent Wikidata entity metadata'); }
    const locator = `https://www.wikidata.org/w/index.php?title=${qid}&oldid=${parsed.data.lastrevid}`;
    return { source: 'wikidata', upstreamSource: 'Wikidata structured data', locator, retrievedAt: result.fetchedAt, revision: String(parsed.data.lastrevid), cacheControl: result.cacheControl, data: parsed.data };
  }
  async getBearers(id: string, options: BearerOptions): Promise<SourceRecord<BearerPage>> {
    const qid = Qid.parse(id); const { signal, ...rest } = options; const args = BearerOptionsSchema.parse(rest); const query = buildBearerQuery(qid, args); const url = new URL(this.query);
    url.search = new URLSearchParams({ query, format: 'json', timeout: '10000' }).toString();
    const result = await this.transport.get(url, signal, 'application/sparql-results+json'); const parsed = Sparql.safeParse(result.data);
    if (!parsed.success || parsed.data.results.bindings.length > args.limit + 1) throw new SourceError('invalid_response', 'Invalid WDQS result envelope');
    const seen = new Set<string>();
    const rows = parsed.data.results.bindings.map(row => {
      const match = row.person.value.match(/^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9][0-9]*)$/);
      const count = Number(row.sitelinks.value);
      if (row.person.type !== 'uri' || !match || !/^\d+$/.test(row.sitelinks.value) || !Number.isSafeInteger(count) || seen.has(match[1]!)) throw new SourceError('invalid_response', 'Invalid WDQS bearer binding');
      const qid = Qid.parse(match[1]); seen.add(qid);
      return { id: qid, ...(row.personLabel && row.personLabel.value !== qid ? { label: row.personLabel.value } : {}), ...(row.personDescription ? { description: row.personDescription.value } : {}), sitelinkCount: count };
    });
    const hasMore = rows.length > args.limit; const capped = args.offset + args.limit > 1000;
    return { source: 'wikidata-query', upstreamSource: 'Wikidata Query Service main graph', locator: url.href, retrievedAt: result.fetchedAt, cacheControl: result.cacheControl, data: { nameEntityId: qid, kind: args.kind, property: args.kind === 'given_name' ? 'P735' : 'P734', language: args.language, query, endpoint: this.query.href, ranking: 'sitelink_count_proxy', results: rows.slice(0, args.limit), hasMore, stopReason: hasMore ? capped ? 'offset_limit' : 'more_available' : 'source_exhausted', nextOffset: hasMore && !capped ? args.offset + args.limit : null } };
  }
  private apiUrl(params: Record<string, string>) { const url = new URL(this.api); url.search = new URLSearchParams({ ...params, format: 'json', formatversion: '2', maxlag: '5' }).toString(); return url; }
}
