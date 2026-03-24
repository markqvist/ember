'use client';

import { useState, useMemo } from 'react';
import { Check, ChevronDown, Box } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { ProviderId } from '@/lib/ai/providers';
import type { ProvidersConfig } from '@/lib/types/settings';

interface CompactModelSelectorProps {
  providerId: ProviderId | null;
  modelId: string | null;
  onModelChange: (providerId: ProviderId, modelId: string) => void;
  providersConfig: ProvidersConfig;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function CompactModelSelector({
  providerId,
  modelId,
  onModelChange,
  providersConfig,
  placeholder = 'Select model...',
  className,
  disabled = false,
}: CompactModelSelectorProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  // Get all configured providers
  const configuredProviders = useMemo(() => {
    return Object.entries(providersConfig)
      .filter(
        ([, config]) =>
          (!config.requiresApiKey || config.apiKey || config.isServerConfigured) &&
          config.models.length >= 1 &&
          (config.baseUrl || config.defaultBaseUrl || config.serverBaseUrl),
      )
      .map(([id, config]) => ({
        id: id as ProviderId,
        name: config.name,
        icon: config.icon,
        type: config.type,
        models: config.models,
      }));
  }, [providersConfig]);

  // Get current selection display
  const currentSelection = useMemo(() => {
    if (!providerId || !modelId) return null;
    const provider = configuredProviders.find((p) => p.id === providerId);
    const model = provider?.models.find((m) => m.id === modelId);
    if (!provider || !model) return null;
    return { provider, model };
  }, [providerId, modelId, configuredProviders]);

  // Get translated provider name
  const getProviderDisplayName = (pid: ProviderId, name: string) => {
    const translationKey = `settings.providerNames.${pid}`;
    const translated = t(translationKey);
    return translated !== translationKey ? translated : name;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !currentSelection && 'text-muted-foreground',
            className,
          )}
        >
          {currentSelection ? (
            <div className="flex items-center gap-2 truncate">
              {currentSelection.provider.icon ? (
                <img
                  src={currentSelection.provider.icon}
                  alt=""
                  className="w-4 h-4 shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <Box className="w-4 h-4 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">
                {getProviderDisplayName(currentSelection.provider.id, currentSelection.provider.name)}
                {' / '}
                {currentSelection.model.name}
              </span>
            </div>
          ) : (
            <span>{placeholder}</span>
          )}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput placeholder={t('settings.searchModels')} />
          <CommandEmpty>{t('settings.noModelsFound')}</CommandEmpty>
          <CommandList className="max-h-[300px]">
            {configuredProviders.map((provider) => (
              <CommandGroup
                key={provider.id}
                heading={
                  <div className="flex items-center gap-2">
                    {provider.icon ? (
                      <img
                        src={provider.icon}
                        alt=""
                        className="w-4 h-4 shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Box className="w-4 h-4 shrink-0 text-muted-foreground" />
                    )}
                    <span>
                      {getProviderDisplayName(provider.id, provider.name)}
                    </span>
                  </div>
                }
              >
                {provider.models.map((model) => {
                  const isSelected = providerId === provider.id && modelId === model.id;
                  return (
                    <CommandItem
                      key={`${provider.id}:${model.id}`}
                      value={`${provider.id}:${model.id}:${model.name}`}
                      onSelect={() => {
                        onModelChange(provider.id, model.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          isSelected ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{model.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {model.contextWindow && (
                            <span className="mr-2">
                              {Math.round(model.contextWindow / 1000)}K ctx
                            </span>
                          )}
                          {model.capabilities?.vision && (
                            <span className="mr-1" title="Vision">👁</span>
                          )}
                          {model.capabilities?.tools && (
                            <span className="mr-1" title="Tools">🔧</span>
                          )}
                        </div>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
