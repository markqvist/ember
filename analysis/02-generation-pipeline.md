# Generation Pipeline Deep Dive

## Overview

The generation pipeline is the heart of OpenMAIC, transforming raw user input into a complete interactive classroom. It consists of **two primary stages**:

1. **Outline Generation**: Analyze requirements and generate scene structure
2. **Scene Content Generation**: Generate full scene content (slides, quizzes, interactive modules, PBL) with actions

## Stage 1: Outline Generation

### Input Processing

**User Requirements Interface** (`UserRequirements`):

```typescript
interface UserRequirements {
  requirement: string;           // Free-form text (topic, description, etc.)
  language: 'zh-CN' | 'en-US';  // CRITICAL: Determines all output language
  userNickname?: string;        // Personalization
  userBio?: string;             // Student background
  webSearch?: boolean;          // Enable web search for context
}
```

**PDF Document Processing**:

```typescript
interface PdfImage {
  id: string;        // e.g., "img_1", "img_2"
  src: string;       // base64 data URL
  pageNumber: number;
  description?: string;
  width?: number;
  height?: number;
}
```

**Key Constants**:

```typescript
export const MAX_PDF_CONTENT_CHARS = 50000;  // Truncate PDF text for LLM context
export const MAX_VISION_IMAGES = 20;         // Max images sent as vision content parts
```

### Prompt Construction

**Prompt Template System** (`lib/generation/prompts/`):

```typescript
// Example: REQUIREMENTS_TO_OUTLINES prompt
const prompts = buildPrompt(PROMPT_IDS.REQUIREMENTS_TO_OUTLINES, {
  requirement: requirements.requirement,
  language: requirements.language,
  pdfContent: truncatedPdfText,
  availableImages: formattedImageDescriptions,
  userProfile: studentProfileText,
  mediaGenerationPolicy: 'Do NOT include image/video mediaGenerations...',
  researchContext: optionalWebSearchResults,
  teacherContext: optionalTeacherPersona,
});
```

**Prompt Sections**:

1. **Role Definition**: "You are an expert curriculum designer..."
2. **User Requirements**: The user's topic, description, and constraints
3. **Student Profile** (optional): Nickname, background for personalization
4. **Available Images**: PDF-extracted images with descriptions
5. **Media Generation Policy**: Disabled if image/video generation not enabled
6. **Output Format**: JSON array of SceneOutline objects

### LLM Call & Response Parsing

```typescript
const response = await aiCall(prompts.system, prompts.user, visionImages);
const outlines = parseJsonResponse<SceneOutline[]>(response);
```

**Response Structure** (`SceneOutline`):

```typescript
interface SceneOutline {
  id: string;
  type: 'slide' | 'quiz' | 'interactive' | 'pbl';
  title: string;
  description: string;
  keyPoints: string[];
  teachingObjective?: string;
  estimatedDuration?: number;
  order: number;
  language: 'zh-CN' | 'en-US';

  // Type-specific configs
  quizConfig?: {
    questionCount: number;
    difficulty: 'easy' | 'medium' | 'hard';
    questionTypes: ('single' | 'multiple' | 'text')[];
  };

  interactiveConfig?: {
    conceptName: string;
    conceptOverview: string;
    designIdea: string;
    subject?: string;
  };

  pblConfig?: {
    projectTopic: string;
    projectDescription: string;
    targetSkills: string[];
    issueCount?: number;
    language: 'zh-CN' | 'en-US';
  };

  // Media placeholder IDs for async generation
  mediaGenerations?: MediaGenerationRequest[];
}
```

### Post-Processing

**1. ID Enrichment**:

```typescript
const enriched = outlines.map((outline, index) => ({
  ...outline,
  id: outline.id || nanoid(),
  order: index + 1,
  language: requirements.language,
}));
```

**2. Media ID Uniquification**:

```typescript
// Replace sequential IDs (gen_img_1, gen_img_2) with globally unique IDs
function uniquifyMediaElementIds(outlines: SceneOutline[]): SceneOutline[] {
  let counter = 1;
  return outlines.map((outline) => ({
    ...outline,
    mediaGenerations: outline.mediaGenerations?.map((mg) => ({
      ...mg,
      elementId: `gen_${mg.type}_${nanoid(8)}`,  // e.g., gen_img_xK8f2mQ
    })),
  }));
}
```

**3. Fallback Logic**:

```typescript
export function applyOutlineFallbacks(
  outline: SceneOutline,
  hasLanguageModel: boolean,
): SceneOutline {
  // Interactive without config → slide
  if (outline.type === 'interactive' && !outline.interactiveConfig) {
    return { ...outline, type: 'slide' };
  }
  // PBL without config or languageModel → slide
  if (outline.type === 'pbl' && (!outline.pblConfig || !hasLanguageModel)) {
    return { ...outline, type: 'slide' };
  }
  return outline;
}
```

## Stage 2: Scene Content Generation

### Parallel Execution Architecture

```typescript
export async function generateFullScenes(
  sceneOutlines: SceneOutline[],
  store: StageStore,
  aiCall: AICallFn,
  callbacks?: GenerationCallbacks,
): Promise<GenerationResult<string[]>> {
  // Generate all scenes in parallel
  const results = await Promise.all(
    sceneOutlines.map(async (outline, index) => {
      const sceneId = await generateSingleScene(outline, api, aiCall);
      // Update progress
      completedCount++;
      callbacks?.onProgress?.({
        currentStage: 3,
        overallProgress: 66 + Math.floor((completedCount / totalScenes) * 34),
        stageProgress: Math.floor((completedCount / totalScenes) * 100),
        statusMessage: `已完成 ${completedCount}/${totalScenes} 个场景`,
      });
      return { success: true, sceneId, index };
    }),
  );

  // Collect successful sceneIds in original order
  const sceneIds = results
    .filter((r) => r.success && r.sceneId !== null)
    .sort((a, b) => a.index - b.index)
    .map((r) => r.sceneId);

  return { success: true, data: sceneIds };
}
```

### Single Scene Generation (Two-Step Process)

```typescript
async function generateSingleScene(
  outline: SceneOutline,
  api: ReturnType<typeof createStageAPI>,
  aiCall: AICallFn,
): Promise<string | null> {
  // Step 3.1: Generate content
  const content = await generateSceneContent(outline, aiCall);

  // Step 3.2: Generate Actions
  const actions = await generateSceneActions(outline, content, aiCall);

  // Create complete Scene
  return createSceneWithActions(outline, content, actions, api);
}
```

### Step 3.1: Content Generation

**Type-Specific Generators**:

```typescript
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
    default:
      return null;
  }
}
```

#### Slide Content Generation

**Prompt Construction**:

```typescript
const prompts = buildPrompt(PROMPT_IDS.SLIDE_CONTENT, {
  title: outline.title,
  description: outline.description,
  keyPoints: outline.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n'),
  elements: '（根据要点自动生成）',
  assignedImages: formattedImageText,
  canvas_width: 1000,
  canvas_height: 562.5,
  teacherContext: formattedTeacherPersona,
});
```

**Response Parsing**:

```typescript
const response = await aiCall(prompts.system, prompts.user, visionImages);
const generatedData = parseJsonResponse<GeneratedSlideData>(response);

// Response structure:
interface GeneratedSlideData {
  elements: Array<{
    type: 'text' | 'image' | 'video' | 'shape' | 'chart' | 'latex' | 'line';
    left: number;
    top: number;
    width: number;
    height: number;
    src?: string;  // Image ID reference or base64 URL
    [key: string]: unknown;
  }>;
  background?: {
    type: 'solid' | 'gradient';
    color?: string;
    gradient?: {
      type: 'linear' | 'radial';
      colors: Array<{ pos: number; color: string }>;
      rotate: number;
    };
  };
  remark?: string;
}
```

**Post-Processing Pipeline**:

```typescript
// 1. Fix element defaults (missing fields, aspect ratio correction)
const fixedElements = fixElementDefaults(generatedData.elements, assignedImages);

// 2. Process LaTeX elements (render LaTeX → HTML via KaTeX)
const latexProcessedElements = processLatexElements(fixedElements);

// 3. Resolve image ID references to actual URLs
const resolvedElements = resolveImageIds(
  latexProcessedElements,
  imageMapping,
  generatedMediaMapping,
);

// 4. Assign unique IDs
const processedElements: PPTElement[] = resolvedElements.map((el) => ({
  ...el,
  id: `${el.type}_${nanoid(8)}`,
  rotate: 0,
}));

// 5. Build background
let background: SlideBackground | undefined;
if (generatedData.background) {
  // Convert to SlideBackground format
}
```

**Image ID Resolution Logic**:

```typescript
function resolveImageIds(
  elements: GeneratedSlideData['elements'],
  imageMapping?: ImageMapping,
  generatedMediaMapping?: ImageMapping,
): GeneratedSlideData['elements'] {
  return elements
    .map((el) => {
      if (el.type === 'image') {
        const src = el.src as string;

        // Case 1: PDF image ID → resolve to base64 URL
        if (isImageIdReference(src)) {
          if (!imageMapping || !imageMapping[src]) {
            return null;  // Remove invalid image elements
          }
          return { ...el, src: imageMapping[src] };
        }

        // Case 2: Generated media ID → resolve to URL or keep placeholder
        if (isGeneratedImageId(src)) {
          if (generatedMediaMapping && generatedMediaMapping[src]) {
            return { ...el, src: generatedMediaMapping[src] };
          }
          // Keep element with placeholder ID — frontend renders skeleton
          return el;
        }
      }

      return el;
    })
    .filter((el): el is NonNullable<typeof el> => el !== null);
}
```

#### Quiz Content Generation

**Prompt Construction**:

```typescript
const prompts = buildPrompt(PROMPT_IDS.QUIZ_CONTENT, {
  title: outline.title,
  description: outline.description,
  keyPoints: outline.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n'),
  questionCount: quizConfig.questionCount,
  difficulty: quizConfig.difficulty,
  questionTypes: quizConfig.questionTypes.join(', '),
});
```

**Response Parsing**:

```typescript
const response = await aiCall(prompts.system, prompts.user);
const generatedQuestions = parseJsonResponse<QuizQuestion[]>(response);

// Normalize question format
const questions: QuizQuestion[] = generatedQuestions.map((q) => {
  const isText = q.type === 'short_answer';
  return {
    ...q,
    id: q.id || `q_${nanoid(8)}`,
    options: isText ? undefined : normalizeQuizOptions(q.options),
    answer: isText ? undefined : normalizeQuizAnswer(q),
    hasAnswer: isText ? false : true,
  };
});
```

#### Interactive Content Generation

**Two-Step Process**:

```typescript
async function generateInteractiveContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  language: 'zh-CN' | 'en-US' = 'zh-CN',
): Promise<GeneratedInteractiveContent | null> {
  // Step 1: Scientific modeling (with fallback on failure)
  let scientificModel: ScientificModel | undefined;
  try {
    const modelPrompts = buildPrompt(PROMPT_IDS.INTERACTIVE_SCIENTIFIC_MODEL, {
      subject: config.subject || '',
      conceptName: config.conceptName,
      conceptOverview: config.conceptOverview,
      keyPoints: outline.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n'),
      designIdea: config.designIdea,
    });

    if (modelPrompts) {
      const modelResponse = await aiCall(modelPrompts.system, modelPrompts.user);
      const parsed = parseJsonResponse<ScientificModel>(modelResponse);
      if (parsed && parsed.core_formulas) {
        scientificModel = parsed;
      }
    }
  } catch (error) {
    log.warn(`Scientific modeling failed, continuing without: ${error}`);
  }

  // Step 2: HTML generation
  const htmlPrompts = buildPrompt(PROMPT_IDS.INTERACTIVE_HTML, {
    conceptName: config.conceptName,
    subject: config.subject || '',
    conceptOverview: config.conceptOverview,
    keyPoints: outline.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n'),
    scientificConstraints: formatScientificConstraints(scientificModel),
    designIdea: config.designIdea,
    language,
  });

  const htmlResponse = await aiCall(htmlPrompts.system, htmlPrompts.user);
  const rawHtml = extractHtml(htmlResponse);

  // Step 3: Post-process HTML (LaTeX delimiter conversion + KaTeX injection)
  const processedHtml = postProcessInteractiveHtml(rawHtml);

  return { html: processedHtml, scientificModel };
}
```

**Scientific Model Structure**:

```typescript
interface ScientificModel {
  core_formulas: string[];
  mechanism: string[];
  constraints: string[];
  forbidden_errors: string[];
}
```

#### PBL Content Generation

```typescript
async function generatePBLSceneContent(
  outline: SceneOutline,
  languageModel?: LanguageModel,
): Promise<GeneratedPBLContent | null> {
  if (!languageModel) {
    log.error('LanguageModel required for PBL generation');
    return null;
  }

  const pblConfig = outline.pblConfig;
  if (!pblConfig) {
    log.error(`PBL outline "${outline.title}" missing pblConfig`);
    return null;
  }

  const projectConfig = await generatePBLContent(
    {
      projectTopic: pblConfig.projectTopic,
      projectDescription: pblConfig.projectDescription,
      targetSkills: pblConfig.targetSkills,
      issueCount: pblConfig.issueCount,
      language: pblConfig.language,
    },
    languageModel,
    {
      onProgress: (msg) => log.info(`${msg}`),
    },
  );

  return { projectConfig };
}
```

### Step 3.2: Action Generation

**Prompt Construction**:

```typescript
const prompts = buildPrompt(PROMPT_IDS.SLIDE_ACTIONS, {
  title: outline.title,
  keyPoints: outline.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n'),
  description: outline.description,
  elements: formatElementsForPrompt(content.elements),
  courseContext: buildCourseContext(ctx),
  agents: formatAgentsForPrompt(agents),
  userProfile: userProfile || '',
});
```

**Response Parsing**:

```typescript
const response = await aiCall(prompts.system, prompts.user);
const actions = parseActionsFromStructuredOutput(response, outline.type);

// Response structure (JSON array):
[
  { type: "action", name: "spotlight", params: { elementId: "img_1" } },
  { type: "text", content: "Photosynthesis is..." },
  { type: "action", name: "wb_open", params: {} },
  { type: "text", content: "Let's analyze..." },
  { type: "action", name: "wb_draw_latex", params: { latex: "E=mc^2", x: 100, y: 100 } },
  { type: "text", content: "This is..." }
]
```

**Action Validation**:

```typescript
function processActions(actions: Action[], elements: PPTElement[], agents?: AgentInfo[]): Action[] {
  const elementIds = new Set(elements.map((el) => el.id));
  const agentIds = new Set(agents?.map((a) => a.id) || []);
  const studentAgents = agents?.filter((a) => a.role === 'student') || [];

  return actions.map((action) => {
    const processedAction: Action = {
      ...action,
      id: action.id || `action_${nanoid(8)}`,
    };

    // Validate spotlight elementId
    if (processedAction.type === 'spotlight') {
      if (!processedAction.elementId || !elementIds.has(processedAction.elementId)) {
        if (elements.length > 0) {
          processedAction.elementId = elements[0].id;
        }
      }
    }

    // Validate/fill discussion agentId
    if (processedAction.type === 'discussion' && agents && agents.length > 0) {
      if (!processedAction.agentId || !agentIds.has(processedAction.agentId)) {
        const pool = studentAgents.length > 0 ? studentAgents : agents.filter((a) => a.role !== 'teacher');
        if (pool.length > 0) {
          processedAction.agentId = pool[Math.floor(Math.random() * pool.length)].id;
        }
      }
    }

    return processedAction;
  });
}
```

**Default Actions (Fallback)**:

```typescript
function generateDefaultSlideActions(outline: SceneOutline, elements: PPTElement[]): Action[] {
  const actions: Action[] = [];

  // Add spotlight for text elements
  const textElements = elements.filter((el) => el.type === 'text');
  if (textElements.length > 0) {
    actions.push({
      id: `action_${nanoid(8)}`,
      type: 'spotlight',
      title: '聚焦重点',
      elementId: textElements[0].id,
    });
  }

  // Add opening speech
  const speechText = outline.keyPoints?.join('。') + '。';
  actions.push({
    id: `action_${nanoid(8)}`,
    type: 'speech',
    title: '场景讲解',
    text: speechText,
  });

  return actions;
}
```

### Scene Creation

```typescript
export function createSceneWithActions(
  outline: SceneOutline,
  content: GeneratedSlideContent | GeneratedQuizContent | GeneratedInteractiveContent | GeneratedPBLContent,
  actions: Action[],
  api: ReturnType<typeof createStageAPI>,
): string | null {
  if (outline.type === 'slide' && 'elements' in content) {
    const slide: Slide = {
      id: nanoid(),
      viewportSize: 1000,
      viewportRatio: 0.5625,
      theme: defaultTheme,
      elements: content.elements,
      background: content.background,
    };

    const sceneResult = api.scene.create({
      type: 'slide',
      title: outline.title,
      order: outline.order,
      content: { type: 'slide', canvas: slide },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'quiz' && 'questions' in content) {
    const sceneResult = api.scene.create({
      type: 'quiz',
      title: outline.title,
      order: outline.order,
      content: { type: 'quiz', questions: content.questions },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'interactive' && 'html' in content) {
    const sceneResult = api.scene.create({
      type: 'interactive',
      title: outline.title,
      order: outline.order,
      content: { type: 'interactive', url: '', html: content.html },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'pbl' && 'projectConfig' in content) {
    const sceneResult = api.scene.create({
      type: 'pbl',
      title: outline.title,
      order: outline.order,
      content: { type: 'pbl', projectConfig: content.projectConfig },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  return null;
}
```

## Model Selection & Customization

### Model Configuration

**Provider Configuration** (`server-providers.yml`):

```yaml
providers:
  openai:
    apiKey: sk-...
  anthropic:
    apiKey: sk-ant-...
  google:
    apiKey: ...
    models:
      - name: gemini-3-flash-preview
        enabled: true
        default: true
```

**Environment Variables** (`.env.local`):

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
DEFAULT_MODEL=google:gemini-3-flash-preview
```

**Model Resolution**:

```typescript
// lib/ai/providers.ts
export async function resolveModel(providerName: string, modelName: string): Promise<LanguageModel> {
  const provider = PROVIDERS[providerName];
  return provider.createModel(modelName);
}
```

### Task-Specific Model Selection

**Prompt Templates by Task Type**:

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
```

**Key Design Decision**: All prompts use the same underlying model; task-specific capabilities come from prompt design, not model selection.

### Customization Hooks

**Hook: `useSceneGenerator`** (`lib/hooks/use-scene-generator.ts`):

```typescript
export function useSceneGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);

  async function generateSceneRequirements(
    requirements: UserRequirements,
    options?: {
      visionEnabled?: boolean;
      imageGenerationEnabled?: boolean;
      videoGenerationEnabled?: boolean;
      researchContext?: string;
    }
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

**Hook: `useAgentConfig`** (`lib/hooks/use-agent-config.ts`):

```typescript
export function useAgentConfig() {
  const { data: agents } = useAgentRegistry();

  function getAgentConfig(agentId: string) {
    return agents.find((a) => a.id === agentId);
  }

  function updateAgentConfig(agentId: string, config: Partial<AgentConfig>) {
    // Update agent config
  }

  return { agents, getAgentConfig, updateAgentConfig };
}
```

## Performance Optimization

### Parallel Generation

```typescript
// All scenes generated concurrently
const results = await Promise.all(
  sceneOutlines.map(async (outline) => {
    return generateSingleScene(outline, api, aiCall);
  }),
);
```

**Impact**: For N scenes, generation time ≈ max(scene_time_i), not sum(scene_time_i).

### Progress Callbacks

```typescript
callbacks?.onProgress?.({
  currentStage: 3,
  overallProgress: 66 + Math.floor((completedCount / totalScenes) * 34),
  stageProgress: Math.floor((completedCount / totalScenes) * 100),
  statusMessage: `已完成 ${completedCount}/${totalScenes} 个场景`,
  scenesGenerated: completedCount,
  totalScenes,
});
```

**Impact**: UI updates every 1-2 scenes (not every action), reducing re-renders.

### PDF Content Truncation

```typescript
const pdfText = pdfText.substring(0, MAX_PDF_CONTENT_CHARS);  // 50,000 chars
```

**Impact**: Prevents LLM context overflow, reduces token costs.

### Image Vision Limit

```typescript
const visionImages = pdfImages.slice(0, MAX_VISION_IMAGES);  // 20 images
```

**Impact**: Reduces prompt size, improves vision API token efficiency.

## Error Handling & Fallbacks

### Outline Fallbacks

```typescript
// Interactive without config → slide
// PBL without config or languageModel → slide
```

### Content Generation Fallbacks

```typescript
// Scientific modeling failure → continue without model
// LaTeX rendering failure → remove element
// Image resolution failure → remove element
```

### Action Generation Fallbacks

```typescript
// Invalid elementId → use first element
// Invalid agentId → pick random student
// Empty response → use default actions
```

## Summary

The generation pipeline is a well-structured, two-stage system that:

1. **Separates concerns**: Outline (structure) vs content (details)
2. **Enables parallelism**: Concurrent scene creation with Promise.all()
3. **Provides fallbacks**: Graceful degradation at multiple levels
4. **Supports extensibility**: Type-specific generators for new scene types
5. **Optimizes performance**: Truncation, vision limits, progress callbacks

The pipeline's modularity makes it easy to:
- Add new scene types (extend `generateSceneContent()`)
- Add new prompt templates (extend `prompts/` directory)
- Add new post-processing steps (extend pipeline)
- Customize generation behavior (hooks, options)
