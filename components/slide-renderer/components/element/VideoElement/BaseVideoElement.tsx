'use client';

import { useRef, useEffect, useState } from 'react';
import { useAnimate } from 'motion/react';
import type { PPTVideoElement } from '@/lib/types/slides';
import { useCanvasStore } from '@/lib/store/canvas';
import { useMediaGenerationStore, isMediaPlaceholder, isEmbeddedMediaPlaceholder } from '@/lib/store/media-generation';
import { useSettingsStore } from '@/lib/store/settings';
import { useMediaStageId } from '@/lib/contexts/media-stage-context';
import { retryMediaTask } from '@/lib/media/media-orchestrator';
import { db } from '@/lib/utils/database';
import { RotateCcw, Film, ShieldAlert, VideoOff } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { createLogger } from '@/lib/logger';

const log = createLogger('BaseVideoElement');

export interface BaseVideoElementProps {
  elementInfo: PPTVideoElement;
}

/**
 * Hook to resolve embedded video from IndexedDB
 */
function useEmbeddedVideo(src: string | null, stageId: string | null) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!src || !isEmbeddedMediaPlaceholder(src)) {
      setObjectUrl(null);
      return;
    }

    let revoked = false;
    setIsLoading(true);

    const loadEmbeddedVideo = async () => {
      try {
        let record = null;

        // Try stageId key first if available
        if (stageId) {
          const stageKey = `${stageId}:${src}`;
          record = await db.mediaFiles.get(stageKey);
        }

        // Fall back to editor key for editor previews
        if (!record) {
          const editorKey = `editor:${src}`;
          record = await db.mediaFiles.get(editorKey);
        }

        if (record && record.blob.size > 0) {
          const url = URL.createObjectURL(record.blob);
          if (!revoked) {
            setObjectUrl(url);
          } else {
            URL.revokeObjectURL(url);
          }
        }
      } catch (error) {
        console.error('Failed to load embedded video:', error);
      } finally {
        if (!revoked) {
          setIsLoading(false);
        }
      }
    };

    loadEmbeddedVideo();

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
 * Base video element component for read-only/presentation display.
 * Controlled exclusively by the canvas store via the play_video action.
 * Videos never autoplay — they wait for an explicit play_video action.
 */
export function BaseVideoElement({ elementInfo }: BaseVideoElementProps) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const playingVideoElementId = useCanvasStore.use.playingVideoElementId();
  const presentationPaused = useCanvasStore.use.presentationPaused();
  const prevPlayingRef = useRef('');
  const playInitiatedRef = useRef(false); // Guard against effect double-invocation
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const renderCountRef = useRef(0);

  // Debug: log render count to detect remounts
  renderCountRef.current++;
  if (renderCountRef.current <= 5 || renderCountRef.current % 10 === 0) {
    log.info(`[${elementInfo.id}] RENDER #${renderCountRef.current}`);
  }

  // Extract src to a local const
  const elementSrc = elementInfo.src || '';

  // Only subscribe to media store when inside a classroom (stageId provided via context).
  const stageId = useMediaStageId();
  const isGenPlaceholder = isMediaPlaceholder(elementSrc);
  const isEmbeddedPlaceholder = isEmbeddedMediaPlaceholder(elementSrc);

  // Get AI-generated video task
  const task = useMediaGenerationStore((s) => {
    if (!isGenPlaceholder) return undefined;
    const t = s.tasks[elementSrc];
    if (t && t.stageId !== stageId) return undefined;
    return t;
  });

  // Get embedded video from IndexedDB
  const { objectUrl: embeddedObjectUrl, isLoading: embeddedLoading } = useEmbeddedVideo(
    elementSrc || null,
    stageId || null
  );

  const videoGenerationEnabled = useSettingsStore((s) => s.videoGenerationEnabled);

  // Resolve actual src priority:
  // 1. AI-generated objectUrl (if done)
  // 2. Embedded video objectUrl (if loaded)
  // 3. Original src (base64 or URL)
  const resolvedSrc =
    (isGenPlaceholder && task?.status === 'done' && task.objectUrl)
      ? task.objectUrl
      : (isEmbeddedPlaceholder && embeddedObjectUrl)
        ? embeddedObjectUrl
        : elementSrc;

  const showDisabled = isGenPlaceholder && !task && !videoGenerationEnabled;
  const showSkeleton =
    isGenPlaceholder &&
    !showDisabled &&
    (!task || task.status === 'pending' || task.status === 'generating');
  const showEmbeddedLoading = isEmbeddedPlaceholder && embeddedLoading;
  const showError = isGenPlaceholder && task?.status === 'failed';
  const isReady = (!isGenPlaceholder && !isEmbeddedPlaceholder) || task?.status === 'done' || (isEmbeddedPlaceholder && embeddedObjectUrl);

  // Mount/unmount lifecycle: ensure video is paused on mount, and cleanup on unmount
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      log.info(`[${elementInfo.id}] Mount: ensuring video is paused`);
      video.pause();
    }
    
    return () => {
      // Cleanup on unmount: pause if still playing to prevent ghost audio
      const videoOnUnmount = videoRef.current;
      if (videoOnUnmount && !videoOnUnmount.paused) {
        log.info(`[${elementInfo.id}] Unmount cleanup: pausing active video`);
        videoOnUnmount.pause();
      }
      // Reset playInitiated on unmount so fresh component can play
      playInitiatedRef.current = false;
    };
  }, [elementInfo.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      log.info(`[${elementInfo.id}] Effect: no video ref, skipping`);
      return;
    }

    log.info(`[${elementInfo.id}] Effect: storeId=${playingVideoElementId}, prevId=${prevPlayingRef.current}, presentationPaused=${presentationPaused}, video.paused=${video.paused}`);

    // If presentation is globally paused, pause this video regardless of playingVideoElementId
    if (presentationPaused) {
      if (!video.paused) {
        log.info(`[${elementInfo.id}] PAUSE: presentationPaused=true, video was playing`);
        video.pause();
      } else {
        log.info(`[${elementInfo.id}] SKIP: presentationPaused=true, video already paused`);
      }
      return;
    }

    const isMe = playingVideoElementId === elementInfo.id;
    const wasMe = prevPlayingRef.current === elementInfo.id;
    prevPlayingRef.current = playingVideoElementId;

    if (isMe && !wasMe) {
      // Guard: prevent double-invocation from React StrictMode or rapid re-renders
      if (playInitiatedRef.current) {
        log.info(`[${elementInfo.id}] SKIP PLAY: playInitiatedRef=true (already initiated)`);
      } else if (video.paused) {
        // "Tap" press animation — a deliberate, teacher-paced click feel
        animate(
          scope.current,
          { scale: [1, 1.035, 1] },
          {
            duration: 0.6,
            ease: [0.25, 0.1, 0.25, 1],
            times: [0, 0.35, 1],
          },
        );
        
        playInitiatedRef.current = true;
        log.info(`[${elementInfo.id}] PLAY: isMe=true, wasMe=false, video.paused=true -> calling play()`);
        video.play().catch((err) => {
          log.warn(`[${elementInfo.id}] play() failed:`, err);
          playInitiatedRef.current = false; // Reset on failure
        });
      } else {
        log.info(`[${elementInfo.id}] SKIP PLAY: isMe=true, wasMe=false, but video.paused=false (already playing)`);
      }
    } else if (!isMe && wasMe) {
      // Guard: only call pause() if video is actually playing
      if (!video.paused) {
        log.info(`[${elementInfo.id}] PAUSE: isMe=false, wasMe=true, video.paused=false -> calling pause()`);
        video.pause();
      } else {
        log.info(`[${elementInfo.id}] SKIP PAUSE: isMe=false, wasMe=true, but video.paused=true (already paused)`);
      }
      // Reset playInitiated when we're no longer the active video
      playInitiatedRef.current = false;
    } else {
      log.info(`[${elementInfo.id}] NO-OP: isMe=${isMe}, wasMe=${wasMe}`);
    }
  }, [playingVideoElementId, presentationPaused, elementInfo.id, animate, scope]);

  const handleEnded = () => {
    log.info(`[${elementInfo.id}] onEnded: video playback ended naturally`);
    // Reset playInitiated so video can be replayed
    playInitiatedRef.current = false;
    if (useCanvasStore.getState().playingVideoElementId === elementInfo.id) {
      log.info(`[${elementInfo.id}] onEnded: syncing store state (pauseVideo)`);
      useCanvasStore.getState().pauseVideo();
    } else {
      log.info(`[${elementInfo.id}] onEnded: store already cleared, no action needed`);
    }
  };

  return (
    <div
      className="absolute"
      data-video-element
      style={{
        top: `${elementInfo.top}px`,
        left: `${elementInfo.left}px`,
        width: `${elementInfo.width}px`,
        height: `${elementInfo.height}px`,
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        ref={scope}
        className="w-full h-full"
        style={{ transform: `rotate(${elementInfo.rotate}deg)` }}
      >
        {showDisabled ? (
          <div className="w-full h-full bg-gray-50 dark:bg-gray-900/30 flex items-center justify-center rounded">
            <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-500 dark:text-gray-400">
              <VideoOff className="w-3 h-3 shrink-0" />
              <span>{t('settings.mediaGenerationDisabled')}</span>
            </div>
          </div>
        ) : showEmbeddedLoading ? (
          <div className="w-full h-full bg-gray-50 dark:bg-gray-900/30 flex items-center justify-center rounded">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              Loading video...
            </div>
          </div>
        ) : showSkeleton ? (
          <div className="w-full h-full bg-gradient-to-br from-indigo-50 via-violet-50/60 to-blue-50 dark:from-indigo-950/40 dark:via-violet-950/30 dark:to-blue-950/20 flex items-center justify-center rounded">
            <style>{`
              @keyframes vid-pulse-ring { 0%, 100% { opacity: 0.15; transform: scale(0.85); } 50% { opacity: 0.35; transform: scale(1.1); } }
            `}</style>
            <div className="relative w-14 h-14">
              <div
                className="absolute inset-0 rounded-full border-2 border-indigo-300/40 dark:border-indigo-500/30"
                style={{
                  animation: 'vid-pulse-ring 2.4s ease-in-out infinite',
                }}
              />
              <Film
                className="absolute inset-0 m-auto w-5 h-5 text-indigo-400/80 dark:text-indigo-500/70"
                strokeWidth={1.5}
              />
            </div>
          </div>
        ) : showError ? (
          <div className="w-full h-full bg-red-50 dark:bg-red-900/20 flex flex-col items-center justify-center gap-1.5 rounded">
            {task?.errorCode === 'CONTENT_SENSITIVE' ? (
              <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                <ShieldAlert className="w-3 h-3 shrink-0" />
                <span>{t('settings.mediaContentSensitive')}</span>
              </div>
            ) : task?.errorCode === 'GENERATION_DISABLED' ? (
              <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-500 dark:text-gray-400">
                <VideoOff className="w-3 h-3 shrink-0" />
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
        ) : (isReady && resolvedSrc) ||
          (isGenPlaceholder && task?.status === 'done') ||
          (isEmbeddedPlaceholder && embeddedObjectUrl) ? (
          <video
            ref={videoRef}
            className="w-full h-full"
            style={{ objectFit: 'contain' }}
            src={resolvedSrc}
            poster={task?.poster || elementInfo.poster}
            preload="metadata"
            controls
            onEnded={handleEnded}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-black/10 rounded">
            <svg
              className="w-12 h-12 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
