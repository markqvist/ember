'use client';

import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { DEFAULT_LC_CONFIG_TEMPLATE } from '@/lib/research/types';
import { Terminal, CheckCircle2, XCircle, AlertCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LCStatusResponse {
  available: boolean;
  version?: string;
  checkedAt: string;
}

interface LCInstallInstructionsResponse {
  instructions: string;
  platform: string;
}

export function LCSettings() {
  const { t } = useI18n();
  const lcConfigTemplate = useSettingsStore((state) => state.lcConfigTemplate);
  const setLCConfigTemplate = useSettingsStore((state) => state.setLCConfigTemplate);

  const [config, setConfig] = useState(lcConfigTemplate || DEFAULT_LC_CONFIG_TEMPLATE);
  const [lcAvailable, setLcAvailable] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [showInstallInstructions, setShowInstallInstructions] = useState(false);
  const [installInstructions, setInstallInstructions] = useState<string>('');

  // Check lc availability on mount
  useEffect(() => {
    checkLCAvailability();
    fetchInstallInstructions();
  }, []);

  const fetchInstallInstructions = async () => {
    try {
      const res = await fetch('/api/lc/install-instructions');
      if (res.ok) {
        const data = await res.json() as { success: true } & LCInstallInstructionsResponse;
        if (data.success) {
          setInstallInstructions(data.instructions);
        }
      }
    } catch {
      // Silently fail - instructions are optional
      setInstallInstructions('pip install humanitys-last-command');
    }
  };

  const checkLCAvailability = async () => {
    setIsChecking(true);
    try {
      const res = await fetch('/api/lc/status');
      if (res.ok) {
        const data = await res.json() as { success: true } & LCStatusResponse;
        if (data.success) {
          setLcAvailable(data.available);
          if (!data.available) {
            setShowInstallInstructions(true);
          }
        }
      } else {
        setLcAvailable(false);
        setShowInstallInstructions(true);
      }
    } catch {
      setLcAvailable(false);
      setShowInstallInstructions(true);
    } finally {
      setIsChecking(false);
    }
  };

  const handleConfigChange = (value: string) => {
    setConfig(value);
    setLCConfigTemplate(value);
  };

  const handleResetToDefault = () => {
    setConfig(DEFAULT_LC_CONFIG_TEMPLATE);
    setLCConfigTemplate(DEFAULT_LC_CONFIG_TEMPLATE);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* LC Availability Status */}
      <div
        className={cn(
          'rounded-lg border p-4',
          lcAvailable === null && 'border-muted bg-muted/30',
          lcAvailable === true && 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30',
          lcAvailable === false && 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
        )}
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            {lcAvailable === null && (
              <AlertCircle className="size-5 text-muted-foreground" />
            )}
            {lcAvailable === true && (
              <CheckCircle2 className="size-5 text-green-600 dark:text-green-400" />
            )}
            {lcAvailable === false && (
              <XCircle className="size-5 text-amber-600 dark:text-amber-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium">
              {lcAvailable === null && t('settings.lcStatusChecking')}
              {lcAvailable === true && t('settings.lcStatusAvailable')}
              {lcAvailable === false && t('settings.lcStatusNotAvailable')}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {lcAvailable === null && t('settings.lcStatusCheckingDesc')}
              {lcAvailable === true && t('settings.lcStatusAvailableDesc')}
              {lcAvailable === false && t('settings.lcStatusNotAvailableDesc')}
            </p>

            {lcAvailable === false && showInstallInstructions && (
              <div className="mt-3 rounded-md bg-background/50 p-3 border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium">{t('settings.lcInstallTitle')}</span>
                  <button
                    onClick={() => setShowInstallInstructions(false)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t('common.hide')}
                  </button>
                </div>
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                  {installInstructions}
                </pre>
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={checkLCAvailability}
            disabled={isChecking}
            className="shrink-0"
          >
            <RotateCcw className={cn('size-3.5 mr-1.5', isChecking && 'animate-spin')} />
            {t('settings.lcCheckAgain')}
          </Button>
        </div>
      </div>

      {/* Configuration Template */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-muted-foreground" />
            <Label className="text-sm font-medium">{t('settings.lcConfigTemplate')}</Label>
          </div>
          <Button variant="ghost" size="sm" onClick={handleResetToDefault}>
            {t('settings.resetToDefault')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('settings.lcConfigTemplateDesc')}</p>
        <Textarea
          value={config}
          onChange={(e) => handleConfigChange(e.target.value)}
          className="font-mono text-xs min-h-[400px] resize-y"
          spellCheck={false}
          placeholder={DEFAULT_LC_CONFIG_TEMPLATE}
        />
        <p className="text-xs text-muted-foreground">{t('settings.lcConfigTemplateHint')}</p>
      </div>

      {/* Info Box */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
        <p className="font-medium mb-1">{t('settings.lcInfoTitle')}</p>
        <p className="text-xs opacity-90">{t('settings.lcInfoDescription')}</p>
      </div>
    </div>
  );
}
