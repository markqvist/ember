# Ember - Full Local Generative Learning Environment.

Create lessons for learning anything. Fully offline, running locally on your own hardware. No cloud providers, no APIs, no data theft or surveillance.

- **One-click lesson generation** — Describe a topic or attach your materials; the AI builds a full lesson in minutes
- **Multi-agent classroom** — AI teachers and peers lecture, discuss, and interact with you in real time
- **Rich scene types** — Slides, quizzes, interactive HTML simulations, and project-based learning (PBL)
- **Whiteboard & TTS** — Agents draw diagrams, write formulas, and explain out loud
- **Export anywhere** — Download editable `.pptx` slides or interactive `.html` pages

Ember is a fork of the [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) project optimized for truly offline and sovereign inference and self-owned hosting. The original OpenMAIC project is conceptually a fantastic idea, but severely broken for actual local use. The goal of Ember is to fix that.

It already supports all required functionality for full classroom generation, text-to-speech, speech-to-text, interactive discussions, agent orchestration, etc., while running completely offline using local `llama.cpp`-based backends.

Ember also includes many useful features not found in the original OpenMAIC project:

TODO: Feature comparison

## Quick Start

### 1. Clone & Install

First, make sure you have `node.js` (>= 20) and `pnpm` (>= 10). Then:

```bash
git clone https://github.com/markqvist/ember.git
cd ember
pnpm install
```

### 2. Configure

1. Configure local models, speech, image and video generation in the web UI.
2. That's it, start generating lessons.

All configuration and settings can be exported and imported in the settings screen for easy setup on multiple computers.

You can also create a local `.env` file with configuration if you prefer

```bash
cp .env.example .env.local
```

Then edit the file to match your setup.

### 3. Run

You can run Ember directly from its source directory:

```bash
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000).

### 4. Build for Production

```bash
pnpm build && pnpm start
```

## Feature Overview

### Lesson Generation

Describe what you want to learn or attach reference materials. Ember's two-stage pipeline handles the rest:

| Stage | What Happens |
|-------|-------------|
| **Outline** | AI analyzes your input and generates a structured lesson outline |
| **Scenes** | Each outline item becomes a rich scene — slides, quizzes, interactive modules, or PBL activities |

### Classroom Components

**Slides**

AI teachers deliver lectures with voice narration, spotlight effects, and laser pointer animations — just like a real classroom.

**Questions & Quizzes**

Interactive quizzes (single / multiple choice, short answer) with real-time AI grading and feedback.

**Interactive Simulation**

HTML-based interactive experiments for visual, hands-on learning — physics simulators, flowcharts, and more.

**Project-Based Learning**

Choose a role and collaborate with AI agents on structured projects with milestones and deliverables.

### Multi-Agent Interaction

- **Classroom Discussion** — Agents proactively initiate discussions; you can jump in anytime or get called on
- **Roundtable Debate** — Multiple agents with different personas discuss a topic, with whiteboard illustrations
- **Q&A Mode** — Ask questions freely; the AI teacher responds with slides, diagrams, or whiteboard drawings
- **Whiteboard** — AI agents draw on a shared whiteboard in real time — solving equations step by step, sketching flowcharts, or illustrating concepts visually.

### Export

| Format | Description |
|--------|-------------|
| **PowerPoint (.pptx)** | Fully editable slides with images, charts, and LaTeX formulas |
| **Interactive HTML** | Self-contained web pages with interactive simulations |

### And More

- **Text-to-Speech** — Multiple voice providers with customizable voices
- **Speech Recognition** — Talk to your AI teacher using your microphone
- **Web Search** — Agents search the web for up-to-date information during class
- **i18n** — Interface supports Chinese and English
- **Dark Mode** — Easy on the eyes for late-night study sessions

# License

The original [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) project is licensed under AGPL-3.0.
