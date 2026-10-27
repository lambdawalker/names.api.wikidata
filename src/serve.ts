#!/usr/bin/env node
import { createWikidataMcpServer } from './mcp.js';
import {startConfiguredService} from './local-service.js';
try {await startConfiguredService('wikidata',(config,token)=>createWikidataMcpServer({clientOptions:{userAgent:config.userAgent}}));}catch{console.error('Service startup failed; check configuration, control token and port.');process.exitCode=1;}
