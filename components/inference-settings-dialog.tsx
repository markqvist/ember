'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Brain, X, RotateCcw, Sparkles, Users, Bot, Check, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useStageStore } from '@/lib/store';
import { useSettingsStore } from '@/lib/store/settings';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import type { ProviderId } from '@/lib/ai/providers';
import type { InferenceModelConfig } from '@/lib/types/stage';
import { CompactModelSelector } from './compact-model-selector';
import { TTS_PROVIDERS, getTTSVoices } from '@/lib/audio/constants';
import type { TTSProviderId } from '@/lib/audio/types';

interface InferenceSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Helper to convert global settings to InferenceModelConfig
function getGlobalModelConfig(): InferenceModelConfig {
  const { providerId, modelId, providersConfig } = useSettingsStore.getState();
  const providerConfig = providersConfig[providerId];
  return {
    providerId,
    modelId,
    providerType: providerConfig?.type,
    requiresApiKey: providerConfig?.requiresApiKey,
  };
}

// Helper to get full model config with credentials
function getFullModelConfig(config: InferenceModelConfig | null | undefined) {
  if (!config) return null;
  const { providersConfig } = useSettingsStore.getState();
  const providerConfig = providersConfig[config.providerId];
  if (!providerConfig) return null;
  return {
    ...config,
    apiKey: providerConfig.apiKey || '',
    baseUrl: providerConfig.baseUrl || providerConfig.defaultBaseUrl || '',
  };
}

export function InferenceSettingsDialog({
  open,
  onOpenChange,
}: InferenceSettingsDialogProps) {
  const { t } = useI18n();
  const stage = useStageStore((s) => s.stage);
  const inferenceConfig = useStageStore((s) => s.inferenceConfig);
  const setInferenceConfig = useStageStore((s) => s.setInferenceConfig);
  const providersConfig = useSettingsStore((s) => s.providersConfig);
  const selectedAgentIds = useSettingsStore((s) => s.selectedAgentIds);
  // Use agents record directly to avoid infinite loop from listAgents() returning new array
  // Use agents record directly to avoid infinite loop from listAgents() returning new array
  const agentsRecord = useAgentRegistry((s) => s.agents);
  // Get a stable string representation for triggering sync
  const agentsVoiceHash = useMemo(() => {
    return Object.values(agentsRecord)
      .map((a) => `${a.id}:${a.voiceId || ''}`)
      .sort()
      .join('|');
  }, [agentsRecord]);
  const stageId = stage?.id;

  // Filter to relevant agents only:
  // - Selected agents (whether default or custom)
  // - Generated agents bound to this specific classroom/stage
  const relevantAgentIds = useMemo(() => {
    const ids = new Set<string>();

    for (const [id, agent] of Object.entries(agentsRecord)) {
      // Include generated agents bound to this stage (classroom-specific generated agents)
      if (agent.isGenerated && agent.boundStageId === stageId) {
        ids.add(id);
        continue;
      }
      // Include agents that are currently selected for this classroom
      if (selectedAgentIds.includes(id)) {
        ids.add(id);
      }
    }

    return ids;
  }, [agentsRecord, stageId, selectedAgentIds]);

  const agents = useMemo(
    () => Object.values(agentsRecord).filter((a) => relevantAgentIds.has(a.id)),
    [agentsRecord, relevantAgentIds],
  );

  // TTS configuration for voice selection
  const ttsProviderId = useSettingsStore((s) => s.ttsProviderId);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const ttsFetchedVoices = useSettingsStore((s) => s.ttsFetchedVoices[ttsProviderId]);
  const ttsProvidersConfig = useSettingsStore((s) => s.ttsProvidersConfig);
  const setTTSFetchedVoices = useSettingsStore((s) => s.setTTSFetchedVoices);
  const ttsProvider = TTS_PROVIDERS[ttsProviderId];
  
  // Use fetched voices if available, otherwise fall back to static voices
  const staticVoices = useMemo(() => {
    return getTTSVoices(ttsProviderId).map((v) => ({ id: v.id, name: v.name }));
  }, [ttsProviderId]);
  
  const availableVoices = useMemo(() => {
    // Prefer fetched voices over static ones
    if (ttsFetchedVoices && ttsFetchedVoices.length > 0) {
      return ttsFetchedVoices.map((v) => ({ id: v.id, name: v.name }));
    }
    return staticVoices;
  }, [ttsFetchedVoices, staticVoices]);
  
  // Fetch voices if provider supports it and none are cached
  useEffect(() => {
    if (ttsProvider.supportsVoiceFetching && !ttsFetchedVoices?.length && open) {
      const fetchVoices = async () => {
        const baseUrl = ttsProvidersConfig[ttsProviderId]?.baseUrl || ttsProvider.defaultBaseUrl;
        if (!baseUrl) return;
        
        try {
          const response = await fetch('/api/voices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiKey: ttsProvidersConfig[ttsProviderId]?.apiKey,
              baseUrl,
              model: ttsProvidersConfig[ttsProviderId]?.model || ttsProvider.defaultModel,
            }),
          });
          
          if (!response.ok) throw new Error('Failed to fetch voices');
          
          const data = await response.json();
          const voices = data.voices || [];
          setTTSFetchedVoices(ttsProviderId, voices);
        } catch (error) {
          console.error('Failed to fetch voices:', error);
          // Fall back to static voices (already in availableVoices)
        }
      };
      
      fetchVoices();
    }
  }, [ttsProviderId, ttsProvider, ttsProvidersConfig, ttsFetchedVoices, open, setTTSFetchedVoices]);

  // Local state for editing
  const [defaultRuntimeModel, setDefaultRuntimeModel] = useState<
    InferenceModelConfig | null | undefined
  >(inferenceConfig?.defaultRuntimeModel);
  const [directorModel, setDirectorModel] = useState<
    InferenceModelConfig | null | undefined
  >(inferenceConfig?.directorModel);
  const [useDefaultForDirector, setUseDefaultForDirector] = useState(
    !inferenceConfig?.directorModel,
  );
  const [agentModels, setAgentModels] = useState<
    Record<string, InferenceModelConfig | null>
  >(inferenceConfig?.agentModels || {});
  const [agentVoices, setAgentVoices] = useState<Record<string, string | null>>({});
  const [showAllAgents, setShowAllAgents] = useState(false);

  // Sync agentVoices with agentsRecord when dialog is open and agent voices change
  useEffect(() => {
    if (open) {
      const voices: Record<string, string | null> = {};
      for (const agent of Object.values(agentsRecord)) {
        if (agent.voiceId) {
          voices[agent.id] = agent.voiceId;
        }
      }
      setAgentVoices(voices);
    }
    // Use agentsVoiceHash to detect actual voice changes without causing infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agentsVoiceHash]);

  // Reset state when dialog opens
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (newOpen) {
        setDefaultRuntimeModel(inferenceConfig?.defaultRuntimeModel);
        setDirectorModel(inferenceConfig?.directorModel);
        setUseDefaultForDirector(!inferenceConfig?.directorModel);
        setAgentModels(inferenceConfig?.agentModels || {});
        // Reset voice state from agent registry
        const voices: Record<string, string | null> = {};
        for (const agent of Object.values(agentsRecord)) {
          if (agent.voiceId) {
            voices[agent.id] = agent.voiceId;
          }
        }
        setAgentVoices(voices);
      }
      onOpenChange(newOpen);
    },
    [inferenceConfig, onOpenChange, agentsRecord],
  );

  // Get generation model for fallback display
  const generationModel = inferenceConfig?.generationModel;
  const globalModel = useMemo(() => getGlobalModelConfig(), []);

  // Fallback chain: explicit default -> generation model -> global settings
  const effectiveDefaultModel = defaultRuntimeModel || generationModel || globalModel;

  // Filter agents - show generated and default agents
  const relevantAgents = useMemo(() => {
    return agents.filter((a) => a.isDefault || a.isGenerated);
  }, [agents]);

  // Show first 3 agents by default, or all if expanded
  const displayedAgents = showAllAgents
    ? relevantAgents
    : relevantAgents.slice(0, 3);

  const handleSave = () => {
    // Filter out null values from agentModels
    const filteredAgentModels: Record<string, InferenceModelConfig> = {};
    for (const [key, value] of Object.entries(agentModels)) {
      if (value !== null) {
        filteredAgentModels[key] = value;
      }
    }

    // Save inference config
    setInferenceConfig({
      ...inferenceConfig,
      generationModel: inferenceConfig?.generationModel || generationModel,
      defaultRuntimeModel: defaultRuntimeModel || undefined,
      directorModel: useDefaultForDirector ? undefined : directorModel || undefined,
      agentModels: Object.keys(filteredAgentModels).length > 0 ? filteredAgentModels : undefined,
    });

    // Save agent voices to registry
    const registry = useAgentRegistry.getState();
    for (const [agentId, voiceId] of Object.entries(agentVoices)) {
      if (voiceId) {
        registry.updateAgent(agentId, { voiceId });
      } else {
        // Clear voiceId if null
        const agent = registry.getAgent(agentId);
        if (agent?.voiceId) {
          registry.updateAgent(agentId, { voiceId: undefined });
        }
      }
    }

    onOpenChange(false);
  };

  const handleReset = () => {
    setDefaultRuntimeModel(undefined);
    setDirectorModel(undefined);
    setUseDefaultForDirector(true);
    setAgentModels({});
    setAgentVoices({});
  };

  const handleAgentModelChange = (agentId: string, providerId: ProviderId, modelId: string) => {
    const providerConfig = providersConfig[providerId];
    setAgentModels((prev) => ({
      ...prev,
      [agentId]: {
        providerId,
        modelId,
        providerType: providerConfig?.type,
        requiresApiKey: providerConfig?.requiresApiKey,
      },
    }));
  };

  const handleClearAgentModel = (agentId: string) => {
    setAgentModels((prev) => {
      const next = { ...prev };
      delete next[agentId];
      return next;
    });
  };

  const handleAgentVoiceChange = (agentId: string, voiceId: string) => {
    setAgentVoices((prev) => ({
      ...prev,
      [agentId]: voiceId,
    }));
  };

  const handleClearAgentVoice = (agentId: string) => {
    setAgentVoices((prev) => {
      const next = { ...prev };
      delete next[agentId];
      return next;
    });
  };

  // Build current agent voices from registry for comparison
  const currentAgentVoices = useMemo(() => {
    const voices: Record<string, string> = {};
    for (const agent of Object.values(agentsRecord)) {
      if (agent.voiceId) {
        voices[agent.id] = agent.voiceId;
      }
    }
    return voices;
  }, [agentsRecord]);

  const hasChanges =
    defaultRuntimeModel !== inferenceConfig?.defaultRuntimeModel ||
    (useDefaultForDirector
      ? inferenceConfig?.directorModel !== undefined
      : directorModel !== inferenceConfig?.directorModel) ||
    JSON.stringify(agentModels) !== JSON.stringify(inferenceConfig?.agentModels || {}) ||
    JSON.stringify(agentVoices) !== JSON.stringify(currentAgentVoices);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            {t('settings.inferenceSettings.title') || 'Inference Configuration'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Default Runtime Model */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <h3 className="font-medium">
                {t('settings.inferenceSettings.defaultRuntimeModel') || 'Default Runtime Model'}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('settings.inferenceSettings.defaultRuntimeModelDesc') ||
                'Model used for agent inference. Falls back to generation model, then global settings.'}
            </p>
            <CompactModelSelector
              providerId={defaultRuntimeModel?.providerId || null}
              modelId={defaultRuntimeModel?.modelId || null}
              onModelChange={(pid, mid) => {
                const providerConfig = providersConfig[pid];
                setDefaultRuntimeModel({
                  providerId: pid,
                  modelId: mid,
                  providerType: providerConfig?.type,
                  requiresApiKey: providerConfig?.requiresApiKey,
                });
              }}
              providersConfig={providersConfig}
              placeholder={
                effectiveDefaultModel
                  ? `${effectiveDefaultModel.providerId}:${effectiveDefaultModel.modelId} (inherited)`
                  : 'Select model...'
              }
            />
            {!defaultRuntimeModel && effectiveDefaultModel && (
              <p className="text-xs text-muted-foreground">
                Using: {effectiveDefaultModel.providerId}:{effectiveDefaultModel.modelId}
                {!inferenceConfig?.defaultRuntimeModel && generationModel && ' (generation model)'}
                {!inferenceConfig?.defaultRuntimeModel && !generationModel && ' (global settings)'}
              </p>
            )}
          </div>

          {/* Director Model */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              <h3 className="font-medium">
                {t('settings.inferenceSettings.directorModel') || 'Director Model'}
              </h3>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Switch
                id="use-default-director"
                checked={useDefaultForDirector}
                onCheckedChange={setUseDefaultForDirector}
              />
              <Label htmlFor="use-default-director" className="text-sm cursor-pointer">
                {t('settings.inferenceSettings.useDefaultRuntime') || 'Use default runtime model'}
              </Label>
            </div>
            {!useDefaultForDirector && (
              <CompactModelSelector
                providerId={directorModel?.providerId || null}
                modelId={directorModel?.modelId || null}
                onModelChange={(pid, mid) => {
                  const providerConfig = providersConfig[pid];
                  setDirectorModel({
                    providerId: pid,
                    modelId: mid,
                    providerType: providerConfig?.type,
                    requiresApiKey: providerConfig?.requiresApiKey,
                  });
                }}
                providersConfig={providersConfig}
                placeholder="Select director model..."
              />
            )}
          </div>

          {/* Per-Agent Models & Voices */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <h3 className="font-medium">
                {t('settings.inferenceSettings.perAgentModels') || 'Per-Agent Configuration'}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('settings.inferenceSettings.perAgentModelsDesc') ||
                'Override the default model and voice for specific agents. Useful for running teacher on heavy model and students on lighter models, with distinct voices for each.'}
            </p>

            <div className="space-y-2">
              {displayedAgents.map((agent) => {
                const agentModel = agentModels[agent.id];
                const agentVoice = agentVoices[agent.id];
                const isModelOverridden = !!agentModel;
                const isVoiceOverridden = !!agentVoice;

                return (
                  <div
                    key={agent.id}
                    className={cn(
                      'flex flex-col gap-2 p-3 rounded-lg border',
                      isModelOverridden || isVoiceOverridden ? 'border-primary/50 bg-primary/5' : 'border-border',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={agent.avatar}
                        alt=""
                        className="w-8 h-8 rounded-full"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/avatars/teacher.png';
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{agent.name}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {agent.role}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(isModelOverridden || isVoiceOverridden) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              handleClearAgentModel(agent.id);
                              handleClearAgentVoice(agent.id);
                            }}
                            className="h-8 w-8 p-0"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {/* Model Selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-12 shrink-0">Model:</span>
                      <div className="flex-1 min-w-0">
                        <CompactModelSelector
                          providerId={agentModel?.providerId || null}
                          modelId={agentModel?.modelId || null}
                          onModelChange={(pid, mid) => handleAgentModelChange(agent.id, pid, mid)}
                          providersConfig={providersConfig}
                          placeholder="Use default"
                          className="h-8"
                        />
                      </div>
                    </div>
                    
                    {/* Voice Selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-12 shrink-0">Voice:</span>
                      <div className="flex-1 min-w-0">
                        <Select
                          value={agentVoice || ''}
                          onValueChange={(value) => handleAgentVoiceChange(agent.id, value)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder={`Default (${ttsProvider.name})`} />
                          </SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {availableVoices.map((voice) => (
                              <SelectItem key={voice.id} value={voice.id} className="text-sm">
                                {voice.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {relevantAgents.length > 3 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllAgents(!showAllAgents)}
                className="w-full"
              >
                {showAllAgents
                  ? t('settings.inferenceSettings.showLess') || 'Show less'
                  : `${t('settings.inferenceSettings.showMore') || 'Show more'} (${relevantAgents.length - 3})`}
              </Button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-muted-foreground"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            {t('settings.inferenceSettings.reset') || 'Reset to defaults'}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel') || 'Cancel'}
            </Button>
            <Button onClick={handleSave} disabled={!hasChanges}>
              <Check className="w-4 h-4 mr-2" />
              {t('common.save') || 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
