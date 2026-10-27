export { WikidataClient, buildBearerQuery } from './client.js';
export { toDocumentInput, toBearerFinding, bestRank, canonicalJson } from './evidence.js';
export { createWikidataMcpServer } from './mcp.js';
export type { WikidataMcpOptions } from './mcp.js';
export { SourceError } from './transport.js';
export type { ErrorCode } from './transport.js';
export type { SourceRecord, ClientOptions } from './types.js';
export { EntitySchema, StatementSchema } from './schemas.js';
export type { Entity, Statement, SearchOptions, EntityOptions, BearerOptions, SearchData, BearerPage, BearerCandidate } from './schemas.js';
