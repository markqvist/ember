/**
 * Research Module
 *
 * Replaces the legacy web-search functionality with lc-based agentic research.
 * Provides comprehensive topic exploration through search, reading, and synthesis.
 */

export {
  LCInvoker,
  isLCAvailable,
  getLCInstallInstructions,
  formatResearchAsContext,
  getDefaultLCInvoker,
  resetLCInvoker,
} from './lc-invoker';

export type {
  LCInvokeOptions,
  LCInvokeResult,
  LCConfig,
} from './lc-invoker';

export type {
  ResearchSettings,
  ResearchResult,
  ResearchSource,
  ResearchOptions,
  ResearchStepStatus,
  ResearchProgress,
} from './types';

export { DEFAULT_LC_CONFIG_TEMPLATE } from './types';
