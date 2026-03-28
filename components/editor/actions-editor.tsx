'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  Check,
  RotateCcw,
  Plus,
  Trash2,
  Volume2,
  Loader2,
  Play,
  Square,
  ChevronUp,
  ChevronDown,
  MessageSquare,
  Search,
  Sparkles,
  Target,
  Video,
  Palette,
  Shapes,
  Type,
  Table,
  Sigma,
  Minus,
  X,
  Eraser,
  Trash,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { generateTTS } from '@/lib/audio/tts-providers';
import { createAudioPlayer } from '@/lib/utils/audio-player';
import { TTS_PROVIDERS, DEFAULT_TTS_VOICES } from '@/lib/audio/constants';
import { db } from '@/lib/utils/database';
import { toast } from 'sonner';
import type {
  Action,
  SpeechAction,
  SpotlightAction,
  LaserAction,
  DiscussionAction,
  PlayVideoAction,
  WbOpenAction,
  WbCloseAction,
  WbClearAction,
  WbDeleteAction,
  WbDrawTextAction,
  WbDrawShapeAction,
  WbDrawChartAction,
  WbDrawLatexAction,
  WbDrawTableAction,
  WbDrawLineAction,
  ActionType,
} from '@/lib/types/action';
import type { TTSProviderId } from '@/lib/audio/types';
import type { PPTElement } from '@/lib/types/slides';

interface ActionsEditorProps {
  actions: Action[];
  onSave: (updatedActions: Action[]) => void;
  onRevert: () => void;
  elements?: PPTElement[]; // Optional slide elements for element ID selection
}

// Action type metadata for UI
interface ActionTypeMeta {
  type: ActionType;
  label: string;
  icon: React.ReactNode;
  category: 'speech' | 'visual' | 'video' | 'discussion' | 'whiteboard';
  description: string;
}

const ACTION_TYPES: ActionTypeMeta[] = [
  {
    type: 'speech',
    label: 'Speech',
    icon: <Volume2 className="w-4 h-4" />,
    category: 'speech',
    description: 'Text-to-speech narration',
  },
  {
    type: 'spotlight',
    label: 'Spotlight',
    icon: <Target className="w-4 h-4" />,
    category: 'visual',
    description: 'Focus on an element, dim others',
  },
  {
    type: 'laser',
    label: 'Laser',
    icon: <Sparkles className="w-4 h-4" />,
    category: 'visual',
    description: 'Point at an element with laser effect',
  },
  {
    type: 'play_video',
    label: 'Play Video',
    icon: <Video className="w-4 h-4" />,
    category: 'video',
    description: 'Start video playback',
  },
  {
    type: 'discussion',
    label: 'Discussion',
    icon: <MessageSquare className="w-4 h-4" />,
    category: 'discussion',
    description: 'Trigger roundtable discussion',
  },
  {
    type: 'wb_open',
    label: 'Open Whiteboard',
    icon: <Maximize2 className="w-4 h-4" />,
    category: 'whiteboard',
    description: 'Open the whiteboard overlay',
  },
  {
    type: 'wb_draw_text',
    label: 'Draw Text',
    icon: <Type className="w-4 h-4" />,
    category: 'whiteboard',
    description: 'Draw text on whiteboard',
  },
  {
    type: 'wb_draw_shape',
    label: 'Draw Shape',
    icon: <Shapes className="w-4 h-4" />,
    category: 'whiteboard',
    description: 'Draw shape on whiteboard',
  },
  {
    type: 'wb_draw_chart',
    label: 'Draw Chart',
    icon: <Palette className="w-4 h-4" />,
    category: 'whiteboard',
    description: 'Draw chart on whiteboard',
  },
  {
    type: 'wb_draw_latex',
    label: 'Draw LaTeX',
    icon: <Sigma className="w-4 h-4" />,
    category: 'whiteboard',
    description: 'Draw formula on whiteboard',
  },
  {
    type: 'wb_draw_table',
    label: 'Draw Table',
    icon: <Table className="w-4 h-4" />,
    category: 'whiteboard',
    description: 'Draw table on whiteboard',
  },
  {
    type: 'wb_draw_line',
    label: 'Draw Line',
    icon: <Minus className="w-4 h-4" />,
    category: 'whiteboard',
    description: 'Draw line/arrow on whiteboard',
  },
  {
    type: 'wb_clear',
    label: 'Clear Whiteboard',
    icon: <Eraser className="w-4 h-4" />,
    category: 'whiteboard',
    description: 'Clear all whiteboard elements',
  },
  {
    type: 'wb_delete',
    label: 'Delete Element',
    icon: <Trash className="w-4 h-4" />,
    category: 'whiteboard',
    description: 'Delete a whiteboard element',
  },
  {
    type: 'wb_close',
    label: 'Close Whiteboard',
    icon: <Minimize2 className="w-4 h-4" />,
    category: 'whiteboard',
    description: 'Close the whiteboard overlay',
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  speech: 'Speech',
  visual: 'Visual Effects',
  video: 'Video',
  discussion: 'Discussion',
  whiteboard: 'Whiteboard',
};

// ============== Helper Functions ==============

function generateActionId(): string {
  return `action_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
}

function createDefaultAction(type: ActionType): Action {
  const base = { id: generateActionId() };

  switch (type) {
    case 'speech':
      return { ...base, type: 'speech', text: '' } as SpeechAction;
    case 'spotlight':
      return { ...base, type: 'spotlight', elementId: '' } as SpotlightAction;
    case 'laser':
      return { ...base, type: 'laser', elementId: '', color: '#ff0000' } as LaserAction;
    case 'play_video':
      return { ...base, type: 'play_video', elementId: '' } as PlayVideoAction;
    case 'discussion':
      return { ...base, type: 'discussion', topic: 'New Discussion' } as DiscussionAction;
    case 'wb_open':
      return { ...base, type: 'wb_open' } as WbOpenAction;
    case 'wb_close':
      return { ...base, type: 'wb_close' } as WbCloseAction;
    case 'wb_clear':
      return { ...base, type: 'wb_clear' } as WbClearAction;
    case 'wb_delete':
      return { ...base, type: 'wb_delete', elementId: '' } as WbDeleteAction;
    case 'wb_draw_text':
      return {
        ...base,
        type: 'wb_draw_text',
        content: '',
        x: 50,
        y: 50,
        width: 400,
        height: 100,
      } as WbDrawTextAction;
    case 'wb_draw_shape':
      return {
        ...base,
        type: 'wb_draw_shape',
        shape: 'rectangle',
        x: 50,
        y: 50,
        width: 100,
        height: 100,
      } as WbDrawShapeAction;
    case 'wb_draw_chart':
      return {
        ...base,
        type: 'wb_draw_chart',
        chartType: 'bar',
        x: 50,
        y: 50,
        width: 400,
        height: 300,
        data: { labels: ['A', 'B'], legends: ['Series 1'], series: [[1, 2]] },
      } as WbDrawChartAction;
    case 'wb_draw_latex':
      return {
        ...base,
        type: 'wb_draw_latex',
        latex: 'E = mc^2',
        x: 50,
        y: 50,
        width: 400,
      } as WbDrawLatexAction;
    case 'wb_draw_table':
      return {
        ...base,
        type: 'wb_draw_table',
        x: 50,
        y: 50,
        width: 400,
        height: 200,
        data: [
          ['Header 1', 'Header 2'],
          ['Cell 1', 'Cell 2'],
        ],
      } as WbDrawTableAction;
    case 'wb_draw_line':
      return {
        ...base,
        type: 'wb_draw_line',
        startX: 100,
        startY: 100,
        endX: 300,
        endY: 100,
        color: '#333333',
        width: 2,
        style: 'solid',
        points: ['', 'arrow'],
      } as WbDrawLineAction;
    default:
      return { ...base, type: 'speech', text: '' } as SpeechAction;
  }
}

function getActionTypeMeta(type: ActionType): ActionTypeMeta | undefined {
  return ACTION_TYPES.find((t) => t.type === type);
}

function getElementPreview(element: PPTElement): string {
  switch (element.type) {
    case 'text':
      return element.content.replace(/<[^>]*>/g, '').slice(0, 60) || '(empty text)';
    case 'latex':
      return element.latex.slice(0, 60) || '(empty formula)';
    case 'image':
      return element.src.split('/').pop() || '(image)';
    case 'video':
      return element.src.split('/').pop() || '(video)';
    case 'audio':
      return element.src.split('/').pop() || '(audio)';
    case 'shape':
      return element.text?.content.replace(/<[^>]*>/g, '').slice(0, 40) || '(shape)';
    case 'chart':
      return `${element.chartType} chart`;
    case 'table':
      return `Table (${element.data.length}x${element.data[0]?.length || 0})`;
    case 'line':
      return 'Line';
    default:
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return `(${(element as any).type})`;
  }
}

// ============== Sub-Components ==============

function SpeechActionEditor({
  action,
  onChange,
  onRegenerateAudio,
  isRegenerating,
}: {
  action: SpeechAction;
  onChange: (updated: SpeechAction) => void;
  onRegenerateAudio: (action: SpeechAction) => void;
  isRegenerating: boolean;
}) {
  const { t } = useI18n();
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const [isCheckingAudio, setIsCheckingAudio] = useState(false);
  const audioPlayerRef = useRef(createAudioPlayer());

  useEffect(() => {
    const checkAudio = async () => {
      if (!action.audioId) {
        setHasAudio(false);
        return;
      }
      setIsCheckingAudio(true);
      try {
        const record = await db.audioFiles.get(action.audioId);
        setHasAudio(!!record);
      } catch {
        setHasAudio(false);
      } finally {
        setIsCheckingAudio(false);
      }
    };
    checkAudio();
  }, [action.audioId, action.audioUrl]);

  useEffect(() => {
    const player = audioPlayerRef.current;
    return () => {
      player.destroy();
    };
  }, []);

  const handlePlayPreview = async () => {
    const audioId = action.audioId;
    if (!audioId) return;

    if (isPlaying) {
      audioPlayerRef.current.stop();
      setIsPlaying(false);
      return;
    }

    try {
      setIsPlaying(true);
      audioPlayerRef.current.onEnded(() => {
        setIsPlaying(false);
      });
      const played = await audioPlayerRef.current.play(audioId, action.audioUrl);
      if (!played) {
        setIsPlaying(false);
        toast.error(t('stage.noAudioAvailable'));
      }
    } catch (error) {
      setIsPlaying(false);
      toast.error(t('stage.audioPreviewFailed') || 'Failed to play audio preview');
    }
  };

  const canPreview = hasAudio || action.audioUrl;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('stage.actionText')}</label>
        <Textarea
          value={action.text}
          onChange={(e) => onChange({ ...action, text: e.target.value })}
          placeholder="Enter speech text..."
          className="w-full min-h-[100px] text-xs resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{t('stage.audioId')}</label>
        <div className="flex gap-2">
          <Input
            value={action.audioId || ''}
            readOnly
            placeholder="No audio generated"
            className="flex-1 text-xs bg-muted"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handlePlayPreview}
            disabled={!canPreview || isCheckingAudio || isRegenerating}
            className="shrink-0 px-2"
            title={isPlaying ? t('stage.stopPreview') : t('stage.playPreview')}
          >
            {isPlaying ? (
              <Square className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRegenerateAudio(action)}
            disabled={isRegenerating}
            className="shrink-0"
            title={t('stage.regenerateAudio')}
          >
            {isRegenerating ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 mr-1" />
            )}
            {isRegenerating ? '...' : t('stage.regenerateAudio')}
          </Button>
        </div>
      </div>

      {action.audioUrl && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">URL:</span> {action.audioUrl.split('/').pop()}
        </div>
      )}
    </div>
  );
}

function ElementIdSelector({
  value,
  onChange,
  elements,
  placeholder = "Select element...",
}: {
  value: string;
  onChange: (value: string) => void;
  elements?: PPTElement[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredElements = useMemo(() => {
    if (!elements) return [];
    if (!search.trim()) return elements;
    const query = search.toLowerCase();
    return elements.filter(
      (el) =>
        el.id.toLowerCase().includes(query) ||
        getElementPreview(el).toLowerCase().includes(query)
    );
  }, [elements, search]);

  const selectedElement = elements?.find((el) => el.id === value);

  if (!elements || elements.length === 0) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Element ID"
        className="w-full text-xs"
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between text-xs font-normal"
        >
          <span className="truncate">
            {value
              ? `${value.slice(0, 30)}${value.length > 30 ? '...' : ''}`
              : placeholder}
          </span>
          <Search className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-0" align="start" onWheel={(e) => e.stopPropagation()}>
        <div className="flex items-center border-b px-3 py-2">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            className="flex h-8 w-full rounded-md bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Search by ID or content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div 
          className="max-h-[300px] overflow-y-auto overscroll-contain"
          onWheel={(e) => e.stopPropagation()}
        >
          {filteredElements.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No elements found.
            </div>
          ) : (
            <div className="p-1">
              {filteredElements.map((element) => (
                <button
                  key={element.id}
                  onClick={() => {
                    onChange(element.id);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={cn(
                    'relative flex w-full cursor-pointer select-none items-start gap-2 rounded-sm px-2 py-2 text-left text-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground',
                    value === element.id && 'bg-accent text-accent-foreground'
                  )}
                >
                  <span className="mt-0.5 shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                    {element.type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[10px] text-muted-foreground truncate">
                      {element.id}
                    </div>
                    <div className="truncate text-muted-foreground">
                      {getElementPreview(element)}
                    </div>
                  </div>
                  {value === element.id && (
                    <Check className="ml-auto h-4 w-4 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ElementActionEditor({
  action,
  onChange,
  type,
  elements,
}: {
  action: SpotlightAction | LaserAction | PlayVideoAction | WbDeleteAction;
  onChange: (updated: Action) => void;
  type: 'spotlight' | 'laser' | 'play_video' | 'wb_delete';
  elements?: PPTElement[];
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          {t('stage.actionElementId')}
        </label>
        <ElementIdSelector
          value={action.elementId}
          onChange={(elementId) => onChange({ ...action, elementId })}
          elements={elements}
        />
      </div>
      {action.type === 'laser' && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Laser Color</label>
          <div className="flex gap-2">
            <Input
              type="color"
              value={(action as LaserAction).color || '#ff0000'}
              onChange={(e) =>
                onChange({ ...(action as LaserAction), color: e.target.value })
              }
              className="w-12 h-8 p-1"
            />
            <Input
              value={(action as LaserAction).color || '#ff0000'}
              onChange={(e) =>
                onChange({ ...(action as LaserAction), color: e.target.value })
              }
              className="flex-1 text-xs"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DiscussionActionEditor({
  action,
  onChange,
}: {
  action: DiscussionAction;
  onChange: (updated: DiscussionAction) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          Topic <span className="text-destructive">*</span>
        </label>
        <Input
          value={action.topic}
          onChange={(e) => onChange({ ...action, topic: e.target.value })}
          placeholder="Discussion topic or question..."
          className="w-full text-xs"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          Custom Prompt <span className="text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          value={action.prompt || ''}
          onChange={(e) =>
            onChange({ ...action, prompt: e.target.value || undefined })
          }
          placeholder="Optional instructions for the discussion..."
          className="w-full min-h-[80px] text-xs resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">
          Starting Agent <span className="text-muted-foreground">(optional)</span>
        </label>
        <Input
          value={action.agentId || ''}
          onChange={(e) =>
            onChange({ ...action, agentId: e.target.value || undefined })
          }
          placeholder="Agent ID to start the discussion..."
          className="w-full text-xs"
        />
      </div>
    </div>
  );
}

function WhiteboardDrawTextEditor({
  action,
  onChange,
}: {
  action: WbDrawTextAction;
  onChange: (updated: WbDrawTextAction) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Content</label>
        <Textarea
          value={action.content}
          onChange={(e) => onChange({ ...action, content: e.target.value })}
          placeholder="Text content..."
          className="w-full min-h-[80px] text-xs resize-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">X Position</label>
          <Input
            type="number"
            value={action.x}
            onChange={(e) => onChange({ ...action, x: Number(e.target.value) })}
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Y Position</label>
          <Input
            type="number"
            value={action.y}
            onChange={(e) => onChange({ ...action, y: Number(e.target.value) })}
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Width</label>
          <Input
            type="number"
            value={action.width || 400}
            onChange={(e) =>
              onChange({ ...action, width: Number(e.target.value) })
            }
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Height</label>
          <Input
            type="number"
            value={action.height || 100}
            onChange={(e) =>
              onChange({ ...action, height: Number(e.target.value) })
            }
            className="text-xs"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Font Size</label>
        <Input
          type="number"
          value={action.fontSize || 18}
          onChange={(e) =>
            onChange({ ...action, fontSize: Number(e.target.value) })
          }
          className="text-xs"
        />
      </div>
    </div>
  );
}

function WhiteboardDrawShapeEditor({
  action,
  onChange,
}: {
  action: WbDrawShapeAction;
  onChange: (updated: WbDrawShapeAction) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Shape</label>
        <Select
          value={action.shape}
          onValueChange={(v: 'rectangle' | 'circle' | 'triangle') =>
            onChange({ ...action, shape: v })
          }
        >
          <SelectTrigger className="text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rectangle">Rectangle</SelectItem>
            <SelectItem value="circle">Circle</SelectItem>
            <SelectItem value="triangle">Triangle</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">X</label>
          <Input
            type="number"
            value={action.x}
            onChange={(e) => onChange({ ...action, x: Number(e.target.value) })}
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Y</label>
          <Input
            type="number"
            value={action.y}
            onChange={(e) => onChange({ ...action, y: Number(e.target.value) })}
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Width</label>
          <Input
            type="number"
            value={action.width}
            onChange={(e) =>
              onChange({ ...action, width: Number(e.target.value) })
            }
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Height</label>
          <Input
            type="number"
            value={action.height}
            onChange={(e) =>
              onChange({ ...action, height: Number(e.target.value) })
            }
            className="text-xs"
          />
        </div>
      </div>
    </div>
  );
}

function WhiteboardDrawLatexEditor({
  action,
  onChange,
}: {
  action: WbDrawLatexAction;
  onChange: (updated: WbDrawLatexAction) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">LaTeX Formula</label>
        <Textarea
          value={action.latex}
          onChange={(e) => onChange({ ...action, latex: e.target.value })}
          placeholder="E = mc^2"
          className="w-full min-h-[80px] text-xs resize-none font-mono"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">X</label>
          <Input
            type="number"
            value={action.x}
            onChange={(e) => onChange({ ...action, x: Number(e.target.value) })}
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Y</label>
          <Input
            type="number"
            value={action.y}
            onChange={(e) => onChange({ ...action, y: Number(e.target.value) })}
            className="text-xs"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Width</label>
        <Input
          type="number"
          value={action.width || 400}
          onChange={(e) =>
            onChange({ ...action, width: Number(e.target.value) })
          }
          className="text-xs"
        />
      </div>
    </div>
  );
}

function WhiteboardDrawLineEditor({
  action,
  onChange,
}: {
  action: WbDrawLineAction;
  onChange: (updated: WbDrawLineAction) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Start X</label>
          <Input
            type="number"
            value={action.startX}
            onChange={(e) =>
              onChange({ ...action, startX: Number(e.target.value) })
            }
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Start Y</label>
          <Input
            type="number"
            value={action.startY}
            onChange={(e) =>
              onChange({ ...action, startY: Number(e.target.value) })
            }
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">End X</label>
          <Input
            type="number"
            value={action.endX}
            onChange={(e) =>
              onChange({ ...action, endX: Number(e.target.value) })
            }
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">End Y</label>
          <Input
            type="number"
            value={action.endY}
            onChange={(e) =>
              onChange({ ...action, endY: Number(e.target.value) })
            }
            className="text-xs"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Line Style</label>
        <Select
          value={action.style || 'solid'}
          onValueChange={(v: 'solid' | 'dashed') =>
            onChange({ ...action, style: v })
          }
        >
          <SelectTrigger className="text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Solid</SelectItem>
            <SelectItem value="dashed">Dashed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Line Width</label>
        <Input
          type="number"
          value={action.width || 2}
          onChange={(e) =>
            onChange({ ...action, width: Number(e.target.value) })
          }
          className="text-xs"
        />
      </div>
    </div>
  );
}

function GenericActionEditor({ action }: { action: Action }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        This action type uses advanced properties. Edit in the JSON tab for full control.
      </p>
      <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-[150px]">
        {JSON.stringify(action, null, 2)}
      </pre>
    </div>
  );
}

function ActionCard({
  action,
  index,
  totalCount,
  onChange,
  onRemove,
  onMove,
  onRegenerateAudio,
  isExpanded,
  onToggle,
  regeneratingId,
  elements,
}: {
  action: Action;
  index: number;
  totalCount: number;
  onChange: (updated: Action) => void;
  onRemove: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onRegenerateAudio: (action: SpeechAction) => void;
  isExpanded: boolean;
  onToggle: () => void;
  regeneratingId: string | null;
  elements?: PPTElement[];
}) {
  const { t } = useI18n();
  const isRegenerating = action.type === 'speech' && regeneratingId === action.id;
  const typeMeta = getActionTypeMeta(action.type);

  const renderEditor = () => {
    switch (action.type) {
      case 'speech':
        return (
          <SpeechActionEditor
            action={action as SpeechAction}
            onChange={(updated) => onChange(updated)}
            onRegenerateAudio={onRegenerateAudio}
            isRegenerating={isRegenerating}
          />
        );
      case 'spotlight':
      case 'laser':
        return (
          <ElementActionEditor
            action={action as SpotlightAction | LaserAction}
            onChange={(updated) => onChange(updated)}
            type={action.type}
            elements={elements}
          />
        );
      case 'play_video':
        return (
          <ElementActionEditor
            action={action as PlayVideoAction}
            onChange={(updated) => onChange(updated)}
            type="play_video"
            elements={elements}
          />
        );
      case 'discussion':
        return (
          <DiscussionActionEditor
            action={action as DiscussionAction}
            onChange={(updated) => onChange(updated)}
          />
        );
      case 'wb_draw_text':
        return (
          <WhiteboardDrawTextEditor
            action={action as WbDrawTextAction}
            onChange={(updated) => onChange(updated)}
          />
        );
      case 'wb_draw_shape':
        return (
          <WhiteboardDrawShapeEditor
            action={action as WbDrawShapeAction}
            onChange={(updated) => onChange(updated)}
          />
        );
      case 'wb_draw_latex':
        return (
          <WhiteboardDrawLatexEditor
            action={action as WbDrawLatexAction}
            onChange={(updated) => onChange(updated)}
          />
        );
      case 'wb_draw_line':
        return (
          <WhiteboardDrawLineEditor
            action={action as WbDrawLineAction}
            onChange={(updated) => onChange(updated)}
          />
        );
      case 'wb_delete':
        return (
          <ElementActionEditor
            action={action as WbDeleteAction}
            onChange={(updated) => onChange(updated)}
            type="wb_delete"
            elements={elements}
          />
        );
      default:
        return <GenericActionEditor action={action} />;
    }
  };

  const getActionSummary = () => {
    switch (action.type) {
      case 'speech':
        const text = (action as SpeechAction).text;
        return text ? text.slice(0, 50) + (text.length > 50 ? '...' : '') : '(empty)';
      case 'discussion':
        return (action as DiscussionAction).topic;
      case 'spotlight':
      case 'laser':
      case 'play_video':
      case 'wb_delete':
        return (action as { elementId: string }).elementId || '(no element)';
      case 'wb_draw_text':
        return (action as WbDrawTextAction).content.slice(0, 40) || '(empty)';
      case 'wb_draw_latex':
        return (action as WbDrawLatexAction).latex.slice(0, 40) || '(empty)';
      default:
        return action.id.slice(0, 20);
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-mono text-muted-foreground w-6 shrink-0">
            {index + 1}
          </span>
          <span
            className={cn(
              'text-xs font-medium px-1.5 py-0.5 rounded shrink-0',
              action.type === 'speech' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
              action.type === 'spotlight' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
              action.type === 'laser' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
              action.type === 'discussion' && 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
              action.type === 'play_video' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
              action.type.startsWith('wb_') && 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
            )}
          >
            {typeMeta?.label || action.type}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {getActionSummary()}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Reorder buttons */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={index === 0}
            onClick={(e) => {
              e.stopPropagation();
              onMove('up');
            }}
            title="Move up"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={index === totalCount - 1}
            onClick={(e) => {
              e.stopPropagation();
              onMove('down');
            }}
            title="Move down"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <Trash2 className="w-3.5 h-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      {isExpanded && <div className="px-3 pb-3 pt-1 border-t">{renderEditor()}</div>}
    </div>
  );
}

function AddActionDropdown({
  onAdd,
}: {
  onAdd: (type: ActionType) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const groupedActions = useMemo(() => {
    const groups: Record<string, ActionTypeMeta[]> = {};
    ACTION_TYPES.forEach((action) => {
      if (!groups[action.category]) groups[action.category] = [];
      groups[action.category].push(action);
    });
    return groups;
  }, []);

  const filteredActions = useMemo(() => {
    if (!search.trim()) return ACTION_TYPES;
    const query = search.toLowerCase();
    return ACTION_TYPES.filter(
      (a) =>
        a.label.toLowerCase().includes(query) ||
        a.description.toLowerCase().includes(query) ||
        a.type.toLowerCase().includes(query)
    );
  }, [search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Action
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="center" onWheel={(e) => e.stopPropagation()}>
        <div className="flex items-center border-b px-3 py-2">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            className="flex h-8 w-full rounded-md bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Search action types..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div 
          className="max-h-[300px] overflow-y-auto overscroll-contain"
          onWheel={(e) => e.stopPropagation()}
        >
          {search.trim() ? (
            // Search results - flat list
            filteredActions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No action types found.
              </div>
            ) : (
              <div className="p-1">
                {filteredActions.map((action) => (
                  <button
                    key={action.type}
                    onClick={() => {
                      onAdd(action.type);
                      setOpen(false);
                      setSearch('');
                    }}
                    className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 text-left text-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {action.icon}
                    <div className="flex-1">
                      <div className="font-medium">{action.label}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {action.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : (
            // Grouped view
            Object.entries(groupedActions).map(([category, actions]) => (
              <div key={category} className="p-1">
                <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {CATEGORY_LABELS[category]}
                </div>
                {actions.map((action) => (
                  <button
                    key={action.type}
                    onClick={() => {
                      onAdd(action.type);
                      setOpen(false);
                      setSearch('');
                    }}
                    className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 text-left text-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {action.icon}
                    <div className="flex-1">
                      <div className="font-medium">{action.label}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {action.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============== Main Component ==============

export function ActionsEditor({
  actions,
  onSave,
  onRevert,
  elements,
}: ActionsEditorProps) {
  const { t } = useI18n();
  const [localActions, setLocalActions] = useState<Action[]>(actions);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [hasChanges, setHasChanges] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  // Sync with props when they change
  useEffect(() => {
    setLocalActions(actions);
    setHasChanges(false);
  }, [actions]);

  const handleActionChange = useCallback((index: number, updated: Action) => {
    setLocalActions((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
    setHasChanges(true);
  }, []);

  const handleActionRemove = useCallback(
    (index: number) => {
      setLocalActions((prev) => prev.filter((_, i) => i !== index));
      setHasChanges(true);
      if (expandedIndex === index) setExpandedIndex(null);
      else if (expandedIndex !== null && expandedIndex > index) {
        setExpandedIndex(expandedIndex - 1);
      }
    },
    [expandedIndex]
  );

  const handleActionMove = useCallback(
    (index: number, direction: 'up' | 'down') => {
      setLocalActions((prev) => {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= prev.length) return prev;
        const next = [...prev];
        const temp = next[index];
        next[index] = next[newIndex];
        next[newIndex] = temp;
        return next;
      });
      setHasChanges(true);
      if (expandedIndex === index) {
        setExpandedIndex(direction === 'up' ? index - 1 : index + 1);
      } else if (expandedIndex === (direction === 'up' ? index - 1 : index + 1)) {
        setExpandedIndex(index);
      }
    },
    [expandedIndex]
  );

  const handleAddAction = useCallback(
    (type: ActionType) => {
      const newAction = createDefaultAction(type);
      setLocalActions((prev) => [...prev, newAction]);
      setHasChanges(true);
      setExpandedIndex(localActions.length);
    },
    [localActions.length]
  );

  const handleRegenerateAudio = useCallback(
    async (action: SpeechAction) => {
      if (!action.text.trim()) {
        toast.error('Speech text is empty');
        return;
      }

      setRegeneratingId(action.id);

      try {
        const settings = useSettingsStore.getState();
        const providerId = settings.ttsProviderId;

        if (providerId === 'browser-native-tts') {
          toast.error('Please configure a server TTS provider in settings');
          return;
        }

        const providerConfig = settings.ttsProvidersConfig?.[providerId];
        const provider = TTS_PROVIDERS[providerId];

        if (!provider) {
          toast.error(`Unknown TTS provider: ${providerId}`);
          return;
        }

        const voice =
          action.voice || settings.ttsVoice || DEFAULT_TTS_VOICES[providerId] || 'default';
        const speed =
          action.speed || settings.ttsSpeed || provider.speedRange?.default || 1.0;

        const ttsConfig = {
          providerId: providerId as TTSProviderId,
          apiKey: providerConfig?.apiKey,
          baseUrl: providerConfig?.baseUrl,
          voice,
          speed,
          model: providerConfig?.model,
        };

        toast.info('Generating audio...');
        console.log(`Regenerating action audio with voice "${voice}"...`);
        const result = await generateTTS(ttsConfig, action.text);

        const format = provider.supportedFormats?.[0] || 'mp3';
        const audioId = action.audioId || `tts_${action.id}`;

        const blob = new Blob([result.audio as unknown as BlobPart], {
          type: `audio/${format}`,
        });
        await db.audioFiles.put({
          id: audioId,
          blob,
          format,
          text: action.text,
          voice,
          createdAt: Date.now(),
        });

        const updatedAction: SpeechAction = {
          ...action,
          audioId,
          audioUrl: undefined,
        };

        const actionIndex = localActions.findIndex((a) => a.id === action.id);
        if (actionIndex !== -1) {
          handleActionChange(actionIndex, updatedAction);
        }

        toast.success('Audio regenerated successfully');
      } catch (error) {
        console.error('TTS regeneration failed:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to regenerate audio');
      } finally {
        setRegeneratingId(null);
      }
    },
    [localActions, handleActionChange]
  );

  const handleSave = useCallback(() => {
    onSave(localActions);
  }, [localActions, onSave]);

  const handleRevert = useCallback(() => {
    setLocalActions(actions);
    setHasChanges(false);
    setExpandedIndex(0);
    onRevert();
  }, [actions, onRevert]);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t('stage.editingActions')} ({localActions.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {t('stage.modified')}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRevert}
            disabled={!hasChanges}
            className="h-7 px-2 text-xs"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            {t('stage.revert')}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges}
            className="h-7 px-2 text-xs"
          >
            <Check className="w-3 h-3 mr-1" />
            {t('stage.applyChanges')}
          </Button>
        </div>
      </div>

      {/* Actions List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {localActions.map((action, index) => (
          <ActionCard
            key={action.id}
            action={action}
            index={index}
            totalCount={localActions.length}
            onChange={(updated) => handleActionChange(index, updated)}
            onRemove={() => handleActionRemove(index)}
            onMove={(direction) => handleActionMove(index, direction)}
            onRegenerateAudio={handleRegenerateAudio}
            isExpanded={expandedIndex === index}
            onToggle={() =>
              setExpandedIndex(expandedIndex === index ? null : index)
            }
            regeneratingId={regeneratingId}
            elements={elements}
          />
        ))}
        {localActions.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No actions. Click below to add one.
          </div>
        )}
      </div>

      {/* Add Action */}
      <AddActionDropdown onAdd={handleAddAction} />
    </div>
  );
}
