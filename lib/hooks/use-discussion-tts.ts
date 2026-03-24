'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSettingsStore } from '@/lib/store/settings';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import type { AgentConfig } from '@/lib/orchestration/registry/types';

interface TTSQueueItem {
  messageId: string;
  partId: string;
  text: string;
  agentId: string | null;
  voiceId: string;
}

interface UseDiscussionTTSOptions {
  enabled: boolean;
  classroomId?: string;
}

interface UseDiscussionTTSReturn {
  /** Call when a text segment is sealed to queue TTS */
  handleSegmentSealed: (
    messageId: string,
    partId: string,
    fullText: string,
    agentId: string | null,
  ) => void;
  /** Returns true if TTS is still playing or queued */
  shouldHold: () => boolean;
  /** Stop all TTS and clear queue */
  cleanup: () => void;
}

/**
 * Hook for discussion TTS - queues and plays audio for discussion turns.
 * 
 * Voice resolution order:
 * 1. Agent's voiceId if configured
 * 2. Classroom's defaultTTSVoice from generation
 * 3. Global TTS voice from settings
 */
export function useDiscussionTTS({
  enabled,
  classroomId,
}: UseDiscussionTTSOptions): UseDiscussionTTSReturn {
  const ttsProviderId = useSettingsStore((s) => s.ttsProviderId);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const ttsSpeed = useSettingsStore((s) => s.ttsSpeed);
  const ttsMuted = useSettingsStore((s) => s.ttsMuted);
  const ttsProvidersConfig = useSettingsStore((s) => s.ttsProvidersConfig);
  const playbackSpeed = useSettingsStore((s) => s.playbackSpeed);

  const queueRef = useRef<TTSQueueItem[]>([]);
  const isPlayingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const processQueueRef = useRef<() => Promise<void>>(async () => {});

  /**
   * Resolve the voice ID for an agent.
   * Priority: agent voiceId > classroom default > global setting
   */
  const resolveVoiceForAgent = useCallback(
    (agentId: string | null): string => {
      // 1. Check agent-specific voice
      if (agentId) {
        const agent = useAgentRegistry.getState().getAgent(agentId);
        if (agent?.voiceId) {
          return agent.voiceId;
        }
      }

      // 2. Fall back to global voice (which was set from classroom default during generation)
      return ttsVoice;
    },
    [ttsVoice]
  );

  /**
   * Generate TTS audio via API
   */
  const generateTTS = useCallback(
    async (text: string, voiceId: string): Promise<string | null> => {
      // Skip browser-native TTS - handle separately
      if (ttsProviderId === 'browser-native-tts') {
        return null;
      }

      const providerConfig = ttsProvidersConfig[ttsProviderId];
      if (!providerConfig) return null;

      try {
        const response = await fetch('/api/generate/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            audioId: `discussion-${Date.now()}`,
            ttsProviderId,
            ttsVoice: voiceId,
            ttsSpeed,
            ttsApiKey: providerConfig.apiKey,
            ttsBaseUrl: providerConfig.serverBaseUrl || providerConfig.baseUrl,
          }),
        });

        if (!response.ok) throw new Error(`TTS API error: ${response.status}`);

        const data = await response.json();
        if (!data.base64) throw new Error('No audio in response');

        return `data:audio/${data.format || 'mp3'};base64,${data.base64}`;
      } catch (error) {
        console.error('[DiscussionTTS] TTS generation failed:', error);
        return null;
      }
    },
    [ttsProviderId, ttsProvidersConfig, ttsSpeed]
  );

  /**
   * Play audio from URL
   */
  const playAudio = useCallback(
    async (audioUrl: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const audio = new Audio(audioUrl);
        audio.playbackRate = playbackSpeed;
        audioRef.current = audio;

        audio.addEventListener('ended', () => {
          isPlayingRef.current = false;
          audioRef.current = null;
          resolve();
        });

        audio.addEventListener('error', (e) => {
          isPlayingRef.current = false;
          audioRef.current = null;
          reject(new Error('Audio playback failed'));
        });

        audio.play().catch((err) => {
          isPlayingRef.current = false;
          audioRef.current = null;
          reject(err);
        });
      });
    },
    [playbackSpeed]
  );

  /**
   * Process the TTS queue
   */
  const processQueue = useCallback(async () => {
    if (isPlayingRef.current || queueRef.current.length === 0) return;
    if (!enabled || ttsMuted) {
      queueRef.current = [];
      return;
    }

    isPlayingRef.current = true;
    const item = queueRef.current.shift()!;

    // Browser-native TTS
    if (ttsProviderId === 'browser-native-tts') {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(item.text);
        utterance.rate = ttsSpeed;
        utterance.volume = 1;

        // Try to find the voice
        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find((v) => v.voiceURI === item.voiceId || v.name === item.voiceId);
        if (voice) {
          utterance.voice = voice;
        }

        utterance.onend = () => {
          isPlayingRef.current = false;
          processQueueRef.current();
        };

        utterance.onerror = () => {
          isPlayingRef.current = false;
          processQueueRef.current();
        };

        window.speechSynthesis.speak(utterance);
      } else {
        isPlayingRef.current = false;
        processQueueRef.current();
      }
      return;
    }

    // Server TTS
    try {
      const audioUrl = await generateTTS(item.text, item.voiceId);
      if (audioUrl) {
        await playAudio(audioUrl);
      }
    } catch (error) {
      console.error('[DiscussionTTS] Playback failed:', error);
    } finally {
      isPlayingRef.current = false;
      processQueueRef.current();
    }
  }, [enabled, ttsMuted, ttsProviderId, ttsSpeed, generateTTS, playAudio]);

  processQueueRef.current = processQueue;

  /**
   * Handle a sealed text segment - queue it for TTS
   */
  const handleSegmentSealed = useCallback(
    (messageId: string, partId: string, fullText: string, agentId: string | null) => {
      if (!enabled || ttsMuted || !fullText.trim()) return;

      const voiceId = resolveVoiceForAgent(agentId);
      queueRef.current.push({
        messageId,
        partId,
        text: fullText,
        agentId,
        voiceId,
      });

      if (!isPlayingRef.current) {
        processQueueRef.current();
      }
    },
    [enabled, ttsMuted, resolveVoiceForAgent]
  );

  /**
   * Check if we should hold the buffer for TTS
   */
  const shouldHold = useCallback(() => {
    return isPlayingRef.current || queueRef.current.length > 0;
  }, []);

  /**
   * Cleanup - stop all audio and clear queue
   */
  const cleanup = useCallback(() => {
    // Stop any in-flight fetch
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    // Stop audio playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }

    // Stop browser TTS
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // Clear queue
    queueRef.current = [];
    isPlayingRef.current = false;
  }, []);

  // Sync playbackSpeed to currently playing audio in real-time
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  return {
    handleSegmentSealed,
    shouldHold,
    cleanup,
  };
}
