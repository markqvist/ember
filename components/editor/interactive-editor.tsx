'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { InteractiveContent } from '@/lib/types/stage';

interface InteractiveEditorProps {
  content: InteractiveContent;
  onSave: (updatedContent: InteractiveContent) => void;
  onRevert: () => void;
}

export function InteractiveEditor({ content, onSave, onRevert }: InteractiveEditorProps) {
  const { t } = useI18n();
  const [url, setUrl] = useState(content.url || '');
  const [html, setHtml] = useState(content.html || '');
  const [hasChanges, setHasChanges] = useState(false);

  const originalUrl = content.url || '';
  const originalHtml = content.html || '';

  const handleUrlChange = useCallback((value: string) => {
    setUrl(value);
    setHasChanges(value !== originalUrl || html !== originalHtml);
  }, [originalUrl, originalHtml, html]);

  const handleHtmlChange = useCallback((value: string) => {
    setHtml(value);
    setHasChanges(value !== originalHtml || url !== originalUrl);
  }, [originalHtml, originalUrl, url]);

  const handleSave = useCallback(() => {
    onSave({
      type: 'interactive',
      url: url.trim(),
      html: html.trim() || undefined,
    });
  }, [url, html, onSave]);

  const handleRevert = useCallback(() => {
    setUrl(originalUrl);
    setHtml(originalHtml);
    setHasChanges(false);
    onRevert();
  }, [originalUrl, originalHtml, onRevert]);

  // Line numbers for HTML textarea
  const lineCount = html.split('\n').length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 10) }, (_, i) => i + 1);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t('stage.editingInteractive')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {t('stage.modified')}
            </span>
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
            disabled={!hasChanges}
            className="h-7 px-2 text-xs"
          >
            <Check className="w-3 h-3 mr-1" />
            {t('stage.applyChanges')}
          </Button>
        </div>
      </div>

      {/* URL Field */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          {t('stage.interactiveUrl')}
        </label>
        <Input
          value={url}
          onChange={(e) => handleUrlChange(e.target.value)}
          placeholder="https://example.com, molecules, or molecules/index.html"
          className="w-full text-xs"
        />
        <p className="text-xs text-muted-foreground">
          {t('stage.interactiveUrlHint')}
        </p>
        {url && !/^(https?:)?\/\//i.test(url) && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            {t('stage.interactiveUrlRelativeHint')}
          </p>
        )}
      </div>

      {/* HTML Editor */}
      <div className="flex-1 flex flex-col gap-1.5 min-h-0">
        <label className="text-xs font-medium text-foreground">
          {t('stage.interactiveHtml')}
        </label>
        <div className="relative flex-1 border rounded-md overflow-hidden bg-slate-50 dark:bg-slate-950 font-mono text-xs">
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
            value={html}
            onChange={(e) => handleHtmlChange(e.target.value)}
            placeholder={t('stage.interactiveHtmlPlaceholder')}
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
        <p className="text-xs text-muted-foreground">
          {t('stage.interactiveHtmlHint')}
        </p>
      </div>
    </div>
  );
}
