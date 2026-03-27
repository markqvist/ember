/**
 * Research Module
 *
 * Replaces the legacy web-search functionality with lc-based agentic research.
 * Provides comprehensive topic exploration through search, reading, and synthesis.
 *
 * ⚠️ IMPORTANT ARCHITECTURAL NOTE:
 *
 * This module is SPLIT between client and server:
 *
 * 1. SHARED (this file): Types, constants, and pure functions
 *    - Safe to import from client components
 *    - Safe to import from server components
 *    - No Node.js APIs (fs, child_process, etc.)
 *
 * 2. SERVER-ONLY (@/lib/research/server):
 *    - LCInvoker class
 *    - isLCAvailable()
 *    - getLCVersion()
 *    - MUST NOT be imported by client components
 *    - Marked with 'server-only' directive
 *
 * Client components should use API routes to access server functionality:
 *    GET  /api/lc/status    -> Check lc availability
 *    POST /api/research     -> Execute research workflow
 */

// ==================== SHARED EXPORTS ====================
// These are safe to import from anywhere

export {
  formatResearchAsContext,
  extractResearchSources,
} from './shared';

export type {
  LCInvokeOptions,
  LCInvokeResult,
  LCConfig,
} from './types';

export type {
  ResearchSettings,
  ResearchResult,
  ResearchSource,
  ResearchOptions,
  ResearchStepStatus,
  ResearchProgress,
} from './types';

export { DEFAULT_LC_CONFIG_TEMPLATE } from './types';

// ==================== SERVER EXPORTS (Documentation Only) ====================
// DO NOT export server-only functions from this file.
// Import them directly from '@/lib/research/server' in server code only.

// Server-only exports (for documentation):
// - LCInvoker: import from '@/lib/research/server'
// - isLCAvailable: import from '@/lib/research/server'
// - getLCVersion: import from '@/lib/research/server'
// - getLCInstallInstructions: import from '@/lib/research/server'
// - getDefaultLCInvoker: import from '@/lib/research/server'
// - resetLCInvoker: import from '@/lib/research/server'
