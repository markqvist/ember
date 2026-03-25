'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, Check, RotateCcw, Plus, Trash2, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { Action, SpeechAction, SpotlightAction, LaserAction } from '@/lib/types/action';

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
}: {
  action: SpeechAction;
  onChange: (updated: SpeechAction) => void;
  onRegenerateAudio: (action: SpeechAction) => void;
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
            className="shrink-0"
            title={t('stage.regenerateAudio')}
          >
            <Volume2 className="w-3.5 h-3.5 mr-1" />
            {t('stage.regenerateAudio')}
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
}: {
  action: Action;
  index: number;
  onChange: (updated: Action) => void;
  onRemove: () => void;
  onRegenerateAudio: (action: SpeechAction) => void;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();

  const renderEditor = () => {
    switch (action.type) {
      case 'speech':
        return (
          <SpeechActionEditor
            action={action as SpeechAction}
            onChange={(updated) => onChange(updated)}
            onRegenerateAudio={onRegenerateAudio}
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

  const handleRegenerateAudio = useCallback((action: SpeechAction) => {
    // Placeholder for TTS regeneration
    console.log('Regenerate audio for:', action.id);
    alert('TTS regeneration will be implemented in a future update.');
  }, []);

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
