/**
 * TTS (Text-to-Speech) Provider Implementation
 *
 * Factory pattern for routing TTS requests to appropriate provider implementations.
 * Follows the same architecture as lib/ai/providers.ts for consistency.
 *
 * Currently Supported Providers:
 * - OpenAI TTS: https://platform.openai.com/docs/guides/text-to-speech
 * - Azure TTS: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech
 * - GLM TTS: https://docs.bigmodel.cn/cn/guide/models/sound-and-video/glm-tts
 * - Qwen TTS: https://bailian.console.aliyun.com/
 * - Browser Native: Web Speech API (client-side only)
 *
 * HOW TO ADD A NEW PROVIDER:
 *
 * 1. Add provider ID to TTSProviderId in lib/audio/types.ts
 *    Example: | 'elevenlabs-tts'
 *
 * 2. Add provider configuration to lib/audio/constants.ts
 *    Example:
 *    'elevenlabs-tts': {
 *      id: 'elevenlabs-tts',
 *      name: 'ElevenLabs',
 *      requiresApiKey: true,
 *      defaultBaseUrl: 'https://api.elevenlabs.io/v1',
 *      icon: '/elevenlabs.svg',
 *      voices: [...],
 *      supportedFormats: ['mp3', 'pcm'],
 *      speedRange: { min: 0.5, max: 2.0, default: 1.0 }
 *    }
 *
 * 3. Implement provider function in this file
 *    Pattern: async function generateXxxTTS(config, text): Promise<TTSGenerationResult>
 *    - Validate config and build API request
 *    - Handle API authentication (apiKey, headers)
 *    - Convert provider-specific parameters (voice, speed, format)
 *    - Return { audio: Uint8Array, format: string }
 *
 *    Example:
 *    async function generateElevenLabsTTS(
 *      config: TTSModelConfig,
 *      text: string
 *    ): Promise<TTSGenerationResult> {
 *      const baseUrl = config.baseUrl || TTS_PROVIDERS['elevenlabs-tts'].defaultBaseUrl;
 *
 *      const response = await fetch(`${baseUrl}/text-to-speech/${config.voice}`, {
 *        method: 'POST',
 *        headers: {
 *          'xi-api-key': config.apiKey!,
 *          'Content-Type': 'application/json',
 *        },
 *        body: JSON.stringify({
 *          text,
 *          model_id: 'eleven_monolingual_v1',
 *          voice_settings: {
 *            stability: 0.5,
 *            similarity_boost: 0.5,
 *          }
 *        }),
 *      });
 *
 *      if (!response.ok) {
 *        throw new Error(`ElevenLabs TTS API error: ${response.statusText}`);
 *      }
 *
 *      const arrayBuffer = await response.arrayBuffer();
 *      return {
 *        audio: new Uint8Array(arrayBuffer),
 *        format: 'mp3',
 *      };
 *    }
 *
 * 4. Add case to generateTTS() switch statement
 *    case 'elevenlabs-tts':
 *      return await generateElevenLabsTTS(config, text);
 *
 * 5. Add i18n translations in lib/i18n.ts
 *    providerElevenLabsTTS: { zh: 'ElevenLabs TTS', en: 'ElevenLabs TTS' }
 *
 * Error Handling Patterns:
 * - Always validate API key if requiresApiKey is true
 * - Throw descriptive errors for API failures
 * - Include response.statusText or error messages from API
 * - For client-only providers (browser-native), throw error directing to client-side usage
 *
 * API Call Patterns:
 * - Direct API: Use fetch with appropriate headers and body format (recommended for better encoding support)
 * - SSML: For Azure-like providers requiring SSML markup
 * - URL-based: For providers returning audio URL (download in second step)
 */

import type { TTSModelConfig } from './types';
import { TTS_PROVIDERS } from './constants';

/**
 * Result of TTS generation
 */
export interface TTSGenerationResult {
  audio: Uint8Array;
  format: string;
}

/**
 * Generate speech using specified TTS provider
 */
export async function generateTTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  const provider = TTS_PROVIDERS[config.providerId];
  if (!provider) {
    throw new Error(`Unknown TTS provider: ${config.providerId}`);
  }

  // Validate API key if required
  if (provider.requiresApiKey && !config.apiKey) {
    throw new Error(`API key required for TTS provider: ${config.providerId}`);
  }

  switch (config.providerId) {
    case 'openai-tts':
      return await generateOpenAITTS(config, text);

    case 'azure-tts':
      return await generateAzureTTS(config, text);

    case 'glm-tts':
      return await generateGLMTTS(config, text);

    case 'qwen-tts':
      return await generateQwenTTS(config, text);

    case 'browser-native-tts':
      throw new Error(
        'Browser Native TTS must be handled client-side using Web Speech API. This provider cannot be used on the server.',
      );

    default:
      throw new Error(`Unsupported TTS provider: ${config.providerId}`);
  }
}

// TTS Text Sanitization Utilities for OpenAI TTS Generation
// Optimized for audio clarity and natural speech patterns

/**
 * Comprehensive text sanitization for TTS generation
 * Addresses common pitfalls that degrade speech quality
 */
export function sanitizeTTSText(input: string): string {
  let text = input;

  // 1. Normalize em-dashes to sentence-ending punctuation with pause
  // Em-dashes in writing often represent dramatic pauses or interruptions
  // For TTS, a period creates a cleaner break
  text = text.replace(/—/g, '. ');

  // 2. Normalize en-dashes and hyphens used as dashes
  text = text.replace(/–/g, ' to ');  // Range indicators like "10–20" → "10 to 20"

  // Handle special chemical notation patterns more explicitly
  // Common formulas that benefit from expansion:
  const chemicalPatterns = [
    { pattern: /H2O/gi, replacement: 'H two O' },
    { pattern: /CO2/gi, replacement: 'C O two' },
    { pattern: /O2/gi, replacement: 'O two' },
    { pattern: /N2/gi, replacement: 'N two' },
    { pattern: /CH4/gi, replacement: 'C H four' },
  ];
  
  for (const { pattern, replacement } of chemicalPatterns) {
    text = text.replace(pattern, replacement);
  }

  // 3. Break up letter-number composites for pronounceability
  // Matches patterns like H2O, CO2, AI2, V10, C++, etc.
  // Insert space between letters/words and numbers
  text = text.replace(/([a-zA-Z])(\d)/g, '$1 $2');   // H2 → H 2
  text = text.replace(/(\d)([a-zA-Z])/g, '$1 $2');   // 2H → 2 H

  // 4. Normalize URLs and email addresses (TTS fails miserably on these)
  const urlPattern = /https?:\/\/[^\s]+/gi;
  text = text.replace(urlPattern, (match) => {
    // Replace with descriptive placeholder or say "dot com" style
    return match.replace(/\./g, ' dot ').replace(/\/\//g, ' slash slash ');
  });

  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  text = text.replace(emailPattern, (match) => {
    return match.replace('@', ' at ').replace(/\./g, ' dot ');
  });

  // 5. Clean up excessive punctuation and whitespace
  text = text.replace(/([!?\.])\s*\1+/g, '$1');           // !!! → !
  text = text.replace(/\s{2,}/g, ' ');                    // Multiple spaces → single space
  text = text.replace(/[^\S\r\n]+/g, ' ');                // Tabs and other whitespace
  text = text.replace(/[\n\r]+/g, '\n');                  // Normalize line breaks

  // 6. Remove emoji characters (TTS may try to read them)
  const emojiRegex = /([\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}])/gu;
  text = text.replace(emojiRegex, '');

  // 7. Remove hashtags and @mentions (social media artifacts)
  text = text.replace(/#[\w#]+/g, '').replace(/\s+/g, ' ');
  text = text.replace(/@[\w_]+/g, '');

  // 8. Handle quotation mark variations (TTS may read them oddly)
  text = text.replace(/[„""]/g, '"');
  text = text.replace(/[«»‹›]/g, '"');

  // 9. Convert numbers to written form if they appear standalone without context
  // This is advanced and depends on your use case - often better handled upstream
  // For example: "3D" → "three D", but this requires context-aware logic
  
  // 10. Remove zero-width characters and other invisible Unicode that confuses TTS
  const invisibleChars = /[\u200B-\u200F\uFEFF\u2060]/g;
  text = text.replace(invisibleChars, '');

  // 11. Strip HTML tags if present
  text = text.replace(/<[^>]+>/g, '');

  // 12. Trim and normalize leading/trailing whitespace
  text = text.trim();

  return text;
}

// Alternative: More aggressive sanitization for noisy input
export function sanitizeTTSTextStrict(input: string): string {
  let text = sanitizeTTSText(input);
  
  // Additional aggressive cleanup
  text = text.replace(/[<>]/g, ' ').replace(/[%@#&]/g, '');
  text = text.replace(/\s+([,.!?:;])/g, '$1');  // Remove space before punctuation
  text = text.replace(/([,.!?:;])(?!\s|$)/g, '$1 ');  // Ensure space after punctuation
  
  return text.trim();
}

// Type definitions for configuration
export interface TTS_SanitizerConfig {
  handleChemicals?: boolean;     // Expand chemical formulas (H2O → H two O)
  handleUrls?: boolean;          // Convert URLs to speakable format
  removeEmojis?: boolean;        // Strip emoji entirely
  aggressiveWhitespace?: boolean;// Extra whitespace normalization
}

// Configurable sanitizer function
export function sanitizeTTSTextConfig(
  input: string, 
  config: TTS_SanitizerConfig = {}
): string {
  const {
    handleChemicals = true,
    handleUrls = true,
    removeEmojis = true,
    aggressiveWhitespace = false
  } = config;
  
  let text = input;

  // Base sanitization (always applied)
  text = text.replace(/—/g, '. ').replace(/–/g, ' to ');
  text = text.replace(/([a-zA-Z])(\d)/g, '$1 $2');
  text = text.replace(/(\d)([a-zA-Z])/g, '$1 $2');

  if (handleChemicals) {
    const chemicals: Record<string, string> = {
      'H2O': 'H two O', 'CO2': 'C O two', 'O2': 'O two',
      'N2': 'N two', 'CH4': 'C H four'
    };
    for (const [formula, pronunciation] of Object.entries(chemicals)) {
      text = text.replace(new RegExp(formula, 'gi'), pronunciation);
    }
  }

  if (handleUrls) {
    text = text.replace(/https?:\/\/[^\s]+/gi, (m) => 
      m.replace(/\./g, ' dot ').replace(/\/\//g, ' slash slash ')
    );
  }

  if (removeEmojis) {
    const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
    text = text.replace(emojiRegex, '');
  }

  // Standard whitespace normalization
  text = text.replace(/([!?\.])\s*\1+/g, '$1')
             .replace(/\s{2,}/g, ' ')
             .trim();

  if (aggressiveWhitespace) {
    text = text.replace(/\s+([,.!?:;])/g, '$1')
               .replace(/([,.!?:;])(?!\s|$)/g, '$1 ');
  }

  return text.trim();
}

/**
 * OpenAI TTS implementation (direct API call with explicit UTF-8 encoding)
 */
async function generateOpenAITTS(config: TTSModelConfig, text: string): Promise<TTSGenerationResult> {
  const baseUrl = config.baseUrl || TTS_PROVIDERS['openai-tts'].defaultBaseUrl;

  // Use configured model, provider default, or fallback to gpt-4o-mini-tts
  const model = config.model || TTS_PROVIDERS['openai-tts'].defaultModel || 'gpt-4o-mini-tts';

  // Sanitize input text
  const sanitizedText = sanitizeTTSText(text);
  // console.log(text);
  // console.log(sanitizedText);

  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      model: model,
      input: sanitizedText,
      voice: config.voice,
      speed: config.speed || 1.0,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`OpenAI TTS API error: ${error.error?.message || response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    audio: new Uint8Array(arrayBuffer),
    format: 'mp3',
  };
}

/**
 * Azure TTS implementation (direct API call with SSML)
 */
async function generateAzureTTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  const baseUrl = config.baseUrl || TTS_PROVIDERS['azure-tts'].defaultBaseUrl;

  // Build SSML
  const rate = config.speed ? `${((config.speed - 1) * 100).toFixed(0)}%` : '0%';
  const ssml = `
    <speak version='1.0' xml:lang='zh-CN'>
      <voice xml:lang='zh-CN' name='${config.voice}'>
        <prosody rate='${rate}'>${escapeXml(text)}</prosody>
      </voice>
    </speak>
  `.trim();

  const response = await fetch(`${baseUrl}/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': config.apiKey!,
      'Content-Type': 'application/ssml+xml; charset=utf-8',
      'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
    },
    body: ssml,
  });

  if (!response.ok) {
    throw new Error(`Azure TTS API error: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    audio: new Uint8Array(arrayBuffer),
    format: 'mp3',
  };
}

/**
 * GLM TTS implementation (GLM API)
 */
async function generateGLMTTS(config: TTSModelConfig, text: string): Promise<TTSGenerationResult> {
  const baseUrl = config.baseUrl || TTS_PROVIDERS['glm-tts'].defaultBaseUrl;

  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      model: 'glm-tts',
      input: text,
      voice: config.voice,
      speed: config.speed || 1.0,
      volume: 1.0,
      response_format: 'wav',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    let errorMessage = `GLM TTS API error: ${errorText}`;
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error?.message) {
        errorMessage = `GLM TTS API error: ${errorJson.error.message} (code: ${errorJson.error.code})`;
      }
    } catch {
      // If not JSON, use the text as is
    }
    throw new Error(errorMessage);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    audio: new Uint8Array(arrayBuffer),
    format: 'wav',
  };
}

/**
 * Qwen TTS implementation (DashScope API - Qwen3 TTS Flash)
 */
async function generateQwenTTS(config: TTSModelConfig, text: string): Promise<TTSGenerationResult> {
  const baseUrl = config.baseUrl || TTS_PROVIDERS['qwen-tts'].defaultBaseUrl;

  // Calculate speed: Qwen3 uses rate parameter from -500 to 500
  // speed 1.0 = rate 0, speed 2.0 = rate 500, speed 0.5 = rate -250
  const rate = Math.round(((config.speed || 1.0) - 1.0) * 500);

  const response = await fetch(`${baseUrl}/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      model: 'qwen3-tts-flash',
      input: {
        text,
        voice: config.voice,
        language_type: 'Chinese', // Default to Chinese, can be made configurable
      },
      parameters: {
        rate, // Speech rate from -500 to 500
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Qwen TTS API error: ${errorText}`);
  }

  const data = await response.json();

  // Check for audio URL in response
  if (!data.output?.audio?.url) {
    throw new Error(`Qwen TTS error: No audio URL in response. Response: ${JSON.stringify(data)}`);
  }

  // Download audio from URL
  const audioUrl = data.output.audio.url;
  const audioResponse = await fetch(audioUrl);

  if (!audioResponse.ok) {
    throw new Error(`Failed to download audio from URL: ${audioResponse.statusText}`);
  }

  const arrayBuffer = await audioResponse.arrayBuffer();

  return {
    audio: new Uint8Array(arrayBuffer),
    format: 'wav', // Qwen3 TTS returns WAV format
  };
}

/**
 * Get current TTS configuration from settings store
 * Note: This function should only be called in browser context
 */
export async function getCurrentTTSConfig(): Promise<TTSModelConfig> {
  if (typeof window === 'undefined') {
    throw new Error('getCurrentTTSConfig() can only be called in browser context');
  }

  // Lazy import to avoid circular dependency
  const { useSettingsStore } = await import('@/lib/store/settings');
  const { ttsProviderId, ttsVoice, ttsSpeed, ttsProvidersConfig } = useSettingsStore.getState();

  const providerConfig = ttsProvidersConfig?.[ttsProviderId];

  return {
    providerId: ttsProviderId,
    apiKey: providerConfig?.apiKey,
    baseUrl: providerConfig?.baseUrl,
    voice: ttsVoice,
    speed: ttsSpeed,
    model: providerConfig?.model,
  };
}

// Re-export from constants for convenience
export { getAllTTSProviders, getTTSProvider, getTTSVoices } from './constants';

/**
 * Escape XML special characters for SSML
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
