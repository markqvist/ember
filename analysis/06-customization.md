# Customization & Configuration Deep Dive

## Overview

OpenMAIC is designed to be highly customizable at multiple levels: provider configuration, agent customization, scene generation, and playback behavior. This document covers all customization points.

## Provider Configuration

### Provider Registry

```yaml
# server-providers.yml (or .env.local)
providers:
  openai:
    apiKey: sk-...
    baseUrl?: https://api.openai.com/v1
    timeout?: 60000

  anthropic:
    apiKey: sk-ant-...
    baseUrl?: https://api.anthropic.com/v1
    timeout?: 60000

  google:
    apiKey: ...
    baseUrl?: https://generativelanguage.googleapis.com/v1beta
    models:
      - name: gemini-3-flash-preview
        enabled: true
        default: true
      - name: gemini-3.1-pro
        enabled: true
        default: false

  custom:
    enabled: true
    baseUrl: https://custom-provider.com/v1
    timeout: 60000
```

### Environment Variables

```env
# .env.local
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
DEFAULT_MODEL=google:gemini-3-flash-preview

# Optional
LLM_TIMEOUT=60000
LLM_MAX_TOKENS=4096
LLM_TEMPERATURE=0.7
```

### Provider Resolution

```typescript
// lib/ai/providers.ts
export async function resolveModel(providerName: string, modelName: string): Promise<LanguageModel> {
  const provider = PROVIDERS[providerName];
  return provider.createModel(modelName);
}

export async function resolveProvider(providerName: string): Promise<LLMProvider> {
  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new Error(`Provider ${providerName} not found`);
  }
  return provider;
}
```

### Custom Provider Implementation

```typescript
// lib/ai/providers/custom-provider.ts
export class CustomLLMProvider implements LLMProvider {
  constructor(private config: ProviderConfig) {}

  async createModel(modelName: string): Promise<LanguageModel> {
    const model = new CustomLanguageModel(modelName, {
      baseUrl: this.config.baseUrl,
      apiKey: this.config.apiKey,
      timeout: this.config.timeout,
    });
    return model;
  }

  async healthCheck(): Promise<boolean> {
    // Implement health check
    return true;
  }
}

// Register custom provider
PROVIDERS.custom = new CustomLLMProvider(customConfig);
```

## Agent Customization

### Agent Registry

```typescript
// lib/orchestration/registry/types.ts
export interface AgentConfig {
  id: string;
  name: string;
  role: 'teacher' | 'assistant' | 'student';
  persona: string;  // Personality description
  avatar?: string;  // Avatar image URL
  color?: string;   // Avatar border color
  allowedActions: string[];  // List of allowed action types
  isDefault?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// lib/orchestration/registry/store.ts
export interface AgentRegistryState {
  agents: Map<string, AgentConfig>;
}
```

### Default Agents

```typescript
// lib/orchestration/registry/default-agents.ts
export const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: 'teacher-1',
    name: 'Teacher',
    role: 'teacher',
    persona: 'You are an experienced educator with a passion for making complex topics accessible. You use examples, analogies, and visual aids to explain concepts clearly.',
    avatar: '/avatars/teacher.svg',
    color: '#FF5733',
    allowedActions: [
      'speech',
      'spotlight',
      'laser',
      'wb_open',
      'wb_draw_text',
      'wb_draw_shape',
      'wb_draw_chart',
      'wb_draw_latex',
      'wb_draw_table',
      'wb_draw_line',
      'wb_clear',
      'wb_delete',
      'wb_close',
    ],
  },
  {
    id: 'assistant-1',
    name: 'Teaching Assistant',
    role: 'assistant',
    persona: 'You are a supportive assistant who helps answer side questions and provides additional examples. You keep explanations concise and don\'t take over the lesson.',
    avatar: '/avatars/assistant.svg',
    color: '#33FF57',
    allowedActions: [
      'speech',
      'wb_open',
      'wb_draw_text',
      'wb_draw_latex',
    ],
  },
  {
    id: 'student-1',
    name: 'Student A',
    role: 'student',
    persona: 'You are an engaged student who participates in discussions, asks questions, and shares observations. You keep your responses short (1-2 sentences).',
    avatar: '/avatars/student-a.svg',
    color: '#3357FF',
    allowedActions: [
      'speech',
    ],
  },
  {
    id: 'student-2',
    name: 'Student B',
    role: 'student',
    persona: 'You are another student who thinks critically and challenges assumptions. You enjoy debate and ask probing questions.',
    avatar: '/avatars/student-b.svg',
    color: '#F333FF',
    allowedActions: [
      'speech',
    ],
  },
];
```

### Custom Agent Creation

```typescript
// lib/orchestration/registry/store.ts
function addAgent(config: AgentConfig) {
  const state = useAgentRegistry.getState();
  state.agents.set(config.id, config);
  useAgentRegistryQueryClient.setQueryData(['agent-registry'], (prev: AgentConfig[]) => {
    return [...prev, config];
  });
}

function updateAgent(agentId: string, config: Partial<AgentConfig>) {
  const state = useAgentRegistry.getState();
  const agent = state.agents.get(agentId);
  if (agent) {
    const updated = { ...agent, ...config, updatedAt: new Date() };
    state.agents.set(agentId, updated);
    useAgentRegistryQueryClient.setQueryData(['agent-registry'], (prev: AgentConfig[]) => {
      return prev.map((a) => (a.id === agentId ? updated : a));
    });
  }
}
```

### Agent Config in Generation Request

```typescript
// app/api/generate-classroom/route.ts
export async function POST(request: Request) {
  const body = await request.json();

  const { agentConfigs } = body;

  // Agent configs travel with request (no server-side persistence)
  const agentConfigOverrides: Record<string, AgentConfig> = {};
  if (agentConfigs?.length) {
    for (const cfg of agentConfigs) {
      agentConfigOverrides[cfg.id] = {
        ...cfg,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
  }

  // Build initial state
  const initialState = buildInitialState(request, languageModel, thinkingConfig);

  // Agent configs are merged: request-scoped overrides take precedence
  const mergedState = {
    ...initialState,
    agentConfigOverrides,
  };
}
```

### Agent Role Guidelines

```typescript
// lib/orchestration/prompt-builder.ts
const ROLE_GUIDELINES: Record<string, string> = {
  teacher: `Your role in this classroom: LEAD TEACHER.
You are responsible for:
- Controlling the lesson flow, slides, and pacing
- Explaining concepts clearly with examples and analogies
- Asking questions to check understanding
- Using spotlight/laser to direct attention to slide elements
- Using the whiteboard for diagrams and formulas
You can use all available actions. Never announce your actions — just teach naturally.`,

  assistant: `Your role in this classroom: TEACHING ASSISTANT.
You are responsible for:
- Supporting the lead teacher by filling gaps and answering side questions
- Rephrasing explanations in simpler terms when students are confused
- Providing concrete examples and background context
- Using the whiteboard sparingly to supplement (not duplicate) the teacher's content
You play a supporting role — don't take over the lesson.`,

  student: `Your role in this classroom: STUDENT.
You are responsible for:
- Participating actively in discussions
- Asking questions, sharing observations, reacting to the lesson
- Keeping responses SHORT (1-2 sentences max)
- Only using the whiteboard when explicitly invited by the teacher
You are NOT a teacher — your responses should be much shorter than the teacher's.`,
};
```

## Scene Generation Customization

### Generation Options

```typescript
// lib/hooks/use-scene-generator.ts
interface GenerationOptions {
  visionEnabled?: boolean;           // Send PDF images as vision content
  imageGenerationEnabled?: boolean;  // Allow AI to request generated images
  videoGenerationEnabled?: boolean;  // Allow AI to request generated videos
  researchContext?: string;          // Web search results
  teacherContext?: string;           // Teacher persona
}
```

### Custom Prompt Templates

```typescript
// lib/generation/prompts/index.ts
export const PROMPT_IDS = {
  REQUIREMENTS_TO_OUTLINES: 'requirements_to_outlines',
  SLIDE_CONTENT: 'slide_content',
  QUIZ_CONTENT: 'quiz_content',
  INTERACTIVE_SCIENTIFIC_MODEL: 'interactive_scientific_model',
  INTERACTIVE_HTML: 'interactive_html',
  SLIDE_ACTIONS: 'slide_actions',
  QUIZ_ACTIONS: 'quiz_actions',
  PBL_ACTIONS: 'pbl_actions',
} as const;

// Custom prompt template
export const CUSTOM_PROMPT_ID = 'custom_prompt' as const;

// Build custom prompt
export function buildPrompt(
  promptId: typeof PROMPT_IDS[keyof typeof PROMPT_IDS] | typeof CUSTOM_PROMPT_ID,
  variables: Record<string, unknown>,
): { system: string; user: string } | null {
  const template = PROMPT_TEMPLATES[promptId];
  if (!template) return null;

  let system = template.system;
  let user = template.user;

  // Replace variables
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    system = system.replace(regex, String(value));
    user = user.replace(regex, String(value));
  });

  return { system, user };
}
```

### Custom Scene Types

```typescript
// lib/generation/scene-generator.ts
export async function generateSceneContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  assignedImages?: PdfImage[],
  imageMapping?: ImageMapping,
  languageModel?: LanguageModel,
  visionEnabled?: boolean,
  generatedMediaMapping?: ImageMapping,
  agents?: AgentInfo[],
): Promise<GeneratedSlideContent | GeneratedQuizContent | GeneratedInteractiveContent | GeneratedPBLContent | null> {

  switch (outline.type) {
    case 'slide':
      return generateSlideContent(...);
    case 'quiz':
      return generateQuizContent(...);
    case 'interactive':
      return generateInteractiveContent(...);
    case 'pbl':
      return generatePBLSceneContent(...);
    case 'custom':  // New custom scene type
      return generateCustomSceneContent(...);
    default:
      return null;
  }
}

async function generateCustomSceneContent(
  outline: SceneOutline,
  aiCall: AICallFn,
): Promise<GeneratedCustomContent | null> {
  const prompts = buildPrompt(PROMPT_IDS.CUSTOM_SCENE, {
    title: outline.title,
    description: outline.description,
    keyPoints: outline.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n'),
    customConfig: outline.customConfig,
  });

  const response = await aiCall(prompts.system, prompts.user);
  const generatedData = parseJsonResponse<GeneratedCustomData>(response);

  return {
    type: 'custom',
    content: generatedData,
  };
}
```

### Custom Content Renderer

```typescript
// components/scene-renderers/custom-renderer.tsx
export function CustomRenderer({ scene }: { scene: Scene }) {
  const content = scene.content as {
    type: 'custom';
    data: GeneratedCustomData;
  };

  return (
    <div className="custom-scene">
      {/* Render custom content */}
    </div>
  );
}
```

## Playback Customization

### Playback Configuration

```typescript
// lib/hooks/use-playback-engine.ts
interface PlaybackConfig {
  playbackSpeed?: number;     // 0.5x to 2x
  autoPlay?: boolean;         // Auto-start playback
  showProgress?: boolean;     // Show progress bar
  enableKeyboardShortcuts?: boolean;  // Keyboard navigation
}
```

### Custom Playback Callbacks

```typescript
interface PlaybackEngineCallbacks {
  onSceneChange?: (sceneId: string) => void;
  onSpeakerChange?: (speaker: string) => void;
  onSpeechStart?: (text: string) => void;
  onSpeechEnd?: () => void;
  onEffectFire?: (effect: Effect) => void;
  onProactiveShow?: (trigger: TriggerEvent) => void;
  onProactiveHide?: () => void;
  onDiscussionConfirmed?: (question: string, prompt: string, agentId: string) => void;
  onDiscussionEnd?: () => void;
  onUserInterrupt?: (text: string) => void;
  onComplete?: () => void;
  onProgress?: (snapshot: PlaybackSnapshot) => void;
  getPlaybackSpeed?: () => number;
  isAgentSelected?: (agentId: string) => boolean;
  onModeChange?: (mode: EngineMode) => void;
}
```

### Custom Playback Behavior

```typescript
// Override default action execution
class CustomActionEngine extends ActionEngine {
  async execute(action: Action): Promise<void> {
    // Custom behavior before execution
    console.log(`Executing custom action: ${action.type}`);

    // Call parent execute
    await super.execute(action);

    // Custom behavior after execution
    console.log(`Completed action: ${action.type}`);
  }
}
```

### Keyboard Shortcuts

```typescript
// lib/hooks/use-keyboard-shortcuts.ts
export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Space: Play/Pause
      if (e.code === 'Space') {
        e.preventDefault();
        if (engine.getMode() === 'playing') {
          engine.pause();
        } else {
          engine.resume();
        }
      }

      // Arrow Right: Next action
      if (e.code === 'ArrowRight') {
        if (engine.getMode() === 'playing') {
          engine.pause();
        }
        engine.resume();
      }

      // Arrow Left: Previous action
      if (e.code === 'ArrowLeft') {
        // Skip to previous action
      }

      // Escape: Exit discussion
      if (e.code === 'Escape') {
        if (engine.getMode() === 'live') {
          engine.handleEndDiscussion();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
```

## TTS/ASR Customization

### TTS Provider Configuration

```typescript
// lib/audio/tts-providers.ts
export const TTS_PROVIDERS = {
  'browser-native-tts': BrowserNativeTTSProvider,
  'azure-voices': AzureTTSProvider,
  'google-voices': GoogleTTSProvider,
  'openai-tts': OpenAITTSProvider,
  'custom-tts': CustomTTSProvider,
} as const;

interface TTSConfig {
  providerId: string;
  voiceId?: string;
  speed?: number;      // 0.5 to 2
  volume?: number;     // 0 to 1
  pitch?: number;      // 0.5 to 2
}
```

### Custom TTS Provider

```typescript
// lib/audio/tts-providers/custom-provider.ts
export class CustomTTSProvider implements TTSProvider {
  constructor(private config: TTSConfig) {}

  async synthesize(text: string): Promise<string> {
    // Implement custom TTS
    return `custom-audio-${Date.now()}`;
  }

  async getVoices(): Promise<TTSVoice[]> {
    // Return list of available voices
    return [];
  }
}
```

### ASR Provider Configuration

```typescript
// lib/audio/asr-providers.ts
export const ASR_PROVIDERS = {
  'browser-native-asr': BrowserNativeASRProvider,
  'azure-asr': AzureASRProvider,
  'google-asr': GoogleASRProvider,
  'openai-whisper': OpenAIWhisperProvider,
} as const;

interface ASRConfig {
  providerId: string;
  language: string;
  enablePunctuation?: boolean;
  enableProfanityFilter?: boolean;
}
```

## Media Generation Customization

### Media Provider Configuration

```typescript
// lib/media/image-providers.ts
export const IMAGE_PROVIDERS = {
  'openai-dall-e': OpenAIImageProvider,
  'stability-studio': StabilityStudioProvider,
  'custom-image': CustomImageProvider,
} as const;

interface ImageConfig {
  providerId: string;
  size?: '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
}
```

### Custom Media Provider

```typescript
// lib/media/image-providers/custom-provider.ts
export class CustomImageProvider implements ImageProvider {
  constructor(private config: ImageConfig) {}

  async generate(prompt: string): Promise<string> {
    // Implement custom image generation
    return `https://custom-provider.com/images/${nanoid()}.png`;
  }
}
```

## Export Customization

### Export Formats

```typescript
// lib/export/use-export-pptx.ts
export function useExportPPTX() {
  async function exportToPPTX(scenes: Scene[]): Promise<void> {
    // Implement PPTX export
  }

  return { exportToPPTX };
}

export function useExportHTML() {
  async function exportToHTML(scenes: Scene[]): Promise<void> {
    // Implement HTML export
  }

  return { exportToHTML };
}
```

### Custom Export Templates

```typescript
// lib/export/export-templates/pptx-custom-template.ts
export const CUSTOM_PPTX_TEMPLATE = {
  layout: {
    margin: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
    slideSize: { w: 9144000, h: 6858000 },
  },
  colors: {
    primary: '#FF5733',
    secondary: '#33FF57',
    accent: '#3357FF',
  },
  fonts: {
    title: 'Microsoft YaHei Bold',
    body: 'Microsoft YaHei',
  },
};
```

## Settings Customization

### Settings Store

```typescript
// lib/store/settings.ts
export interface SettingsState {
  // LLM
  llmProviderId: string;
  llmModelId: string;
  llmTemperature: number;
  llmMaxTokens: number;

  // TTS
  ttsEnabled: boolean;
  ttsProviderId: string;
  ttsVoice: string;
  ttsSpeed: number;
  ttsVolume: number;
  ttsMuted: boolean;

  // ASR
  asrEnabled: boolean;
  asrProviderId: string;

  // Media Generation
  imageGenerationEnabled: boolean;
  imageProviderId: string;
  videoGenerationEnabled: boolean;
  videoProviderId: string;

  // Playback
  playbackSpeed: number;
  autoPlay: boolean;
  showProgress: boolean;

  // Interface
  theme: 'light' | 'dark';
  language: 'zh-CN' | 'en-US';
}
```

### Settings Persistence

```typescript
// lib/store/settings.ts
export function useSettingsStore() {
  const [settings, setSettings] = useState<SettingsState>(() => {
    // Load from localStorage
    const saved = localStorage.getItem('settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const updateSetting = <K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K]
  ) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    localStorage.setItem('settings', JSON.stringify(newSettings));
  };

  return { settings, updateSetting };
}
```

## Theme Customization

### Theme Config

```typescript
// configs/theme.ts
export const THEMES = {
  light: {
    name: 'Light',
    primaryColor: '#5b9bd5',
    secondaryColor: '#ed7d31',
    accentColor: '#a5a5a5',
    textPrimary: '#333333',
    textSecondary: '#666666',
    background: '#ffffff',
    cardBackground: '#f9f9f9',
  },
  dark: {
    name: 'Dark',
    primaryColor: '#5b9bd5',
    secondaryColor: '#ed7d31',
    accentColor: '#a5a5a5',
    textPrimary: '#ffffff',
    textSecondary: '#cccccc',
    background: '#1a1a1a',
    cardBackground: '#2d2d2d',
  },
  custom: {
    name: 'Custom',
    primaryColor: '#FF5733',
    secondaryColor: '#33FF57',
    accentColor: '#3357FF',
    textPrimary: '#333333',
    textSecondary: '#666666',
    background: '#ffffff',
    cardBackground: '#f9f9f9',
  },
};
```

### Dynamic Theme Application

```typescript
// lib/hooks/use-theme.ts
export function useTheme() {
  const { settings } = useSettingsStore();

  useEffect(() => {
    const theme = THEMES[settings.theme];
    document.documentElement.style.setProperty('--primary-color', theme.primaryColor);
    document.documentElement.style.setProperty('--secondary-color', theme.secondaryColor);
    document.documentElement.style.setProperty('--accent-color', theme.accentColor);
    document.documentElement.style.setProperty('--bg-color', theme.background);
    document.documentElement.style.setProperty('--card-bg', theme.cardBackground);
    document.documentElement.style.setProperty('--text-primary', theme.textPrimary);
    document.documentElement.style.setProperty('--text-secondary', theme.textSecondary);
  }, [settings.theme]);

  return { theme: THEMES[settings.theme] };
}
```

## Extensibility Hooks

### Hook: `useSceneGenerator`

```typescript
export function useSceneGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);

  async function generateSceneRequirements(
    requirements: UserRequirements,
    options?: GenerationOptions
  ) {
    setIsGenerating(true);
    setProgress({
      currentStage: 1,
      overallProgress: 5,
      statusMessage: '分析需求...',
    });

    const session = createGenerationSession(requirements);
    const result = await runGenerationPipeline(session, store, aiCall, {
      onProgress: (p) => setProgress(p),
      onStageComplete: (stage, data) => {
        setProgress((prev) => ({
          ...prev,
          currentStage: stage,
          overallProgress: stage === 1 ? 50 : 100,
        }));
      },
    });

    setIsGenerating(false);
    return result;
  }

  return { isGenerating, progress, generateSceneRequirements };
}
```

### Hook: `useAgentConfig`

```typescript
export function useAgentConfig() {
  const { data: agents } = useAgentRegistry();

  function getAgentConfig(agentId: string) {
    return agents.find((a) => a.id === agentId);
  }

  function updateAgentConfig(agentId: string, config: Partial<AgentConfig>) {
    updateAgent(agentId, config);
  }

  function createAgentConfig(config: Partial<AgentConfig>) {
    const newAgent = {
      id: `agent-${nanoid(8)}`,
      ...config,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    addAgent(newAgent);
  }

  return { agents, getAgentConfig, updateAgentConfig, createAgentConfig };
}
```

### Hook: `usePlaybackEngine`

```typescript
export function usePlaybackEngine(scenes: Scene[]) {
  const actionEngine = useMemo(() => new ActionEngine(stageStore), [stageStore]);
  const audioPlayer = useMemo(() => new AudioPlayer(), []);
  const playbackEngine = useMemo(() => new PlaybackEngine(scenes, actionEngine, audioPlayer), [scenes, actionEngine, audioPlayer]);

  function start() {
    playbackEngine.start();
  }

  function pause() {
    playbackEngine.pause();
  }

  function resume() {
    playbackEngine.resume();
  }

  function stop() {
    playbackEngine.stop();
  }

  return {
    playbackEngine,
    start,
    pause,
    resume,
    stop,
  };
}
```

## Summary

OpenMAIC provides extensive customization options:

1. **Provider Configuration**: Multiple LLM, TTS, ASR, and media providers
2. **Agent Customization**: Role-based agents with custom personas and avatars
3. **Scene Generation**: Custom prompt templates and scene types
4. **Playback Behavior**: Custom callbacks, keyboard shortcuts, and playback modes
5. **TTS/ASR**: Multiple providers with custom implementations
6. **Media Generation**: Custom image/video providers
7. **Export**: Custom export formats and templates
8. **Settings**: Persistent user preferences
9. **Theme**: Light/dark/custom themes
10. **Hooks**: Custom hooks for generation, orchestration, and playback

The system's modular design makes it easy to:
- Add new providers (LLM, TTS, ASR, media)
- Create custom agents (roles, personas, avatars)
- Extend scene types (new generation pipelines)
- Customize playback behavior (callbacks, shortcuts)
- Add custom export formats
- Implement custom themes
- Create custom hooks
