'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Upload, FileArchive, AlertCircle, CheckCircle, X, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ClassroomImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportSuccess?: () => void;
}

interface ImportState {
  status: 'idle' | 'uploading' | 'confirming' | 'importing' | 'success' | 'error';
  file?: File;
  error?: string;
  classroomName?: string;
  classroomId?: string;
}

export function ClassroomImportDialog({
  open,
  onOpenChange,
  onImportSuccess,
}: ClassroomImportDialogProps) {
  const { t } = useI18n();
  const [isDragging, setIsDragging] = useState(false);
  const [state, setState] = useState<ImportState>({ status: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setState({ status: 'idle' });
    setIsDragging(false);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onOpenChange(false);
  }, [resetState, onOpenChange]);

  const validateFile = (file: File): boolean => {
    if (!file.name.endsWith('.zip')) {
      setState({
        status: 'error',
        error: t('common.import.invalidFileType'),
      });
      return false;
    }
    // 1 GB limit
    if (file.size > 1024 * 1024 * 1024) {
      setState({
        status: 'error',
        error: t('common.import.fileTooLarge'),
      });
      return false;
    }
    return true;
  };

  const handleFileSelect = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const file = files[0];

      if (!validateFile(file)) return;

      setState({ status: 'uploading', file });

      // First attempt - check if classroom exists
      const formData = new FormData();
      formData.append('file', file);
      formData.append('allowOverwrite', 'false');

      try {
        const response = await fetch('/api/classroom-import', {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            setState({
              status: 'success',
              classroomName: result.name,
              classroomId: result.id,
            });
            onImportSuccess?.();
          }
        } else if (response.status === 409) {
          // Classroom already exists - need confirmation
          const errorData = await response.json().catch(() => ({}));
          // Try to extract classroom name from the file for the confirmation dialog
          setState({
            status: 'confirming',
            file,
            error: errorData.details || errorData.error,
          });
        } else {
          const errorData = await response.json().catch(() => ({}));
          setState({
            status: 'error',
            file,
            error: errorData.details || errorData.error || t('common.import.failed'),
          });
        }
      } catch (err) {
        setState({
          status: 'error',
          file,
          error: err instanceof Error ? err.message : t('common.import.failed'),
        });
      }
    },
    [t, onImportSuccess]
  );

  const handleConfirmOverwrite = useCallback(async () => {
    if (!state.file) return;

    setState({ status: 'importing', file: state.file });

    const formData = new FormData();
    formData.append('file', state.file);
    formData.append('allowOverwrite', 'true');

    try {
      const response = await fetch('/api/classroom-import', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setState({
            status: 'success',
            classroomName: result.name,
            classroomId: result.id,
          });
          onImportSuccess?.();
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        setState({
          status: 'error',
          file: state.file,
          error: errorData.details || errorData.error || t('common.import.failed'),
        });
      }
    } catch (err) {
      setState({
        status: 'error',
        file: state.file,
        error: err instanceof Error ? err.message : t('common.import.failed'),
      });
    }
  }, [state.file, t, onImportSuccess]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      handleFileSelect(files);
    },
    [handleFileSelect]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className="max-w-md w-[90vw]" onPointerDownOutside={handleClose}>
        <DialogHeader>
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Upload className="size-4 text-violet-500" />
            {t('common.import.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <AnimatePresence mode="wait">
            {/* Idle / Dragging State */}
            {(state.status === 'idle' || state.status === 'uploading') && (
              <motion.div
                key="dropzone"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={cn(
                  'border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer',
                  isDragging
                    ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/20'
                    : 'border-muted-foreground/20 hover:border-violet-300 dark:hover:border-violet-700',
                  state.status === 'uploading' && 'opacity-70 pointer-events-none'
                )}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    handleFileSelect(files);
                    e.target.value = '';
                  }}
                />
                <div className="size-12 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mx-auto mb-3">
                  {state.status === 'uploading' ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    >
                      <Upload className="size-6 text-violet-600 dark:text-violet-400" />
                    </motion.div>
                  ) : (
                    <FileArchive className="size-6 text-violet-600 dark:text-violet-400" />
                  )}
                </div>
                <p className="text-sm font-medium text-foreground">
                  {state.status === 'uploading'
                    ? t('common.import.uploading')
                    : t('common.import.dropzone')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('common.import.clickToBrowse')}
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-2">
                  {t('common.import.maxSize')}
                </p>
              </motion.div>
            )}

            {/* Confirmation State */}
            {state.status === 'confirming' && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-4"
              >
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                        {t('common.import.alreadyExists')}
                      </p>
                      <p className="text-xs text-amber-700/70 dark:text-amber-400/70 mt-1">
                        {state.error}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      resetState();
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
                    onClick={handleConfirmOverwrite}
                  >
                    {t('common.import.replace')}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Importing State */}
            {state.status === 'importing' && (
              <motion.div
                key="importing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-8 text-center"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                  className="size-12 rounded-full border-2 border-violet-200 dark:border-violet-800 border-t-violet-600 dark:border-t-violet-400 mx-auto mb-4"
                />
                <p className="text-sm font-medium text-foreground">
                  {t('common.import.importing')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('common.import.pleaseWait')}
                </p>
              </motion.div>
            )}

            {/* Success State */}
            {state.status === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="py-4 text-center"
              >
                <div className="size-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="size-8 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-base font-semibold text-foreground">
                  {t('common.import.success')}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {state.classroomName}
                </p>
                <div className="flex gap-2 mt-6">
                  <Button variant="outline" className="flex-1" onClick={handleClose}>
                    {t('common.close')}
                  </Button>
                  <Button
                    className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
                    onClick={() => {
                      if (state.classroomId) {
                        window.location.href = `/classroom/${state.classroomId}`;
                      }
                    }}
                  >
                    <Download className="size-4 mr-1.5" />
                    {t('common.import.open')}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Error State */}
            {state.status === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-4"
              >
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-destructive">
                        {t('common.import.failed')}
                      </p>
                      <p className="text-xs text-destructive/70 mt-1 break-words">
                        {state.error}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={handleClose}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
                    onClick={() => {
                      resetState();
                    }}
                  >
                    {t('common.import.tryAgain')}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
