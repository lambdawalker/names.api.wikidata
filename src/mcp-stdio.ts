#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createWikidataMcpServer } from './mcp.js';
try {
  const userAgent = process.env.WIKIDATA_USER_AGENT; if (!userAgent?.trim()) throw Error('configuration');
  await createWikidataMcpServer({ clientOptions: { userAgent } }).connect(new StdioServerTransport());
} catch { console.error('Wikidata MCP startup failed; set an informative WIKIDATA_USER_AGENT.'); process.exitCode = 1; }
