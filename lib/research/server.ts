/**
 * Research Module - Server-Only Components
 *
 * ⚠️ SERVER-ONLY: This file contains code that MUST NOT be imported
 * by client components. It uses Node.js APIs like child_process,
 * fs, etc. that are not available in the browser.
 *
 * Use 'import "server-only"' to enforce this at build time.
 */

import 'server-only';
import { createLogger } from '@/lib/logger';
import type { LCConfig, LCInvokeOptions, LCInvokeResult } from './types';
import { DEFAULT_LC_CONFIG_TEMPLATE } from './types';

const log = createLogger('LCInvoker');

/**
 * Check if lc command is available in the system PATH
 * SERVER-ONLY: Requires child_process access
 */
export async function isLCAvailable(): Promise<boolean> {
  try {
    // Dynamically import child_process to ensure it's only loaded server-side
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    await execAsync('which lc');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get lc version if available
 * SERVER-ONLY: Requires child_process access
 */
export async function getLCVersion(): Promise<string | undefined> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const { stdout } = await execAsync('lc --version');
    return stdout.trim();
  } catch {
    return undefined;
  }
}

/**
 * Get installation instructions for lc based on the platform
 * Pure function but kept here since it's only needed server-side
 */
export function getLCInstallInstructions(): string {
  const platform = process.platform;

  const instructions: Record<string, string> = {
    linux: `Install lc via pip:
  pip install git+https://github.com/markqvist/lc`,
    
    darwin: `Install lc via pip:
  pip install git+https://github.com/markqvist/lc`,

    win32: `Install lc via pip:
  pip install git+https://github.com/markqvist/lc`,

    unknown: `Install lc via pip:
  pip install git+https://github.com/markqvist/lc`,
  };

  return instructions[platform] || instructions.unknown;
}

/**
 * LC Invoker class for managing lc workflow execution
 * SERVER-ONLY: Spawns child processes
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
      const query = (options.input.query as string) || 'the topic';
      return `# Research Synthesis: ${query}

## Key Findings

This is a placeholder research synthesis. When the research pipeline is properly configured and integrated, this will contain:

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
*Note: This is placeholder content.*`;
    }

    return JSON.stringify({
      workflow: options.workflow,
      status: 'completed',
      placeholder: true,
      message: 'Research integration pending - this is mock output',
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
 * Singleton instance for common use cases
 * SERVER-ONLY
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
