# OpenMAIC Technical Architecture Overview

## Executive Summary

OpenMAIC is a **multi-stage, multi-agent interactive learning platform** that transforms user input (topic descriptions or uploaded materials) into an interactive classroom experience. The architecture is designed to be:

- **Modular**: Separate concerns for generation, orchestration, playback, and action execution
- **Extensible**: Pluggable providers for LLMs, TTS, ASR, media generation
- **Stateless**: Server APIs are stateless; orchestration state travels with requests
- **Real-time**: SSE streaming for multi-agent conversations; progressive generation feedback

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Input                                  │
│  - Topic description text                                           │
│  - Uploaded documents (PDF, etc.)                                   │
│  - Optional: student profile, web search, image generation enabled  │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Stage 1: Outline Generation                      │
│  - AI analyzes requirements & documents                             │
│  - Generates Scene Outline[] (ordered list of scenes)              │
│  - Scene types: slide, quiz, interactive, PBL                      │
│  - Output: SceneOutline[] with metadata                            │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Stage 2: Scene Content Generation                │
│  For each scene in parallel:                                        │
│    ├─ Type-specific content generation (slide/quiz/interactive/PBL)│
│    ├─ Action generation (speech, spotlight, whiteboard, etc.)      │
│    └─ Create complete Scene object with actions[]                  │
│  Output: Scene[] (full classroom)                                   │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Playback & Interaction                           │
│  - PlaybackEngine: State machine (idle → playing → live → paused)  │
│  - Multi-agent orchestration via LangGraph                          │
│  - ActionEngine: Executes all action types (speech, wb, effects)    │
│  - Real-time SSE streaming for conversations                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Core System Components

### 1. **Generation Pipeline** (`lib/generation/`)

**Purpose**: Two-stage content generation from raw requirements to complete scenes.

**Architecture**:

```
pipeline-runner.ts
    │
    ├─► Stage 1: generateSceneOutlinesFromRequirements()
    │    ├─ Build prompts with user requirements, PDF content, images
    │    ├─ Call LLM → SceneOutline[]
    │    └─ Apply fallback logic (interactive → slide, PBL → slide)
    │
    └─► Stage 2: generateFullScenes()
         ├─ For each outline (parallel execution with Promise.all)
         │    ├─ Step 3.1: generateSceneContent()
         │    │    ├─ Type-specific generation:
         │    │    │   • slide → generateSlideContent()
         │    │    │   • quiz → generateQuizContent()
         │    │    │   • interactive → generateInteractiveContent()
         │    │    │       ├─ Scientific modeling (with fallback)
         │    │    │       └─ HTML generation
         │    │    └─ Post-processing (LaTeX, image resolution)
         │    │
         │    └─ Step 3.2: generateSceneActions()
         │         ├─ Build prompts with scene context
         │         ├─ Call LLM → Action[]
         │         └─ Validate & fill action IDs
         │
         └─► CreateSceneWithActions()
              └─ Return Scene object to store
```

**Key Design Decisions**:

1. **Two-Stage Pipeline**: Separation of outline (structure) and content (details) enables:
   - Parallel generation of scenes
   - Fallback logic at outline level (interactive → slide)
   - Clearer prompts (outline-focused vs content-focused)

2. **Parallel Scene Generation**: Uses `Promise.all()` for concurrent scene creation, dramatically improving speed for long lessons.

3. **Media Placeholder System**: AI generates `gen_img_N`/`gen_vid_N` IDs; actual media is generated asynchronously and resolved at runtime.

4. **Type-Specific Content Generation**: Each scene type has dedicated generators with appropriate prompts and post-processing.

### 2. **Orchestration System** (`lib/orchestration/`)

**Purpose**: Multi-agent conversation management via LangGraph.

**Architecture**:

```
StateGraph (LangGraph)
    │
    ├─► Director Node (LLM-based decision)
    │    ├─ Single agent: Code-only logic (no LLM calls)
    │    │   • Turn 0: Dispatch agent
    │    │   • Turn 1+: Cue user
    │    │
    │    └─ Multi agent: LLM-based with fast paths
    │         ├─ Turn 0 + triggerAgentId: Dispatch trigger (skip LLM)
    │         ├─ Otherwise: LLM decides next agent / USER / END
    │         └─ Response streamed via SSE
    │
    └─► Agent Generate Node (runAgentGeneration)
         ├─ Build agent-specific system prompt
         ├─ Stream response with parseStructuredChunk()
         │    ├─ text_delta: Speech content
         │    ├─ action: Action objects (spotlight, wb, etc.)
         │    └─ onEnd: Emit agent_end event
         └─ Update state (turnCount, agentResponses, etc.)
```

**Key Design Decisions**:

1. **Unified Director Graph**: Same topology for single and multi-agent (code fast-path for single agent).

2. **Custom Parser State Machine**: `createParserState()` → `parseStructuredChunk()` → `finalizeParser()` handles:
   - JSON array parsing
   - Interleaved text and action objects
   - Streaming response processing
   - Graceful fallback for incomplete JSON

3. **Stateless Architecture**: Agent configs travel with requests (`agentConfigOverrides`), no server-side persistence needed.

4. **Context Tracking**:
   - `whiteboardLedger`: Tracks whiteboard changes per turn
   - `agentResponses`: Conversation history with previews
   - `storeState`: Current classroom state (scenes, whiteboard, etc.)

### 3. **Playback Engine** (`lib/playback/`)

**Purpose**: Unified state machine for lecture playback and live discussion.

**State Machine**:

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

**Key Operations**:

- **Speech Playback**: Pre-generated audio (TTS) OR browser-native TTS with sentence chunking
- **Discussion Lifecycle**:
  - Agent triggers discussion → 3s delay → ProactiveCard shown
  - User clicks "Join" → save lecture state → live mode
  - User clicks "Skip" → consumed → continue
  - Discussion ends → restore lecture → idle
- **User Interruption**: Any user message → interrupt → live mode → save state
- **Progress Tracking**: `getSnapshot()` / `restoreFromSnapshot()` for pause/resume

**Key Design Decisions**:

1. **Mode-Based State Machine**: Clear separation between lecture playback and live discussion.

2. **Browser TTS Chunking**: Chrome bug workaround (15s utterance cutoff) → split into sentence-level chunks.

3. **State Preservation**: Discussion end saves lecture state (sceneIndex, actionIndex) to avoid replaying previous speech.

### 4. **Action Engine** (`lib/action/`)

**Purpose**: Unified execution layer for all agent actions.

**Execution Modes**:

```
┌──────────────────────────────────────────────────────────────┐
│                    Fire-and-Forget                          │
│  Spotlight, Laser → Dispatch & return immediately            │
│  Auto-clear after 5 seconds                                  │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                    Synchronous                              │
│  Speech, Video, Whiteboard actions → await completion       │
│  Sequential execution (one action at a time)                 │
└──────────────────────────────────────────────────────────────┘
```

**Action Types** (28+):

| Category | Actions | Purpose |
|----------|---------|---------|
| **Speech** | `speech` | Text-to-speech (pre-generated or browser TTS) |
| **Visual Effects** | `spotlight`, `laser` | Focus attention on elements |
| **Video** | `play_video` | Play video elements (await completion) |
| **Whiteboard** | `wb_open`, `wb_close`, `wb_draw_*`, `wb_clear`, `wb_delete` | Interactive whiteboard operations |
| **Discussion** | `discussion` | Trigger discussion prompts |

**Key Design Decisions**:

1. **Unified Execution**: Single `execute()` method handles all action types with switch-case dispatch.

2. **Media Placeholder Resolution**: `resolveMediaPlaceholderId()` bridges slide element IDs (e.g., `video_abc123`) with media store keys (e.g., `gen_vid_1`).

3. **Whiteboard Auto-Open**: Implicitly opens whiteboard before draw/clear/delete actions.

4. **Animation Delays**: 800ms fade-in for whiteboard elements; cascade exit animation for `wb_clear`.

## Data Flow Summary

```
1. User Input
   ↓
2. Stage 1: Outline Generation
   - LLM analyzes requirements + documents
   - Output: SceneOutline[] (structure)
   ↓
3. Stage 2: Scene Content
   - For each outline (parallel):
     - Type-specific content generation
     - Action generation
     - Post-processing (LaTeX, image resolution)
   - Output: Scene[] (complete classroom)
   ↓
4. Playback
   - PlaybackEngine processes Scene.actions[]
   - ActionEngine executes actions sequentially
   ↓
5. Interaction
   - Multi-agent orchestration via LangGraph
   - Real-time SSE streaming
   - PlaybackEngine handles interruptions, discussions
```

## Technology Stack

- **Framework**: Next.js 16 (App Router), React 19
- **Language**: TypeScript 5
- **Orchestration**: LangGraph 1.1
- **AI SDK**: Vercel AI SDK (streaming, structured output)
- **State Management**: Zustand stores (canvas, settings, media generation, whiteboard history)
- **Styling**: Tailwind CSS 4
- **Math**: KaTeX (LaTeX rendering)
- **Build**: pnpm workspace, rollup (custom packages)

## Key Metrics

- **Generation Pipeline**: Two-stage (outline → scenes), parallel scene creation
- **Concurrency**: 28+ action types, 4 scene types, 3+ agent roles
- **Streaming**: SSE for real-time multi-agent conversations
- **Performance**: Parallel generation, progress callbacks every 1-2 scenes

## Extensibility Points

1. **LLM Providers**: Pluggable via `lib/ai/providers.ts` (OpenAI, Anthropic, Google, DeepSeek, etc.)
2. **TTS/ASR**: `lib/audio/tts-providers.ts` / `lib/audio/asr-providers.ts`
3. **Media Generation**: `lib/media/media-orchestrator.ts` (image, video providers)
4. **Scene Types**: Extend by adding new `generateXxxContent()` functions and renderers
5. **Agent Roles**: Add to `lib/orchestration/registry/types.ts` and `ROLE_GUIDELINES`

## Next Steps

See subsequent analysis documents for detailed breakdowns of:
- Generation pipeline (Stage 1 & 2) in `analysis/02-generation-pipeline.md`
- Orchestration system in `analysis/03-orchestration.md`
- Playback engine in `analysis/04-playback-engine.md`
- Action system in `analysis/05-action-system.md`
- Customization & configuration in `analysis/06-customization.md`
