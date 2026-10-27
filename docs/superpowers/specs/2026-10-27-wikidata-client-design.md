# Wikidata name client

Implement the user's approved next client: name search, entity retrieval, bearer discovery, storage evidence and bounded MCP. Node24 TypeScript, native fetch, public reads without credentials; no model/vault/database dependency. Do not change the orchestrator's roots-only workflow in this milestone.

## Approaches and implementation decisions

Native Wikibase Action API plus narrow templated WDQS queries provide revision-aware JSON and bearer discovery. wikibase-sdk supplies useful URL/query helpers, but our three fixed requests and preservation of full raw claims need no simplification dependency. Wikidata also offers a general hosted read-only MCP (https://wd-mcp.wmcloud.org/mcp/); this package supplies a names-specific, bounded stdio interface and deterministic storage evidence rather than replacing that general service. No extra HTTP server.

## Contracts

- WikidataClient.searchNames(query,{language='en',limit=10,continue?,signal?}): SourceRecord<SearchData>. Search matches are candidates; no auto-selection or assertion they are names. Preserve unknown search metadata and explicit continuation.
- getEntity(qid,{languages=['en'],signal?}): SourceRecord<Entity>. Action wbgetentities includes info/labels/descriptions/aliases/claims/sitelinks. Preserve statement GUID, rank, snak types, datavalues, qualifiers, references, source revision and language identity. Validate response envelope and item identity; reject redirect/missing/mismatched IDs explicitly rather than inventing same identity. Empty API array-maps normalize to {} only if empty. Future unknown fields retained.
- getBearers(nameEntityId,{kind:'given_name'|'surname',language='en',limit=10,offset=0,signal?}): SourceRecord<BearerPage>. Fixed query P735 or P734, direct P31 Q5, truthy best-rank statements, rank by sitelink count descending then URI. At most20 results/page, offset<=1000, query limit+1 detects next page. Results include QID, available label/description and sitelink count. Sitelinks are a discovery prominence proxy, never fame or population statistics. WDQS is mutable, incomplete and can lag live entities; query result has retrieval time/query/endpoint, no fabricated revision. Re-fetch person entity to validate its current name statement before preparing storage findings.

## Transport

Reuse the prior client's bounded serial request pattern locally without depending on Wiktionary. Required informative User-Agent; 1-second interval, 15-second attempt timeout, decoded JSON8MiB,2 retries only transient429/502/503/504 or maxlag/ratelimited; Retry-After seconds/date, never auto-wait>60seconds. Body reads and queue waits abort. Redirects disabled. Typed errors without raw body logging. Configurable fixed endpoint URLs (HTTPS or loopback HTTP) for testing/self-hosting, never model-selected URLs. Same client serializes API and WDQS operations. Query requests ask for10-second WDQS timeout. Bounds are hard; no implicit unlimited pagination.

## Evidence and storage

toDocumentInput(entityRecord): deterministic Markdown header + canonical fenced full selected entity JSON, cap1MiB. Structured data CC0; no external reference contents, media or Wikipedia prose fetched. Revision URL and retrieved time preserve observation identity; source IDs hash retrieval/revision/content. Markdown body dedup is storage-owned. Raw claims retained in the evidence, not flattened into etymological edges.

toBearerFinding(personRecord,{nameEntityId,kind,formIds,labelLanguage='en'}): require current best-rank direct P31 Q5 and matching best-rank P735/P734 statement. Select only cited GUIDs that match; preserve full originals/qualifiers/references in the supporting JSON. Require an actual requested-language label. Return a structural candidate finding with sources/evidence/notable_bearers; caller supplies existing form IDs, which are validated but not semantically certified. No writes or public network calls inside adapters. Never auto-import WDQS results as supported facts. Store integration verifies source/doc retention, existing form references, admission and restart using the real service.

## Agent/CLI boundary

MCP tools search_names/get_entity/get_bearers are read-only. Entity tool returns metadata and paged canonical JSON text (default4000/max8000UTF16 units), not an unbounded entity tree. Per-process LRU8/TTL5min keyed by QID/languages preserves observation across chunks; complete serialized CallToolResult <=64KiB including escaping and metadata. Names/identities remain exact or fail size checks; metadata truncation must be explicit. No arbitrary SPARQL input. CLI supports search/entity/bearers, entity --markdown/--document, informative env User-Agent, exclusive output file creation, Linux/PowerShell examples.

## Acceptance

Offline tests cover actual envelope shapes, revisions, sparse/malformed maps, ranks/novalue/somevalue/qualifiers/references, injection rejection, request limits/retries/cancellation, pagination, attribution and bounded MCP output. Real in-memory MCP and stdio tests. CI Linux/Windows plus pinned storage compatibility. Opt-in live John search/name entity/bearers smoke; transient provider failure is reported honestly. No API key, GPU or LLM required.

References: https://www.wikidata.org/wiki/Wikidata:Data_access ; https://www.mediawiki.org/wiki/Wikibase/API ; https://www.wikidata.org/wiki/Property:P735 ; https://www.wikidata.org/wiki/Property:P734 ; https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service/WDQS_graph_split
