'use client';

import { useCallback, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/lib/hooks/use-i18n';
import { SceneJsonEditor } from './scene-json-editor';
import { InteractiveEditor } from './interactive-editor';
import type { Scene, InteractiveContent } from '@/lib/types/stage';

interface SceneEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scene: Scene | null;
  onSave: (updatedScene: Scene) => void;
}

export function SceneEditorModal({ open, onOpenChange, scene, onSave }: SceneEditorModalProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('json');

  const handleRevert = useCallback(() => {
    // Revert is handled internally by editors
  }, []);

  const handleJsonSave = useCallback((updatedScene: Scene) => {
    onSave(updatedScene);
    onOpenChange(false);
  }, [onSave, onOpenChange]);

  const handleInteractiveSave = useCallback((updatedContent: InteractiveContent) => {
    if (!scene) return;
    const updatedScene: Scene = {
      ...scene,
      content: updatedContent,
    };
    onSave(updatedScene);
    onOpenChange(false);
  }, [scene, onSave, onOpenChange]);

  if (!scene) return null;

  // Determine available tabs based on scene type
  const hasInteractiveEditor = scene.type === 'interactive' && scene.content.type === 'interactive';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[90vw] h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-base font-semibold">
            {t('stage.editSceneTitle')}: {scene.title}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <TabsList className="mx-6 mt-4 w-fit" variant="line">
              {hasInteractiveEditor && (
                <TabsTrigger value="interactive" className="text-xs">
                  {t('stage.interactiveTab')}
                </TabsTrigger>
              )}
              <TabsTrigger value="json" className="text-xs">
                JSON
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 p-6 overflow-hidden">
              {hasInteractiveEditor && (
                <TabsContent value="interactive" className="h-full mt-0">
                  <InteractiveEditor
                    content={scene.content as InteractiveContent}
                    onSave={handleInteractiveSave}
                    onRevert={handleRevert}
                  />
                </TabsContent>
              )}
              <TabsContent value="json" className="h-full mt-0">
                <SceneJsonEditor
                  scene={scene}
                  onSave={handleJsonSave}
                  onRevert={handleRevert}
                  className="h-full"
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
