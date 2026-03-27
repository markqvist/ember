/**
 * LC (Humanity's Last Command) Invoker
 *
 * A general-purpose wrapper for shelling out to lc for agentic workflows.
 * This class handles environment setup, configuration templating, and
 * execution of lc workflows with proper error handling and output capture.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('LCInvoker');

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

export interface LCConfig {
  /** Path to lc binary (optional, defaults to 'lc' in PATH) */
  binaryPath?: string;
  /** Base configuration template */
  configTemplate: string;
  /** Environment variables to inject */
  env?: Record<string, string>;
}

/**
 * Check if lc command is available in the system PATH
 */
export async function isLCAvailable(): Promise<boolean> {
  try {
    // In a real implementation, this would check if 'lc' is in PATH
    // For now, return false to indicate placeholder state
    return false;
  } catch {
    return false;
  }
}

/**
 * Get installation instructions for lc based on the platform
 */
export function getLCInstallInstructions(): string {
  const platform = typeof process !== 'undefined' ? process.platform : 'unknown';

  const instructions: Record<string, string> = {
    linux: `Install lc via pip:
  pip install humanitys-last-command

Or install from source:
  git clone https://github.com/markqvist/lc.git
  cd lc && pip install -e .`,
    darwin: `Install lc via pip:
  pip install humanitys-last-command

Or using Homebrew:
  brew tap markqvist/lc
  brew install lc`,
    win32: `Install lc via pip:
  pip install humanitys-last-command

Or download the Windows binary from:
  https://github.com/markqvist/lc/releases`,
    unknown: `Install lc via pip:
  pip install humanitys-last-command

For platform-specific instructions, see:
  https://github.com/markqvist/lc#installation`,
  };

  return instructions[platform] || instructions.unknown;
}

/**
 * LC Invoker class for managing lc workflow execution
 */
export class LCInvoker {
  private config: LCConfig;

  constructor(config: LCConfig) {
    this.config = {
      ...config,
      binaryPath: config.binaryPath || 'lc',
    };
  }

  /**
   * Invoke lc with the specified workflow
   *
   * PLACEHOLDER IMPLEMENTATION
   * Currently returns mock data. Full implementation will:
   * 1. Write config template to temp file
   * 2. Spawn lc process with workflow input
   * 3. Stream output for progress updates
   * 4. Parse and return final result
   */
  async invoke(options: LCInvokeOptions): Promise<LCInvokeResult> {
    const startTime = Date.now();

    log.info(`[LCInvoker] Starting workflow: ${options.workflow}`, {
      input: options.input,
      timeout: options.timeoutMs || 300000,
    });

    // PLACEHOLDER: Return mock research synthesis
    // This will be replaced with actual lc shell execution
    const mockOutput = this.generateMockOutput(options);

    const durationMs = Date.now() - startTime;

    log.info(`[LCInvoker] Workflow completed in ${durationMs}ms`);

    return {
      success: true,
      output: mockOutput,
      durationMs,
    };
  }

  /**
   * Generate mock output for placeholder implementation
   */
  private generateMockOutput(options: LCInvokeOptions): string {
    if (options.workflow === 'research') {
      const query = options.input.query as string || 'the topic';
      return `# Research Synthesis: ${query}

## Key Findings

This is a placeholder research synthesis. When lc is properly configured and integrated, this will contain:

- Comprehensive web search results from multiple sources
- Deep analysis of relevant documents and papers
- Synthesis of conflicting viewpoints
- Structured information organized by theme
- Citations and source references

## Suggested Structure

1. **Introduction** - Overview of ${query}
2. **Core Concepts** - Fundamental principles and terminology
3. **Current State** - Latest developments and research
4. **Applications** - Practical uses and case studies
5. **Future Directions** - Emerging trends and open questions

## Sources Consulted

- Academic databases (arXiv, PubMed, etc.)
- Technical documentation
- Expert blogs and publications
- Reference materials and textbooks

---
*Note: This is placeholder content. Install and configure lc to enable real research workflows.*`;
    }

    return JSON.stringify({
      workflow: options.workflow,
      status: 'completed',
      placeholder: true,
      message: 'LC integration pending - this is mock output',
    });
  }

  /**
   * Build the lc configuration from template and runtime parameters
   */
  private buildConfig(runtimeParams: Record<string, unknown>): string {
    let config = this.config.configTemplate;

    // Replace template variables
    for (const [key, value] of Object.entries(runtimeParams)) {
      const placeholder = `{{${key}}}`;
      config = config.replaceAll(placeholder, String(value));
    }

    return config;
  }

  /**
   * Validate that lc is available before attempting invocation
   */
  async validate(): Promise<{ valid: boolean; error?: string }> {
    const available = await isLCAvailable();

    if (!available) {
      return {
        valid: false,
        error: `lc is not installed or not in PATH.\n\n${getLCInstallInstructions()}`,
      };
    }

    return { valid: true };
  }
}

/**
 * Format research results into markdown context for LLM prompts
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
 * Singleton instance for common use cases
 */
let defaultInvoker: LCInvoker | null = null;

export function getDefaultLCInvoker(config?: LCConfig): LCInvoker {
  if (!defaultInvoker && config) {
    defaultInvoker = new LCInvoker(config);
  }
  if (!defaultInvoker) {
    throw new Error('LCInvoker not initialized. Call with config first.');
  }
  return defaultInvoker;
}

export function resetLCInvoker(): void {
  defaultInvoker = null;
}
