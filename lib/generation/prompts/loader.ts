/**
 * Prompt Loader - Loads prompts from markdown files
 *
 * Supports:
 * - Loading prompts from templates/{promptId}/ directory
 * - Snippet inclusion via {{snippet:name}} syntax
 * - Variable interpolation via {{variable}} syntax
 * - Caching for performance
 * - Introspection logging of resolved prompts
 */

import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import type { PromptId, LoadedPrompt, SnippetId } from './types';
import { createLogger } from '@/lib/logger';
const log = createLogger('PromptLoader');

// Cache for loaded prompts and snippets
const promptCache = new Map<string, LoadedPrompt>();
const snippetCache = new Map<string, string>();

/**
 * Directory for introspection logs of resolved prompts
 */
export const INTROSPECTION_DIR = path.join(process.cwd(), 'data', 'introspection', 'prompts');

/**
 * Get the prompts directory path
 */
function getPromptsDir(): string {
  // In Next.js, use process.cwd() for the project root
  return path.join(process.cwd(), 'lib', 'generation', 'prompts');
}

/**
 * Ensure the introspection directory exists
 * Silently fails if directory cannot be created (permissions, etc.)
 */
async function ensureIntrospectionDir(): Promise<void> {
  try {
    await fsPromises.mkdir(INTROSPECTION_DIR, { recursive: true });
  } catch {
    // Silently fail - introspection is best-effort
  }
}

/**
 * Log a resolved prompt to the introspection directory
 * Writes prompts with structured filenames for observability
 */
async function logResolvedPrompt(
  promptId: PromptId,
  promptType: 'system' | 'user',
  content: string,
): Promise<void> {
  try {
    await ensureIntrospectionDir();

    const now = new Date();
    const timestamp = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}_${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}_${String(now.getMinutes()).padStart(2, '0')}`;
    const uniqueId = nanoid(8);
    const filename = `${timestamp}_${promptType}_${promptId}_${uniqueId}.md`;
    const filepath = path.join(INTROSPECTION_DIR, filename);

    const header = `<!--\n  Prompt ID: ${promptId}\n  Type: ${promptType}\n  Generated: ${now.toISOString()}\n-->\n\n`;

    await fsPromises.writeFile(filepath, header + content, 'utf-8');
  } catch (error) {
    // Log warning but don't fail the generation flow
    log.warn('Failed to write introspection log:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Load a snippet by ID
 */
export function loadSnippet(snippetId: SnippetId): string {
  const cached = snippetCache.get(snippetId);
  if (cached) return cached;

  const snippetPath = path.join(getPromptsDir(), 'snippets', `${snippetId}.md`);

  try {
    const content = fs.readFileSync(snippetPath, 'utf-8').trim();
    snippetCache.set(snippetId, content);
    return content;
  } catch {
    log.warn(`Snippet not found: ${snippetId}`);
    return `{{snippet:${snippetId}}}`;
  }
}

/**
 * Process snippet includes in a template
 * Replaces {{snippet:name}} with actual snippet content
 */
function processSnippets(template: string): string {
  return template.replace(/\{\{snippet:(\w[\w-]*)\}\}/g, (_, snippetId) => {
    return loadSnippet(snippetId as SnippetId);
  });
}

/**
 * Load a prompt by ID
 */
export function loadPrompt(promptId: PromptId): LoadedPrompt | null {
  const cached = promptCache.get(promptId);
  if (cached) return cached;

  const promptDir = path.join(getPromptsDir(), 'templates', promptId);

  try {
    // Load system.md
    const systemPath = path.join(promptDir, 'system.md');
    let systemPrompt = fs.readFileSync(systemPath, 'utf-8').trim();
    systemPrompt = processSnippets(systemPrompt);

    // Load user.md (optional, may not exist)
    const userPath = path.join(promptDir, 'user.md');
    let userPromptTemplate = '';
    try {
      userPromptTemplate = fs.readFileSync(userPath, 'utf-8').trim();
      userPromptTemplate = processSnippets(userPromptTemplate);
    } catch {
      // user.md is optional
    }

    const loaded: LoadedPrompt = {
      id: promptId,
      systemPrompt,
      userPromptTemplate,
    };

    promptCache.set(promptId, loaded);
    return loaded;
  } catch (error) {
    log.error(`Failed to load prompt ${promptId}:`, error);
    return null;
  }
}

/**
 * Interpolate variables in a template
 * Replaces {{variable}} with values from the variables object
 */
export function interpolateVariables(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    if (value === undefined) return match;
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  });
}

/**
 * Build a complete prompt with variables
 * Also logs resolved prompts to introspection directory for observability
 */
export function buildPrompt(
  promptId: PromptId,
  variables: Record<string, unknown>,
): { system: string; user: string } | null {
  const prompt = loadPrompt(promptId);
  if (!prompt) return null;

  const system = interpolateVariables(prompt.systemPrompt, variables);
  const user = interpolateVariables(prompt.userPromptTemplate, variables);

  // Fire-and-forget introspection logging - don't await, don't block
  void logResolvedPrompt(promptId, 'system', system);
  void logResolvedPrompt(promptId, 'user', user);

  return { system, user };
}

/**
 * Clear all caches (useful for development/testing)
 */
export function clearPromptCache(): void {
  promptCache.clear();
  snippetCache.clear();
}
