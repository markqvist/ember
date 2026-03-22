# Action System Deep Dive

## Overview

The Action System is a unified execution layer for all agent actions, supporting both **fire-and-forget** visual effects and **synchronous** operations like speech, video, and whiteboard interactions.

## Action Types

### Fire-and-Forget Actions

```typescript
type FireAndForgetAction =
  | { type: 'spotlight' }
  | { type: 'laser' };
```

**Behavior**: Dispatch immediately, auto-clear after 5 seconds.

**Examples**:
- Spotlight: Focus attention on an element by dimming everything else
- Laser: Point at an element with a laser pointer effect

### Synchronous Actions

```typescript
type SynchronousAction =
  | { type: 'speech' }
  | { type: 'play_video' }
  | { type: 'wb_open' }
  | { type: 'wb_draw_text' }
  | { type: 'wb_draw_shape' }
  | { type: 'wb_draw_chart' }
  | { type: 'wb_draw_latex' }
  | { type: 'wb_draw_table' }
  | { type: 'wb_draw_line' }
  | { type: 'wb_clear' }
  | { type: 'wb_delete' }
  | { type: 'wb_close' }
  | { type: 'discussion' };
```

**Behavior**: Await completion before continuing to next action.

### Action Interface

```typescript
interface Action {
  id: string;
  type: ActionType;  // 'speech' | 'spotlight' | 'laser' | 'wb_*' | 'play_video' | 'discussion'
  title?: string;
  [key: string]: unknown;
}

// Specific action types
interface SpeechAction extends Action {
  type: 'speech';
  title: string;
  text: string;
  audioId?: string;  // Pre-generated audio ID
  audioUrl?: string; // Pre-generated audio URL
}

interface SpotlightAction extends Action {
  type: 'spotlight';
  title: string;
  elementId: string;
  dimOpacity?: number;
}

interface LaserAction extends Action {
  type: 'laser';
  title: string;
  elementId: string;
  color?: string;
}

interface PlayVideoAction extends Action {
  type: 'play_video';
  title: string;
  elementId: string;
}

interface WbDrawTextAction extends Action {
  type: 'wb_draw_text';
  title: string;
  content: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontSize?: number;
  color?: string;
  elementId?: string;
}

interface WbDrawShapeAction extends Action {
  type: 'wb_draw_shape';
  title: string;
  shape: 'rectangle' | 'circle' | 'triangle';
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor?: string;
  elementId?: string;
}

interface WbDrawChartAction extends Action {
  type: 'wb_draw_chart';
  title: string;
  chartType: 'bar' | 'column' | 'line' | 'pie' | 'ring' | 'area' | 'radar' | 'scatter';
  x: number;
  y: number;
  width: number;
  height: number;
  data: {
    labels: string[];
    legends: string[];
    series: number[][];
  };
  themeColors?: string[];
  elementId?: string;
}

interface WbDrawLatexAction extends Action {
  type: 'wb_draw_latex';
  title: string;
  latex: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
  elementId?: string;
}

interface WbDrawTableAction extends Action {
  type: 'wb_draw_table';
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: string[][];
  outline?: {
    width: number;
    style: string;
    color: string;
  };
  theme?: {
    color: string;
  };
  elementId?: string;
}

interface WbDrawLineAction extends Action {
  type: 'wb_draw_line';
  title: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color?: string;
  width?: number;
  style?: 'solid' | 'dashed';
  points?: [string, string];  // ['arrow', ''] or ['', 'arrow']
  elementId?: string;
}

interface WbDeleteAction extends Action {
  type: 'wb_delete';
  title: string;
  elementId: string;
}

interface WbClearAction extends Action {
  type: 'wb_clear';
  title: string;
}

interface WbOpenAction extends Action {
  type: 'wb_open';
  title: string;
}

interface WbCloseAction extends Action {
  type: 'wb_close';
  title: string;
}

interface DiscussionAction extends Action {
  type: 'discussion';
  title: string;
  topic: string;
  prompt?: string;
  agentId: string;
}
```

## ActionEngine Architecture

### Execution Modes

```typescript
class ActionEngine {
  private stageStore: StageStore;
  private stageAPI: ReturnType<typeof createStageAPI>;
  private audioPlayer: AudioPlayer | null;
  private effectTimer: ReturnType<typeof setTimeout> | null;

  async execute(action: Action): Promise<void> {
    // Auto-open whiteboard if needed
    if (action.type.startsWith('wb_') && action.type !== 'wb_open' && action.type !== 'wb_close') {
      await this.ensureWhiteboardOpen();
    }

    switch (action.type) {
      // Fire-and-forget
      case 'spotlight':
        this.executeSpotlight(action);
        return;
      case 'laser':
        this.executeLaser(action);
        return;

      // Synchronous
      case 'speech':
        return this.executeSpeech(action);
      case 'play_video':
        return this.executePlayVideo(action);
      case 'wb_open':
        return this.executeWbOpen();
      case 'wb_draw_text':
        return this.executeWbDrawText(action);
      case 'wb_draw_shape':
        return this.executeWbDrawShape(action);
      case 'wb_draw_chart':
        return this.executeWbDrawChart(action);
      case 'wb_draw_latex':
        return this.executeWbDrawLatex(action);
      case 'wb_draw_table':
        return this.executeWbDrawTable(action);
      case 'wb_draw_line':
        return this.executeWbDrawLine(action);
      case 'wb_clear':
        return this.executeWbClear();
      case 'wb_delete':
        return this.executeWbDelete(action);
      case 'wb_close':
        return this.executeWbClose();
      case 'discussion':
        // Lifecycle managed externally
        return;
    }
  }
}
```

### Fire-and-Forget Execution

```typescript
private executeSpotlight(action: SpotlightAction): void {
  useCanvasStore.getState().setSpotlight(action.elementId, {
    dimness: action.dimOpacity ?? 0.5,
  });
  this.scheduleEffectClear();
}

private executeLaser(action: LaserAction): void {
  useCanvasStore.getState().setLaser(action.elementId, {
    color: action.color ?? '#ff0000',
  });
  this.scheduleEffectClear();
}

private scheduleEffectClear(): void {
  if (this.effectTimer) {
    clearTimeout(this.effectTimer);
  }
  this.effectTimer = setTimeout(() => {
    useCanvasStore.getState().clearAllEffects();
    this.effectTimer = null;
  }, EFFECT_AUTO_CLEAR_MS);  // 5000ms
}
```

### Synchronous Execution: Speech

```typescript
private async executeSpeech(action: SpeechAction): Promise<void> {
  if (!this.audioPlayer) return;

  return new Promise<void>((resolve) => {
    this.audioPlayer!.onEnded(() => resolve());
    this.audioPlayer!.play(action.audioId || '', action.audioUrl)
      .then((audioStarted) => {
        if (!audioStarted) resolve();
      })
      .catch(() => resolve());
  });
}
```

### Synchronous Execution: Video

```typescript
private async executePlayVideo(action: PlayVideoAction): Promise<void> {
  // Resolve video element src to media placeholder ID
  const placeholderId = this.resolveMediaPlaceholderId(action.elementId);

  if (placeholderId) {
    const task = useMediaGenerationStore.getState().getTask(placeholderId);
    if (task && task.status !== 'done') {
      // Wait for media to be ready
      await new Promise<void>((resolve) => {
        const unsubscribe = useMediaGenerationStore.subscribe((state) => {
          const t = state.tasks[placeholderId];
          if (!t || t.status === 'done' || t.status === 'failed') {
            unsubscribe();
            resolve();
          }
        });
      });
    }
  }

  useCanvasStore.getState().playVideo(action.elementId);

  // Wait until video finishes
  return new Promise<void>((resolve) => {
    const unsubscribe = useCanvasStore.subscribe((state) => {
      if (state.playingVideoElementId !== action.elementId) {
        unsubscribe();
        resolve();
      }
    });
  });
}
```

**Media Placeholder Resolution**:

```typescript
private resolveMediaPlaceholderId(elementId: string): string | null {
  const { scenes, currentSceneId } = this.stageStore.getState();

  // Search current scene first, then remaining scenes
  const orderedScenes = currentSceneId
    ? [
        scenes.find((s) => s.id === currentSceneId),
        ...scenes.filter((s) => s.id !== currentSceneId),
      ]
    : scenes;

  for (const scene of orderedScenes) {
    if (!scene || scene.type !== 'slide') continue;
    const elements = scene.content.canvas?.elements;
    if (!Array.isArray(elements)) continue;
    const el = elements.find((e: { id: string }) => e.id === elementId);
    if (el && 'src' in el && typeof el.src === 'string' && isMediaPlaceholder(el.src)) {
      return el.src;
    }
  }
  return null;
}

function isMediaPlaceholder(src: string): boolean {
  return /^gen_(img|vid)_[\w-]+$/i.test(src);
}
```

### Synchronous Execution: Whiteboard

#### Auto-Open Whiteboard

```typescript
private async ensureWhiteboardOpen(): Promise<void> {
  if (!useCanvasStore.getState().whiteboardOpen) {
    await this.executeWbOpen();
  }
}
```

#### Open Whiteboard

```typescript
private async executeWbOpen(): Promise<void> {
  this.stageAPI.whiteboard.get();
  useCanvasStore.getState().setWhiteboardOpen(true);
  await delay(2000);  // Wait for open animation
}

private async executeWbClose(): Promise<void> {
  useCanvasStore.getState().setWhiteboardOpen(false);
  await delay(700);  // Wait for close animation
}
```

#### Draw Text

```typescript
private async executeWbDrawText(action: WbDrawTextAction): Promise<void> {
  const wb = this.stageAPI.whiteboard.get();
  if (!wb.success || !wb.data) return;

  const fontSize = action.fontSize ?? 18;
  let htmlContent = action.content ?? '';
  if (!htmlContent) return;
  if (!htmlContent.startsWith('<')) {
    htmlContent = `<p style="font-size: ${fontSize}px;">${htmlContent}</p>`;
  }

  this.stageAPI.whiteboard.addElement(
    {
      id: action.elementId || '',
      type: 'text',
      content: htmlContent,
      left: action.x,
      top: action.y,
      width: action.width ?? 400,
      height: action.height ?? 100,
      rotate: 0,
      defaultFontName: 'Microsoft YaHei',
      defaultColor: action.color ?? '#333333',
    },
    wb.data.id,
  );

  await delay(800);  // Wait for fade-in animation
}
```

#### Draw Shape

```typescript
private async executeWbDrawShape(action: WbDrawShapeAction): Promise<void> {
  const wb = this.stageAPI.whiteboard.get();
  if (!wb.success || !wb.data) return;

  this.stageAPI.whiteboard.addElement(
    {
      id: action.elementId || '',
      type: 'shape',
      viewBox: [1000, 1000] as [number, number],
      path: SHAPE_PATHS[action.shape] ?? SHAPE_PATHS.rectangle,
      left: action.x,
      top: action.y,
      width: action.width,
      height: action.height,
      rotate: 0,
      fill: action.fillColor ?? '#5b9bd5',
      fixedRatio: false,
    },
    wb.data.id,
  );

  await delay(800);
}
```

**SVG Shape Paths**:

```typescript
const SHAPE_PATHS: Record<string, string> = {
  rectangle: 'M 0 0 L 1000 0 L 1000 1000 L 0 1000 Z',
  circle: 'M 500 0 A 500 500 0 1 1 499 0 Z',
  triangle: 'M 500 0 L 1000 1000 L 0 1000 Z',
};
```

#### Draw Chart

```typescript
private async executeWbDrawChart(action: WbDrawChartAction): Promise<void> {
  const wb = this.stageAPI.whiteboard.get();
  if (!wb.success || !wb.data) return;

  this.stageAPI.whiteboard.addElement(
    {
      id: action.elementId || '',
      type: 'chart',
      left: action.x,
      top: action.y,
      width: action.width,
      height: action.height,
      rotate: 0,
      chartType: action.chartType,
      data: action.data,
      themeColors: action.themeColors ?? ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4'],
    },
    wb.data.id,
  );

  await delay(800);
}
```

#### Draw LaTeX

```typescript
private async executeWbDrawLatex(action: WbDrawLatexAction): Promise<void> {
  const wb = this.stageAPI.whiteboard.get();
  if (!wb.success || !wb.data) return;

  try {
    const html = katex.renderToString(action.latex, {
      throwOnError: false,
      displayMode: true,
      output: 'html',
    });

    this.stageAPI.whiteboard.addElement(
      {
        id: action.elementId || '',
        type: 'latex',
        left: action.x,
        top: action.y,
        width: action.width ?? 400,
        height: action.height ?? 80,
        rotate: 0,
        latex: action.latex,
        html,
        color: action.color ?? '#000000',
        fixedRatio: true,
      },
      wb.data.id,
    );
  } catch (err) {
    log.warn(`Failed to render latex "${action.latex}":`, err);
    return;
  }

  await delay(800);
}
```

#### Draw Table

```typescript
private async executeWbDrawTable(action: WbDrawTableAction): Promise<void> {
  const wb = this.stageAPI.whiteboard.get();
  if (!wb.success || !wb.data) return;

  const rows = action.data.length;
  const cols = rows > 0 ? action.data[0].length : 0;
  if (rows === 0 || cols === 0) return;

  // Build colWidths: equal distribution
  const colWidths = Array(cols).fill(1 / cols);

  // Build table data
  let cellId = 0;
  const tableData = action.data.map((row) =>
    row.map((text) => ({
      id: `cell_${cellId++}`,
      colspan: 1,
      rowspan: 1,
      text,
    })),
  );

  this.stageAPI.whiteboard.addElement(
    {
      id: action.elementId || '',
      type: 'table',
      left: action.x,
      top: action.y,
      width: action.width,
      height: action.height,
      rotate: 0,
      colWidths,
      cellMinHeight: 36,
      data: tableData,
      outline: action.outline ?? {
        width: 2,
        style: 'solid',
        color: '#eeece1',
      },
      theme: action.theme
        ? {
            color: action.theme.color,
            rowHeader: true,
            rowFooter: false,
            colHeader: false,
            colFooter: false,
          }
        : undefined,
    },
    wb.data.id,
  );

  await delay(800);
}
```

#### Draw Line

```typescript
private async executeWbDrawLine(action: WbDrawLineAction): Promise<void> {
  const wb = this.stageAPI.whiteboard.get();
  if (!wb.success || !wb.data) return;

  // Calculate bounding box
  const left = Math.min(action.startX, action.endX);
  const top = Math.min(action.startY, action.endY);

  // Convert to relative coordinates
  const start: [number, number] = [action.startX - left, action.startY - top];
  const end: [number, number] = [action.endX - left, action.endY - top];

  this.stageAPI.whiteboard.addElement(
    {
      id: action.elementId || '',
      type: 'line',
      left,
      top,
      width: action.width ?? 2,
      start,
      end,
      style: action.style ?? 'solid',
      color: action.color ?? '#333333',
      points: action.points ?? ['', ''],
    },
    wb.data.id,
  );

  await delay(800);
}
```

#### Delete Element

```typescript
private async executeWbDelete(action: WbDeleteAction): Promise<void> {
  const wb = this.stageAPI.whiteboard.get();
  if (!wb.success || !wb.data) return;

  this.stageAPI.whiteboard.deleteElement(action.elementId, wb.data.id);
  await delay(300);
}
```

#### Clear Whiteboard

```typescript
private async executeWbClear(): Promise<void> {
  const wb = this.stageAPI.whiteboard.get();
  if (!wb.success || !wb.data) return;

  const elementCount = wb.data.elements?.length || 0;
  if (elementCount === 0) return;

  // Save snapshot before AI clear
  useWhiteboardHistoryStore
    .getState()
    .pushSnapshot(wb.data.elements!, getClientTranslation('whiteboard.beforeAIClear'));

  // Trigger cascade exit animation
  useCanvasStore.getState().setWhiteboardClearing(true);

  // Calculate animation duration
  const animMs = Math.min(380 + elementCount * 55, 1400);
  await delay(animMs);

  // Actually remove elements
  this.stageAPI.whiteboard.update({ elements: [] }, wb.data.id);
  useCanvasStore.getState().setWhiteboardClearing(false);
}
```

**Animation Calculation**:
- Base: 380ms
- Per element: 55ms
- Cap: 1400ms

## Tool Schema & Validation

### Effective Actions

```typescript
export function getEffectiveActions(allowedActions: string[], sceneType?: string): string[] {
  if (!sceneType || sceneType === 'slide') return allowedActions;
  return allowedActions.filter(
    (a) => !SLIDE_ONLY_ACTIONS.includes(a as (typeof SLIDE_ONLY_ACTIONS)[number]),
  );
}
```

**SLIDE_ONLY_ACTIONS**:
- `spotlight`
- `laser`

**Behavior**: These actions are removed for non-slide scenes (quiz, interactive, PBL).

### Action Descriptions

```typescript
export function getActionDescriptions(allowedActions: string[]): string {
  const descriptions: Record<string, string> = {
    spotlight:
      'Focus attention on a single key element by dimming everything else. Use sparingly — max 1-2 per response. Parameters: { elementId: string, dimOpacity?: number }',
    laser:
      'Point at an element with a laser pointer effect. Parameters: { elementId: string, color?: string }',
    wb_open:
      'Open the whiteboard for hand-drawn explanations, formulas, diagrams, or step-by-step derivations. Creates a new whiteboard if none exists. Call this before adding elements. Parameters: {}',
    wb_draw_text:
      'Add text to the whiteboard. Use for writing formulas, steps, or key points. Parameters: { content: string, x: number, y: number, width?: number, height?: number, fontSize?: number, color?: string, elementId?: string }',
    wb_draw_shape:
      'Add a shape to the whiteboard. Use for diagrams and visual explanations. Parameters: { shape: "rectangle"|"circle"|"triangle", x: number, y: number, width: number, height: number, fillColor?: string, elementId?: string }',
    wb_draw_chart:
      'Add a chart to the whiteboard. Use for data visualization (bar charts, line graphs, pie charts, etc.). Parameters: { chartType: "bar"|"column"|"line"|"pie"|"ring"|"area"|"radar"|"scatter", x: number, y: number, width: number, height: number, data: { labels: string[], legends: string[], series: number[][] }, themeColors?: string[], elementId?: string }',
    wb_draw_latex:
      'Add a LaTeX formula to the whiteboard. Use for mathematical equations and scientific notation. Parameters: { latex: string, x: number, y: number, width?: number, height?: number, color?: string, elementId?: string }',
    wb_draw_table:
      'Add a table to the whiteboard. Use for structured data display and comparisons. Parameters: { x: number, y: number, width: number, height: number, data: string[][] (first row is header), outline?: { width: number, style: string, color: string }, theme?: { color: string }, elementId?: string }',
    wb_draw_line:
      'Add a line or arrow to the whiteboard. Use for connecting elements, drawing relationships, flow diagrams, or annotations. Parameters: { startX: number, startY: number, endX: number, endY: number, color?: string (default "#333333"), width?: number (line thickness, default 2), style?: "solid"|"dashed" (default "solid"), points?: [startMarker, endMarker] where marker is ""|"arrow" (default ["",""]), elementId?: string }',
    wb_clear:
      'Clear all elements from the whiteboard. Use when whiteboard is too crowded before adding new elements. Parameters: {}',
    wb_delete:
      'Delete a specific element from the whiteboard by its ID. Use to remove an outdated, incorrect, or overlapping element without clearing the entire board. Parameters: { elementId: string }',
    wb_close:
      'Close the whiteboard and return to the slide view. Always close after you finish drawing. Parameters: {}',
    play_video:
      'Start playback of a video element on the current slide. Synchronous — blocks until the video finishes playing. Use a speech action before this to introduce the video. Parameters: { elementId: string }',
  };

  if (allowedActions.length === 0) {
    return 'You have no actions available. You can only speak to students.';
  }

  const lines = allowedActions
    .filter((action) => descriptions[action])
    .map((action) => `- ${action}: ${descriptions[action]}`);

  return lines.join('\n');
}
```

## Whiteboard Animation System

### Fade-In Animation

```typescript
await delay(800);  // Whiteboard elements
```

**Timing**: 800ms fade-in from opacity 0 to 1.

### Cascade Exit Animation

```typescript
const animMs = Math.min(380 + elementCount * 55, 1400);
await delay(animMs);
```

**Timing**:
- Base: 380ms (first element)
- Per element: 55ms
- Cap: 1400ms

**Effect**: Elements cascade out from bottom to top.

### Open/Close Animations

```typescript
// Open
await delay(2000);  // Slow spring animation

// Close
await delay(700);  // Fast ease-out tween
```

## Performance Considerations

### Timer Management

```typescript
private effectTimer: ReturnType<typeof setTimeout> | null;

private scheduleEffectClear(): void {
  if (this.effectTimer) {
    clearTimeout(this.effectTimer);
  }
  this.effectTimer = setTimeout(() => {
    useCanvasStore.getState().clearAllEffects();
    this.effectTimer = null;
  }, EFFECT_AUTO_CLEAR_MS);  // 5000ms
}
```

**Cleanup**: `dispose()` method cancels timers when engine is no longer needed.

### Animation Delays

- **Whiteboard elements**: 800ms fade-in
- **Whiteboard clear**: 380ms + 55ms × elementCount (capped at 1400ms)
- **Whiteboard open**: 2000ms (spring animation)
- **Whiteboard close**: 700ms (ease-out tween)

### Synchronous Execution

- **Speech**: 1 action at a time (plays audio, awaits onEnded)
- **Video**: 1 action at a time (plays video, awaits completion)
- **Whiteboard**: 1 action at a time (draws, awaits animation)
- **Discussion**: Handled externally (no execution)

## Error Handling

### LaTeX Rendering Failures

```typescript
try {
  const html = katex.renderToString(action.latex, {
    throwOnError: false,
    displayMode: true,
    output: 'html',
  });
  // Add element
} catch (err) {
  log.warn(`Failed to render latex "${action.latex}":`, err);
  return;  // Skip element
}
```

**Behavior**: Failed LaTeX elements are silently skipped.

### Whiteboard Access Failures

```typescript
const wb = this.stageAPI.whiteboard.get();
if (!wb.success || !wb.data) return;
```

**Behavior**: Whiteboard not ready → skip action.

### Media Generation Failures

```typescript
if (task && task.status !== 'done') {
  await new Promise<void>((resolve) => {
    const unsubscribe = useMediaGenerationStore.subscribe((state) => {
      const t = state.tasks[placeholderId];
      if (!t || t.status === 'done' || t.status === 'failed') {
        unsubscribe();
        resolve();
      }
    });
  });
}

if (useMediaGenerationStore.getState().tasks[placeholderId]?.status === 'failed') {
  return;  // Skip playback
}
```

**Behavior**: Wait for media to be ready or fail → skip playback if failed.

## Summary

The Action System is a comprehensive execution layer that:

1. **Supports multiple action types**: 28+ actions covering speech, visual effects, video, and whiteboard
2. **Separates execution modes**: Fire-and-forget vs synchronous
3. **Manages animations**: Fade-in, cascade exit, open/close animations
4. **Handles media resolution**: Placeholder IDs → actual URLs
5. **Validates actions**: Scene-type-specific filtering
6. **Optimizes performance**: Timer management, animation delays
7. **Provides robust error handling**: Graceful degradation at multiple levels

The system's modularity enables:
- Custom whiteboard animations
- Media generation integration
- Scene-type-specific action filtering
- Action validation and error handling
- Media placeholder resolution
