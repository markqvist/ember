# Orchestration System Deep Dive

## Overview

The orchestration system manages multi-agent conversations via LangGraph, providing real-time SSE streaming for interactive classroom discussions. It supports both **single-agent** and **multi-agent** modes with adaptive logic.

## Architecture

### LangGraph StateGraph

```
┌─────────────────────────────────────────────────────────────────┐
│                    OrchestratorState                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Immutable (set once at graph entry)                     │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ • messages: StatelessChatRequest['messages']            │   │
│  │ • storeState: Current classroom state                    │   │
│  │ • availableAgentIds: string[]                           │   │
│  │ • maxTurns: number                                      │   │
│  │ • languageModel: LanguageModel                          │   │
│  │ • thinkingConfig: ThinkingConfig | null                 │   │
│  │ • discussionContext: { topic, prompt } | null           │   │
│  │ • triggerAgentId: string | null                        │   │
│  │ • userProfile: { nickname, bio } | null                 │   │
│  │ • agentConfigOverrides: Record<string, AgentConfig>     │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Mutable (updated by nodes)                              │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ • currentAgentId: string | null                         │   │
│  │ • turnCount: number                                     │   │
│  │ • agentResponses: AgentTurnSummary[] (reducer)          │   │
│  │ • whiteboardLedger: WhiteboardActionRecord[] (reducer)  │   │
│  │ • shouldEnd: boolean                                    │   │
│  │ • totalActions: number                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Director Node                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Strategy 1: Single Agent (≤1 agent)                     │   │
│  │  • Turn 0: Dispatch agent                               │   │
│  │  • Turn 1+: Cue user (keep session active)              │   │
│  │  • No LLM calls                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Strategy 2: Multi Agent (>1 agent)                      │   │
│  │  • Turn 0 + triggerAgentId: Dispatch trigger            │   │
│  │  • Otherwise: LLM decision (next agent / USER / END)   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Agent Generate Node                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. Build agent-specific system prompt                    │   │
│  │ 2. Stream response with parseStructuredChunk()           │   │
│  │ 3. Emit events:                                         │   │
│  │     • agent_start                                        │   │
│  │     • text_delta (speech content)                       │   │
│  │     • action (spotlight, wb, etc.)                      │   │
│  │     • agent_end                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                            END
```

### Graph Topology

```typescript
export function createOrchestrationGraph() {
  const graph = new StateGraph(OrchestratorState)
    .addNode('director', directorNode)
    .addNode('agent_generate', agentGenerateNode)
    .addEdge(START, 'director')
    .addConditionalEdges('director', directorCondition, {
      agent_generate: 'agent_generate',
      [END]: END,
    })
    .addEdge('agent_generate', 'director');

  return graph.compile();
}
```

## Director Node

### Single Agent Strategy

```typescript
async function directorNode(state: OrchestratorStateType, config: LangGraphRunnableConfig) {
  const isSingleAgent = state.availableAgentIds.length <= 1;

  // Turn limit check
  if (state.turnCount >= state.maxTurns) {
    return { shouldEnd: true };
  }

  if (isSingleAgent) {
    const agentId = state.availableAgentIds[0] || 'default-1';

    if (state.turnCount === 0) {
      // First turn: dispatch the agent
      write({
        type: 'thinking',
        data: { stage: 'agent_loading', agentId },
      });
      return { currentAgentId: agentId, shouldEnd: false };
    }

    // Agent already responded: cue user for follow-up
    write({
      type: 'cue_user',
      data: { fromAgentId: agentId },
    });
    return { shouldEnd: true };
  }
  // ... multi agent logic
}
```

**Behavior**:
- Turn 0: Agent speaks first
- Turn 1+: User is cued to speak (keeps session alive for follow-ups)
- No LLM calls (pure code logic)

### Multi Agent Strategy

```typescript
// Fast-path for first turn with trigger
if (state.turnCount === 0 && state.triggerAgentId) {
  const triggerId = state.triggerAgentId;
  if (state.availableAgentIds.includes(triggerId)) {
    write({
      type: 'thinking',
      data: { stage: 'agent_loading', agentId: triggerId },
    });
    return { currentAgentId: triggerId, shouldEnd: false };
  }
}

// LLM-based decision
const agents = state.availableAgentIds
  .map((id) => resolveAgent(state, id))
  .filter((a): a is AgentConfig => a != null);

const openaiMessages = convertMessagesToOpenAI(state.messages);
const conversationSummary = summarizeConversation(openaiMessages);

const prompt = buildDirectorPrompt(
  agents,
  conversationSummary,
  state.agentResponses,
  state.turnCount,
  state.discussionContext,
  state.triggerAgentId,
  state.whiteboardLedger,
  state.userProfile || undefined,
  state.storeState.whiteboardOpen,
);

const adapter = new AISdkLangGraphAdapter(state.languageModel, state.thinkingConfig ?? undefined);
const result = await adapter._generate(
  [new SystemMessage(prompt), new HumanMessage('Decide which agent should speak next.')],
  { signal: config.signal } as Record<string, unknown>,
);

const decision = parseDirectorDecision(result.generations[0]?.text || '');
```

**Decision Types**:

```typescript
interface DirectorDecision {
  shouldEnd?: boolean;
  nextAgentId?: string;  // Agent ID or 'USER'
}
```

**LLM Output Format**:

```json
[
  {"type": "text", "content": "Let's discuss quantum entanglement..."},
  {"type": "action", "name": "wb_open", "params": {}},
  {"type": "action", "name": "wb_draw_latex", "params": {"latex": "Ψ(x,t)...", "x": 100, "y": 100}},
  {"type": "text", "content": "This equation describes..."}
]
```

## Agent Generate Node

### Response Streaming

```typescript
async function runAgentGeneration(
  state: OrchestratorStateType,
  agentId: string,
  config: LangGraphRunnableConfig,
): Promise<{
  contentPreview: string;
  actionCount: number;
  whiteboardActions: WhiteboardActionRecord[];
}> {
  const agentConfig = resolveAgent(state, agentId);
  const rawWrite = config.writer as (chunk: StatelessEvent) => void;
  const write = (chunk: StatelessEvent) => {
    try {
      rawWrite(chunk);
    } catch (e) {
      log.warn(`[AgentGenerate] write failed for ${agentId}:`, e);
    }
  };
  const messageId = `assistant-${agentId}-${Date.now()}`;

  // Emit agent_start
  write({
    type: 'agent_start',
    data: {
      messageId,
      agentId,
      agentName: agentConfig.name,
      agentAvatar: agentConfig.avatar,
      agentColor: agentConfig.color,
    },
  });

  // Build system prompt with context
  const systemPrompt = buildStructuredPrompt(
    agentConfig,
    state.storeState,
    state.discussionContext,
    state.whiteboardLedger,
    state.userProfile || undefined,
    state.agentResponses,
  );

  const openaiMessages = convertMessagesToOpenAI(state.messages, agentId);
  const lcMessages = [
    new SystemMessage(systemPrompt),
    ...openaiMessages.map((m) =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
    ),
  ];

  // Ensure trailing HumanMessage
  const lastMsg = lcMessages[lcMessages.length - 1];
  if (!lcMessages.some((m) => m instanceof HumanMessage)) {
    lcMessages.push(new HumanMessage('Please begin.'));
  } else if (lastMsg instanceof AIMessage) {
    lcMessages.push(new HumanMessage("It's your turn to speak."));
  }

  // Stream response
  const parserState = createParserState();
  let fullText = '';
  let actionCount = 0;
  const whiteboardActions: WhiteboardActionRecord[] = [];

  for await (const chunk of adapter.streamGenerate(lcMessages, {
    signal: config.signal,
  })) {
    if (chunk.type === 'delta') {
      const parseResult = parseStructuredChunk(chunk.content, parserState);

      // Emit ordered entries (text and action objects)
      for (const entry of parseResult.ordered) {
        if (entry.type === 'text') {
          const rawText = parseResult.textChunks[entry.index];
          const text = rawText.replace(/^>+\s?/gm, '');
          fullText += text;
          write({
            type: 'text_delta',
            data: { content: text, messageId },
          });
        } else if (entry.type === 'action') {
          const ac = parseResult.actions[entry.index];
          // Validate action against allowed actions
          if (effectiveActions.includes(ac.actionName)) {
            actionCount++;
            if (ac.actionName.startsWith('wb_')) {
              whiteboardActions.push({
                actionName: ac.actionName as WhiteboardActionRecord['actionName'],
                agentId,
                agentName: agentConfig.name,
                params: ac.params,
              });
            }
            write({
              type: 'action',
              data: {
                actionId: ac.actionId,
                actionName: ac.actionName,
                params: ac.params,
                agentId,
                messageId,
              },
            });
          }
        }
      }

      // Emit trailing partial text deltas
      for (let i = parseResult.ordered.length; i < parseResult.textChunks.length; i++) {
        const rawText = parseResult.textChunks[i];
        const text = rawText.replace(/^>+\s?/gm, '');
        fullText += text;
        write({
          type: 'text_delta',
          data: { content: text, messageId },
        });
      }
    }
  }

  // Finalize parser (handle incomplete JSON)
  const finalResult = finalizeParser(parserState);
  for (const entry of finalResult.ordered) {
    if (entry.type === 'text') {
      const rawText = finalResult.textChunks[entry.index];
      const text = rawText.replace(/^>+\s?/gm, '');
      fullText += text;
      write({
        type: 'text_delta',
        data: { content: text, messageId },
      });
    }
  }

  // Emit agent_end
  write({
    type: 'agent_end',
    data: { messageId, agentId },
  });

  return {
    contentPreview: fullText.slice(0, 300),
    actionCount,
    whiteboardActions,
  };
}
```

### Parser State Machine

```typescript
interface ParserState {
  ordered: Array<{ type: 'text' | 'action'; index: number }>;
  textChunks: string[];
  actions: any[];
  isDone: boolean;
  buffer: string;
  bracketDepth: number;
}

function createParserState(): ParserState {
  return {
    ordered: [],
    textChunks: [],
    actions: [],
    isDone: false,
    buffer: '',
    bracketDepth: 0,
  };
}

function parseStructuredChunk(content: string, state: ParserState): ParserState {
  // Detect start of JSON array: [
  if (!state.isDone && content.startsWith('[')) {
    state.buffer += content;
    state.bracketDepth++;
  }

  // Detect end of JSON array: ]
  if (!state.isDone && content.includes(']')) {
    state.buffer += content;
    state.bracketDepth--;

    if (state.bracketDepth === 0) {
      try {
        const parsed = JSON.parse(state.buffer);
        if (Array.isArray(parsed)) {
          // Add ordered entries
          parsed.forEach((item, index) => {
            if (item.type === 'text') {
              state.ordered.push({ type: 'text', index });
            } else if (item.type === 'action') {
              state.ordered.push({ type: 'action', index });
            }
          });
          // Add text chunks
          parsed.forEach((item) => {
            if (item.type === 'text') {
              state.textChunks.push(item.content);
            }
          });
          // Add actions
          parsed.forEach((item) => {
            if (item.type === 'action') {
              state.actions.push(item);
            }
          });
        }
        state.isDone = true;
      } catch (e) {
        // Invalid JSON, continue buffering
      }
    }
  } else if (!state.isDone) {
    state.buffer += content;
  }

  return state;
}

function finalizeParser(state: ParserState): ParserState {
  // If incomplete JSON, try to parse remaining buffer
  if (!state.isDone && state.buffer.trim()) {
    try {
      const parsed = JSON.parse(state.buffer);
      if (Array.isArray(parsed)) {
        parsed.forEach((item, index) => {
          if (item.type === 'text') {
            state.ordered.push({ type: 'text', index });
          } else if (item.type === 'action') {
            state.ordered.push({ type: 'action', index });
          }
        });
        parsed.forEach((item) => {
          if (item.type === 'text') {
            state.textChunks.push(item.content);
          }
        });
        parsed.forEach((item) => {
          if (item.type === 'action') {
            state.actions.push(item);
          }
        });
      }
    } catch (e) {
      // Invalid JSON, ignore
    }
  }
  return state;
}
```

## System Prompt Construction

### Role Guidelines

```typescript
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

### Context Building

```typescript
export function buildStructuredPrompt(
  agentConfig: AgentConfig,
  storeState: StatelessChatRequest['storeState'],
  discussionContext?: DiscussionContext,
  whiteboardLedger?: WhiteboardActionRecord[],
  userProfile?: { nickname?: string; bio?: string },
  agentResponses?: AgentTurnSummary[],
): string {
  // Determine current scene type
  const currentScene = storeState.currentSceneId
    ? storeState.scenes.find((s) => s.id === storeState.currentSceneId)
    : undefined;
  const sceneType = currentScene?.type;

  // Filter actions by scene type
  const effectiveActions = getEffectiveActions(agentConfig.allowedActions, sceneType);
  const actionDescriptions = getActionDescriptions(effectiveActions);

  // Build state context
  const stateContext = buildStateContext(storeState);

  // Build virtual whiteboard context
  const virtualWbContext = buildVirtualWhiteboardContext(storeState, whiteboardLedger);

  // Build student profile section
  const studentProfileSection =
    userProfile?.nickname || userProfile?.bio
      ? `\n# Student Profile
You are teaching ${userProfile.nickname || 'a student'}.${userProfile.bio ? `\nTheir background: ${userProfile.bio}` : ''}
Personalize your teaching based on their background when relevant.`
      : '';

  // Build peer context (what agents already said this round)
  const peerContext = buildPeerContextSection(agentResponses, agentConfig.name);

  // Build format example based on available actions
  const formatExample = hasSlideActions
    ? `[{"type":"action","name":"spotlight","params":{"elementId":"img_1"}},{"type":"text","content":"Your speech"}]`
    : `[{"type":"action","name":"wb_open","params":{}},{"type":"text","content":"Your speech"}]`;

  // Language constraint
  const courseLanguage = storeState.stage?.language;
  const languageConstraint = courseLanguage
    ? `\n# Language (CRITICAL)\nYou MUST speak in ${courseLanguage === 'zh-CN' ? 'Chinese' : 'English'}.\n`
    : '';

  return `# Role
You are ${agentConfig.name}.

## Your Personality
${agentConfig.persona}

## Your Classroom Role
${roleGuideline}
${studentProfileSection}${peerContext}${languageConstraint}

# Output Format
You MUST output a JSON array.

${formatExample}

## Ordering Principles
${hasSlideActions ? '- spotlight/laser before corresponding text' : '- whiteboard can interleave'}

# Available Actions
${actionDescriptions}
`;
}
```

### Peer Context Section

```typescript
function buildPeerContextSection(
  agentResponses: AgentTurnSummary[] | undefined,
  currentAgentName: string,
): string {
  if (!agentResponses || agentResponses.length === 0) return '';

  const peers = agentResponses.filter((r) => r.agentName !== currentAgentName);
  if (peers.length === 0) return '';

  const peerLines = peers.map((r) => `- ${r.agentName}: "${r.contentPreview}"`).join('\n');

  return `
# This Round's Context (CRITICAL — READ BEFORE RESPONDING)
The following agents have already spoken in this discussion round:
${peerLines}

You are ${currentAgentName}, responding AFTER the agents above. You MUST:
1. NOT repeat greetings or introductions
2. NOT restate what previous speakers already explained
3. Add NEW value from YOUR unique perspective as ${currentAgentName}
4. Build on, question, or extend what was said — do not echo it
`;
}
```

### Virtual Whiteboard Context

```typescript
function buildVirtualWhiteboardContext(
  storeState: StatelessChatRequest['storeState'],
  ledger?: WhiteboardActionRecord[],
): string {
  if (!ledger || ledger.length === 0) return '';

  const elements: VirtualWhiteboardElement[] = [];
  for (const record of ledger) {
    switch (record.actionName) {
      case 'wb_clear':
        elements.length = 0;
        break;
      case 'wb_delete': {
        const deleteId = String(record.params.elementId || '');
        const idx = elements.findIndex((el) => el.elementId === deleteId);
        if (idx >= 0) elements.splice(idx, 1);
        break;
      }
      case 'wb_draw_text': {
        elements.push({
          agentName: record.agentName,
          summary: `text: "${record.params.content?.slice(0, 40)}..." at (${record.params.x},${record.params.y})`,
        });
        break;
      }
      // ... other whiteboard actions
    }
  }

  if (elements.length === 0) return '';

  const elementLines = elements
    .map((el, i) => `  ${i + 1}. [by ${el.agentName}] ${el.summary}`)
    .join('\n');

  return `
## Whiteboard Changes This Round (IMPORTANT)
Other agents have modified the whiteboard during this discussion round.
Current whiteboard elements (${elements.length}):
${elementLines}

DO NOT redraw content that already exists.
`;
}
```

### Message Conversion

```typescript
export function convertMessagesToOpenAI(
  messages: StatelessChatRequest['messages'],
  currentAgentId?: string,
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  return messages
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .map((msg) => {
      if (msg.role === 'assistant') {
        // Assistant messages → JSON array (few-shot examples)
        const items: Array<{ type: string; [key: string]: string }> = [];

        if (msg.parts) {
          for (const part of msg.parts) {
            const p = part as Record<string, unknown>;

            if (p.type === 'text' && p.text) {
              items.push({ type: 'text', content: p.text as string });
            } else if ((p.type as string)?.startsWith('action-') && p.state === 'result') {
              const actionName = (p.actionName || (p.type as string).replace('action-', '')) as string;
              items.push({
                type: 'action',
                name: actionName,
                result: p.output?.success ? 'success' : 'failed',
              });
            }
          }
        }

        const content = items.length > 0 ? JSON.stringify(items) : '';
        const msgAgentId = msg.metadata?.agentId;

        // Convert to user role if from different agent
        if (currentAgentId && msgAgentId && msgAgentId !== currentAgentId) {
          const agentName = msg.metadata?.senderName || msgAgentId;
          return {
            role: 'user' as const,
            content: content ? `[${agentName}]: ${content}` : '',
          };
        }

        return {
          role: 'assistant' as const,
          content,
        };
      }

      // User messages
      const contentParts: string[] = [];
      if (msg.parts) {
        for (const part of msg.parts) {
          const p = part as Record<string, unknown>;

          if (p.type === 'text' && p.text) {
            contentParts.push(p.text as string);
          } else if ((p.type as string)?.startsWith('action-') && p.state === 'result') {
            contentParts.push(`[Action ${p.actionName}: result]`);
          }
        }
      }

      const senderName = msg.metadata?.senderName;
      let content = contentParts.join('\n');
      if (senderName) {
        content = `[${senderName}]: ${content}`;
      }

      return {
        role: 'user' as const,
        content,
      };
    })
    .filter((msg) => {
      const stripped = msg.content.replace(/[.\s…]+/g, '');
      return stripped.length > 0;
    });
}
```

## Customization & Configuration

### Agent Registry

```typescript
// lib/orchestration/registry/types.ts
export interface AgentConfig {
  id: string;
  name: string;
  role: 'teacher' | 'assistant' | 'student';
  persona: string;
  avatar?: string;
  color?: string;
  allowedActions: string[];
  isDefault?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// lib/orchestration/registry/store.ts
export interface AgentRegistryState {
  agents: Map<string, AgentConfig>;
}

export function useAgentRegistry() {
  const { data: agents } = useAgentRegistryQuery();

  function getAgent(agentId: string) {
    return agents.find((a) => a.id === agentId);
  }

  function addAgent(config: AgentConfig) {
    // Add to registry
  }

  function updateAgent(agentId: string, config: Partial<AgentConfig>) {
    // Update agent config
  }

  function removeAgent(agentId: string) {
    // Remove agent
  }

  return { agents, getAgent, addAgent, updateAgent, removeAgent };
}
```

### Agent Config Overrides (Request-Scoped)

```typescript
export function buildInitialState(
  request: StatelessChatRequest,
  languageModel: LanguageModel,
  thinkingConfig?: ThinkingConfig,
): typeof OrchestratorState.State {
  // Build request-scoped agent config overrides
  const agentConfigOverrides: Record<string, AgentConfig> = {};
  if (request.config.agentConfigs?.length) {
    for (const cfg of request.config.agentConfigs) {
      agentConfigOverrides[cfg.id] = {
        ...cfg,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
  }

  return {
    messages: request.messages,
    storeState: request.storeState,
    availableAgentIds: request.config.agentIds,
    maxTurns: turnCount + 1,
    languageModel,
    thinkingConfig: thinkingConfig ?? null,
    discussionContext: request.config.discussionTopic
      ? {
          topic: request.config.discussionTopic,
          prompt: request.config.discussionPrompt,
        }
      : null,
    triggerAgentId: request.config.triggerAgentId || null,
    userProfile: request.userProfile || null,
    agentConfigOverrides,
    currentAgentId: null,
    turnCount,
    agentResponses: incoming?.agentResponses ?? [],
    whiteboardLedger: incoming?.whiteboardLedger ?? [],
    shouldEnd: false,
    totalActions: 0,
  };
}
```

### Discussion Context

```typescript
interface DiscussionContext {
  topic: string;
  prompt?: string;
}
```

**Usage**:

```typescript
// When user initiates discussion
const result = await runGenerationPipeline(session, store, aiCall, {
  discussionContext: {
    topic: 'What do you think about quantum entanglement?',
    prompt: 'Ask clarifying questions and explain key concepts.',
  },
});
```

**Agent Prompt**:

```
# Discussion Context
Topic: "What do you think about quantum entanglement?"
Guiding prompt: 'Ask clarifying questions and explain key concepts.'

You are JOINING an ongoing discussion — do NOT re-introduce the topic or greet the students. The discussion has already started. Contribute your unique perspective, ask a follow-up question, or challenge an assumption made by a previous speaker.
```

## Performance Considerations

### Streaming Efficiency

- **Chunk-based parsing**: `parseStructuredChunk()` processes streaming content incrementally
- **Ordered emission**: Text and action objects emitted in original interleaved order
- **Partial text handling**: Trailing partial text deltas emitted after complete JSON

### Context Window Management

- **Conversation summarization**: `summarizeConversation()` condenses last 10 messages
- **Whiteboard ledger**: Only tracks whiteboard actions (not full state)
- **Agent responses**: Store previews (300 chars) instead of full text

### Token Optimization

- **Peer context**: Only includes previous agents' previews
- **Whiteboard context**: Summarizes elements (not full state)
- **Action descriptions**: Dynamic filtering based on scene type

## Error Handling

### Parser Failures

```typescript
function finalizeParser(state: ParserState): ParserState {
  if (!state.isDone && state.buffer.trim()) {
    try {
      const parsed = JSON.parse(state.buffer);
      // Handle parsed content
    } catch (e) {
      // Invalid JSON, ignore
    }
  }
  return state;
}
```

**Behavior**: Invalid JSON falls back to emitting all text chunks and actions from buffer.

### Agent Response Failures

```typescript
if (!result.contentPreview && result.actionCount === 0) {
  log.warn(`Agent "${agentConfig?.name || agentId}" produced empty response`);
}
```

**Behavior**: Empty response logged but doesn't crash orchestration.

### Action Validation

```typescript
if (!effectiveActions.includes(ac.actionName)) {
  log.warn(`Agent ${agentConfig.name} attempted disallowed action: ${ac.actionName}, skipping`);
  continue;
}
```

**Behavior**: Disallowed actions are skipped, not emitted.

## Summary

The orchestration system is a sophisticated LangGraph-based multi-agent conversation manager that:

1. **Adapts to agent count**: Single agent (code-only) vs multi-agent (LLM-based)
2. **Provides real-time streaming**: SSE with chunk-based parsing
3. **Tracks conversation state**: Agent responses, whiteboard ledger, turn count
4. **Supports context-rich prompts**: Peer context, whiteboard context, student profile
5. **Enables request-scoped configs**: Agent overrides travel with requests
6. **Handles errors gracefully**: Parser failures, empty responses, disallowed actions

The system's modularity enables:
- Custom agent roles via `ROLE_GUIDELINES`
- Scene-type-specific action filtering
- Dynamic prompt construction based on state
- Request-scoped agent configuration
- Discussion context for agent-initiated conversations
