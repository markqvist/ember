'use client';

import { useState, useCallback, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Loader2, Trash2, AlertTriangle, Download, Upload, FileJson, CheckCircle2 } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { clearDatabase } from '@/lib/utils/database';
import { toast } from 'sonner';
import { createLogger } from '@/lib/logger';
import {
  downloadSettingsExport,
  readImportFile,
  importSettings,
  getImportSummary,
} from '@/lib/utils/settings-export';
import { cn } from '@/lib/utils';

const log = createLogger('GeneralSettings');

export function GeneralSettings() {
  const { t } = useI18n();

  // Clear cache state
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [clearing, setClearing] = useState(false);

  // Import/Export state
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<{
    valid: boolean;
    version?: number;
    exportedAt?: string;
    keys: string[];
    error?: string;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const confirmPhrase = t('settings.clearCacheConfirmPhrase');
  const isConfirmValid = confirmInput === confirmPhrase;

  // Export handler
  const handleExport = useCallback(() => {
    try {
      downloadSettingsExport();
      toast.success(t('settings.exportSuccess') || 'Settings exported successfully');
    } catch (error) {
      log.error('Export failed:', error);
      toast.error(t('settings.exportFailed') || 'Failed to export settings');
    }
  }, [t]);

  // Import handlers
  const handleFileSelect = useCallback(async (file: File) => {
    setImportFile(file);
    try {
      const data = await readImportFile(file);
      const summary = getImportSummary(data);
      setImportPreview(summary);
    } catch (error) {
      log.error('Failed to read import file:', error);
      setImportPreview({
        valid: false,
        keys: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const data = await readImportFile(importFile);
      const result = importSettings(data);

      if (result.success) {
        toast.success(
          t('settings.importSuccess') || `Imported ${result.importedKeys.length} settings successfully`
        );
        setShowImportDialog(false);
        setImportFile(null);
        setImportPreview(null);
        // Reload page after a short delay to apply imported settings
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        const errorMsg = result.errors.join(', ');
        toast.error(t('settings.importFailed') || `Import failed: ${errorMsg}`);
      }
    } catch (error) {
      log.error('Import failed:', error);
      toast.error(t('settings.importFailed') || 'Failed to import settings');
    } finally {
      setImporting(false);
    }
  }, [importFile, t]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file && file.type === 'application/json') {
        handleFileSelect(file);
      } else {
        toast.error(t('settings.importInvalidFile') || 'Please select a valid JSON file');
      }
    },
    [handleFileSelect, t]
  );

  const handleClearCache = useCallback(async () => {
    if (!isConfirmValid) return;
    setClearing(true);
    try {
      // 1. Clear IndexedDB
      await clearDatabase();
      // 2. Clear localStorage
      localStorage.clear();
      // 3. Clear sessionStorage
      sessionStorage.clear();

      toast.success(t('settings.clearCacheSuccess'));

      // Reload page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      log.error('Failed to clear cache:', error);
      toast.error(t('settings.clearCacheFailed'));
      setClearing(false);
    }
  }, [isConfirmValid, t]);

  const clearCacheItems =
    t('settings.clearCacheConfirmItems').split('、').length > 1
      ? t('settings.clearCacheConfirmItems').split('、')
      : t('settings.clearCacheConfirmItems').split(', ');

  return (
    <div className="flex flex-col gap-8">
      {/* Data Management - Export/Import */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-primary/10 text-primary">
              <FileJson className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold">{t('settings.dataManagement') || 'Data Management'}</h3>
          </div>

          {/* Export Section */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{t('settings.exportSettings') || 'Export Settings'}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {t('settings.exportSettingsDescription') ||
                  'Download all configuration including providers, models, audio settings, and user profile as a JSON file for backup or migration.'}
              </p>
            </div>
            <Button variant="outline" size="sm" className="shrink-0" onClick={handleExport}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              {t('settings.export') || 'Export'}
            </Button>
          </div>

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* Import Section */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{t('settings.importSettings') || 'Import Settings'}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {t('settings.importSettingsDescription') ||
                  'Restore settings from a previously exported JSON file. This will overwrite your current configuration.'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => {
                setShowImportDialog(true);
                setImportFile(null);
                setImportPreview(null);
              }}
            >
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              {t('settings.import') || 'Import'}
            </Button>
          </div>
        </div>
      </div>

      {/* Danger Zone - Clear Cache */}
      <div className="relative rounded-xl border border-destructive/30 bg-destructive/[0.03] dark:bg-destructive/[0.06] overflow-hidden">
        {/* Subtle diagonal stripe pattern for danger emphasis */}
        <div
          className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 10px,
              currentColor 10px,
              currentColor 11px
            )`,
          }}
        />

        <div className="relative p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-destructive/10 text-destructive">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-destructive">{t('settings.dangerZone')}</h3>
          </div>

          {/* Content */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{t('settings.clearCache')}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {t('settings.clearCacheDescription')}
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="shrink-0"
              onClick={() => {
                setConfirmInput('');
                setShowClearDialog(true);
              }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              {t('settings.clearCache')}
            </Button>
          </div>
        </div>
      </div>

      {/* Clear Cache Confirmation Dialog */}
      <AlertDialog
        open={showClearDialog}
        onOpenChange={(open) => {
          if (!clearing) {
            setShowClearDialog(open);
            if (!open) setConfirmInput('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              {t('settings.clearCacheConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>{t('settings.clearCacheConfirmDescription')}</p>
                <ul className="space-y-1.5 ml-1">
                  {clearCacheItems.map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-destructive/60 shrink-0" />
                      {item.trim()}
                    </li>
                  ))}
                </ul>
                <div className="pt-1">
                  <Label className="text-xs font-medium text-foreground">
                    {t('settings.clearCacheConfirmInput')}
                  </Label>
                  <Input
                    className="mt-1.5 h-9 text-sm"
                    placeholder={confirmPhrase}
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && isConfirmValid) {
                        handleClearCache();
                      }
                    }}
                    autoFocus
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>{t('common.cancel')}</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={!isConfirmValid || clearing}
              onClick={handleClearCache}
            >
              {clearing ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-1.5" />
              )}
              {t('settings.clearCacheButton')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Settings Dialog */}
      <Dialog
        open={showImportDialog}
        onOpenChange={(open) => {
          if (!importing) {
            setShowImportDialog(open);
            if (!open) {
              setImportFile(null);
              setImportPreview(null);
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              {t('settings.importSettings') || 'Import Settings'}
            </DialogTitle>
            <DialogDescription>
              {t('settings.importSettingsDescription') ||
                'Restore settings from a previously exported JSON file.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* File Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'relative border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors',
                'hover:border-primary/50 hover:bg-primary/5',
                importFile ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
                'flex flex-col items-center justify-center gap-2'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
              {importFile ? (
                <>
                  <FileJson className="w-8 h-8 text-primary" />
                  <p className="text-sm font-medium text-primary">{importFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(importFile.size / 1024).toFixed(1)} KB
                  </p>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {t('settings.importDropzone') || 'Drop JSON file here or click to browse'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.importFileTypes') || 'Supports: .json files'}
                  </p>
                </>
              )}
            </div>

            {/* Import Preview */}
            {importPreview && (
              <div
                className={cn(
                  'rounded-lg border p-3 space-y-2',
                  importPreview.valid ? 'border-primary/20 bg-primary/5' : 'border-destructive/20 bg-destructive/5'
                )}
              >
                <div className="flex items-center gap-2">
                  {importPreview.valid ? (
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                  )}
                  <span className={cn('text-sm font-medium', importPreview.valid ? 'text-primary' : 'text-destructive')}>
                    {importPreview.valid
                      ? t('settings.importValid') || 'Valid import file'
                      : t('settings.importInvalid') || 'Invalid import file'}
                  </span>
                </div>

                {importPreview.valid && (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {importPreview.exportedAt && (
                      <p>
                        {t('settings.importExportedAt') || 'Exported'}:{' '}
                        {new Date(importPreview.exportedAt).toLocaleString()}
                      </p>
                    )}
                    <p>
                      {t('settings.importKeysCount') || 'Settings to restore'}: {importPreview.keys.length}
                    </p>
                  </div>
                )}

                {importPreview.error && (
                  <p className="text-xs text-destructive">{importPreview.error}</p>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setShowImportDialog(false)}
              disabled={importing}
            >
              {t('common.cancel') || 'Cancel'}
            </Button>
            <Button
              onClick={handleImport}
              disabled={!importPreview?.valid || importing}
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  {t('settings.importing') || 'Importing...'}
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-1.5" />
                  {t('settings.import') || 'Import'}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
