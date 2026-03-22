# Playback Engine Deep Dive

## Overview

The Playback Engine is a unified state machine that manages lecture playback and live discussion interaction. It seamlessly transitions between different modes while preserving state for pause/resume functionality.

## State Machine

### Mode Hierarchy

```
idle ──────────────────→ playing ──────────────→ paused
     │                         │                       │
     │                         │  resume()             │
     │                         └───────────────────────┘
     │
     │  handleEndDiscussion()
     │                         confirmDiscussion()
     │                         / handleUserInterrupt()
     │                              │
     │                              ▼         pause()
     └──────────────────────── live ──────────────→ paused
                                 ▲                    │
                                 │ resume / user msg  │
                                 └────────────────────┘
```

### State Definitions

```typescript
type EngineMode = 'idle' | 'playing' | 'paused' | 'live';

interface PlaybackSnapshot {
  sceneIndex: number;
  actionIndex: number;
  consumedDiscussions: Set<string>;
  sceneId: string;
}
```

## Core Operations

### Initialization

```typescript
constructor(
  scenes: Scene[],
  actionEngine: ActionEngine,
  audioPlayer: AudioPlayer,
  callbacks: PlaybackEngineCallbacks = {},
) {
  this.scenes = scenes;
  this.sceneId = scenes[0]?.id;
  this.actionEngine = actionEngine;
  this.audioPlayer = audioPlayer;
  this.callbacks = callbacks;
}
```

### Playback Control

#### Start (from idle)

```typescript
start(): void {
  if (this.mode !== 'idle') {
    log.warn('Cannot start: not idle, current mode:', this.mode);
    return;
  }

  this.sceneIndex = 0;
  this.actionIndex = 0;
  this.setMode('playing');
  this.processNext();
}
```

#### Continue (from idle, after discussion)

```typescript
continuePlayback(): void {
  if (this.mode !== 'idle') {
    log.warn('Cannot continue: not idle, current mode:', this.mode);
    return;
  }
  this.setMode('playing');
  this.processNext();
}
```

#### Pause

```typescript
pause(): void {
  if (this.mode === 'playing') {
    // Cancel pending timers
    if (this.triggerDelayTimer) {
      clearTimeout(this.triggerDelayTimer);
      this.triggerDelayTimer = null;
    }
    if (this.speechTimer) {
      this.speechTimerRemaining = Math.max(
        0,
        this.speechTimerRemaining - (Date.now() - this.speechTimerStart),
      );
      clearTimeout(this.speechTimer);
      this.speechTimer = null;
    }
    this.setMode('paused');
    // Freeze TTS
    if (!this.currentTrigger) {
      if (this.browserTTSActive) {
        // Cancel+re-speak pattern
        this.browserTTSPausedChunks = this.browserTTSChunks.slice(this.browserTTSChunkIndex);
        window.speechSynthesis?.cancel();
      } else if (this.audioPlayer.isPlaying()) {
        this.audioPlayer.pause();
      }
    }
  } else if (this.mode === 'live') {
    this.setMode('paused');
    this.currentTopicState = 'pending';
  } else {
    log.warn('Cannot pause: mode is', this.mode);
  }
}
```

#### Resume

```typescript
resume(): void {
  if (this.mode !== 'paused') {
    log.warn('Cannot resume: not paused, mode is', this.mode);
    return;
  }

  if (this.currentTopicState === 'pending') {
    // Resume discussion → live
    this.currentTopicState = 'active';
    this.setMode('live');
  } else if (this.currentTrigger) {
    // Waiting on ProactiveCard — just resume mode
    this.setMode('playing');
  } else {
    // Resume lecture
    this.setMode('playing');
    if (this.browserTTSPausedChunks.length > 0) {
      // Browser TTS was paused via cancel — re-speak
      this.browserTTSActive = true;
      this.browserTTSChunks = this.browserTTSPausedChunks;
      this.browserTTSChunkIndex = 0;
      this.browserTTSPausedChunks = [];
      this.playBrowserTTSChunk();
    } else if (this.audioPlayer.hasActiveAudio()) {
      this.audioPlayer.resume();
    } else if (this.speechTimerRemaining > 0) {
      // Reading timer was paused — reschedule
      this.speechTimerStart = Date.now();
      this.speechTimer = setTimeout(() => {
        this.speechTimer = null;
        this.speechTimerRemaining = 0;
        this.callbacks.onSpeechEnd?.();
        if (this.mode === 'playing') this.processNext();
      }, this.speechTimerRemaining);
    } else {
      this.processNext();
    }
  }
}
```

#### Stop

```typescript
stop(): void {
  this.setMode('idle');
  this.audioPlayer.stop();
  this.cancelBrowserTTS();
  this.actionEngine.clearEffects();
  if (this.triggerDelayTimer) {
    clearTimeout(this.triggerDelayTimer);
    this.triggerDelayTimer = null;
  }
  if (this.speechTimer) {
    clearTimeout(this.speechTimer);
    this.speechTimer = null;
  }
  this.speechTimerRemaining = 0;
  this.sceneIndex = 0;
  this.actionIndex = 0;
  this.savedSceneIndex = null;
  this.savedActionIndex = null;
  this.currentTopicState = null;
  this.currentTrigger = null;
}
```

### Discussion Lifecycle

#### Confirm Discussion (User joins)

```typescript
confirmDiscussion(): void {
  if (!this.currentTrigger) {
    log.warn('confirmDiscussion called but no trigger');
    return;
  }

  // Mark consumed so it won't re-trigger on replay
  this.consumedDiscussions.add(this.currentTrigger.id);

  // Save lecture state
  this.savedSceneIndex = this.sceneIndex;
  this.savedActionIndex = this.actionIndex;

  // Enter live mode
  this.currentTopicState = 'active';
  this.setMode('live');

  // Notify callbacks
  this.callbacks.onProactiveHide?.();
  this.callbacks.onDiscussionConfirmed?.(
    this.currentTrigger.question,
    this.currentTrigger.prompt,
    this.currentTrigger.agentId,
  );
  this.currentTrigger = null;
}
```

#### Skip Discussion

```typescript
skipDiscussion(): void {
  if (this.currentTrigger) {
    this.consumedDiscussions.add(this.currentTrigger.id);
    this.currentTrigger = null;
  }
  this.callbacks.onProactiveHide?.();

  if (this.mode === 'playing') {
    this.processNext();
  }
}
```

#### End Discussion

```typescript
handleEndDiscussion(): void {
  this.actionEngine.clearEffects();
  this.currentTopicState = 'closed';

  // Close whiteboard if it was open during discussion
  useCanvasStore.getState().setWhiteboardOpen(false);

  this.callbacks.onDiscussionEnd?.();

  // Restore lecture state
  if (this.savedSceneIndex !== null && this.savedActionIndex !== null) {
    this.sceneIndex = this.savedSceneIndex;
    this.actionIndex = this.savedActionIndex;
    this.savedSceneIndex = null;
    this.savedActionIndex = null;
  }

  this.setMode('idle');
}
```

### User Interruption

```typescript
handleUserInterrupt(text: string): void {
  if (this.mode === 'playing' || this.mode === 'paused') {
    // Save lecture state
    if (this.savedSceneIndex === null) {
      this.savedSceneIndex = this.sceneIndex;
      this.savedActionIndex = Math.max(0, this.actionIndex - 1);
    }

    // Cancel pending trigger delay
    if (this.triggerDelayTimer) {
      clearTimeout(this.triggerDelayTimer);
      this.triggerDelayTimer = null;
    }
  }

  this.currentTopicState = 'active';
  this.setMode('live');
  this.audioPlayer.stop();
  this.cancelBrowserTTS();
  this.callbacks.onUserInterrupt?.(text);
}
```

## Core Processing Loop

### Process Next Action

```typescript
private async processNext(): Promise<void> {
  if (this.mode !== 'playing') return;

  // Check for scene boundary
  if (this.actionIndex === 0 && this.sceneIndex < this.scenes.length) {
    const scene = this.scenes[this.sceneIndex];
    this.actionEngine.clearEffects();
    this.callbacks.onSceneChange?.(scene.id);
    this.callbacks.onSpeakerChange?.('teacher');
  }

  const current = this.getCurrentAction();
  if (!current) {
    // All scenes complete
    this.actionEngine.clearEffects();
    this.setMode('idle');
    this.callbacks.onComplete?.();
    return;
  }

  const { action } = current;

  // Notify progress
  this.callbacks.onProgress?.(this.getSnapshot());

  this.actionIndex++;

  switch (action.type) {
    case 'speech': {
      const speechAction = action as SpeechAction;
      this.callbacks.onSpeechStart?.(speechAction.text);

      this.audioPlayer.onEnded(() => {
        this.callbacks.onSpeechEnd?.();
        if (this.mode === 'playing') {
          this.processNext();
        }
      });

      const scheduleReadingTimer = () => {
        const text = speechAction.text;
        const cjkCount = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
        const isCJK = cjkCount > text.length * 0.3;
        const speed = this.callbacks.getPlaybackSpeed?.() ?? 1;
        const rawMs = isCJK
          ? Math.max(2000, text.length * 150)
          : Math.max(2000, text.split(/\s+/).filter(Boolean).length * 240);
        const readingMs = rawMs / speed;
        this.speechTimerStart = Date.now();
        this.speechTimerRemaining = readingMs;
        this.speechTimer = setTimeout(() => {
          this.speechTimer = null;
          this.speechTimerRemaining = 0;
          this.callbacks.onSpeechEnd?.();
          if (this.mode === 'playing') this.processNext();
        }, readingMs);
      };

      this.audioPlayer
        .play(speechAction.audioId || '', speechAction.audioUrl)
        .then((audioStarted) => {
          if (!audioStarted) {
            const settings = useSettingsStore.getState();
            if (
              settings.ttsEnabled &&
              settings.ttsProviderId === 'browser-native-tts' &&
              typeof window !== 'undefined' &&
              window.speechSynthesis
            ) {
              this.playBrowserTTS(speechAction);
            } else {
              scheduleReadingTimer();
            }
          }
        })
        .catch((err) => {
          log.error('TTS error:', err);
          scheduleReadingTimer();
        });
      break;
    }

    case 'spotlight':
    case 'laser': {
      this.actionEngine.execute(action);
      this.callbacks.onEffectFire?.({
        kind: action.type,
        targetId: action.elementId,
        ...(action.type === 'spotlight' ? { dimOpacity: action.dimOpacity } : { color: action.color }),
      } as Effect);
      this.processNext();
      break;
    }

    case 'discussion': {
      const discussionAction = action as DiscussionAction;
      if (this.consumedDiscussions.has(discussionAction.id)) {
        this.processNext();
        return;
      }
      if (
        discussionAction.agentId &&
        this.callbacks.isAgentSelected &&
        !this.callbacks.isAgentSelected(discussionAction.agentId)
      ) {
        this.consumedDiscussions.add(discussionAction.id);
        this.processNext();
        return;
      }

      const trigger: TriggerEvent = {
        id: discussionAction.id,
        question: discussionAction.topic,
        prompt: discussionAction.prompt,
        agentId: discussionAction.agentId,
      };

      this.triggerDelayTimer = setTimeout(() => {
        this.triggerDelayTimer = null;
        if (this.mode !== 'playing') return;
        this.currentTrigger = trigger;
        this.callbacks.onProactiveShow?.(trigger);
      }, 3000);
      break;
    }

    case 'wb_open':
    case 'wb_draw_text':
    case 'wb_draw_shape':
    case 'wb_draw_chart':
    case 'wb_draw_latex':
    case 'wb_draw_table':
    case 'wb_draw_line':
    case 'wb_clear':
    case 'wb_delete':
    case 'wb_close':
    case 'play_video': {
      await this.actionEngine.execute(action);
      if (this.mode === 'playing') {
        this.processNext();
      }
      break;
    }

    default:
      this.processNext();
      break;
  }
}
```

### Get Current Action

```typescript
private getCurrentAction(): { action: Action; sceneId: string } | null {
  while (this.sceneIndex < this.scenes.length) {
    const scene = this.scenes[this.sceneIndex];
    const actions = scene.actions || [];

    if (this.actionIndex < actions.length) {
      return { action: actions[this.actionIndex], sceneId: scene.id };
    }

    // Move to next scene
    this.sceneIndex++;
    this.actionIndex = 0;
  }
  return null;
}
```

### Is Exhausted

```typescript
isExhausted(): boolean {
  let si = this.sceneIndex;
  let ai = this.actionIndex;
  while (si < this.scenes.length) {
    const actions = this.scenes[si].actions || [];
    while (ai < actions.length) {
      const action = actions[ai];
      if (action.type === 'discussion' && this.consumedDiscussions.has(action.id)) {
        ai++;
        continue;
      }
      return false;
    }
    si++;
    ai = 0;
  }
  return true;
}
```

## Browser Native TTS

### Sentence Chunking

```typescript
private splitIntoChunks(text: string): string[] {
  // Split on sentence-ending punctuation (Latin + CJK) and newlines
  const chunks = text
    .split(/(?<=[.!?。！？\n])\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return chunks.length > 0 ? chunks : [text];
}
```

**Rationale**: Chrome bug workaround for utterances >~15s cutoff.

### Play Chunk

```typescript
private async playBrowserTTSChunk(): Promise<void> {
  if (this.browserTTSChunkIndex >= this.browserTTSChunks.length) {
    this.browserTTSActive = false;
    this.browserTTSChunks = [];
    this.callbacks.onSpeechEnd?.();
    if (this.mode === 'playing') this.processNext();
    return;
  }

  const settings = useSettingsStore.getState();
  const chunkText = this.browserTTSChunks[this.browserTTSChunkIndex];
  const utterance = new SpeechSynthesisUtterance(chunkText);

  // Apply settings
  const speed = this.callbacks.getPlaybackSpeed?.() ?? 1;
  utterance.rate = (settings.ttsSpeed ?? 1) * speed;
  utterance.volume = settings.ttsMuted ? 0 : (settings.ttsVolume ?? 1);

  // Ensure voices are loaded
  const voices = await this.ensureVoicesLoaded();

  // Set voice
  let voiceFound = false;
  if (settings.ttsVoice && settings.ttsVoice !== 'default') {
    const voice = voices.find((v) => v.voiceURI === settings.ttsVoice);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
      voiceFound = true;
    }
  }
  if (!voiceFound) {
    const cjkRatio = (chunkText.match(/[\u4e00-\u9fff]/g) || []).length / chunkText.length;
    utterance.lang = cjkRatio > 0.3 ? 'zh-CN' : 'en-US';
  }

  utterance.onend = () => {
    this.browserTTSChunkIndex++;
    if (this.mode === 'playing') {
      this.playBrowserTTSChunk();
    }
  };

  utterance.onerror = (event) => {
    if (event.error !== 'canceled') {
      log.warn('Browser TTS chunk error:', event.error);
      this.browserTTSChunkIndex++;
      if (this.mode === 'playing') {
        this.playBrowserTTSChunk();
      }
    }
  };

  // Chrome bug workaround
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
```

### Voices Loading

```typescript
private cachedVoices: SpeechSynthesisVoice[] | null = null;
private async ensureVoicesLoaded(): Promise<SpeechSynthesisVoice[]> {
  if (this.cachedVoices && this.cachedVoices.length > 0) {
    return this.cachedVoices;
  }

  let voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    this.cachedVoices = voices;
    return voices;
  }

  // Chrome: voices load asynchronously
  await new Promise<void>((resolve) => {
    const onVoicesChanged = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
      resolve();
    };
    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
    setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
      resolve();
    }, 2000);
  });

  voices = window.speechSynthesis.getVoices();
  this.cachedVoices = voices;
  return voices;
}
```

### Cancel TTS

```typescript
private cancelBrowserTTS(): void {
  if (this.browserTTSActive) {
    this.browserTTSActive = false;
    this.browserTTSChunks = [];
    this.browserTTSChunkIndex = 0;
    this.browserTTSPausedChunks = [];
    window.speechSynthesis?.cancel();
  }
}
```

## Progress Tracking

### Snapshot

```typescript
getSnapshot(): PlaybackSnapshot {
  return {
    sceneIndex: this.sceneIndex,
    actionIndex: this.actionIndex,
    consumedDiscussions: [...this.consumedDiscussions],
    sceneId: this.sceneId,
  };
}
```

### Restore

```typescript
restoreFromSnapshot(snapshot: PlaybackSnapshot): void {
  this.sceneIndex = snapshot.sceneIndex;
  this.actionIndex = snapshot.actionIndex;
  this.consumedDiscussions = new Set(snapshot.consumedDiscussions);
}
```

**Usage**: Pause/resume functionality.

## Performance Considerations

### Timer Management

- **Trigger delay**: 3s delay before ProactiveCard
- **Speech timer**: Reading time for pre-generated audio
- **Browser TTS timer**: Sentence-level chunk processing

### State Preservation

- **Discussion end**: Saves sceneIndex, actionIndex
- **User interruption**: Saves sceneIndex, actionIndex-1 (to replay interrupted speech)
- **Browser TTS pause**: Saves remaining chunks for resume

### Mode Transitions

- **Playing → Paused**: Cancel timers, freeze TTS
- **Paused → Playing**: Resume TTS or schedule reading timer
- **Live → Paused**: Abort SSE, truncate, topic pending
- **Live → Live**: User message → interrupt → live

## Error Handling

### Speech Playback Failures

```typescript
.catch((err) => {
  log.error('TTS error:', err);
  scheduleReadingTimer();
});
```

**Behavior**: Falls back to reading timer (browser TTS not available).

### Browser TTS Failures

```typescript
utterance.onerror = (event) => {
  if (event.error !== 'canceled') {
    log.warn('Browser TTS chunk error:', event.error);
    this.browserTTSChunkIndex++;
    if (this.mode === 'playing') {
      this.playBrowserTTSChunk();
    }
  }
};
```

**Behavior**: Skips failed chunk, tries next.

### Invalid Discussion Actions

```typescript
if (this.consumedDiscussions.has(discussionAction.id)) {
  this.processNext();
  return;
}
```

**Behavior**: Skips already-consumed discussions.

### Agent Selection Validation

```typescript
if (discussionAction.agentId && this.callbacks.isAgentSelected && !this.callbacks.isAgentSelected(discussionAction.agentId)) {
  this.consumedDiscussions.add(discussionAction.id);
  this.processNext();
  return;
}
```

**Behavior**: Skips discussions for unselected agents.

## Summary

The Playback Engine is a robust state machine that:

1. **Manages multiple modes**: idle, playing, paused, live
2. **Preserves state**: Snapshots for pause/resume
3. **Handles interruptions**: User messages → live mode
4. **Supports discussions**: Trigger → confirm → end lifecycle
5. **Manages TTS**: Pre-generated audio OR browser-native TTS
6. **Tracks progress**: Scene/Action indices, consumed discussions
7. **Optimizes performance**: Timer management, state preservation

The system's modularity enables:
- Custom playback callbacks
- Agent selection validation
- Browser TTS configuration
- Reading speed customization
- State snapshot/restore
- Discussion lifecycle hooks
