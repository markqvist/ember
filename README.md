# Ember
**A truly local, offline-first generative learning environment.**

Describe a topic. Attach your documents. Ember constructs a complete interactive classroom with slides, quizzes, simulations, project-based learning, and delivers it with synthesized instructors and peers who speak, draw, debate, and respond in real time. All running on your hardware. No API keys. No cloud dependencies. No data extraction.

Ember is a comprehensive fork and optimization of the [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) project, reimagined for sovereign, offline inference. The original OpenMAIC presents an elegant conceptual architecture for multi-agent educational orchestration, but its implementation assumes hyperscaler API dependency at every layer, making it practically nonfunctional for actual local deployment.

Every mainstream "AI education" platform operates on the same extractive model: Your learning materials, your conversations, your intellectual development is piped to remote infrastructure for analysis, profiling, and monetization. The pedagogical relationship becomes mediated by entities with interests fundamentally misaligned with your own.

Ember corrects this.

## What Ember Does Differently

### Local-First Inference Architecture

Ember treats local inference as a the primary environment, not a fallback. The system is tested and optimized against `llama-swap` and `llama.cpp`-based backends (via llama-server's OpenAI-compatible API) for:

- **Language model inference** — Full support for classroom generation, agent orchestration, and discussion flows using local GGUF models
- **Text-to-speech** — Integrated with local TTS backends (Chatterbox TTS via `llama-swap` is an excellent choice)
- **Speech recognition** — ASR via local Whisper implementations (`whisper.cpp` via `llama-swap`, for example)

The architecture supports heterogeneous inference: lightweight models for outline generation, stronger models for content creation, specialized models for specific agent personas — all configurable per-classroom, per-agent.

### Per-Agent, Per-Classroom Configuration

Unlike the monolithic model selection of the original, Ember supports granular inference configuration:

| Configuration Level | Control |
|---------------------|---------|
| **Global defaults** | System-wide provider and model preferences |
| **Per-classroom** | Override models, voices, and generation parameters for specific lessons |
| **Per-agent** | Assign distinct models and voices to individual teacher/peer agents |
| **Runtime resolution** | Automatic fallback chains when preferred models are unavailable |

This enables sophisticated pedagogical orchestration: a "professor" agent running a large reasoning model, "peer" agents on efficient instruct models, each with appropriate voice characteristics for role immersion.

### Persistent, Portable Classrooms

The original OpenMAIC stored generated media (TTS audio, images, simulations) exclusively in browser IndexedDB—ephemeral by design. Ember implements:

- **Server-side media persistence** — All generated assets stored on local filesystem with portable references
- **Browser audio caching** — Intelligent fetch-and-cache for playback performance without data loss, generate speech once, listen on any device
- **Classroom persistence** — Persist generated classrooms to server for easily loading on other computers or sharing in a ZIP file
- **Settings portability** — Full configuration export/import for reproducible deployments

### Corrected Multi-Agent Systems

The discussion and roundtable systems in OpenMAIC were architecturally sound but practically broken for local inference; runtime model resolution failures, prompt contexts that confused local models, no discussion TTS or voice differentiation between agents. Ember implements:

- **Robust runtime model resolution** — Fully configurable runtime models with proper fallback chains and error handling for local inference endpoints
- **Cleaned prompt architecture** — Removed assumptions about proprietary model behaviors; prompts now work reliably with local models
- **Per-agent TTS voices** — Each agent speaks with a distinct, configurable voice during discussions
- **Discussion TTS integration** — Full speech synthesis for multi-agent debates and conversations

### Operational Reliability

Local inference requires different operational patterns than API calls. Ember adds:

- **Configurable timeouts** — Generation timeouts adjustable for local hardware constraints
- **Introspection and debugging** — Complete prompt logging to disk for generation debugging
- **Keyboard navigation** — Full playback control without mouse dependency
- **PDF processing** — Working local document ingestion (multi-PDF upload, proper parsing)
- **Better agent registry** — Improved default agent filtering and profile injection into prompts


## Quick Start

### Requirements

- **Node.js** >= 20
- **pnpm** >= 10
- **Local inference backend(s)** — llama-server, faster-whisper-server, or equivalent OpenAI-compatible endpoints

### Installation

```bash
git clone https://github.com/markqvist/ember.git
cd ember
pnpm install
```

### Configuration

Configuring providers via the web UI (Settings → Providers) is the easiest. Simply open the web UI and add your custom endpoints as providers.

Or, create `.env.local`:

```bash
cp .env.example .env.local
```

For local `llama.cpp` inference:

```env
# Example: local llama-server for LLM inference
OPENAI_BASE_URL=http://localhost:8080/v1
OPENAI_API_KEY=sk-dummy-key-required-by-openai-format

# Example: local faster-whisper for ASR
ASR_OPENAI_BASE_URL=http://localhost:8000/v1
ASR_OPENAI_API_KEY=sk-dummy

# Example: local Piper/Coqui TTS server
TTS_OPENAI_BASE_URL=http://localhost:5000/v1
TTS_OPENAI_API_KEY=sk-dummy
```

All configuration can be exported/imported via Settings → General for rapid deployment across machines.

### Run

```bash
pnpm dev
```

Access at `http://localhost:3000`.

### Production Build

```bash
pnpm build && pnpm start
```

---

## Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| Lesson generation (outline → scenes) | ✅ Complete | Optimized for local model capabilities |
| Slide lectures with TTS | ✅ Complete | Per-agent voice configuration |
| Interactive quizzes | ✅ Complete | Local inference for grading/feedback |
| HTML simulations | ✅ Complete | Self-contained, no external deps |
| Project-based learning | ✅ Complete | Multi-agent collaboration |
| Multi-agent discussion | ✅ Complete | Per-agent voices, fixed resolution |
| Roundtable debate | ✅ Complete | TTS for all participants |
| Whiteboard drawing | ✅ Complete | Real-time SVG rendering |
| Speech recognition | ✅ Complete | Local Whisper integration |
| Classroom persistence | ✅ Complete | Server-side media storage |
| Keyboard navigation | ✅ Complete | Full playback control |
| Settings export/import | ✅ Complete | Portable configuration |
| PDF import | ✅ Complete | Multi-document upload |
| Generation introspection | ✅ Complete | Prompt logging to disk |
| Per-classroom inference config | ✅ Complete | Model/voice overrides per lesson |
| Per-agent model/voice config | ✅ Complete | Heterogeneous inference |
| Quick classroom export/import | 🔄 In Progress | Complete data portability |
| Per-slide editing | 🔄 In Progress | Raw JSON editor implemented |
| Local web search | 🔄 In Progress | Via local search API |
| Course prerequisite chains | 📋 Planned | Include previous courses as context |


## Comparison: Ember vs. OpenMAIC

| Aspect | OpenMAIC | Ember |
|--------|----------|-------|
| **Primary target** | Cloud API users | Local/offline inference |
| **Local LLM support** | Broken (hardcoded timeouts, bad prompts) | First-class, optimized |
| **Local TTS/ASR** | Non-functional | Fully supported |
| **Media persistence** | IndexedDB only (ephemeral) | Server-side filesystem + browser cache |
| **Per-agent config** | None | Per-classroom, per-agent model/voice |
| **Runtime resolution** | Fails on local endpoints | Proper fallback chains |
| **Timeout handling** | Fixed at 300s | Configurable for your hardware |
| **Prompt debugging** | None | Full introspection logging |
| **Keyboard control** | None | Complete navigation |
| **Settings portability** | Manual env configuration | Export/import UI |
| **Multi-PDF upload** | Single file only | Multiple documents |
| **Agent profile injection** | Broken (not in prompts) | Fixed |

**Ember** — *A fire that is yours to keep and nurture*