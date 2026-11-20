export interface AppConfig {
  pageTitle: string;
  pageDescription: string;
  companyName: string;

  supportsChatInput: boolean;
  supportsVideoInput: boolean;
  supportsScreenShare: boolean;
  isPreConnectBufferEnabled: boolean;

  startButtonText: string;
  accent?: string;
  accentDark?: string;

  audioVisualizerType?: 'bar' | 'wave' | 'grid' | 'radial' | 'aura';
  audioVisualizerColor?: `#${string}`;
  audioVisualizerColorDark?: `#${string}`;
  audioVisualizerColorShift?: number;
  audioVisualizerBarCount?: number;
  audioVisualizerGridRowCount?: number;
  audioVisualizerGridColumnCount?: number;
  audioVisualizerRadialBarCount?: number;
  audioVisualizerRadialRadius?: number;
  audioVisualizerWaveLineWidth?: number;

  // agent dispatch configuration
  agentName?: string;

  // Cloud sandbox configuration
  sandboxId?: string;
}

export const APP_CONFIG_DEFAULTS: AppConfig = {
<<<<<<< HEAD
  companyName: 'Personal Autonomous Agent',
  pageTitle: 'Personal Autonomous Agent',
  pageDescription: 'A real-time personal autonomous AI agent',
=======
  companyName: 'Blackboard Tutor',
  pageTitle: 'Blackboard Tutor',
  pageDescription: 'A voice AI tutor that explains topics visually on a live blackboard',
>>>>>>> 68f2d672499f5e755fdd42e08361f321da03d83b

  supportsChatInput: true,
  supportsVideoInput: true,
  supportsScreenShare: true,
  isPreConnectBufferEnabled: false,

<<<<<<< HEAD
  startButtonText: 'Start session',
=======
  logo: '/blackboard-logo.svg',
  accent: undefined,
  logoDark: '/blackboard-logo-dark.svg',
  accentDark: undefined,
  startButtonText: 'Start learning',
>>>>>>> 68f2d672499f5e755fdd42e08361f321da03d83b

  // optional: audio visualization configuration
  // audioVisualizerType: 'bar',
  // audioVisualizerColor: '#002cf2',
  // audioVisualizerColorDark: '#1fd5f9',
  // audioVisualizerColorShift: 0.3,
  // audioVisualizerBarCount: 5,
  // audioVisualizerType: 'radial',
  // audioVisualizerRadialBarCount: 24,
  // audioVisualizerRadialRadius: 100,
  // audioVisualizerType: 'grid',
  // audioVisualizerGridRowCount: 25,
  // audioVisualizerGridColumnCount: 25,
  // audioVisualizerType: 'wave',
  // audioVisualizerWaveLineWidth: 3,
  // audioVisualizerType: 'aura',

  // agent dispatch configuration
  agentName: process.env.AGENT_NAME ?? undefined,

  // Cloud sandbox configuration
  sandboxId: undefined,
};
