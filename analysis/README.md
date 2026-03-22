# OpenMAIC Technical Architecture Analysis

## Overview

This directory contains deep-dive analysis documents covering the technical architecture of OpenMAIC, the multi-agent interactive classroom platform. Each document explores a specific aspect of the system in detail.

## Documentation Structure

### 01-overview-architecture.md
**High-Level Architecture Overview**

- Executive summary of the system
- High-level data flow diagram
- Core system components (Generation, Orchestration, Playback, Action)
- Technology stack
- Key metrics
- Extensibility points

### 02-generation-pipeline.md
**Generation Pipeline Deep Dive**

- Stage 1: Outline Generation
  - Input processing (UserRequirements, PDF documents)
  - Prompt construction and templates
  - LLM call and response parsing
  - Post-processing (ID enrichment, media IDs, fallbacks)

- Stage 2: Scene Content Generation
  - Parallel execution architecture
  - Type-specific generators (slide, quiz, interactive, PBL)
  - Post-processing pipeline (LaTeX, image resolution)
  - Action generation

- Model Selection & Customization
  - Provider configuration
  - Task-specific model selection
  - Customization hooks

- Performance Optimization
  - Parallel generation
  - Progress callbacks
  - PDF content truncation
  - Image vision limits

### 03-orchestration.md
**Orchestration System Deep Dive**

- LangGraph StateGraph architecture
- Director Node (single vs multi-agent strategy)
- Agent Generate Node (response streaming)
- Parser State Machine (chunk-based JSON parsing)
- System Prompt Construction
  - Role guidelines
  - Context building (peer, whiteboard, student profile)
  - Message conversion

- Customization & Configuration
  - Agent registry
  - Agent config overrides (request-scoped)
  - Discussion context

- Performance Considerations
  - Streaming efficiency
  - Context window management
  - Token optimization

- Error Handling
  - Parser failures
  - Agent response failures
  - Action validation

### 04-playback-engine.md
**Playback Engine Deep Dive**

- State machine (idle → playing → paused → live)
- Core operations (start, pause, resume, stop)
- Discussion lifecycle (confirm, skip, end)
- User interruption handling
- Core processing loop
- Browser Native TTS
  - Sentence chunking
  - Play chunk
  - Voices loading
  - Cancel TTS

- Progress Tracking
  - Snapshot
  - Restore

- Performance Considerations
  - Timer management
  - State preservation
  - Mode transitions

- Error Handling
  - Speech playback failures
  - Browser TTS failures
  - Invalid discussion actions
  - Agent selection validation

### 05-action-system.md
**Action System Deep Dive**

- Action Types
  - Fire-and-forget (spotlight, laser)
  - Synchronous (speech, video, whiteboard)

- ActionEngine Architecture
  - Execution modes
  - Fire-and-forget execution
  - Synchronous execution (speech, video, whiteboard operations)

- Whiteboard Animation System
  - Fade-in animation
  - Cascade exit animation
  - Open/close animations

- Tool Schema & Validation
  - Effective actions (scene-type-specific filtering)
  - Action descriptions

- Performance Considerations
  - Timer management
  - Animation delays
  - Synchronous execution

- Error Handling
  - LaTeX rendering failures
  - Whiteboard access failures
  - Media generation failures

### 06-customization.md
**Customization & Configuration Deep Dive**

- Provider Configuration
  - Provider registry
  - Environment variables
  - Custom provider implementation

- Agent Customization
  - Agent registry
  - Default agents
  - Custom agent creation
  - Agent role guidelines

- Scene Generation Customization
  - Generation options
  - Custom prompt templates
  - Custom scene types

- Playback Customization
  - Playback configuration
  - Custom playback callbacks
  - Custom playback behavior
  - Keyboard shortcuts

- TTS/ASR Customization
  - TTS provider configuration
  - Custom TTS provider

- Media Generation Customization
  - Media provider configuration
  - Custom media provider

- Export Customization
  - Export formats
  - Custom export templates

- Settings Customization
  - Settings store
  - Settings persistence

- Theme Customization
  - Theme config
  - Dynamic theme application

- Extensibility Hooks
  - `useSceneGenerator`
  - `useAgentConfig`
  - `usePlaybackEngine`

## Key Design Principles

### 1. Separation of Concerns
- Generation, orchestration, playback, and action execution are separate systems
- Each system has clear responsibilities and boundaries

### 2. Modularity
- Components are designed to be independently testable and replaceable
- Plugin architecture for providers (LLM, TTS, ASR, media)

### 3. Statelessness
- Server APIs are stateless
- Orchestration state travels with requests (agentConfigOverrides, whiteboardLedger, etc.)

### 4. Real-Time Streaming
- SSE streaming for multi-agent conversations
- Progressive generation feedback (progress callbacks every 1-2 scenes)

### 5. Extensibility
- Custom providers (LLM, TTS, ASR, media)
- Custom agents (roles, personas, avatars)
- Custom scene types
- Custom playback behavior
- Custom export formats
- Custom themes

### 6. Performance Optimization
- Parallel generation (Promise.all for scenes)
- PDF content truncation (50,000 chars)
- Image vision limits (20 images)
- Timer management
- State preservation for pause/resume

### 7. Robust Error Handling
- Fallback logic at multiple levels (outline → slide, content → skip element)
- Graceful degradation (parser failures, empty responses, disallowed actions)

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

## Architecture Diagram

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
│  - For each scene (parallel execution with Promise.all)             │
│    ├─ Type-specific content generation                              │
│    ├─ Action generation (speech, spotlight, whiteboard, etc.)      │
│    └─ Create complete Scene object with actions[]                  │
│  - Output: Scene[] (full classroom)                                 │
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

## Extensibility Points

### 1. LLM Providers
- Add to `lib/ai/providers.ts`
- Implement `LLMProvider` interface
- Register in `PROVIDERS` constant

### 2. TTS/ASR Providers
- Add to `lib/audio/tts-providers.ts` / `lib/audio/asr-providers.ts`
- Implement `TTSProvider` / `ASRProvider` interface
- Add to `TTS_PROVIDERS` / `ASR_PROVIDERS` constant

### 3. Media Providers
- Add to `lib/media/image-providers.ts` / `lib/media/video-providers.ts`
- Implement `ImageProvider` / `VideoProvider` interface
- Add to `IMAGE_PROVIDERS` / `VIDEO_PROVIDERS` constant

### 4. Agent Roles
- Add to `lib/orchestration/registry/types.ts`
- Update `ROLE_GUIDELINES` in `lib/orchestration/prompt-builder.ts`
- Add to `DEFAULT_AGENTS` in `lib/orchestration/registry/default-agents.ts`

### 5. Scene Types
- Add to `SceneOutline` type in `lib/types/generation.ts`
- Implement generator in `lib/generation/scene-generator.ts`
- Add renderer in `components/scene-renderers/`

### 6. Playback Behavior
- Implement custom `PlaybackEngineCallbacks`
- Override `ActionEngine.execute()`
- Add keyboard shortcuts in `lib/hooks/use-keyboard-shortcuts.ts`

### 7. Export Formats
- Implement export function in `lib/export/use-export-pptx.ts` / `lib/export/use-export-html.ts`
- Add custom templates in `lib/export/export-templates/`

### 8. Themes
- Add to `configs/theme.ts`
- Apply in `lib/hooks/use-theme.ts`

### 9. Custom Hooks
- Create custom hooks using existing patterns
- Export from `lib/hooks/`

## Quick Reference

### Generation Pipeline
- **Stage 1**: `lib/generation/pipeline-runner.ts` → `generateSceneOutlinesFromRequirements()`
- **Stage 2**: `lib/generation/pipeline-runner.ts` → `generateFullScenes()`
- **Content Generation**: `lib/generation/scene-generator.ts`
- **Action Generation**: `lib/generation/scene-generator.ts` → `generateSceneActions()`

### Orchestration
- **Director Graph**: `lib/orchestration/director-graph.ts`
- **Director Node**: `lib/orchestration/director-graph.ts` → `directorNode()`
- **Agent Generate Node**: `lib/orchestration/director-graph.ts` → `agentGenerateNode()`
- **Prompt Builder**: `lib/orchestration/prompt-builder.ts`
- **Parser**: `lib/orchestration/director-prompt.ts` → `parseStructuredChunk()`

### Playback
- **Engine**: `lib/playback/engine.ts`
- **State Machine**: `lib/playback/types.ts`
- **Core Operations**: `lib/playback/engine.ts` → `start()`, `pause()`, `resume()`, `stop()`
- **Browser TTS**: `lib/playback/engine.ts` → `playBrowserTTSChunk()`

### Action System
- **Engine**: `lib/action/engine.ts`
- **Execution**: `lib/action/engine.ts` → `execute()`
- **Fire-and-Forget**: `lib/action/engine.ts` → `executeSpotlight()`, `executeLaser()`
- **Synchronous**: `lib/action/engine.ts` → `executeSpeech()`, `executePlayVideo()`, `executeWbDraw*()`

### Configuration
- **Providers**: `lib/ai/providers.ts`, `server-providers.yml`
- **Agents**: `lib/orchestration/registry/types.ts`, `lib/orchestration/registry/store.ts`
- **Settings**: `lib/store/settings.ts`
- **Themes**: `configs/theme.ts`

## Next Steps

1. **Review the overview** (`01-overview-architecture.md`) to understand the high-level architecture
2. **Deep dive into generation** (`02-generation-pipeline.md`) to understand how lessons are created
3. **Explore orchestration** (`03-orchestration.md`) to understand multi-agent conversations
4. **Study playback** (`04-playback-engine.md`) to understand lecture playback and interaction
5. **Examine actions** (`05-action-system.md`) to understand action execution
6. **Review customization** (`06-customization.md`) to understand extensibility points

## Contributing

When contributing to OpenMAIC:

1. **Follow the separation of concerns**: Keep generation, orchestration, playback, and action separate
2. **Maintain type safety**: Use TypeScript strictly
3. **Implement fallbacks**: Provide graceful degradation for all critical operations
4. **Optimize performance**: Use parallel execution where possible
5. **Handle errors gracefully**: Log errors but don't crash the system
6. **Document changes**: Update this analysis directory when making architectural changes

## License

This analysis is based on the OpenMAIC project, which is licensed under AGPL-3.0.
