'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { TTS_PROVIDERS, DEFAULT_TTS_VOICES, getTTSVoices } from '@/lib/audio/constants';
import type { TTSProviderId, TTSVoiceInfo } from '@/lib/audio/types';
import { Volume2, Loader2, CheckCircle2, XCircle, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createLogger } from '@/lib/logger';
import { useTTSPreview } from '@/lib/audio/use-tts-preview';

const log = createLogger('TTSSettings');

interface TTSSettingsProps {
  selectedProviderId: TTSProviderId;
}

export function TTSSettings({ selectedProviderId }: TTSSettingsProps) {
  const { t } = useI18n();

  const ttsVoice = useSettingsStore((state) => state.ttsVoice);
  const ttsSpeed = useSettingsStore((state) => state.ttsSpeed);
  const ttsProvidersConfig = useSettingsStore((state) => state.ttsProvidersConfig);
  const setTTSProviderConfig = useSettingsStore((state) => state.setTTSProviderConfig);
  const setTTSVoice = useSettingsStore((state) => state.setTTSVoice);
  const setTTSFetchedVoices = useSettingsStore((state) => state.setTTSFetchedVoices);
  const cachedVoices = useSettingsStore((state) => state.ttsFetchedVoices[selectedProviderId]);
  const activeProviderId = useSettingsStore((state) => state.ttsProviderId);

  // When testing a non-active provider, use that provider's default voice
  // instead of the active provider's voice (which may be incompatible)
  const effectiveVoice =
    selectedProviderId === activeProviderId
      ? ttsVoice
      : DEFAULT_TTS_VOICES[selectedProviderId] || 'default';

  const ttsProvider = TTS_PROVIDERS[selectedProviderId] ?? TTS_PROVIDERS['openai-tts'];
  const isServerConfigured = !!ttsProvidersConfig[selectedProviderId]?.isServerConfigured;

  const [showApiKey, setShowApiKey] = useState(false);
  const [testText, setTestText] = useState(t('settings.ttsTestTextDefault'));
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const { previewing: testingTTS, startPreview, stopPreview } = useTTSPreview();

  // Voice fetching state
  const [fetchedVoices, setFetchedVoices] = useState<TTSVoiceInfo[]>([]);
  const [fetchingVoices, setFetchingVoices] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);

  const fetchVoices = useCallback(async () => {
    if (!ttsProvider.supportsVoiceFetching) return;
    
    const baseUrl = ttsProvidersConfig[selectedProviderId]?.baseUrl || ttsProvider.defaultBaseUrl;
    if (!baseUrl) {
      setVoicesError('Base URL required');
      return;
    }

    setFetchingVoices(true);
    setVoicesError(null);

    try {
      const response = await fetch('/api/voices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: ttsProvidersConfig[selectedProviderId]?.apiKey,
          baseUrl,
          model: ttsProvidersConfig[selectedProviderId]?.model,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch voices');
      }

      const voices = data.voices || [];
      setFetchedVoices(voices);
      // Save to store cache
      setTTSFetchedVoices(selectedProviderId, voices);
    } catch (err) {
      setVoicesError(err instanceof Error ? err.message : 'Unknown error');
      setFetchedVoices([]);
    } finally {
      setFetchingVoices(false);
    }
  }, [selectedProviderId, ttsProvider, ttsProvidersConfig, setTTSFetchedVoices]);

  // Use fetched voices if available, otherwise cached, otherwise fall back to static
  const supportsVoiceFetching = ttsProvider.supportsVoiceFetching;
  const staticVoices = getTTSVoices(selectedProviderId);
  const availableVoices = fetchedVoices.length > 0 
    ? fetchedVoices 
    : (cachedVoices && cachedVoices.length > 0 ? cachedVoices : staticVoices);

  // Auto-fetch voices when provider changes and supports fetching (only once, if no cache)
  useEffect(() => {
    if (supportsVoiceFetching && !hasFetchedRef.current) {
      const hasCache = cachedVoices && cachedVoices.length > 0;
      if (!hasCache) {
        fetchVoices();
      }
      hasFetchedRef.current = true;
    }
  }, [selectedProviderId, supportsVoiceFetching, cachedVoices, fetchVoices]);

  // Reset fetch flag when provider changes
  useEffect(() => {
    hasFetchedRef.current = false;
    setFetchedVoices([]);
  }, [selectedProviderId]);

  // Update test text when language changes
  useEffect(() => {
    setTestText(t('settings.ttsTestTextDefault'));
  }, [t]);

  // Reset state when provider changes
  useEffect(() => {
    stopPreview();
    setShowApiKey(false);
    setTestStatus('idle');
    setTestMessage('');
  }, [selectedProviderId, stopPreview]);

  const handleTestTTS = async () => {
    if (!testText.trim()) return;

    setTestStatus('testing');
    setTestMessage('');

    try {
      await startPreview({
        text: testText,
        providerId: selectedProviderId,
        voice: effectiveVoice,
        speed: ttsSpeed,
        apiKey: ttsProvidersConfig[selectedProviderId]?.apiKey,
        baseUrl: ttsProvidersConfig[selectedProviderId]?.baseUrl,
        model: ttsProvidersConfig[selectedProviderId]?.model,
      });
      setTestStatus('success');
      setTestMessage(t('settings.ttsTestSuccess'));
    } catch (error) {
      log.error('TTS test failed:', error);
      setTestStatus('error');
      setTestMessage(
        error instanceof Error && error.message
          ? `${t('settings.ttsTestFailed')}: ${error.message}`
          : t('settings.ttsTestFailed'),
      );
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Server-configured notice */}
      {isServerConfigured && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
          {t('settings.serverConfiguredNotice')}
        </div>
      )}

      {/* API Key & Base URL */}
      {(ttsProvider.requiresApiKey || isServerConfigured) && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">{t('settings.ttsApiKey')}</Label>
              <div className="relative">
                <Input
                  name={`tts-api-key-${selectedProviderId}`}
                  type={showApiKey ? 'text' : 'password'}
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={
                    isServerConfigured ? t('settings.optionalOverride') : t('settings.enterApiKey')
                  }
                  value={ttsProvidersConfig[selectedProviderId]?.apiKey || ''}
                  onChange={(e) =>
                    setTTSProviderConfig(selectedProviderId, {
                      apiKey: e.target.value,
                    })
                  }
                  className="font-mono text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">{t('settings.ttsBaseUrl')}</Label>
              <Input
                name={`tts-base-url-${selectedProviderId}`}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={ttsProvider.defaultBaseUrl || t('settings.enterCustomBaseUrl')}
                value={ttsProvidersConfig[selectedProviderId]?.baseUrl || ''}
                onChange={(e) =>
                  setTTSProviderConfig(selectedProviderId, {
                    baseUrl: e.target.value,
                  })
                }
                className="text-sm"
              />
            </div>
          </div>
          {/* Request URL Preview */}
          {(() => {
            const effectiveBaseUrl =
              ttsProvidersConfig[selectedProviderId]?.baseUrl || ttsProvider.defaultBaseUrl || '';
            if (!effectiveBaseUrl) return null;
            let endpointPath = '';
            switch (selectedProviderId) {
              case 'openai-tts':
              case 'glm-tts':
                endpointPath = '/audio/speech';
                break;
              case 'azure-tts':
                endpointPath = '/cognitiveservices/v1';
                break;
              case 'qwen-tts':
                endpointPath = '/services/aigc/multimodal-generation/generation';
                break;
            }
            if (!endpointPath) return null;
            return (
              <p className="text-xs text-muted-foreground break-all">
                {t('settings.requestUrl')}: {effectiveBaseUrl + endpointPath}
              </p>
            );
          })()}
        </>
      )}

      {/* Model Configuration (for providers that support custom models) */}
      {ttsProvider.supportsCustomModels && (
        <div className="space-y-2">
          <Label className="text-sm">Model</Label>
          <Input
            placeholder={ttsProvider.defaultModel || 'gpt-4o-mini-tts'}
            value={ttsProvidersConfig[selectedProviderId]?.model || ''}
            onChange={(e) =>
              setTTSProviderConfig(selectedProviderId, {
                model: e.target.value,
              })
            }
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Custom model ID (e.g., gpt-4o-mini-tts, tts-1, tts-1-hd). Leave empty to use provider default.
          </p>
        </div>
      )}

      {/* Voice Selection */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm">{t('settings.ttsVoice')}</Label>
          {supportsVoiceFetching && (
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchVoices}
              disabled={fetchingVoices}
              className="h-7 px-2 text-xs"
            >
              {fetchingVoices ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              {t('settings.fetchVoices')}
            </Button>
          )}
        </div>
        <Select value={effectiveVoice} onValueChange={setTTSVoice}>
          <SelectTrigger className="text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {availableVoices.map((voice) => (
              <SelectItem key={voice.id} value={voice.id} className="text-sm">
                <div className="flex flex-col">
                  <span>{voice.name}</span>
                  {voice.description && (
                    <span className="text-xs text-muted-foreground">
                      {t(`settings.${voice.description}`) || voice.description}
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {voicesError && (
          <p className="text-xs text-destructive">
            {t('settings.fetchVoicesFailed')}: {voicesError}
          </p>
        )}
        {fetchedVoices.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t('settings.voicesFetched')}: {fetchedVoices.length} voices
          </p>
        )}
      </div>

      {/* Test TTS */}
      <div className="space-y-2">
        <Label className="text-sm">{t('settings.testTTS')}</Label>
        <div className="flex gap-2">
          <Input
            placeholder={t('settings.ttsTestTextPlaceholder')}
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            className="flex-1"
          />
          <Button
            onClick={handleTestTTS}
            disabled={
              testingTTS ||
              !testText.trim() ||
              (ttsProvider.requiresApiKey &&
                !ttsProvidersConfig[selectedProviderId]?.apiKey?.trim() &&
                !isServerConfigured)
            }
            size="default"
            className="gap-2 w-32"
          >
            {testingTTS ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
            {t('settings.testTTS')}
          </Button>
        </div>
      </div>

      {testMessage && (
        <div
          className={cn(
            'rounded-lg p-3 text-sm overflow-hidden',
            testStatus === 'success' &&
              'bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800',
            testStatus === 'error' &&
              'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800',
          )}
        >
          <div className="flex items-start gap-2 min-w-0">
            {testStatus === 'success' && <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />}
            {testStatus === 'error' && <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
            <p className="flex-1 min-w-0 break-all">{testMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
