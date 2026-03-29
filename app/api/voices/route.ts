import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { apiError, apiSuccess } from '@/lib/server/api-response';

const log = createLogger('Voices API');

export const maxDuration = 30;

/**
 * Generic TTS Voice List API
 * Fetches available voices from OpenAI-compatible /v1/voices or /v1/audio/voices endpoint
 * Supports llama-swap proxy which requires ?model= parameter
 */
export async function POST(req: NextRequest) {
  try {
    const { apiKey, baseUrl, model } = await req.json();

    if (!baseUrl) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Base URL is required');
    }

    // Validate baseUrl against SSRF
    const ssrfError = validateUrlForSSRF(baseUrl);
    if (ssrfError) {
      return apiError('INVALID_URL', 403, ssrfError);
    }

    // Construct voices endpoint URL
    // llama-swap uses /v1/audio/voices?model=<model_id>
    // Standard OpenAI uses /v1/voices
    const baseUrlWithoutTrailingSlash = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
    
    // Try llama-swap format first (/v1/audio/voices?model=xxx)
    // If no model provided, fall back to standard OpenAI format (/v1/voices)
    let voicesUrl: string;
    if (model) {
      voicesUrl = `${baseUrlWithoutTrailingSlash}/audio/voices?model=${encodeURIComponent(model)}`;
    } else {
      voicesUrl = `${baseUrlWithoutTrailingSlash}/voices`;
    }

    log.info(`Fetching voices from: ${voicesUrl}`);

    // Call voices endpoint
    const response = await fetch(voicesUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey || ''}`,
        'Content-Type': 'application/json',
      },
      redirect: 'manual',
    });

    if (response.status >= 300 && response.status < 400) {
      return apiError('REDIRECT_NOT_ALLOWED', 403, 'Redirects are not allowed');
    }

    if (!response.ok) {
      const errorText = await response.text();
      return apiError(
        'UPSTREAM_ERROR',
        response.status,
        'Failed to fetch voices from TTS provider',
        errorText || response.statusText,
      );
    }

    const data = await response.json();
    
    // Transform to Ember format - handle multiple response formats:
    // 1. OpenAI format: { voices: [{ voice_id: "...", name: "..." }] }
    // 2. Simple array format: ["voice1", "voice2", "voice3"]
    let voices = [];
    
    if (Array.isArray(data)) {
      // Simple array format: ["voice1", "voice2", ...]
      voices = data.map((v: any) => ({
        id: typeof v === 'string' ? v : (v.voice_id || v.id || String(v)),
        name: typeof v === 'string' ? v : (v.name || v.voice_id || v.id || String(v)),
        language: typeof v === 'object' ? (v.language || 'unknown') : 'unknown',
        gender: typeof v === 'object' ? (v.gender || 'neutral') : 'neutral',
        description: typeof v === 'object' ? (v.description || '') : '',
      }));
    } else if (data.voices && Array.isArray(data.voices)) {
      // OpenAI format: { voices: [...] }
      voices = data.voices.map((v: any) => ({
        id: v.voice_id || v.id,
        name: v.name || v.voice_id || v.id,
        language: v.language || 'unknown',
        gender: v.gender || 'neutral',
        description: v.description || '',
      }));
    }

    return apiSuccess({ voices });
  } catch (error) {
    log.error('API error:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to fetch voices',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
