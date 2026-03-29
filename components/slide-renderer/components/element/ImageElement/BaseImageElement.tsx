'use client';

import { useState, useEffect } from 'react';
import type { PPTImageElement } from '@/lib/types/slides';
import { useElementShadow } from '../hooks/useElementShadow';
import { useElementFlip } from '../hooks/useElementFlip';
import { useClipImage } from './useClipImage';
import { useFilter } from './useFilter';
import { ImageOutline } from './ImageOutline';
import { useMediaGenerationStore, isMediaPlaceholder, isEmbeddedMediaPlaceholder } from '@/lib/store/media-generation';
import { useSettingsStore } from '@/lib/store/settings';
import { useMediaStageId } from '@/lib/contexts/media-stage-context';
import { retryMediaTask } from '@/lib/media/media-orchestrator';
import { db } from '@/lib/utils/database';
import { RotateCcw, Paintbrush, ShieldAlert, ImageOff } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';

export interface BaseImageElementProps {
  elementInfo: PPTImageElement;
}

/**
 * Hook to resolve embedded media from IndexedDB
 */
function useEmbeddedMedia(src: string | null, stageId: string | null) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!src || !isEmbeddedMediaPlaceholder(src) || !stageId) {
      setObjectUrl(null);
      return;
    }

    let revoked = false;
    setIsLoading(true);

    const loadEmbeddedMedia = async () => {
      try {
        const compoundKey = `${stageId}:${src}`;
        const record = await db.mediaFiles.get(compoundKey);

        if (record && record.blob.size > 0) {
          const url = URL.createObjectURL(record.blob);
          if (!revoked) {
            setObjectUrl(url);
          } else {
            URL.revokeObjectURL(url);
          }
        }
      } catch (error) {
        console.error('Failed to load embedded media:', error);
      } finally {
        if (!revoked) {
          setIsLoading(false);
        }
      }
    };

    loadEmbeddedMedia();

    return () => {
      revoked = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src, stageId]);

  return { objectUrl, isLoading };
}

/**
 * Base image element component for read-only display
 */
export function BaseImageElement({ elementInfo }: BaseImageElementProps) {
  const { t } = useI18n();
  const { shadowStyle } = useElementShadow(elementInfo.shadow);
  const { flipStyle } = useElementFlip(elementInfo.flipH, elementInfo.flipV);
  const { clipShape, imgPosition } = useClipImage(elementInfo);
  const { filter } = useFilter(elementInfo.filters);

  // Extract src to a local const to help TypeScript narrow the type
  const elementSrc: string = elementInfo.src || '';

  // Only subscribe to media store when inside a classroom (stageId provided via context).
  // Homepage thumbnails have no stageId context → skip store to prevent cross-course contamination.
  const stageId = useMediaStageId();
  const isGenPlaceholder = !!stageId && isMediaPlaceholder(elementSrc);
  const isEmbeddedPlaceholder = !!stageId && isEmbeddedMediaPlaceholder(elementSrc);

  // Get AI-generated media task
  const task = useMediaGenerationStore((s) => {
    if (!isGenPlaceholder) return undefined;
    const t = s.tasks[elementSrc];
    // Only use task if it belongs to the current stage
    if (t && t.stageId !== stageId) return undefined;
    return t;
  });

  // Get embedded media from IndexedDB
  const { objectUrl: embeddedObjectUrl, isLoading: embeddedLoading } = useEmbeddedMedia(
    elementSrc || null,
    stageId || null
  );

  const imageGenerationEnabled = useSettingsStore((s) => s.imageGenerationEnabled);

  // Resolve actual src priority:
  // 1. AI-generated objectUrl (if done)
  // 2. Embedded media objectUrl (if loaded)
  // 3. Original src (base64 or URL)
  const resolvedSrc =
    (isGenPlaceholder && task?.status === 'done' && task.objectUrl)
      ? task.objectUrl
      : (isEmbeddedPlaceholder && embeddedObjectUrl)
        ? embeddedObjectUrl
        : elementSrc;

  const showDisabled = isGenPlaceholder && !task && !imageGenerationEnabled;
  const showSkeleton =
    isGenPlaceholder &&
    !showDisabled &&
    (!task || task.status === 'pending' || task.status === 'generating');
  const showEmbeddedLoading = isEmbeddedPlaceholder && embeddedLoading;
  const showError = isGenPlaceholder && task?.status === 'failed';

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
      <div className="w-full h-full" style={{ transform: `rotate(${elementInfo.rotate}deg)` }}>
        <div
          className="w-full h-full relative"
          style={{
            filter: shadowStyle ? `drop-shadow(${shadowStyle})` : '',
            transform: flipStyle,
          }}
        >
          <ImageOutline elementInfo={elementInfo} />

          <div
            className="w-full h-full overflow-hidden relative"
            style={{ clipPath: clipShape.style }}
          >
            {showDisabled ? (
              <div className="w-full h-full bg-gray-50 dark:bg-gray-900/30 flex items-center justify-center">
                <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-500 dark:text-gray-400">
                  <ImageOff className="w-3 h-3 shrink-0" />
                  <span>{t('settings.mediaGenerationDisabled')}</span>
                </div>
              </div>
            ) : showEmbeddedLoading ? (
              <div className="w-full h-full bg-gray-50 dark:bg-gray-900/30 flex items-center justify-center">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  Loading...
                </div>
              </div>
            ) : showSkeleton ? (
              <div className="w-full h-full bg-gradient-to-br from-amber-50 via-orange-50/60 to-yellow-50 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-yellow-950/20 flex items-center justify-center">
                <style>{`
                  @keyframes img-pulse-ring { 0%, 100% { opacity: 0.15; transform: scale(0.85); } 50% { opacity: 0.35; transform: scale(1.1); } }
                `}</style>
                <div className="relative w-12 h-12">
                  <div
                    className="absolute inset-0 rounded-full border-2 border-amber-300/40 dark:border-amber-500/30"
                    style={{
                      animation: 'img-pulse-ring 2.4s ease-in-out infinite',
                    }}
                  />
                  <Paintbrush
                    className="absolute inset-0 m-auto w-5 h-5 text-amber-400/80 dark:text-amber-500/70"
                    strokeWidth={1.5}
                  />
                </div>
              </div>
            ) : showError ? (
              <div className="w-full h-full bg-red-50 dark:bg-red-900/20 flex flex-col items-center justify-center gap-1.5">
                {task?.errorCode === 'CONTENT_SENSITIVE' ? (
                  <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                    <ShieldAlert className="w-3 h-3 shrink-0" />
                    <span>{t('settings.mediaContentSensitive')}</span>
                  </div>
                ) : task?.errorCode === 'GENERATION_DISABLED' ? (
                  <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-500 dark:text-gray-400">
                    <ImageOff className="w-3 h-3 shrink-0" />
                    <span>{t('settings.mediaGenerationDisabled')}</span>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      retryMediaTask(elementSrc);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 rounded hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {t('settings.mediaRetry')}
                  </button>
                )}
              </div>
            ) : resolvedSrc ? (
              <>
                <img
                  src={resolvedSrc}
                  draggable={false}
                  style={{
                    position: 'absolute',
                    top: imgPosition.top,
                    left: imgPosition.left,
                    width: imgPosition.width,
                    height: imgPosition.height,
                    filter,
                  }}
                  alt=""
                  onDragStart={(e) => e.preventDefault()}
                />
                {elementInfo.colorMask && (
                  <div
                    className="absolute inset-0"
                    style={{ backgroundColor: elementInfo.colorMask }}
                  />
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
