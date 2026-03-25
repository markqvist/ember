'use client';

import { useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/hooks/use-i18n';
import { SceneJsonEditor } from './scene-json-editor';
import type { Scene } from '@/lib/types/stage';

interface SceneEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scene: Scene | null;
  onSave: (updatedScene: Scene) => void;
}

export function SceneEditorModal({ open, onOpenChange, scene, onSave }: SceneEditorModalProps) {
  const { t } = useI18n();

  const handleRevert = useCallback(() => {
    // Revert is handled internally by SceneJsonEditor
    // This callback is for any additional external actions
  }, []);

  const handleSave = useCallback((updatedScene: Scene) => {
    onSave(updatedScene);
    onOpenChange(false);
  }, [onSave, onOpenChange]);

  if (!scene) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[90vw] h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-base font-semibold">{t('stage.editSceneTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 p-6 overflow-hidden">
          <SceneJsonEditor
            scene={scene}
            onSave={handleSave}
            onRevert={handleRevert}
            className="h-full"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
