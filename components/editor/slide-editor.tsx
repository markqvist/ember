'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  Check,
  RotateCcw,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Type,
  Image as ImageIcon,
  Shapes,
  Minus,
  BarChart3,
  Table2,
  Sigma,
  Video,
  Music,
  GripVertical,
  Lock,
  Unlock,
  Copy,
  Palette,
  Layers,
  Upload,
  Link as LinkIcon,
  Download,
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
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/lib/hooks/use-i18n';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import type {
  PPTElement,
  PPTTextElement,
  PPTImageElement,
  PPTShapeElement,
  PPTLineElement,
  PPTChartElement,
  PPTTableElement,
  PPTLatexElement,
  PPTVideoElement,
  PPTAudioElement,
  Slide,
  SlideBackground,
  Gradient,
} from '@/lib/types/slides';

interface SlideEditorProps {
  slide: Slide;
  onSave: (updatedSlide: Slide) => void;
  onRevert: () => void;
}

// Element type metadata
interface ElementTypeMeta {
  type: PPTElement['type'];
  label: string;
  icon: React.ReactNode;
  description: string;
}

const ELEMENT_TYPES: ElementTypeMeta[] = [
  {
    type: 'text',
    label: 'Text',
    icon: <Type className="w-4 h-4" />,
    description: 'Text content with formatting',
  },
  {
    type: 'image',
    label: 'Image',
    icon: <ImageIcon className="w-4 h-4" />,
    description: 'Image from URL or file',
  },
  {
    type: 'shape',
    label: 'Shape',
    icon: <Shapes className="w-4 h-4" />,
    description: 'Geometric shape with optional text',
  },
  {
    type: 'line',
    label: 'Line',
    icon: <Minus className="w-4 h-4" />,
    description: 'Line or arrow connector',
  },
  {
    type: 'chart',
    label: 'Chart',
    icon: <BarChart3 className="w-4 h-4" />,
    description: 'Data visualization chart',
  },
  {
    type: 'table',
    label: 'Table',
    icon: <Table2 className="w-4 h-4" />,
    description: 'Data table with cells',
  },
  {
    type: 'latex',
    label: 'LaTeX',
    icon: <Sigma className="w-4 h-4" />,
    description: 'Mathematical formula',
  },
  {
    type: 'video',
    label: 'Video',
    icon: <Video className="w-4 h-4" />,
    description: 'Video player element',
  },
  {
    type: 'audio',
    label: 'Audio',
    icon: <Music className="w-4 h-4" />,
    description: 'Audio player element',
  },
];

// ============== Helper Functions ==============

function generateElementId(type: string): string {
  return `${type}_${nanoid(8)}`;
}

function getElementTypeMeta(type: PPTElement['type']): ElementTypeMeta | undefined {
  return ELEMENT_TYPES.find((t) => t.type === type);
}

function getElementPreview(element: PPTElement): string {
  switch (element.type) {
    case 'text':
      return (element as PPTTextElement).content.replace(/<[^>]*>/g, '').slice(0, 60) || '(empty)';
    case 'latex':
      return (element as PPTLatexElement).latex.slice(0, 40) || '(empty)';
    case 'image':
      return (element as PPTImageElement).src.split('/').pop() || '(image)';
    case 'video':
      return (element as PPTVideoElement).src.split('/').pop() || '(video)';
    case 'audio':
      return (element as PPTAudioElement).src.split('/').pop() || '(audio)';
    case 'shape':
      return (element as PPTShapeElement).text?.content.replace(/<[^>]*>/g, '').slice(0, 40) || '(shape)';
    case 'chart':
      return `${(element as PPTChartElement).chartType} chart`;
    case 'table':
      const table = element as PPTTableElement;
      return `Table (${table.data.length}x${table.data[0]?.length || 0})`;
    case 'line':
      return 'Line';
    default:
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return `(${(element as any).type})`;
  }
}

function createDefaultElement(type: PPTElement['type']): PPTElement {
  const base = {
    id: generateElementId(type),
    left: 100,
    top: 100,
    width: 200,
    height: type === 'line' ? 0 : 100,
    rotate: 0,
  };

  switch (type) {
    case 'text':
      return {
        ...base,
        type: 'text',
        content: '<p>New text element</p>',
        defaultFontName: 'Arial',
        defaultColor: '#333333',
        width: 400,
        height: 60,
      } as PPTTextElement;
    case 'image':
      return {
        ...base,
        type: 'image',
        src: '',
        fixedRatio: true,
      } as PPTImageElement;
    case 'shape':
      return {
        ...base,
        type: 'shape',
        viewBox: [1000, 1000],
        path: 'M0,0 L1000,0 L1000,1000 L0,1000 Z',
        fixedRatio: false,
        fill: '#5b9bd5',
      } as PPTShapeElement;
    case 'line':
      return {
        ...base,
        type: 'line',
        start: [100, 100],
        end: [300, 100],
        style: 'solid',
        color: '#333333',
        points: ['', 'arrow'],
      } as PPTLineElement;
    case 'chart':
      return {
        ...base,
        type: 'chart',
        chartType: 'bar',
        data: {
          labels: ['A', 'B', 'C'],
          legends: ['Series 1'],
          series: [[10, 20, 15]],
        },
        themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5'],
        width: 400,
        height: 300,
      } as PPTChartElement;
    case 'table':
      return {
        ...base,
        type: 'table',
        outline: { style: 'solid', width: 1, color: '#333' },
        colWidths: [0.5, 0.5],
        cellMinHeight: 40,
        data: [
          [{ id: 'c1', colspan: 1, rowspan: 1, text: 'Header 1' }, { id: 'c2', colspan: 1, rowspan: 1, text: 'Header 2' }],
          [{ id: 'c3', colspan: 1, rowspan: 1, text: 'Cell 1' }, { id: 'c4', colspan: 1, rowspan: 1, text: 'Cell 2' }],
        ],
        width: 400,
        height: 120,
      } as PPTTableElement;
    case 'latex':
      return {
        ...base,
        type: 'latex',
        latex: 'E = mc^2',
        width: 300,
        height: 60,
      } as PPTLatexElement;
    case 'video':
      return {
        ...base,
        type: 'video',
        src: '',
        autoplay: false,
        width: 400,
        height: 225,
      } as PPTVideoElement;
    case 'audio':
      return {
        ...base,
        type: 'audio',
        src: '',
        autoplay: false,
        loop: false,
        fixedRatio: true,
        color: '#5b9bd5',
      } as PPTAudioElement;
    default:
      return base as PPTElement;
  }
}

// ============== Sub-Components ==============

function CommonPropertiesEditor({
  element,
  onChange,
}: {
  element: PPTElement;
  onChange: (updated: PPTElement) => void;
}) {
  const isLine = element.type === 'line';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">X Position</label>
          <Input
            type="number"
            value={Math.round(element.left)}
            onChange={(e) => onChange({ ...element, left: Number(e.target.value) })}
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Y Position</label>
          <Input
            type="number"
            value={Math.round(element.top)}
            onChange={(e) => onChange({ ...element, top: Number(e.target.value) })}
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Width</label>
          <Input
            type="number"
            value={Math.round(element.width)}
            onChange={(e) => onChange({ ...element, width: Number(e.target.value) })}
            className="text-xs"
          />
        </div>
        {!isLine && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Height</label>
            <Input
              type="number"
              value={Math.round((element as PPTElement & { height?: number }).height || 0)}
              onChange={(e) => onChange({ ...element, height: Number(e.target.value) })}
              className="text-xs"
            />
          </div>
        )}
      </div>
      {!isLine && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Rotation (degrees)</label>
          <Input
            type="number"
            value={(element as PPTElement & { rotate?: number }).rotate || 0}
            onChange={(e) => onChange({ ...element, rotate: Number(e.target.value) })}
            className="text-xs"
          />
        </div>
      )}
      <div className="flex items-center gap-2 pt-2">
        <Switch
          checked={element.lock || false}
          onCheckedChange={(checked) => onChange({ ...element, lock: checked })}
        />
        <span className="text-xs">Lock element</span>
      </div>
    </div>
  );
}

function TextElementEditor({
  element,
  onChange,
}: {
  element: PPTTextElement;
  onChange: (updated: PPTTextElement) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Content (HTML)</label>
        <Textarea
          value={element.content}
          onChange={(e) => onChange({ ...element, content: e.target.value })}
          placeholder="<p>Your text here</p>"
          className="w-full min-h-[100px] text-xs resize-none font-mono"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Default Font</label>
          <Input
            value={element.defaultFontName}
            onChange={(e) => onChange({ ...element, defaultFontName: e.target.value })}
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Default Color</label>
          <div className="flex gap-2">
            <Input
              type="color"
              value={element.defaultColor}
              onChange={(e) => onChange({ ...element, defaultColor: e.target.value })}
              className="w-12 h-8 p-1"
            />
            <Input
              value={element.defaultColor}
              onChange={(e) => onChange({ ...element, defaultColor: e.target.value })}
              className="flex-1 text-xs"
            />
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Line Height</label>
        <Input
          type="number"
          step={0.1}
          value={element.lineHeight || 1.5}
          onChange={(e) => onChange({ ...element, lineHeight: Number(e.target.value) })}
          className="text-xs"
        />
      </div>
    </div>
  );
}

function ImageElementEditor({
  element,
  onChange,
}: {
  element: PPTImageElement;
  onChange: (updated: PPTImageElement) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState(element.src?.startsWith('http') ? element.src : '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import needed functions
  const { generateEmbeddedMediaId } = require('@/lib/utils/media-extractor');
  const { db } = require('@/lib/utils/database');
  const { isEmbeddedMediaPlaceholder } = require('@/lib/store/media-generation');

  // Check if current src is a valid image
  const hasImage = element.src && element.src.length > 0;
  const isBase64Image = element.src?.startsWith('data:image');
  const isExternalUrl = element.src?.startsWith('http://') || element.src?.startsWith('https://');
  const isEmbeddedId = isEmbeddedMediaPlaceholder(element.src || '');

  // Load preview URL for embedded media
  useEffect(() => {
    let objectUrl: string | null = null;
    
    const loadPreview = async () => {
      if (isEmbeddedId && element.src) {
        // For embedded IDs, get from IndexedDB
        try {
          // We need stageId from context, but for editor preview we'll use a temporary approach
          // In practice, the stage component will handle the actual rendering
          const records = await db.mediaFiles.toArray();
          const record = records.find((r: { id: string }) => r.id.includes(element.src as string));
          if (record) {
            objectUrl = URL.createObjectURL(record.blob);
            setPreviewUrl(objectUrl);
          }
        } catch (error) {
          console.error('Failed to load embedded media preview:', error);
        }
      } else if (isBase64Image || isExternalUrl) {
        // For base64 or external URLs, use src directly
        setPreviewUrl(element.src);
      } else {
        setPreviewUrl(null);
      }
    };

    loadPreview();

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [element.src, isEmbeddedId, isBase64Image, isExternalUrl]);

  // Convert file to base64 and generate embedded ID
  const fileToEmbeddedId = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        // Extract just the base64 data (remove data:image/... prefix)
        const base64Data = base64.split(',')[1];
        const embeddedId = generateEmbeddedMediaId(base64Data, 'image');
        resolve(embeddedId);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Store file in IndexedDB and return embedded ID
  const storeFileInIndexedDB = async (file: File, embeddedId: string): Promise<void> => {
    const { base64ToBlob } = await import('@/lib/utils/base64');
    
    // Read file as base64 first
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Convert to blob
    const blob = base64ToBlob(base64.split(',')[1], file.type);

    // Store with a temporary stageId that will be replaced on save
    // Using 'editor' as temporary stageId - will be migrated on classroom save
    const compoundKey = `editor:${embeddedId}`;
    
    await db.mediaFiles.put({
      id: compoundKey,
      stageId: 'editor',
      type: 'image',
      blob,
      mimeType: file.type,
      size: blob.size,
      prompt: '',
      params: JSON.stringify({ source: 'editor_upload', pendingMigration: true }),
      createdAt: Date.now(),
    });
  };

  // Handle file upload (from drop or picker)
  const handleFileUpload = async (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file');
      return;
    }
    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be smaller than 10MB');
      return;
    }

    try {
      setIsLoading(true);
      const embeddedId = await fileToEmbeddedId(file);
      await storeFileInIndexedDB(file, embeddedId);
      onChange({ ...element, src: embeddedId });
      toast.success('Image uploaded successfully');
    } catch {
      toast.error('Failed to process image file');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle drag events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  // Handle file picker
  const handleFilePicker = () => fileInputRef.current?.click();
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = ''; // Reset for re-selecting same file
  };

  // Fetch external URL and store in IndexedDB with embedded ID
  const handleFetchUrl = async () => {
    if (!urlInput.trim()) {
      toast.error('Please enter a URL');
      return;
    }
    if (!urlInput.startsWith('http://') && !urlInput.startsWith('https://')) {
      toast.error('URL must start with http:// or https://');
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch('/api/proxy-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();

      // Validate it's an image
      if (!blob.type.startsWith('image/')) {
        throw new Error('URL does not point to a valid image');
      }

      // Convert blob to base64 for hash generation
      const reader = new FileReader();
      const base64: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // Generate embedded ID and store in IndexedDB
      const base64Data = base64.split(',')[1];
      const embeddedId = generateEmbeddedMediaId(base64Data, 'image');
      
      // Store in IndexedDB (reusing the blob we already have)
      const compoundKey = `editor:${embeddedId}`;
      await db.mediaFiles.put({
        id: compoundKey,
        stageId: 'editor',
        type: 'image',
        blob,
        mimeType: blob.type,
        size: blob.size,
        prompt: '',
        params: JSON.stringify({ source: 'fetched_url', url: urlInput.trim(), pendingMigration: true }),
        createdAt: Date.now(),
      });

      onChange({ ...element, src: embeddedId });
      setUrlInput('');
      toast.success('Image fetched and stored successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch image');
    } finally {
      setIsLoading(false);
    }
  };

  // Clear image
  const handleClear = () => {
    onChange({ ...element, src: '' });
    setUrlInput('');
  };

  return (
    <div className="space-y-3">
      {/* Image Preview / Upload Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={!hasImage ? handleFilePicker : undefined}
        className={cn(
          'relative h-32 rounded-lg border-2 border-dashed transition-all overflow-hidden',
          isDragging
            ? 'border-primary bg-primary/5'
            : hasImage
              ? 'border-border bg-muted/30'
              : 'border-muted-foreground/25 bg-muted/20 hover:border-muted-foreground/40 cursor-pointer',
          isLoading && 'opacity-70'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              Processing...
            </div>
          </div>
        ) : hasImage ? (
          <>
            <img
              src={previewUrl || element.src}
              alt="Preview"
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            {/* Overlay with actions */}
            <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleFilePicker();
                }}
              >
                <Upload className="w-3.5 h-3.5 mr-1" />
                Replace
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Remove
              </Button>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
            <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
            <span className="text-xs font-medium">Drop image here or click to upload</span>
            <span className="text-[10px] opacity-60 mt-1">Supports JPG, PNG, GIF, WebP</span>
          </div>
        )}
      </div>

      {/* Image Source Info */}
      {hasImage && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {isEmbeddedId ? (
            <>
              <Check className="w-3 h-3 text-green-500" />
              <span>Stored in IndexedDB (offline available)</span>
            </>
          ) : isBase64Image ? (
            <>
              <Check className="w-3 h-3 text-green-500" />
              <span>Embedded base64 (will migrate on save)</span>
            </>
          ) : isExternalUrl ? (
            <>
              <LinkIcon className="w-3 h-3 text-amber-500" />
              <span>External URL (click fetch to store)</span>
            </>
          ) : (
            <>
              <ImageIcon className="w-3 h-3" />
              <span>Image source</span>
            </>
          )}
        </div>
      )}

      {/* URL Input with Fetch Button */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Image URL (optional)</label>
        <div className="flex gap-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://example.com/image.png"
            className="text-xs flex-1"
            disabled={isLoading}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={handleFetchUrl}
            disabled={isLoading || !urlInput.trim()}
            className="shrink-0"
          >
            {isLoading ? (
              <div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span className="ml-1.5 hidden sm:inline">Fetch & Embed</span>
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Enter a URL to fetch and embed the image for offline use.
        </p>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Switch
          checked={element.fixedRatio}
          onCheckedChange={(checked) => onChange({ ...element, fixedRatio: checked })}
        />
        <span className="text-xs">Maintain aspect ratio</span>
      </div>
    </div>
  );
}

function ShapeElementEditor({
  element,
  onChange,
}: {
  element: PPTShapeElement;
  onChange: (updated: PPTShapeElement) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Fill Color</label>
        <div className="flex gap-2">
          <Input
            type="color"
            value={element.fill}
            onChange={(e) => onChange({ ...element, fill: e.target.value })}
            className="w-12 h-8 p-1"
          />
          <Input
            value={element.fill}
            onChange={(e) => onChange({ ...element, fill: e.target.value })}
            className="flex-1 text-xs"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={element.fixedRatio}
          onCheckedChange={(checked) => onChange({ ...element, fixedRatio: checked })}
        />
        <span className="text-xs">Fixed aspect ratio</span>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Shape Text (HTML)</label>
        <Textarea
          value={element.text?.content || ''}
          onChange={(e) =>
            onChange({
              ...element,
              text: e.target.value
                ? {
                    content: e.target.value,
                    defaultFontName: element.text?.defaultFontName || 'Arial',
                    defaultColor: element.text?.defaultColor || '#333',
                    align: element.text?.align || 'middle',
                  }
                : undefined,
            })
          }
          placeholder="<p>Text inside shape</p>"
          className="w-full min-h-[60px] text-xs resize-none font-mono"
        />
      </div>
    </div>
  );
}

function LineElementEditor({
  element,
  onChange,
}: {
  element: PPTLineElement;
  onChange: (updated: PPTLineElement) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Start X</label>
          <Input
            type="number"
            value={element.start[0]}
            onChange={(e) =>
              onChange({ ...element, start: [Number(e.target.value), element.start[1]] })
            }
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Start Y</label>
          <Input
            type="number"
            value={element.start[1]}
            onChange={(e) =>
              onChange({ ...element, start: [element.start[0], Number(e.target.value)] })
            }
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">End X</label>
          <Input
            type="number"
            value={element.end[0]}
            onChange={(e) =>
              onChange({ ...element, end: [Number(e.target.value), element.end[1]] })
            }
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">End Y</label>
          <Input
            type="number"
            value={element.end[1]}
            onChange={(e) =>
              onChange({ ...element, end: [element.end[0], Number(e.target.value)] })
            }
            className="text-xs"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Line Style</label>
        <Select
          value={element.style}
          onValueChange={(v: 'solid' | 'dashed' | 'dotted') =>
            onChange({ ...element, style: v })
          }
        >
          <SelectTrigger className="text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Solid</SelectItem>
            <SelectItem value="dashed">Dashed</SelectItem>
            <SelectItem value="dotted">Dotted</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Line Color</label>
        <div className="flex gap-2">
          <Input
            type="color"
            value={element.color}
            onChange={(e) => onChange({ ...element, color: e.target.value })}
            className="w-12 h-8 p-1"
          />
          <Input
            value={element.color}
            onChange={(e) => onChange({ ...element, color: e.target.value })}
            className="flex-1 text-xs"
          />
        </div>
      </div>
    </div>
  );
}

function ChartElementEditor({
  element,
  onChange,
}: {
  element: PPTChartElement;
  onChange: (updated: PPTChartElement) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Chart Type</label>
        <Select
          value={element.chartType}
          onValueChange={(v: PPTChartElement['chartType']) =>
            onChange({ ...element, chartType: v })
          }
        >
          <SelectTrigger className="text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bar">Bar</SelectItem>
            <SelectItem value="column">Column</SelectItem>
            <SelectItem value="line">Line</SelectItem>
            <SelectItem value="pie">Pie</SelectItem>
            <SelectItem value="ring">Ring</SelectItem>
            <SelectItem value="area">Area</SelectItem>
            <SelectItem value="radar">Radar</SelectItem>
            <SelectItem value="scatter">Scatter</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function LatexElementEditor({
  element,
  onChange,
}: {
  element: PPTLatexElement;
  onChange: (updated: PPTLatexElement) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">LaTeX Formula</label>
        <Textarea
          value={element.latex}
          onChange={(e) => onChange({ ...element, latex: e.target.value })}
          placeholder="E = mc^2"
          className="w-full min-h-[80px] text-xs resize-none font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Formula Color</label>
        <div className="flex gap-2">
          <Input
            type="color"
            value={element.color || '#000000'}
            onChange={(e) => onChange({ ...element, color: e.target.value })}
            className="w-12 h-8 p-1"
          />
          <Input
            value={element.color || '#000000'}
            onChange={(e) => onChange({ ...element, color: e.target.value })}
            className="flex-1 text-xs"
          />
        </div>
      </div>
    </div>
  );
}

function VideoElementEditor({
  element,
  onChange,
}: {
  element: PPTVideoElement;
  onChange: (updated: PPTVideoElement) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Video Source URL</label>
        <Input
          value={element.src}
          onChange={(e) => onChange({ ...element, src: e.target.value })}
          placeholder="https://example.com/video.mp4"
          className="text-xs"
        />
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={element.autoplay}
            onCheckedChange={(checked) => onChange({ ...element, autoplay: checked })}
          />
          <span className="text-xs">Autoplay</span>
        </div>
      </div>
    </div>
  );
}

function AudioElementEditor({
  element,
  onChange,
}: {
  element: PPTAudioElement;
  onChange: (updated: PPTAudioElement) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Audio Source URL</label>
        <Input
          value={element.src}
          onChange={(e) => onChange({ ...element, src: e.target.value })}
          placeholder="https://example.com/audio.mp3"
          className="text-xs"
        />
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={element.autoplay}
            onCheckedChange={(checked) => onChange({ ...element, autoplay: checked })}
          />
          <span className="text-xs">Autoplay</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={element.loop}
            onCheckedChange={(checked) => onChange({ ...element, loop: checked })}
          />
          <span className="text-xs">Loop</span>
        </div>
      </div>
    </div>
  );
}

function ElementEditor({
  element,
  onChange,
}: {
  element: PPTElement;
  onChange: (updated: PPTElement) => void;
}) {
  const renderTypeEditor = () => {
    switch (element.type) {
      case 'text':
        return <TextElementEditor element={element as PPTTextElement} onChange={onChange} />;
      case 'image':
        return <ImageElementEditor element={element as PPTImageElement} onChange={onChange} />;
      case 'shape':
        return <ShapeElementEditor element={element as PPTShapeElement} onChange={onChange} />;
      case 'line':
        return <LineElementEditor element={element as PPTLineElement} onChange={onChange} />;
      case 'chart':
        return <ChartElementEditor element={element as PPTChartElement} onChange={onChange} />;
      case 'latex':
        return <LatexElementEditor element={element as PPTLatexElement} onChange={onChange} />;
      case 'video':
        return <VideoElementEditor element={element as PPTVideoElement} onChange={onChange} />;
      case 'audio':
        return <AudioElementEditor element={element as PPTAudioElement} onChange={onChange} />;
      default:
        return (
          <div className="text-xs text-muted-foreground">
            Advanced editing for this element type is not yet supported. Use JSON tab for full control.
          </div>
        );
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
          <GripVertical className="w-3 h-3" />
          Position & Size
        </h4>
        <CommonPropertiesEditor element={element} onChange={onChange} />
      </div>
      <div>
        <h4 className="text-xs font-semibold text-foreground mb-2">
          {element.type.charAt(0).toUpperCase() + element.type.slice(1)} Properties
        </h4>
        {renderTypeEditor()}
      </div>
    </div>
  );
}

function ElementCard({
  element,
  index,
  totalCount,
  onChange,
  onRemove,
  onMove,
  onDuplicate,
  isExpanded,
  onToggle,
}: {
  element: PPTElement;
  index: number;
  totalCount: number;
  onChange: (updated: PPTElement) => void;
  onRemove: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onDuplicate: () => void;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const typeMeta = getElementTypeMeta(element.type);
  const isLocked = element.lock || false;

  return (
    <div className={cn('border rounded-lg overflow-hidden bg-card', isLocked && 'opacity-70')}>
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-mono text-muted-foreground w-6 shrink-0">
            {index + 1}
          </span>
          <span className="text-xs font-medium px-1.5 py-0.5 rounded shrink-0 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400">
            {typeMeta?.label || element.type}
          </span>
          {isLocked && <Lock className="w-3 h-3 text-muted-foreground" />}
          <span className="text-xs text-muted-foreground truncate">
            {getElementPreview(element)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={index === 0}
            onClick={(e) => {
              e.stopPropagation();
              onMove('up');
            }}
            title="Move up (send backward)"
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
            title="Move down (bring forward)"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            title="Duplicate"
          >
            <Copy className="w-3.5 h-3.5" />
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

      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t">
          <ElementEditor element={element} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

function AddElementDropdown({
  onAdd,
}: {
  onAdd: (type: PPTElement['type']) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Element
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-1" align="center">
        {ELEMENT_TYPES.map((type) => (
          <button
            key={type.type}
            onClick={() => {
              onAdd(type.type);
              setOpen(false);
            }}
            className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 text-left text-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {type.icon}
            <div className="flex-1">
              <div className="font-medium">{type.label}</div>
              <div className="text-[10px] text-muted-foreground">{type.description}</div>
            </div>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function BackgroundEditor({
  background,
  theme,
  onChangeBackground,
  onChangeTheme,
}: {
  background?: SlideBackground;
  theme: Slide['theme'];
  onChangeBackground: (bg: SlideBackground | undefined) => void;
  onChangeTheme: (theme: Partial<Slide['theme']>) => void;
}) {
  const bgType = background?.type || 'solid';
  const bgColor = background?.color || theme.backgroundColor || '#ffffff';

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Background Type</label>
        <Select
          value={bgType}
          onValueChange={(v: SlideBackground['type']) => {
            if (v === 'solid') {
              onChangeBackground({ type: 'solid', color: bgColor });
            } else if (v === 'image') {
              onChangeBackground({ type: 'image', image: { src: '', size: 'cover' } });
            } else if (v === 'gradient') {
              onChangeBackground({
                type: 'gradient',
                gradient: {
                  type: 'linear',
                  colors: [{ pos: 0, color: '#5b9bd5' }, { pos: 100, color: '#ffffff' }],
                  rotate: 0,
                },
              });
            }
          }}
        >
          <SelectTrigger className="text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Solid Color</SelectItem>
            <SelectItem value="image">Image</SelectItem>
            <SelectItem value="gradient">Gradient</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {bgType === 'solid' && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Background Color</label>
          <div className="flex gap-2">
            <Input
              type="color"
              value={bgColor}
              onChange={(e) => onChangeBackground({ type: 'solid', color: e.target.value })}
              className="w-12 h-8 p-1"
            />
            <Input
              value={bgColor}
              onChange={(e) => onChangeBackground({ type: 'solid', color: e.target.value })}
              className="flex-1 text-xs"
            />
          </div>
        </div>
      )}

      {bgType === 'image' && background?.image && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Image URL</label>
          <Input
            value={background.image.src}
            onChange={(e) =>
              onChangeBackground({
                ...background,
                image: { src: e.target.value, size: (background as SlideBackground & { image: { size: string } }).image?.size || 'cover' },
              })
            }
            placeholder="https://example.com/bg.jpg"
            className="text-xs"
          />
        </div>
      )}

      <div className="border-t pt-3 mt-3">
        <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
          <Palette className="w-3 h-3" />
          Theme
        </h4>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Background Color (Theme)</label>
          <div className="flex gap-2">
            <Input
              type="color"
              value={theme.backgroundColor}
              onChange={(e) => onChangeTheme({ backgroundColor: e.target.value })}
              className="w-12 h-8 p-1"
            />
            <Input
              value={theme.backgroundColor}
              onChange={(e) => onChangeTheme({ backgroundColor: e.target.value })}
              className="flex-1 text-xs"
            />
          </div>
        </div>
        <div className="space-y-1.5 mt-2">
          <label className="text-xs font-medium text-foreground">Font Color</label>
          <div className="flex gap-2">
            <Input
              type="color"
              value={theme.fontColor}
              onChange={(e) => onChangeTheme({ fontColor: e.target.value })}
              className="w-12 h-8 p-1"
            />
            <Input
              value={theme.fontColor}
              onChange={(e) => onChangeTheme({ fontColor: e.target.value })}
              className="flex-1 text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== Main Component ==============

export function SlideEditor({ slide, onSave, onRevert }: SlideEditorProps) {
  const { t } = useI18n();
  const [localSlide, setLocalSlide] = useState<Slide>(slide);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'elements' | 'background'>('elements');

  // Sync with props when they change
  useEffect(() => {
    setLocalSlide(slide);
    setHasChanges(false);
  }, [slide]);

  const handleElementChange = useCallback((index: number, updated: PPTElement) => {
    setLocalSlide((prev) => {
      const newElements = [...prev.elements];
      newElements[index] = updated;
      return { ...prev, elements: newElements };
    });
    setHasChanges(true);
  }, []);

  const handleElementRemove = useCallback(
    (index: number) => {
      setLocalSlide((prev) => ({
        ...prev,
        elements: prev.elements.filter((_, i) => i !== index),
      }));
      setHasChanges(true);
      if (expandedIndex === index) setExpandedIndex(null);
      else if (expandedIndex !== null && expandedIndex > index) {
        setExpandedIndex(expandedIndex - 1);
      }
    },
    [expandedIndex]
  );

  const handleElementMove = useCallback(
    (index: number, direction: 'up' | 'down') => {
      setLocalSlide((prev) => {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= prev.elements.length) return prev;
        const newElements = [...prev.elements];
        const temp = newElements[index];
        newElements[index] = newElements[newIndex];
        newElements[newIndex] = temp;
        return { ...prev, elements: newElements };
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

  const handleElementDuplicate = useCallback((index: number) => {
    setLocalSlide((prev) => {
      const element = prev.elements[index];
      const duplicated = {
        ...element,
        id: generateElementId(element.type),
        left: element.left + 20,
        top: element.top + 20,
      };
      const newElements = [...prev.elements];
      newElements.splice(index + 1, 0, duplicated);
      return { ...prev, elements: newElements };
    });
    setHasChanges(true);
    toast.success('Element duplicated');
  }, []);

  const handleAddElement = useCallback(
    (type: PPTElement['type']) => {
      const newElement = createDefaultElement(type);
      setLocalSlide((prev) => ({
        ...prev,
        elements: [...prev.elements, newElement],
      }));
      setHasChanges(true);
      setExpandedIndex(localSlide.elements.length);
    },
    [localSlide.elements.length]
  );

  const handleBackgroundChange = useCallback((background: SlideBackground | undefined) => {
    setLocalSlide((prev) => ({ ...prev, background }));
    setHasChanges(true);
  }, []);

  const handleThemeChange = useCallback((theme: Partial<Slide['theme']>) => {
    setLocalSlide((prev) => ({ ...prev, theme: { ...prev.theme, ...theme } }));
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(() => {
    onSave(localSlide);
  }, [localSlide, onSave]);

  const handleRevert = useCallback(() => {
    setLocalSlide(slide);
    setHasChanges(false);
    setExpandedIndex(0);
    onRevert();
  }, [slide, onRevert]);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {localSlide.elements.length} elements
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

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setActiveTab('elements')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium transition-colors',
            activeTab === 'elements'
              ? 'text-foreground border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Layers className="w-3.5 h-3.5 inline mr-1" />
          Elements
        </button>
        <button
          onClick={() => setActiveTab('background')}
          className={cn(
            'px-3 py-1.5 text-xs font-medium transition-colors',
            activeTab === 'background'
              ? 'text-foreground border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Palette className="w-3.5 h-3.5 inline mr-1" />
          Background
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {activeTab === 'elements' ? (
          <>
            {localSlide.elements.map((element, index) => (
              <ElementCard
                key={element.id}
                element={element}
                index={index}
                totalCount={localSlide.elements.length}
                onChange={(updated) => handleElementChange(index, updated)}
                onRemove={() => handleElementRemove(index)}
                onMove={(direction) => handleElementMove(index, direction)}
                onDuplicate={() => handleElementDuplicate(index)}
                isExpanded={expandedIndex === index}
                onToggle={() =>
                  setExpandedIndex(expandedIndex === index ? null : index)
                }
              />
            ))}
            {localSlide.elements.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No elements. Click below to add one.
              </div>
            )}
          </>
        ) : (
          <BackgroundEditor
            background={localSlide.background}
            theme={localSlide.theme}
            onChangeBackground={handleBackgroundChange}
            onChangeTheme={handleThemeChange}
          />
        )}
      </div>

      {/* Add Element */}
      {activeTab === 'elements' && <AddElementDropdown onAdd={handleAddElement} />}
    </div>
  );
}
