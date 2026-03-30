'use client';

import type { PPTVideoElement } from '@/lib/types/slides';
import { useMediaGenerationStore, isMediaPlaceholder } from '@/lib/store/media-generation';
import { useMediaStageId } from '@/lib/contexts/media-stage-context';
import { Film } from 'lucide-react';

export interface ThumbnailVideoElementProps {
  elementInfo: PPTVideoElement;
}

/**
 * Thumbnail video element - static preview only, no playback capability.
 * Used in slide thumbnails to avoid duplicate video players responding to store state.
 */
export function ThumbnailVideoElement({ elementInfo }: ThumbnailVideoElementProps) {
  const stageId = useMediaStageId();
  const isGenPlaceholder = isMediaPlaceholder(elementInfo.src || '');

  // Get AI-generated video task for poster
  const task = useMediaGenerationStore((s) => {
    if (!isGenPlaceholder) return undefined;
    const t = s.tasks[elementInfo.src || ''];
    if (t && t.stageId !== stageId) return undefined;
    return t;
  });

  const posterUrl = task?.poster || elementInfo.poster;

  return (
    <div
      className="absolute"
      style={{
        top: `${elementInfo.top}px`,
        left: `${elementInfo.left}px`,
        width: `${elementInfo.width}px`,
        height: `${elementInfo.height}px`,
      }}
    >
      <div
        className="w-full h-full"
        style={{ transform: `rotate(${elementInfo.rotate}deg)` }}
      >
        {posterUrl ? (
          <img
            className="w-full h-full"
            style={{ objectFit: 'contain' }}
            src={posterUrl}
            alt=""
            draggable={false}
          />
        ) : (
          <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center rounded">
            <Film className="w-6 h-6 text-gray-400" />
          </div>
        )}
      </div>
    </div>
  );
}
