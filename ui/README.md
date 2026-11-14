# Personal Autonomous Agent UI

A Next.js frontend for a real-time Personal Autonomous AI Agent. The app connects to a voice agent over WebRTC, streams the conversation transcript, and provides microphone, camera, screen-share, and text input controls along with a complete control plane for prompts, MCP tools, skills, knowledge, and memory.

The default theme is an AMOLED midnight palette (true-black surfaces with a cool indigo accent). A light theme is available from the theme toggle at the bottom of the screen.

## Features

- Real-time voice conversation with the agent
- Live transcript with chat input
- Camera video and screen-share controls
- Multiple audio visualizer styles (`bar`, `grid`, `radial`, `wave`, `aura`)
- AMOLED midnight dark theme by default, light theme optional
- Configurable title, description, and start button text

## Getting started

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000 in your browser.

The app expects an agent to be running against the same server. Configure the connection details in `.env.local` (copy `.env.example` if you don't have one):

```env
LIVEKIT_URL=wss://your-server-url
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret

# Leave AGENT_NAME blank for automatic dispatch
AGENT_NAME=
```

The included `/api/token` route is a development-only token server. Replace it with an authenticated endpoint before deploying to production.

## Project structure

```
ui/
├── app/                  - Next.js App Router pages, layout, token API
├── components/
│   ├── agents-ui/        - Voice session UI components
│   ├── app/              - App shell, welcome view, theme controls
│   └── ui/               - Primitive shadcn/ui components
├── hooks/                - Session, controls, and visualizer hooks
├── lib/                  - Config and utility helpers
├── public/               - Static assets
└── styles/               - Global styles and theme tokens
```

## Configuration

Edit `app-config.ts` to customize the app shell:

```ts
export const APP_CONFIG_DEFAULTS: AppConfig = {
  companyName: 'Personal Autonomous Agent',
  pageTitle: 'Personal Autonomous Agent',
  pageDescription: 'A real-time personal autonomous AI agent',

  supportsChatInput: true,
  supportsVideoInput: true,
  supportsScreenShare: true,
  isPreConnectBufferEnabled: true,

  startButtonText: 'Start session',
};
```

### Audio visualizer presets

Set `audioVisualizerType` in `app-config.ts` to switch visualizer styles:

- `bar` (default): vertical bars with optional `audioVisualizerBarCount`
- `grid`: dot grid with `audioVisualizerGridRowCount` and `audioVisualizerGridColumnCount`
- `radial`: circular bars with `audioVisualizerRadialBarCount` and `audioVisualizerRadialRadius`
- `wave`: oscilloscope-style wave with `audioVisualizerWaveLineWidth`
- `aura`: shader-based aura with `audioVisualizerAuraColorShift`

Use `audioVisualizerColor` to set a shared accent color across all visualizer modes.
