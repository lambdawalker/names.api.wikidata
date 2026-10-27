# names.api.wikidata

TypeScript client for Wikidata name research: candidate item search, revision-aware entities, human bearer discovery, Markdown evidence and bounded read-only MCP. Public reads require an informative User-Agent, with no API key, LLM or database dependency.

## Setup on Linux and Windows

Install Node.js24+ and Git. On Linux, the existing [nvm setup instructions](https://github.com/lambdawalker/names.api.wiktionary/blob/main/docs/linux-setup.md) apply. Then:

```sh
git clone https://github.com/lambdawalker/names.api.wikidata.git
cd names.api.wikidata
# Until this implementation PR is merged:
git checkout feat/wikidata-client
npm ci
npm run build
```

Set a contact User-Agent in the terminal running the client. Linux/Bash:

```bash
export WIKIDATA_USER_AGENT='NamesResearch/0.1 (https://github.com/lambdawalker/ds.names.orchestrator)'
```

Windows/PowerShell:

```powershell
$env:WIKIDATA_USER_AGENT = 'NamesResearch/0.1 (https://github.com/lambdawalker/ds.names.orchestrator)'
```

Use your own application's name/contact URL when running your project. The CLI does not load `.env` automatically. No credential wizard is needed.

```sh
npm run research -- search John --language en --limit 5
npm run research -- entity Q4925477 --languages en,es
npm run research -- entity Q4925477 --markdown --output John.md
npm run research -- entity Q4925477 --document --output John.document.json
npm run research -- bearers Q4925477 --kind given_name --limit 5
```

Search returns ambiguous items, including given-name/surname items and unrelated titles. Inspect the entity's claims before choosing an identity. `Q4925477` is the inspected John given-name item; `Q5281981` is a distinct John surname item. These examples are discovery starting points, not a permanent catalog of all name senses. Output files are created exclusively and never overwritten. `--document` emits a `store_document` input; it does not send it. This package has not been published to npm; its prepare build supports installation from a reviewed Git commit.

## Library API

```ts
import { WikidataClient, toDocumentInput, toBearerFinding } from '@lambdawalker/names-api-wikidata';

const client = new WikidataClient({
  userAgent: 'MyNameResearch/1 (https://example.org/contact)',
});
const candidates = await client.searchNames('John', { language: 'en', limit: 5 });
const name = await client.getEntity('Q4925477', { languages: ['en', 'es'] });
const page = await client.getBearers(name.data.id, { kind: 'given_name', language: 'en', limit: 5 });

// Inspect a current person entity before turning a discovery row into a finding.
if (page.data.results[0]) {
  const person = await client.getEntity(page.data.results[0].id);
  const documentInput = toDocumentInput(person);
  // Submit documentInput to POST /v1/operations/store_document in your store.
  const finding = toBearerFinding(person, {
    nameEntityId: name.data.id,
    kind: 'given_name',
    formIds: ['YOUR_EXISTING_FORM_ID'],
    // documentId: the document_id returned by store_document, when retained.
  });
  // Submit finding to record_finding. The supplied form IDs must already exist.
}
```

`SourceRecord<T>` carries provider, upstream lineage, URL, retrieval time, optional revision/cache headers and data. `getEntity` preserves raw statement GUIDs, ranks, all snak values, qualifiers, references, multilingual values, sitelinks and future unknown fields. Legacy lowercase statement subject prefixes are retained. API empty array-maps normalize to empty objects; malformed arrays fail. Missing items, redirected/mismatched item identities and malformed responses fail explicitly.

Search language selects the search/display language. Entity `languages` filters labels/descriptions/aliases; it does not change a name's usage language or the language represented by a claim. Missing labels stay missing. Current entity reads use `wbgetentities`; historical revision reads are not implemented. Entity locators point to the returned revision. Claims are data reported by Wikidata, not independently established historical truths.

## Bearers and prominence

`getBearers` uses fixed queries against the main Wikidata Query Service (WDQS), matching direct human classification `P31=Q5` and either given-name `P735` or family-name `P734`. It does not accept arbitrary SPARQL. Given names include middle names, so a person's familiar display name need not begin with the queried name.

Rows rank by descending **sitelink count**, then entity URI. That count spans Wikimedia site links and is a prominence/discovery proxy, not an objective fame score or a population/birth statistic. WDQS truthy properties select preferred statements, or normal statements when no preferred statements exist; deprecated statements are excluded. Its index can lag the entity API, and results are incomplete.

Pagination is bounded: limit1–20 and offset0–1000. `nextOffset`, `hasMore` and `stopReason` distinguish more results, source exhaustion and the offset safety cap. Search uses the API's `nextContinue` cursor. Pages are not frozen snapshots; edits between requests can change order, duplicate or skip rows. A query result has a timestamp/query/endpoint but **no entity revision**. Do not reuse it as revisioned proof.

`toBearerFinding` rechecks current best-rank human and matching name statements, requires an actual label in `labelLanguage` (default `en`), and retains the selected statements' qualifiers/references in supporting JSON. Caller-supplied form-to-QID mapping remains a candidate assertion. Findings use `status: candidate`; no derived-from/borrowing edges are inferred.

## Markdown storage and licensing

`toDocumentInput` returns deterministic Markdown containing the complete fetched entity selection as canonical JSON, safely fenced, with its revision and CC0 source metadata. It is capped at1MiB. Source IDs include retrieval time/revision/content, so retries should reuse the original payload. The store deduplicates identical Markdown bodies across observations.

Wikidata structured data is CC0. Linked reference text, Wikipedia prose and media are not downloaded or relicensed. URLs/filenames in claims remain structured metadata. Code is MIT. A citation proves traceability to a Wikidata statement, not semantic correctness or independent corroboration.

To check storage compatibility against a built checkout:

```bash
STORE_CHECKOUT=/absolute/path/to/names.research.store npm run store:integration
```

PowerShell:

```powershell
$env:STORE_CHECKOUT = 'C:\path\to\names.research.store'
npm run store:integration
```

The check starts a temporary authenticated HTTP/SQLite store, stores synthetic Markdown and a candidate bearer, verifies idempotency/body deduplication and restart recovery, then cleans up. It requires no running service, Neo4j or external API credentials. No database schema change is needed. Orchestrator enrichment integration is a subsequent milestone; its root workflow is unchanged here.

## MCP

Set `WIKIDATA_USER_AGENT`, then start `npm run mcp`, or configure an MCP client to launch the built entry directly:

```json
{
  "mcpServers": {
    "wikidata": {
      "command": "node",
      "args": ["/absolute/path/to/names.api.wikidata/dist/mcp-stdio.js"],
      "env": { "WIKIDATA_USER_AGENT": "MyNameResearch/1 (https://example.org/contact)" }
    }
  }
}
```

On Windows use an absolute path with JSON-escaped backslashes, e.g. `C:\\projects\\names.api.wikidata\\dist\\mcp-stdio.js`. MCP configuration envelopes vary by host; the command/args/env values are the server launch settings. Stdout is reserved for MCP protocol messages.

| Tool | Inputs / output |
|---|---|
| `search_names` | Query/language/limit/continue; compact candidate identities and labels. |
| `get_entity` | ID/languages/offset/limit; revision-aware canonical JSON text chunks. |
| `get_bearers` | Name entity ID/kind/language/limit/offset; bearer discovery page. |

All three tools are read-only. Entity chunks use UTF-16 offsets, default4000/max8000 units. For offset>0 pass the first chunk's numeric `revision`; a refreshed/mismatched revision fails instead of mixing pages. Cache is LRU8 entities with fixed5-minute TTL, scoped by item and language set; there is no persistent source cache inside this library. Complete serialized MCP results, including metadata and escaping, are capped64KiB. Oversized fields cause a safe size error rather than changing identities. Source content is untrusted evidence, never instructions.

Wikidata also provides a general [hosted MCP](https://www.wikidata.org/wiki/Wikidata:MCP). This package's interface is scoped to names, provenance and bounded outputs; the hosted service is an alternative for general exploration.

## Transport and verification

Requests are serial per client instance with a default1-second interval. Share an instance across concurrent callers. An attempt defaults to15 seconds including body reads; decoded JSON is capped8MiB. `fetch`, `now`, `timeoutMs`, `intervalMs`, `retries` and `maxResponseBytes` are injectable. Public methods accept `signal`. `apiUrl`/`queryUrl` are fixed constructor settings (HTTPS, or loopback HTTP for tests/mirrors), not model-selected endpoints. Redirects are disabled.

Two retries cover429/502/503/504 and MediaWiki maxlag/ratelimited. Retry-After seconds/date is honored; waits over60 seconds are returned via `SourceError.retryAfterMs` rather than sleeping indefinitely. Other HTTP/network/schema errors do not become empty results. No raw response-body logging or hidden unlimited pagination. WDQS requests ask for a10-second service timeout in addition to the local request timeout.

```sh
npm test
npm run typecheck
npm pack --dry-run
# Optional live search/entity/bearer pilot:
npm run smoke
```

CI covers offline tests on Linux and Windows plus real HTTP/SQLite storage compatibility. The optional live pilot requires network access and provider availability. If using an environment proxy with Node24, enable `NODE_USE_ENV_PROXY=1` as appropriate for your network. A 429/timeout is a failed lookup, not proof that a name has no bearers.

Provider references: [data access/licensing](https://www.wikidata.org/wiki/Wikidata:Data_access), [Wikibase API](https://www.mediawiki.org/wiki/Wikibase/API), [given name P735](https://www.wikidata.org/wiki/Property:P735), [family name P734](https://www.wikidata.org/wiki/Property:P734), [WDQS graph split](https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service/WDQS_graph_split). See the [design](docs/superpowers/specs/2026-10-27-wikidata-client-design.md) and [plan](docs/superpowers/plans/2026-10-27-wikidata-client.md).
