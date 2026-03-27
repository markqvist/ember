/**
 * Research Module - Shared Components
 *
 * This file contains only types, constants, and pure functions
 * that can be safely imported by both client and server code.
 *
 * NOTE: Do NOT import from './server' in this file to avoid
 * accidentally bundling server-only code to the client.
 */

import type { ResearchResult } from './types';

/**
 * Format research results into markdown context for LLM prompts
 * Pure function - safe to use anywhere
 */
export function formatResearchAsContext(researchOutput: string): string {
  if (!researchOutput || researchOutput.trim().length === 0) {
    return '';
  }

  return `## Research Context

${researchOutput}

---
`;
}

/**
 * Extract sources from research result
 * Pure function - safe to use anywhere
 */
export function extractResearchSources(result: ResearchResult): Array<{
  title: string;
  url: string;
  excerpt?: string;
}> {
  return result.sources.map((source) => ({
    title: source.title,
    url: source.url,
    excerpt: source.excerpt,
  }));
}
