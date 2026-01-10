# Konta – Context Aware Browsing Extension

A Chrome extension that automatically captures and organizes your browsing
sessions into a personal knowledge management system with ML-powered
semantic search and knowledge graph visualization.

---

## Table of Contents

* [Prerequisites](#prerequisites)
* [Setup Instructions](#setup-instructions)
* [Build Instructions](#build-instructions)
* [Run Instructions](#run-instructions)
* [Demo Video](#demo-video)
* [Running Evaluations](#running-evaluations)
* [Project Structure](#project-structure)
* [Documentation](#documentation)
* [Technology Stack](#technology-stack)

---

## Prerequisites

Before you begin, ensure you have the following installed:

* **Node.js**: v18.0.0 or higher
* **pnpm** (recommended) or npm
* **Chrome Browser**: v120 or higher
* **Git**: For version control

---

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.ecodesamsung.com/SRIB-PRISM/WAH_Aegis
cd WAH_Aegis
```

### 2. Install Dependencies

Using pnpm:

```bash
pnpm install
```

### 3. Verify Installation

Check that all dependencies are installed:

```bash
pnpm list
```

---

## Build Instructions

### Development Build (with hot reload)

Build the extension in development mode with automatic recompilation:

```bash
pnpm dev
```

**Output:**
`build/chrome-mv3-dev/`

### Production Build

Create an optimized production bundle:

```bash
pnpm build
```

**Output:**
`build/chrome-mv3-prod/`

---

## Run Instructions

### Load Extension in Chrome (Production)

After running `pnpm build`:

1. Open Chrome and navigate to:
   `chrome://extensions/`
2. Enable **Developer Mode** (toggle in top-right corner)
3. Click **Load unpacked** and select the build folder:

```
path/to/WAH_Aegis/build/chrome-mv3-prod/
```

4. Extension loaded! The Konta icon will appear in your toolbar

### Test the Extension

1. Click the extension icon – open the popup
2. Follow onboarding steps – set up Konta for the first time
3. Open the sidepanel – access from the popup or extension menu
4. Browse some pages – sessions are captured automatically
5. View your knowledge graph – see relationships between pages

---

## Demo Video

[![Konta Demo Video](https://img.youtube.com/vi/eqXz6zuXvwI/0.jpg)](https://youtu.be/eqXz6zuXvwI)

Direct link: https://youtu.be/eqXz6zuXvwI

---

## Running Evaluations

The project includes automated evaluation scripts for testing core algorithms:

### Setup Evaluations

First, install `ts-node` for running TypeScript directly:

```bash
pnpm add -D ts-node
```

### Available Evaluations

#### 1. Knowledge Graph Evaluation
Tests clustering algorithm with 8 topic clusters + ambiguous/noise pages.
Metrics: Precision, Recall, F1 Score, Purity

```bash
pnpm exec ts-node evaluation/knowledge-graph-eval.ts
```

#### 2. Search Layers Comparison
Compares Layer-1 (strict keyword) vs Layer-2 (semantic) search.
Metrics: Rank@1, NDCG@5

```bash
pnpm exec ts-node evaluation/layer1_2.ts
```

#### 3. Project Detection
Tests project detection algorithm with 50 synthetic candidates (35 real, 15 noise).
Metrics: Precision, Recall, F1 Score, Confusion Matrix

```bash
pnpm exec ts-node evaluation/project_detection.ts
```

### Add NPM Scripts (Optional)

For convenience, add these to `package.json` scripts:

```json
"eval:graph": "ts-node evaluation/knowledge-graph-eval.ts",
"eval:layers": "ts-node evaluation/layer1_2.ts",
"eval:project": "ts-node evaluation/project_detection.ts",
"eval:all": "pnpm eval:graph && pnpm eval:layers && pnpm eval:project"
```

Then run evaluations with:

```bash
pnpm eval:all      # Run all evaluations
pnpm eval:graph    # Knowledge graph clustering only
pnpm eval:layers   # Search comparison only
pnpm eval:project  # Project detection only
```

---

## Project Structure

```
src/
├── popup.tsx                  # Extension popup UI
├── sidepanel.tsx              # Sidepanel UI
├── style.css                  # Global styles
├── background/
│   ├── index.ts               # Service worker (background script)
│   ├── sessionManager.ts      # Session detection & management
│   ├── projectManager.ts      # Project management
│   ├── embedding-engine.ts    # ML embedding generation
│   ├── sessionStore.ts        # Session storage
│   ├── blocklistStore.ts      # Blocklist management
│   ├── candidateDetector.ts   # Project candidate detection
│   ├── consent-listener.ts    # User consent handling
│   ├── contextLearning.ts     # Context learning logic
│   ├── ephemeralBehavior.ts   # Ephemeral behavior tracking
│   ├── focusModeManager.ts    # Focus mode management
│   ├── historyImporter.ts     # Browser history import
│   ├── labelledSessionsStore.ts # Labelled sessions storage
│   ├── labelsStore.ts         # Labels storage
│   ├── layer3-ml-ranker.ts    # ML-based ranking
│   ├── page-event-listeners.ts # Page event handling
│   ├── projectSuggestions.ts # Project suggestion logic
│   ├── reminderManager.ts    # Reminder management
│   ├── search-coordinator.ts # Search coordination
│   ├── sidepanel-listeners.ts # Sidepanel event listeners
│   ├── similarity-notifier.ts # Similarity notifications
│   └── testHelpers.ts         # Testing utilities
│
├── components/
│   ├── NotificationToast.tsx  # Toast notification component
│   ├── onboarding/
│   │   ├── ConsentModal.tsx
│   │   ├── WelcomeBackModal.tsx
│   │   └── WelcomeModal.tsx
│   ├── sidepanel/
│   │   ├── CoiPanel.tsx
│   │   ├── EmptyState.tsx
│   │   ├── FocusPanel.tsx
│   │   ├── GraphPanel.tsx
│   │   ├── GraphPanel.tsx.backup
│   │   ├── PopulatedState.tsx
│   │   ├── ProjectPanel.tsx
│   │   └── SettingsModal.tsx
│   └── ui/                    # Shared UI components (shadcn/ui)
│       ├── button.tsx
│       ├── checkbox.tsx
│       ├── dialog.tsx
│       └── input.tsx
│
├── contents/                  # Content scripts
│   ├── add-to-project-button.tsx
│   ├── consent.tsx
│   ├── google-search.tsx
│   ├── indicator.tsx
│   ├── notification.ts
│   ├── page-capture.ts
│   ├── project-notification.ts
│   └── scroll-tracker.ts
│
├── derived/
│   ├── index.ts
│   └── types.ts
│
├── lib/
│   ├── coi.ts
│   ├── context-classifier.ts
│   ├── knowledge-graph.ts
│   ├── layer1-keyword-search.ts
│   ├── layer2-semantic-search.ts
│   ├── logger.ts
│   ├── resource-extractor.ts
│   ├── search-explainer.ts
│   ├── session-title-inference.ts
│   └── utils.ts
│
├── tabs/
│   └── graph.tsx              # Full-page graph view
│
├── types/
│   ├── index.ts
│   ├── ephemeral-behavior.ts
│   ├── focus-mode.ts
│   ├── page-event.ts
│   ├── project-candidate.ts
│   ├── project.ts
│   ├── session.ts
│   └── settings.ts
│
assets/
├── Ambient-Motion.json
├── Ambient-Motion.lottie
├── BreezeSans-Regular.ttf
├── icon.png
├── konta_logo.svg
├── ort-wasm-simd-threaded.wasm
├── ort-wasm-simd.wasm
├── ort-wasm-threaded.wasm
└── ort-wasm.wasm
│
build/
├── chrome-mv3-dev/            # Development build
└── chrome-mv3-prod/           # Production build
│
Root Configuration Files:
├── .github/
├── .gitignore
├── .plasmo/
├── .prettierrc.mjs
├── components.json
├── DARK_MODE_GUIDE.md
├── DARK_MODE_IMPLEMENTATION.md
├── package.json
├── pnpm-lock.yaml
├── postcss.config.js
├── README.md
├── tailwind.config.js
└── tsconfig.json
```

---

## Documentation

* [Final Report](documentation/Final_Report.pdf)
* [Evaluation Benchmarks](evaluation/Evaluation_Benchmarks.pdf)

---

## Technology Stack

| Category  | Technology              | Version |
| --------- | ----------------------- | ------- |
| Framework | Plasmo                  | 0.90.5  |
| UI        | React                   | 18.2.0  |
| Language  | TypeScript              | 5.3.3   |
| Styling   | Shadcn and Tailwind CSS | 3.4.19  |
| ML        | Transformers.js         | 2.17.2  |
| Graph     | react-force-graph-2d    | 1.29.0  |
| Icons     | Lucide React            | 0.562.0 |

---

Built with ❤️ by **Team Aegis**, Thapar University