/**
 * Provider registry
 * 
 * NOTE: Ember is a local-first, sovereign learning environment.
 * No commercial cloud providers are pre-configured by default.
 * Users can add their own custom providers via the Settings UI.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import type {
  ProviderId,
  ProviderConfig,
  ModelInfo,
  ModelConfig,
  ThinkingConfig,
} from '@/lib/types/provider';
import { createLogger } from '@/lib/logger';
// NOTE: Do NOT import thinking-context.ts here — it uses node:async_hooks
// which is server-only, and this file is also used on the client via
// settings.ts. The thinking context is read from globalThis instead
// (set by thinking-context.ts at module load time on the server).

// Extend globalThis for timeout logging flag
declare global {
  // eslint-disable-next-line no-var
  var __llmTimeoutLogged: boolean | undefined;
}

const log = createLogger('AIProviders');

// Re-export types for backward compatibility
export type { ProviderId, ProviderConfig, ModelInfo, ModelConfig };

/**
 * Provider registry
 * 
 * NOTE: Intentionally empty - users configure their own providers.
 */
export const PROVIDERS: Record<ProviderId, ProviderConfig> = {};

/**
 * Get provider config (from built-in or unified config in localStorage)
 */
function getProviderConfig(providerId: ProviderId): ProviderConfig | null {
  // Check built-in providers first
  if (PROVIDERS[providerId]) {
    return PROVIDERS[providerId];
  }

  // Check unified providersConfig in localStorage (browser only)
  if (typeof window !== 'undefined') {
    try {
      const storedConfig = localStorage.getItem('providersConfig');
      if (storedConfig) {
        const config = JSON.parse(storedConfig);
        const providerSettings = config[providerId];
        if (providerSettings) {
          return {
            id: providerId,
            name: providerSettings.name,
            type: providerSettings.type,
            defaultBaseUrl: providerSettings.defaultBaseUrl,
            icon: providerSettings.icon,
            requiresApiKey: providerSettings.requiresApiKey,
            models: providerSettings.models,
          };
        }
      }
    } catch (e) {
      log.error('Failed to load provider config:', e);
    }
  }

  return null;
}

/**
 * Model instance with its configuration info
 */
export interface ModelWithInfo {
  model: LanguageModel;
  modelInfo: ModelInfo | null;
}

/**
 * Return vendor-specific body params to inject for OpenAI-compatible providers.
 * Called from the custom fetch wrapper inside getModel().
 */
function getCompatThinkingBodyParams(
  providerId: ProviderId,
  config: ThinkingConfig,
): Record<string, unknown> | undefined {
  if (config.enabled === false) {
    switch (providerId) {
      // Kimi / DeepSeek / GLM use { thinking: { type: "disabled" } }
      case 'kimi':
      case 'deepseek':
      case 'glm':
        return { thinking: { type: 'disabled' } };
      // Qwen / SiliconFlow use { enable_thinking: false }
      case 'qwen':
      case 'siliconflow':
        return { enable_thinking: false };
      default:
        return undefined;
    }
  }
  if (config.enabled === true) {
    switch (providerId) {
      case 'kimi':
      case 'deepseek':
      case 'glm':
        return { thinking: { type: 'enabled' } };
      case 'qwen':
      case 'siliconflow':
        return { enable_thinking: true };
      default:
        return undefined;
    }
  }
  return undefined;
}

/**
 * Get a configured language model instance with its info
 * Accepts individual parameters for flexibility and security
 */
export function getModel(config: ModelConfig): ModelWithInfo {
  // Get provider type and requiresApiKey, with fallback to registry
  let providerType = config.providerType;
  let requiresApiKey = config.requiresApiKey ?? true;

  if (!providerType) {
    const provider = getProviderConfig(config.providerId);
    if (provider) {
      providerType = provider.type;
      requiresApiKey = provider.requiresApiKey;
    } else {
      throw new Error(`Unknown provider: ${config.providerId}. Please provide providerType.`);
    }
  }

  // Validate API key if required
  if (requiresApiKey && !config.apiKey) {
    throw new Error(`API key required for provider: ${config.providerId}`);
  }

  // Use provided API key, or empty string for providers that don't require one
  const effectiveApiKey = config.apiKey || '';

  // Resolve base URL: explicit > provider default > SDK default
  const provider = getProviderConfig(config.providerId);
  const effectiveBaseUrl = config.baseUrl || provider?.defaultBaseUrl || undefined;

  let model: LanguageModel;

  switch (providerType) {
    case 'openai': {
      const openaiOptions: Parameters<typeof createOpenAI>[0] = {
        apiKey: effectiveApiKey,
        baseURL: effectiveBaseUrl,
      };

      // For OpenAI-compatible providers (not native OpenAI), add a fetch
      // wrapper that injects vendor-specific thinking params into the HTTP
      // body. The thinking config is read from AsyncLocalStorage, set by
      // callLLM / streamLLM at call time.
      //
      // Also configure extended timeouts for local/self-hosted inference
      // where large models may take significant time to generate responses.
      const providerId = config.providerId;
      const isLocalInference =
        config.baseUrl?.includes('localhost') ||
        config.baseUrl?.includes('127.0.0.1') ||
        config.baseUrl?.startsWith('http://192.168.') ||
        config.baseUrl?.startsWith('http://10.') ||
        process.env.LLM_EXTENDED_TIMEOUT === 'true';

      // Parse timeout values from environment (in seconds, default to 0 = disabled/no timeout)
      const connectTimeoutSec = parseInt(process.env.LLM_CONNECT_TIMEOUT_SEC || '0', 10);
      const headersTimeoutSec = parseInt(process.env.LLM_HEADERS_TIMEOUT_SEC || '0', 10);
      const bodyTimeoutSec = parseInt(process.env.LLM_BODY_TIMEOUT_SEC || '0', 10);
      const useExtendedTimeouts = isLocalInference || connectTimeoutSec > 0 || headersTimeoutSec > 0 || bodyTimeoutSec > 0;

      if (config.providerId !== 'openai' || useExtendedTimeouts) {
        openaiOptions.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
          // Read thinking config from globalThis (set by thinking-context.ts)
          const thinkingCtx = (globalThis as Record<string, unknown>).__thinkingContext as
            | { getStore?: () => unknown }
            | undefined;
          const thinking = thinkingCtx?.getStore?.() as ThinkingConfig | undefined;
          let modifiedInit = init;
          if (thinking && modifiedInit?.body && typeof modifiedInit.body === 'string') {
            const extra = getCompatThinkingBodyParams(providerId, thinking);
            if (extra) {
              try {
                const body = JSON.parse(modifiedInit.body);
                Object.assign(body, extra);
                modifiedInit = { ...modifiedInit, body: JSON.stringify(body) };
              } catch {
                /* leave body as-is */
              }
            }
          }

          // Use undici with extended timeouts for local inference or when explicitly configured
          if (useExtendedTimeouts) {
            // Dynamic import to avoid bundling issues on client side
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { fetch: undiciFetch, Agent } = require('undici');

            // Build dispatcher options with configured timeouts (0 = disabled/no timeout)
            const dispatcherOptions: Record<string, number> = {};
            if (connectTimeoutSec > 0) dispatcherOptions.connectTimeout = connectTimeoutSec * 1000;
            if (headersTimeoutSec > 0) dispatcherOptions.headersTimeout = headersTimeoutSec * 1000;
            if (bodyTimeoutSec > 0) dispatcherOptions.bodyTimeout = bodyTimeoutSec * 1000;

            // Log timeout configuration once for visibility
            if (!globalThis.__llmTimeoutLogged) {
              log.info(
                `[LLM Timeout] Using extended timeouts for ${providerId}: connect=${connectTimeoutSec}s, headers=${headersTimeoutSec}s, body=${bodyTimeoutSec}s (0=disabled)`
              );
              (globalThis as Record<string, unknown>).__llmTimeoutLogged = true;
            }

            return undiciFetch(url as string, {
              ...(modifiedInit as Record<string, unknown>),
              ...(Object.keys(dispatcherOptions).length > 0
                ? { dispatcher: new Agent(dispatcherOptions) }
                : {}),
            }) as Promise<Response>;
          }

          return globalThis.fetch(url, modifiedInit);
        };
      }

      const openai = createOpenAI(openaiOptions);
      model = openai.chat(config.modelId);
      break;
    }

    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: effectiveApiKey,
        baseURL: effectiveBaseUrl,
      });
      model = anthropic.chat(config.modelId);
      break;
    }

    case 'google': {
      const googleOptions: Parameters<typeof createGoogleGenerativeAI>[0] = {
        apiKey: effectiveApiKey,
        baseURL: effectiveBaseUrl,
      };
      if (config.proxy) {
        // Dynamic require to avoid bundling undici on the client side
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ProxyAgent, fetch: undiciFetch } = require('undici');
        const agent = new ProxyAgent(config.proxy);
        googleOptions.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
          undiciFetch(input as string, {
            ...(init as Record<string, unknown>),
            dispatcher: agent,
          }).then((r: unknown) => r as Response)) as typeof fetch;
      }
      const google = createGoogleGenerativeAI(googleOptions);
      model = google.chat(config.modelId);
      break;
    }

    default:
      throw new Error(`Unsupported provider type: ${providerType}`);
  }

  // Look up model info from the provider registry
  const modelInfo = provider?.models.find((m) => m.id === config.modelId) || null;

  return { model, modelInfo };
}

/**
 * Parse model string in format "providerId:modelId" or just "modelId" (defaults to OpenAI)
 */
export function parseModelString(modelString: string): {
  providerId: ProviderId;
  modelId: string;
} {
  // Split only on the first colon to handle model IDs that contain colons
  const colonIndex = modelString.indexOf(':');

  if (colonIndex > 0) {
    return {
      providerId: modelString.slice(0, colonIndex) as ProviderId,
      modelId: modelString.slice(colonIndex + 1),
    };
  }

  // Default to OpenAI for backward compatibility
  return {
    providerId: 'openai',
    modelId: modelString,
  };
}

/**
 * Get all available models grouped by provider
 */
export function getAllModels(): {
  provider: ProviderConfig;
  models: ModelInfo[];
}[] {
  return Object.values(PROVIDERS).map((provider) => ({
    provider,
    models: provider.models,
  }));
}

/**
 * Get provider by ID
 */
export function getProvider(providerId: ProviderId): ProviderConfig | undefined {
  return PROVIDERS[providerId];
}

/**
 * Get model info
 */
export function getModelInfo(providerId: ProviderId, modelId: string): ModelInfo | undefined {
  const provider = PROVIDERS[providerId];
  return provider?.models.find((m) => m.id === modelId);
}
