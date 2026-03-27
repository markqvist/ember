/**
 * Research API
 *
 * POST /api/research
 * Performs comprehensive agentic research using lc (Humanity's Last Command).
 * Replaces the legacy Tavily-based web search with deep research workflows.
 */

import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { LCInvoker } from '@/lib/research/server';
import { formatResearchAsContext } from '@/lib/research';
import { DEFAULT_LC_CONFIG_TEMPLATE } from '@/lib/research/types';

const log = createLogger('Research');

export interface ResearchRequest {
  query: string;
  maxDepth?: number;
  maxSources?: number;
  focusAreas?: string[];
}

export interface ResearchResponse {
  synthesis: string;
  sources: Array<{
    title: string;
    url: string;
    excerpt?: string;
    type?: 'webpage' | 'paper' | 'documentation' | 'other';
  }>;
  context: string;
  query: string;
  durationMs: number;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { query, maxDepth, maxSources, focusAreas } = body as ResearchRequest;

    if (!query || !query.trim()) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'query is required');
    }

    log.info(`[Research] Starting research for query: ${query.slice(0, 100)}...`);

    // Initialize lc invoker with default config
    // In the future, this will be configurable via settings
    const invoker = new LCInvoker({
      configTemplate: DEFAULT_LC_CONFIG_TEMPLATE,
    });

    // Validate lc availability
    const validation = await invoker.validate();
    if (!validation.valid) {
      log.warn('[Research] lc not available:', validation.error);
      return apiError(
        'SERVICE_UNAVAILABLE',
        503,
        'Research service is not configured. Please install and configure lc (Humanity\'s Last Command).',
        validation.error,
      );
    }

    // Invoke lc research workflow
    const result = await invoker.invoke({
      workflow: 'research',
      input: {
        query: query.trim(),
        maxDepth: maxDepth ?? 3,
        maxSources: maxSources ?? 10,
        focusAreas: focusAreas ?? [],
      },
      timeoutMs: 300000, // 5 minutes
    });

    if (!result.success) {
      log.error('[Research] Workflow failed:', result.error);
      return apiError(
        'RESEARCH_FAILED',
        500,
        result.error || 'Research workflow failed',
      );
    }

    // Parse the research output
    // For now, the placeholder returns a markdown synthesis
    const synthesis = result.output;

    // Extract sources from the synthesis (placeholder implementation)
    // In the full implementation, lc will return structured source data
    const sources: ResearchResponse['sources'] = [
      {
        title: 'Research Placeholder',
        url: 'https://github.com/markqvist/lc',
        excerpt: 'This is placeholder output. Install lc to enable real research.',
        type: 'documentation',
      },
    ];

    // Format as context for LLM prompts
    const context = formatResearchAsContext(synthesis);

    log.info(`[Research] Completed in ${result.durationMs}ms`);

    return apiSuccess({
      synthesis,
      sources,
      context,
      query: query.trim(),
      durationMs: result.durationMs,
    });
  } catch (err) {
    log.error('[Research] Error:', err);
    const message = err instanceof Error ? err.message : 'Research failed';
    return apiError('INTERNAL_ERROR', 500, message);
  }
}
