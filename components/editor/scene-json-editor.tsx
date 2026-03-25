'use client';

import { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { Scene } from '@/lib/types/stage';

interface SceneJsonEditorProps {
  scene: Scene;
  onSave: (updatedScene: Scene) => void;
  onRevert: () => void;
  className?: string;
}

/**
 * Validates that the edited JSON maintains critical media references
 * Returns warnings if audioId or media placeholders are modified
 */
function validateMediaReferences(original: Scene, edited: Scene): string[] {
  const warnings: string[] = [];

  // Check audio references in actions
  const originalAudioIds = new Set<string>();
  const editedAudioIds = new Set<string>();

  original.actions?.forEach((action) => {
    if ('audioId' in action && action.audioId) {
      originalAudioIds.add(action.audioId);
    }
  });

  edited.actions?.forEach((action) => {
    if ('audioId' in action && action.audioId) {
      editedAudioIds.add(action.audioId);
    }
  });

  // Check for removed audio references
  originalAudioIds.forEach((id) => {
    if (!editedAudioIds.has(id)) {
      warnings.push(`Audio reference "${id}" was removed`);
    }
  });

  // Check media placeholders in slide content
  if (original.content.type === 'slide' && edited.content.type === 'slide') {
    const originalElements = original.content.canvas?.elements || [];
    const editedElements = edited.content.canvas?.elements || [];

    const originalPlaceholders = new Set<string>();
    const editedPlaceholders = new Set<string>();

    originalElements.forEach((el: { src?: string; type?: string }) => {
      if (el.src?.match(/^gen_(img|vid)_/)) {
        originalPlaceholders.add(el.src);
      }
    });

    editedElements.forEach((el: { src?: string; type?: string }) => {
      if (el.src?.match(/^gen_(img|vid)_/)) {
        editedPlaceholders.add(el.src);
      }
    });

    originalPlaceholders.forEach((placeholder) => {
      if (!editedPlaceholders.has(placeholder)) {
        warnings.push(`Media placeholder "${placeholder}" was removed`);
      }
    });
  }

  return warnings;
}

/**
 * Validates scene structure matches expected type
 */
function validateSceneStructure(scene: unknown): scene is Scene {
  if (!scene || typeof scene !== 'object') return false;
  const s = scene as Record<string, unknown>;

  // Required fields
  if (typeof s.id !== 'string') return false;
  if (typeof s.stageId !== 'string') return false;
  if (typeof s.type !== 'string') return false;
  if (typeof s.title !== 'string') return false;
  if (typeof s.order !== 'number') return false;
  if (!s.content || typeof s.content !== 'object') return false;

  // Content must have type
  const content = s.content as Record<string, unknown>;
  if (!content.type || typeof content.type !== 'string') return false;

  return true;
}

export function SceneJsonEditor({ scene, onSave, onRevert, className }: SceneJsonEditorProps) {
  const { t } = useI18n();
  const [jsonText, setJsonText] = useState(() => JSON.stringify(scene, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const originalJson = useMemo(() => JSON.stringify(scene, null, 2), [scene]);

  const handleTextChange = useCallback(
    (value: string) => {
      setJsonText(value);
      setHasChanges(value !== originalJson);
      setParseError(null);
      setValidationWarnings([]);
    },
    [originalJson]
  );

  const handleValidate = useCallback((): Scene | null => {
    try {
      const parsed = JSON.parse(jsonText);

      if (!validateSceneStructure(parsed)) {
        setParseError(t('stage.invalidSceneStructure'));
        return null;
      }

      // Ensure ID and stageId cannot be changed
      if (parsed.id !== scene.id) {
        setParseError(`${t('stage.sceneIdImmutable')} ("${scene.id}")`);
        return null;
      }

      if (parsed.stageId !== scene.stageId) {
        setParseError(`${t('stage.stageIdImmutable')} ("${scene.stageId}")`);
        return null;
      }

      // Check for media reference warnings
      const warnings = validateMediaReferences(scene, parsed);
      if (warnings.length > 0) {
        setValidationWarnings(warnings);
      }

      return parsed as Scene;
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Invalid JSON');
      return null;
    }
  }, [jsonText, scene]);

  const handleSave = useCallback(() => {
    const validated = handleValidate();
    if (validated) {
      onSave(validated);
    }
  }, [handleValidate, onSave]);

  const handleRevert = useCallback(() => {
    setJsonText(originalJson);
    setParseError(null);
    setValidationWarnings([]);
    setHasChanges(false);
    onRevert();
  }, [originalJson, onRevert]);

  // Line numbers for the textarea
  const lineCount = jsonText.split('\n').length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 10) }, (_, i) => i + 1);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t('stage.editScene')}: <span className="font-medium text-foreground">{scene.title}</span>
          </span>
          <span className="text-xs text-muted-foreground">({scene.type})</span>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-xs text-amber-600 dark:text-amber-400">{t('stage.modified')}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRevert}
            disabled={!hasChanges}
            className="h-7 px-2 text-xs"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            {t('stage.revert')}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={!!parseError && validationWarnings.length === 0}
            className="h-7 px-2 text-xs"
          >
            <Check className="w-3 h-3 mr-1" />
            {t('stage.applyChanges')}
          </Button>
        </div>
      </div>

      {/* Error display */}
      {parseError && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{parseError}</span>
        </div>
      )}

      {/* Warnings display */}
      {validationWarnings.length > 0 && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-1">
              {t('stage.mediaReferenceWarning')}:
            </p>
            <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-0.5">
              {validationWarnings.map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
            <p className="text-xs text-amber-600 dark:text-amber-400/70 mt-1 italic">
              {t('stage.mediaReferenceRemoved')}
            </p>
          </div>
        </div>
      )}

      {/* JSON Editor */}
      <div className="relative flex-1 min-h-[400px] border rounded-md overflow-hidden bg-slate-50 dark:bg-slate-950 font-mono text-xs">
        {/* Line numbers */}
        <div className="absolute left-0 top-0 bottom-0 w-10 bg-slate-100 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600 text-right pr-2 pt-2 select-none overflow-hidden">
          {lineNumbers.map((num) => (
            <div key={num} className="leading-5">
              {num}
            </div>
          ))}
        </div>

        {/* Textarea */}
        <textarea
          value={jsonText}
          onChange={(e) => handleTextChange(e.target.value)}
          className={cn(
            'absolute inset-0 left-10 w-[calc(100%-2.5rem)] h-full resize-none',
            'bg-transparent text-slate-800 dark:text-slate-200',
            'border-0 outline-none p-2 leading-5',
            'font-mono whitespace-pre tab-[2]',
            'focus:ring-0 focus-visible:ring-0'
          )}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>

      {/* Help text */}
      <div className="text-xs text-muted-foreground flex items-center justify-between">
        <span>{t('stage.editHelpText')}</span>
        <span className="font-mono">{t('stage.closeShortcut')}</span>
      </div>
    </div>
  );
}
