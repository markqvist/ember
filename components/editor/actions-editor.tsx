'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, Check, RotateCcw, Plus, Trash2, Volume2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { generateTTS } from '@/lib/audio/tts-providers';
import { TTS_PROVIDERS, DEFAULT_TTS_VOICES } from '@/lib/audio/constants';
import { db } from '@/lib/utils/database';
import { toast } from 'sonner';
import type { Action, SpeechAction, SpotlightAction, LaserAction } from '@/lib/types/action';
import type { TTSProviderId } from '@/lib/audio/types';

interface ActionsEditorProps {
  actions: Action[];
  onSave: (updatedActions: Action[]) => void;
  onRevert: () => void;
}

type ActionType = Action['type'];

const ACTION_TYPES: ActionType[] = [
  'speech',
  'spotlight',
  'laser',
  'play_video',
  'discussion',
  'wb_open',
  'wb_draw_text',
  'wb_draw_shape',
  'wb_draw_chart',
  'wb_draw_latex',
  'wb_draw_table',
  'wb_draw_line',
  'wb_clear',
  'wb_delete',
  'wb_close',
];

const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  speech: 'Speech',
  spotlight: 'Spotlight',
  laser: 'Laser',
  play_video: 'Play Video',
  discussion: 'Discussion',
  wb_open: 'Open Whiteboard',
  wb_draw_text: 'Draw Text',
  wb_draw_shape: 'Draw Shape',
  wb_draw_chart: 'Draw Chart',
  wb_draw_latex: 'Draw LaTeX',
  wb_draw_table: 'Draw Table',
  wb_draw_line: 'Draw Line',
  wb_clear: 'Clear Whiteboard',
  wb_delete: 'Delete Element',
  wb_close: 'Close Whiteboard',
};

function SpeechActionEditor({
  action,
  onChange,
  onRegenerateAudio,
  isRegenerating,
}: {
  action: SpeechAction;
  onChange: (updated: SpeechAction) => void;
  onRegenerateAudio: (action: SpeechAction) => void;
  isRegenerating: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('stage.actionText')}</label>
        <Textarea
          value={action.text}
          onChange={(e) => onChange({ ...action, text: e.target.value })}
          placeholder="Enter speech text..."
          className="w-full min-h-[100px] text-xs resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('stage.audioId')}</label>
        <div className="flex gap-2">
          <Input
            value={action.audioId || ''}
            readOnly
            placeholder="No audio generated"
            className="flex-1 text-xs bg-muted"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRegenerateAudio(action)}
            disabled={isRegenerating}
            className="shrink-0"
            title={t('stage.regenerateAudio')}
          >
            {isRegenerating ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 mr-1" />
            )}
            {isRegenerating ? '...' : t('stage.regenerateAudio')}
          </Button>
        </div>
      </div>

      {action.audioUrl && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">URL:</span> {action.audioUrl.split('/').pop()}
        </div>
      )}
    </div>
  );
}

function ElementActionEditor({
  action,
  onChange,
  type,
}: {
  action: SpotlightAction | LaserAction;
  onChange: (updated: SpotlightAction | LaserAction) => void;
  type: 'spotlight' | 'laser';
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('stage.actionElementId')}</label>
        <Input
          value={action.elementId}
          onChange={(e) => onChange({ ...action, elementId: e.target.value })}
          placeholder="e.g., text_IY5NhV9b"
          className="w-full text-xs"
        />
      </div>
    </div>
  );
}

function GenericActionEditor({ action }: { action: Action }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        This action type uses advanced properties. Edit in the JSON tab for full control.
      </p>
      <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-[150px]">
        {JSON.stringify(action, null, 2)}
      </pre>
    </div>
  );
}

function ActionCard({
  action,
  index,
  onChange,
  onRemove,
  onRegenerateAudio,
  isExpanded,
  onToggle,
  regeneratingId,
}: {
  action: Action;
  index: number;
  onChange: (updated: Action) => void;
  onRemove: () => void;
  onRegenerateAudio: (action: SpeechAction) => void;
  isExpanded: boolean;
  onToggle: () => void;
  regeneratingId: string | null;
}) {
  const { t } = useI18n();
  const isRegenerating = action.type === 'speech' && regeneratingId === action.id;

  const renderEditor = () => {
    switch (action.type) {
      case 'speech':
        return (
          <SpeechActionEditor
            action={action as SpeechAction}
            onChange={(updated) => onChange(updated)}
            onRegenerateAudio={onRegenerateAudio}
            isRegenerating={isRegenerating}
          />
        );
      case 'spotlight':
      case 'laser':
        return (
          <ElementActionEditor
            action={action as SpotlightAction | LaserAction}
            onChange={(updated) => onChange(updated)}
            type={action.type}
          />
        );
      default:
        return <GenericActionEditor action={action} />;
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground w-6">{index + 1}</span>
          <span
            className={cn(
              'text-xs font-medium px-1.5 py-0.5 rounded',
              action.type === 'speech' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
              action.type === 'spotlight' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
              action.type === 'laser' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
              !['speech', 'spotlight', 'laser'].includes(action.type) &&
                'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
            )}
          >
            {ACTION_TYPE_LABELS[action.type] || action.type}
          </span>
          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
            {action.type === 'speech' ? (action as SpeechAction).text.slice(0, 50) + '...' : action.id}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Trash2 className="w-3.5 h-3.5 text-destructive" />
        </Button>
      </div>

      {isExpanded && <div className="px-3 pb-3 pt-1 border-t">{renderEditor()}</div>}
    </div>
  );
}

export function ActionsEditor({ actions, onSave, onRevert }: ActionsEditorProps) {
  const { t } = useI18n();
  const [localActions, setLocalActions] = useState<Action[]>(actions);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [hasChanges, setHasChanges] = useState(false);

  const handleActionChange = useCallback((index: number, updated: Action) => {
    setLocalActions((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
    setHasChanges(true);
  }, []);

  const handleActionRemove = useCallback((index: number) => {
    setLocalActions((prev) => prev.filter((_, i) => i !== index));
    setHasChanges(true);
    if (expandedIndex === index) setExpandedIndex(null);
  }, [expandedIndex]);

  const handleAddAction = useCallback(() => {
    const newAction: Action = {
      id: `action_${Date.now()}`,
      type: 'speech',
      text: '',
    } as SpeechAction;
    setLocalActions((prev) => [...prev, newAction]);
    setHasChanges(true);
    setExpandedIndex(localActions.length);
  }, [localActions.length]);

  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const handleRegenerateAudio = useCallback(async (action: SpeechAction) => {
    if (!action.text.trim()) {
      toast.error('Speech text is empty');
      return;
    }

    setRegeneratingId(action.id);

    try {
      // Get TTS configuration from settings store
      const settings = useSettingsStore.getState();
      const providerId = settings.ttsProviderId;

      // Skip browser-native-tts as it can't be used for generation
      if (providerId === 'browser-native-tts') {
        toast.error('Please configure a server TTS provider in settings');
        return;
      }

      // Get provider configuration
      const providerConfig = settings.ttsProvidersConfig?.[providerId];
      const provider = TTS_PROVIDERS[providerId];

      if (!provider) {
        toast.error(`Unknown TTS provider: ${providerId}`);
        return;
      }

      // Resolve voice and speed (action > settings > default)
      const voice = action.voice || settings.ttsVoice || DEFAULT_TTS_VOICES[providerId] || 'default';
      const speed = action.speed || settings.ttsSpeed || provider.speedRange?.default || 1.0;

      // Build TTS config
      const ttsConfig = {
        providerId: providerId as TTSProviderId,
        apiKey: providerConfig?.apiKey,
        baseUrl: providerConfig?.baseUrl,
        voice,
        speed,
        model: providerConfig?.model,
      };

      // Generate TTS
      toast.info('Generating audio...');
      const result = await generateTTS(ttsConfig, action.text);

      // Determine format from provider or default to mp3
      const format = provider.supportedFormats?.[0] || 'mp3';

      // Create audio ID (reuse existing or generate new)
      const audioId = action.audioId || `tts_${action.id}`;

      // Store in IndexedDB
      const blob = new Blob([result.audio as unknown as BlobPart], { type: `audio/${format}` });
      await db.audioFiles.put({
        id: audioId,
        blob,
        format,
        text: action.text,
        voice,
        createdAt: Date.now(),
      });

      // Update action with new audio reference (clear audioUrl as it's now local-only)
      const updatedAction: SpeechAction = {
        ...action,
        audioId,
        audioUrl: undefined, // Clear server URL - will be set on next server save
        voice,
        speed,
      };

      // Update local actions
      const actionIndex = localActions.findIndex((a) => a.id === action.id);
      if (actionIndex !== -1) {
        handleActionChange(actionIndex, updatedAction);
      }

      toast.success('Audio regenerated successfully');
    } catch (error) {
      console.error('TTS regeneration failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to regenerate audio');
    } finally {
      setRegeneratingId(null);
    }
  }, [localActions, handleActionChange]);

  const handleSave = useCallback(() => {
    onSave(localActions);
  }, [localActions, onSave]);

  const handleRevert = useCallback(() => {
    setLocalActions(actions);
    setHasChanges(false);
    setExpandedIndex(0);
    onRevert();
  }, [actions, onRevert]);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t('stage.editingActions')} ({localActions.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-xs text-amber-600 dark:text-amber-400">{t('stage.modified')}</span>
          )}
          <Button variant="outline" size="sm" onClick={handleRevert} disabled={!hasChanges} className="h-7 px-2 text-xs">
            <RotateCcw className="w-3 h-3 mr-1" />
            {t('stage.revert')}
          </Button>
          <Button variant="default" size="sm" onClick={handleSave} disabled={!hasChanges} className="h-7 px-2 text-xs">
            <Check className="w-3 h-3 mr-1" />
            {t('stage.applyChanges')}
          </Button>
        </div>
      </div>

      {/* Actions List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {localActions.map((action, index) => (
          <ActionCard
            key={action.id}
            action={action}
            index={index}
            onChange={(updated) => handleActionChange(index, updated)}
            onRemove={() => handleActionRemove(index)}
            onRegenerateAudio={handleRegenerateAudio}
            isExpanded={expandedIndex === index}
            onToggle={() => setExpandedIndex(expandedIndex === index ? null : index)}
            regeneratingId={regeneratingId}
          />
        ))}
      </div>

      {/* Add Action */}
      <Button variant="outline" size="sm" onClick={handleAddAction} className="w-full">
        <Plus className="w-3.5 h-3.5 mr-1" />
        {t('stage.addAction')}
      </Button>
    </div>
  );
}
