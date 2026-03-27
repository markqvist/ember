/**
 * Research Module Type Definitions
 *
 * Replaces the legacy web-search types with a unified research interface
 * that supports lc-based agentic research workflows.
 */

/**
 * Research configuration stored in settings
 */
export interface ResearchSettings {
  /** Whether research is enabled for generation */
  enabled: boolean;
  /** lc configuration template (YAML/JSON) */
  lcConfigTemplate: string;
  /** Last validation status */
  lcAvailable?: boolean;
  /** Last validation check timestamp */
  lastCheckedAt?: number;
}

/**
 * Research result structure
 */
export interface ResearchResult {
  /** The synthesized research output */
  synthesis: string;
  /** Sources consulted during research */
  sources: ResearchSource[];
  /** Query that was researched */
  query: string;
  /** Execution time in milliseconds */
  durationMs: number;
  /** Whether the research succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Individual research source
 */
export interface ResearchSource {
  /** Source title */
  title: string;
  /** Source URL */
  url: string;
  /** Brief excerpt or description */
  excerpt?: string;
  /** Source type */
  type?: 'webpage' | 'paper' | 'documentation' | 'other';
}

/**
 * Research workflow options
 */
export interface ResearchOptions {
  /** The query/topic to research */
  query: string;
  /** Maximum depth of research (iterations) */
  maxDepth?: number;
  /** Maximum sources to consult */
  maxSources?: number;
  /** Focus areas for the research */
  focusAreas?: string[];
  /** Language for research output */
  language?: string;
}

/**
 * Default lc configuration template
 */
export const DEFAULT_LC_CONFIG_TEMPLATE = `# LC Configuration Template for Ember Research Workflows
# This template is used to configure lc sessions for research tasks

# Model configuration for research agent
model:
  provider: openai
  model: gpt-4o
  temperature: 0.7

# Search configuration
search:
  engines:
    - brave
    - google
  max_results: 10
  safe_search: true

# Web scraping configuration
scrape:
  timeout: 30000
  max_content_length: 50000
  extract_images: false

# Research workflow settings
research:
  max_iterations: 3
  synthesis_depth: comprehensive
  include_citations: true

# Output formatting
output:
  format: markdown
  include_metadata: true
`;

/**
 * Research step status for progress tracking
 */
export type ResearchStepStatus =
  | 'idle'
  | 'searching'
  | 'reading'
  | 'analyzing'
  | 'synthesizing'
  | 'complete'
  | 'error';

/**
 * Research progress update
 */
export interface ResearchProgress {
  /** Current step */
  step: ResearchStepStatus;
  /** Progress message */
  message: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current sources found */
  sourcesFound: number;
  /** Sources processed */
  sourcesProcessed: number;
}
