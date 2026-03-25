'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { Stage } from '@/lib/types/stage';

interface ClassroomEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classroom: Stage | null;
  onSave: (updates: { name: string; description?: string }) => void;
}

export function ClassroomEditModal({ open, onOpenChange, classroom, onSave }: ClassroomEditModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Reset form when modal opens with new classroom data
  useEffect(() => {
    if (open && classroom) {
      setName(classroom.name || '');
      setDescription(classroom.description || '');
    }
  }, [open, classroom]);

  const handleSave = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    onSave({
      name: trimmedName,
      description: description.trim() || undefined,
    });
    onOpenChange(false);
  }, [name, description, onSave, onOpenChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSave();
    }
  }, [handleSave]);

  if (!classroom) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[90vw]" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {t('classroom.editClassroom')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name field */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {t('classroom.name')}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('classroom.namePlaceholder')}
              className="w-full"
              autoFocus
            />
          </div>

          {/* Description field */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {t('classroom.description')}
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('classroom.descriptionPlaceholder')}
              className="w-full min-h-[100px] resize-none"
              rows={4}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || isLoading}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {t('settings.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
