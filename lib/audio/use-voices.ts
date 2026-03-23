'use client';

import { useState, useCallback } from 'react';
import type { TTSVoiceInfo } from './types';

interface UseVoicesOptions {
  providerId: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

interface UseVoicesResult {
  voices: TTSVoiceInfo[];
  isLoading: boolean;
  error: string | null;
  fetchVoices: () => Promise<void>;
}

/**
 * Hook for fetching TTS voices from OpenAI-compatible /v1/voices endpoint
 */
export function useVoices({ providerId, apiKey, baseUrl, model }: UseVoicesOptions): UseVoicesResult {
  const [voices, setVoices] = useState<TTSVoiceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVoices = useCallback(async () => {
    if (!baseUrl) {
      setError('Base URL required to fetch voices');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/voices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, baseUrl, model }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch voices');
      }

      setVoices(data.voices || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setVoices([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, baseUrl, model]);

  return { voices, isLoading, error, fetchVoices };
}
