'use client';

import { useCallback, useState, useEffect, useMemo } from 'react';
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
import { ActionsEditor } from './actions-editor';
import { QuizEditor } from './quiz-editor';
import type { Scene, InteractiveContent, QuizContent } from '@/lib/types/stage';

interface SceneEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scene: Scene | null;
  onSave: (updatedScene: Scene) => void;
}

function getDefaultTab(scene: Scene | null): string {
  if (!scene) return 'json';

  // Priority: quiz > interactive > actions > json
  const hasQuizEditor = scene.type === 'quiz' && scene.content.type === 'quiz';
  const hasInteractiveEditor = scene.type === 'interactive' && scene.content.type === 'interactive';
  const hasActionsEditor = scene.actions && scene.actions.length > 0;

  if (hasQuizEditor) return 'quiz';
  if (hasInteractiveEditor) return 'interactive';
  if (hasActionsEditor) return 'actions';
  return 'json';
}

export function SceneEditorModal({ open, onOpenChange, scene, onSave }: SceneEditorModalProps) {
  const { t } = useI18n();
  const defaultTab = useMemo(() => getDefaultTab(scene), [scene?.id, scene?.type]);
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Reset to default tab when modal opens with a new scene
  useEffect(() => {
    if (open) {
      setActiveTab(getDefaultTab(scene));
    }
  }, [open, scene?.id]);

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

  const handleQuizSave = useCallback((updatedContent: QuizContent) => {
    if (!scene) return;
    const updatedScene: Scene = {
      ...scene,
      content: updatedContent,
    };
    onSave(updatedScene);
    onOpenChange(false);
  }, [scene, onSave, onOpenChange]);

  const handleActionsSave = useCallback((updatedActions: import('@/lib/types/action').Action[]) => {
    if (!scene) return;
    const updatedScene: Scene = {
      ...scene,
      actions: updatedActions,
    };
    onSave(updatedScene);
    onOpenChange(false);
  }, [scene, onSave, onOpenChange]);

  if (!scene) return null;

  // Determine available tabs based on scene type
  const hasQuizEditor = scene.type === 'quiz' && scene.content.type === 'quiz';
  const hasInteractiveEditor = scene.type === 'interactive' && scene.content.type === 'interactive';
  const hasActionsEditor = scene.actions && scene.actions.length > 0;

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
              {hasQuizEditor && (
                <TabsTrigger value="quiz" className="text-xs">
                  {t('stage.quizTab')}
                </TabsTrigger>
              )}
              {hasInteractiveEditor && (
                <TabsTrigger value="interactive" className="text-xs">
                  {t('stage.interactiveTab')}
                </TabsTrigger>
              )}
              {hasActionsEditor && (
                <TabsTrigger value="actions" className="text-xs">
                  {t('stage.actionsTab')}
                </TabsTrigger>
              )}
              <TabsTrigger value="json" className="text-xs">
                JSON
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 p-6 overflow-hidden">
              {hasQuizEditor && (
                <TabsContent value="quiz" className="h-full mt-0">
                  <QuizEditor
                    content={scene.content as QuizContent}
                    onSave={handleQuizSave}
                    onRevert={handleRevert}
                  />
                </TabsContent>
              )}
              {hasInteractiveEditor && (
                <TabsContent value="interactive" className="h-full mt-0">
                  <InteractiveEditor
                    content={scene.content as InteractiveContent}
                    onSave={handleInteractiveSave}
                    onRevert={handleRevert}
                  />
                </TabsContent>
              )}
              {hasActionsEditor && (
                <TabsContent value="actions" className="h-full mt-0">
                  <ActionsEditor
                    actions={scene.actions || []}
                    onSave={handleActionsSave}
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
