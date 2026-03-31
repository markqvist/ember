import { ScanLine, Microscope, Bot, FileText, LayoutPanelLeft, Clapperboard, ScanEye } from 'lucide-react';
import { useSettingsStore } from '@/lib/store/settings';
import type {
  SceneOutline,
  UserRequirements,
  PdfImage,
  ImageMapping,
  SessionPdfSource,
} from '@/lib/types/generation';
import type { AnalyzedImage } from '@/lib/types/image-analysis';

// Session state stored in sessionStorage
export interface GenerationSessionState {
  sessionId: string;
  requirements: UserRequirements;
  pdfText: string;
  pdfSources?: SessionPdfSource[];
  pdfImages?: PdfImage[];
  imageStorageIds?: string[];
  imageMapping?: ImageMapping;
  sceneOutlines?: SceneOutline[] | null;
  currentStep: 'generating' | 'complete';
  previewPhase?: 'preparing' | 'review' | 'generating-content';
  // PDF deferred parsing fields
  pdfStorageKey?: string;
  pdfFileName?: string;
  pdfProviderId?: string;
  pdfProviderConfig?: { apiKey?: string; baseUrl?: string };
  // Research context (replaces web search)
  researchContext?: string;
  researchSources?: Array<{ title: string; url: string }>;
  researchEnabled?: boolean;
  // Image analysis results
  imageAnalysis?: {
    status: 'pending' | 'analyzing' | 'complete' | 'failed' | 'skipped';
    progress: {
      completed: number;
      total: number;
      currentImageId?: string;
      currentStatus?: 'analyzing' | 'included' | 'rejected';
    };
    analyses: AnalyzedImage[];
    error?: string;
  };
  // Model capability cache
  selectedModelSupportsVision?: boolean;
}

export type GenerationStep = {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  type: 'analysis' | 'writing' | 'visual';
};

export const ALL_STEPS: GenerationStep[] = [
  {
    id: 'pdf-analysis',
    title: 'generation.analyzingPdf',
    description: 'generation.analyzingPdfDesc',
    icon: ScanLine,
    type: 'analysis',
  },
  {
    id: 'image-analysis',
    title: 'generation.analyzingImages',
    description: 'generation.analyzingImagesDesc',
    icon: ScanEye,
    type: 'analysis',
  },
  {
    id: 'research',
    title: 'generation.researching',
    description: 'generation.researchingDesc',
    icon: Microscope,
    type: 'analysis',
  },
  {
    id: 'agent-generation',
    title: 'generation.agentGeneration',
    description: 'generation.agentGenerationDesc',
    icon: Bot,
    type: 'writing',
  },
  {
    id: 'outline',
    title: 'generation.generatingOutlines',
    description: 'generation.generatingOutlinesDesc',
    icon: FileText,
    type: 'writing',
  },
  {
    id: 'slide-content',
    title: 'generation.generatingSlideContent',
    description: 'generation.generatingSlideContentDesc',
    icon: LayoutPanelLeft,
    type: 'visual',
  },
  {
    id: 'actions',
    title: 'generation.generatingActions',
    description: 'generation.generatingActionsDesc',
    icon: Clapperboard,
    type: 'visual',
  },
];

export const getActiveSteps = (session: GenerationSessionState | null) => {
  return ALL_STEPS.filter((step) => {
    if (step.id === 'pdf-analysis') {
      return Boolean(
        session?.pdfStorageKey || ((session?.pdfSources?.length ?? 0) > 0 && !session?.pdfText),
      );
    }
    if (step.id === 'image-analysis') {
      // Only show if we have images AND vision model is selected
      const hasImages = (session?.pdfImages?.length ?? 0) > 0;
      const visionSupported = session?.selectedModelSupportsVision === true;
      return hasImages && visionSupported;
    }
    if (step.id === 'research') return !!session?.researchEnabled;
    if (step.id === 'agent-generation') return useSettingsStore.getState().agentMode === 'auto';
    return true;
  });
};
