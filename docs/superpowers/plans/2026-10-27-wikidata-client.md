# Wikidata Client Implementation Plan

> Execute inline with superpowers:executing-plans and test-first steps; one fresh final reviewer.

**Goal:** Supply structured, revision-aware Wikidata evidence and bearer candidates for name research.
**Architecture:** Native serialized HTTP -> validated source records -> deterministic evidence adapters and bounded read-only MCP/CLI.
**Tech Stack:** Node24, TypeScript, Zod4.6.7, MCP2.4.0, Vitest5.
**Spec:** ../specs/2026-10-27-wikidata-client-design.md

## Global Constraints

- No credentials, model, database drivers or automatic claim promotion.
- Preserve original identifiers/claim ranks/qualifiers/references and source lineage.
- API8MiB, evidence1MiB, MCP64KiB; bounded pagination and serial provider access.

## Review Focus

- Missing entities, redirects, malformed claims and API empty array-maps are distinguished.
- WDQS is not a revisioned evidence source; current entity must establish bearer relationship.
- Preferred/deprecated ranks, novalue/somevalue snaks and qualifiers cannot be flattened away.
- Query parameters and QIDs cannot inject arbitrary SPARQL or select arbitrary URLs.
- MCP metadata and JSON escaping cannot bypass result limits or mix cached observations.

### Task1: Transport and source client
**Files:** src/types.ts,transport.ts,schemas.ts,client.ts,tests/transport.test.ts,client.test.ts.
- [x] Write failing tests for typed preserved entity/search envelopes and bearer templates/pagination.
- [x] Watch RED, implement fixed API/WDQS methods, run tests/typecheck; commit.

### Task2: Evidence and storage
**Files:** src/evidence.ts,tests/evidence.test.ts,scripts/store-integration.mjs.
- [x] RED tests for source revision/CC0, canonical JSON/fence, best-rank bearer proof and unknown/deprecated refusal.
- [x] Implement structural adapters, run tests and real HTTP/SQLite compatibility; commit.

### Task3: MCP/CLI and release branch
**Files:** src/mcp.ts,mcp-stdio.ts,cli.ts,index.ts, tests/mcp.test.ts,cli.test.ts; README, scripts/smoke.mjs, .github/workflows/ci.yml.
- [x] RED paging/LRU/size/stdio/CLI tests.
- [x] Implement bounded surfaces, Linux/Windows setup and CI.
- [x] Verify clean Git packaging/live pilot, fresh review, one regression-tested Important fix pass; publish feature PR and check CI.
