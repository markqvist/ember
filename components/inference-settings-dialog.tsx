'use client';

import { useState, useMemo, useCallback } from 'react';
import { Brain, X, RotateCcw, Sparkles, Users, Bot, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useStageStore } from '@/lib/store';
import { useSettingsStore } from '@/lib/store/settings';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import type { ProviderId } from '@/lib/ai/providers';
import type { InferenceModelConfig } from '@/lib/types/stage';
import { CompactModelSelector } from './compact-model-selector';

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
  // Use agents record directly to avoid infinite loop from listAgents() returning new array
  const agentsRecord = useAgentRegistry((s) => s.agents);
  const agents = useMemo(() => Object.values(agentsRecord), [agentsRecord]);

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
  const [showAllAgents, setShowAllAgents] = useState(false);

  // Reset state when dialog opens
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (newOpen) {
        setDefaultRuntimeModel(inferenceConfig?.defaultRuntimeModel);
        setDirectorModel(inferenceConfig?.directorModel);
        setUseDefaultForDirector(!inferenceConfig?.directorModel);
        setAgentModels(inferenceConfig?.agentModels || {});
      }
      onOpenChange(newOpen);
    },
    [inferenceConfig, onOpenChange],
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

    setInferenceConfig({
      ...inferenceConfig,
      generationModel: inferenceConfig?.generationModel || generationModel,
      defaultRuntimeModel: defaultRuntimeModel || undefined,
      directorModel: useDefaultForDirector ? undefined : directorModel || undefined,
      agentModels: Object.keys(filteredAgentModels).length > 0 ? filteredAgentModels : undefined,
    });
    onOpenChange(false);
  };

  const handleReset = () => {
    setDefaultRuntimeModel(undefined);
    setDirectorModel(undefined);
    setUseDefaultForDirector(true);
    setAgentModels({});
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

  const hasChanges =
    defaultRuntimeModel !== inferenceConfig?.defaultRuntimeModel ||
    (useDefaultForDirector
      ? inferenceConfig?.directorModel !== undefined
      : directorModel !== inferenceConfig?.directorModel) ||
    JSON.stringify(agentModels) !== JSON.stringify(inferenceConfig?.agentModels || {});

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            {t('inferenceSettings.title') || 'Inference Configuration'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Default Runtime Model */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <h3 className="font-medium">
                {t('inferenceSettings.defaultRuntimeModel') || 'Default Runtime Model'}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('inferenceSettings.defaultRuntimeModelDesc') ||
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
                {t('inferenceSettings.directorModel') || 'Director Model'}
              </h3>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Switch
                id="use-default-director"
                checked={useDefaultForDirector}
                onCheckedChange={setUseDefaultForDirector}
              />
              <Label htmlFor="use-default-director" className="text-sm cursor-pointer">
                {t('inferenceSettings.useDefaultRuntime') || 'Use default runtime model'}
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

          {/* Per-Agent Models */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <h3 className="font-medium">
                {t('inferenceSettings.perAgentModels') || 'Per-Agent Model Overrides'}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('inferenceSettings.perAgentModelsDesc') ||
                'Override the default model for specific agents. Useful for running teacher on heavy model and students on lighter models.'}
            </p>

            <div className="space-y-2">
              {displayedAgents.map((agent) => {
                const agentModel = agentModels[agent.id];
                const isOverridden = !!agentModel;

                return (
                  <div
                    key={agent.id}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border',
                      isOverridden ? 'border-primary/50 bg-primary/5' : 'border-border',
                    )}
                  >
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
                    {isOverridden && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleClearAgentModel(agent.id)}
                        className="h-8 w-8 p-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
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
                  ? t('inferenceSettings.showLess') || 'Show less'
                  : `${t('inferenceSettings.showMore') || 'Show more'} (${relevantAgents.length - 3})`}
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
            {t('inferenceSettings.reset') || 'Reset to defaults'}
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
