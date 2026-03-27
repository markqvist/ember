/**
 * Research Module Type Definitions
 *
 * Replaces the legacy web-search types with a unified research interface
 * that supports lc-based agentic research workflows.
 */

// ==================== LC Invoker Types ====================

/**
 * LC Invoker configuration
 */
export interface LCConfig {
  /** Path to lc binary (optional, defaults to 'lc' in PATH) */
  binaryPath?: string;
  /** Base configuration template */
  configTemplate: string;
  /** Environment variables to inject */
  env?: Record<string, string>;
}

/**
 * LC Invocation options
 */
export interface LCInvokeOptions {
  /** The workflow/task to execute */
  workflow: 'research' | 'analyze' | 'generate';
  /** Input data for the workflow */
  input: Record<string, unknown>;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Working directory for lc execution */
  workingDir?: string;
}

/**
 * LC Invocation result
 */
export interface LCInvokeResult {
  /** Whether the invocation succeeded */
  success: boolean;
  /** The workflow output */
  output: string;
  /** Any error message */
  error?: string;
  /** Exit code */
  exitCode?: number;
  /** Execution time in ms */
  durationMs: number;
}

// ==================== Research Types ====================

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
export const DEFAULT_LC_CONFIG_TEMPLATE = `[models]
  default = primary

  [[primary]]
    backend = openai
    base_url = http://localhost:1234/v1
    model = local-model
    api_key =
    sysprompt = system.jinja
    vision = yes
    temperature = 0.7
    max_tokens = 32768
    context_limit = 200000
    context_shift_factor = 0.35

[toolkits]
  builtin = filesystem

[resolvers]
  builtin = environment, filesystem, system

[skills]
  pinned =
  directories =

[loading]
  user_skills = no
  user_tools = no
  user_quirks = no

  project_skills = yes
  project_tools = yes

[session]
  global_history = no
  persistence = yes
  lock_timeout = 10800

[display]
  show_reasoning = no
  stream_output = yes
  render_markdown = yes

[stdin]
  max_text_bytes = 16384
  max_binary_bytes = 512

[logging]
  level = 4
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
