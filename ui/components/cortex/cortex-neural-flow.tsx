'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  BaseEdge,
  getBezierPath,
  EdgeLabelRenderer,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  Brain,
  Search,
  FileText,
  Database,
  Terminal,
  Zap,
  Calendar,
  Palette,
  PenTool,
  Layers,
  Sigma,
  Clock,
  GitBranch,
  Activity,
  Sparkles,
  RefreshCw,
  Play,
  CheckCircle2,
  Sliders,
  X,
  Maximize2,
  Minimize2,
  ChevronRight,
  Info,
  Globe,
  Cpu,
  Radio,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/shadcn/utils';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type SubagentRole = 'research' | 'action' | 'canvas' | 'memory';

export type SubagentStatus = 'idle' | 'running' | 'active' | 'done' | 'waiting';

export type VoiceState = 'listening' | 'speaking' | 'thinking' | 'idle';

export type MoodValence = 'focused' | 'creative' | 'analytical' | 'calm' | 'executive';

export interface SubagentHandData extends Record<string, unknown> {
  id: string;
  role: SubagentRole;
  title: string;
  subtitle: string;
  description: string;
  themeColor: string;
  glowColor: string;
  status: SubagentStatus;
  progress: number;
  activeTask: string;
  tools: string[];
  metrics: {
    latencyMs: number;
    tasksCompleted: number;
    lastActive: string;
    dataRate: string;
  };
  recentLogs: string[];
}

export interface CortexNodeData extends Record<string, unknown> {
  id: string;
  label: string;
  executiveGoal: string;
  voiceState: VoiceState;
  moodValence: MoodValence;
  activeLimbsCount: number;
  totalLimbsCount: number;
  latencyMs: number;
  telemetryStream: string;
}

export type CortexNodeType = Node<CortexNodeData, 'cortexNode'>;
export type HandNodeType = Node<SubagentHandData, 'handNode'>;
export type NeuralFlowNode = CortexNodeType | HandNodeType;

// ============================================================================
// Synaptic Edge Component
// ============================================================================

export function SynapticEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isActive = Boolean(data?.isActive ?? true);
  const color = (data?.color as string) || '#A855F7';
  const glowColor = (data?.glowColor as string) || color;
  const speed = (data?.speed as number) || 2.4;
  const pulseText = (data?.label as string) || 'WebRTC Data';

  return (
    <>
      {/* 1. Deep outer ambient glow */}
      <BaseEdge
        id={`${id}-ambient`}
        path={edgePath}
        style={{
          stroke: glowColor,
          strokeWidth: isActive ? 10 : 3,
          strokeOpacity: isActive ? 0.2 : 0.05,
          filter: isActive ? `blur(4px)` : 'none',
        }}
      />

      {/* 2. Core bezier connector path */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: isActive ? 2 : 1.5,
          strokeOpacity: isActive ? 0.85 : 0.35,
          ...style,
        }}
        markerEnd={markerEnd}
      />

      {/* 3. Glowing animated synaptic stream */}
      {isActive && (
        <path
          d={edgePath}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray="6, 12"
          strokeLinecap="round"
          style={{
            animation: `synapseFlowAnimation ${speed}s linear infinite`,
            filter: `drop-shadow(0 0 6px ${color})`,
          }}
        />
      )}

      {/* 4. Synaptic photon particle sliding along the bezier curve */}
      {isActive && (
        <circle r={3.5} fill="#FFFFFF" style={{ filter: `drop-shadow(0 0 6px ${color})` }}>
          <animateMotion dur={`${speed}s`} repeatCount="indefinite" path={edgePath} />
        </circle>
      )}

      {/* 5. Midpoint Telemetry Badge */}
      <EdgeLabelRenderer>
        <div
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          }}
          className={cn(
            'pointer-events-none absolute z-10 flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0A0A0C]/90 px-2 py-0.5 font-mono text-[9px] font-medium tracking-tight backdrop-blur-md transition-all',
            isActive ? 'text-zinc-300 shadow-[0_0_12px_rgba(0,0,0,0.8)]' : 'text-zinc-600 opacity-60'
          )}
        >
          <span
            className="size-1.5 rounded-full"
            style={{
              backgroundColor: color,
              boxShadow: isActive ? `0 0 6px ${color}` : 'none',
            }}
          />
          <span>{pulseText}</span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

// ============================================================================
// Central Cortex Root Node Component
// ============================================================================

export function CortexNodeComponent({ data, selected }: NodeProps<CortexNodeType>) {
  const {
    label = 'Central Neural Cortex',
    executiveGoal = 'Decomposing intent & orchestrating subagent limbs',
    voiceState = 'speaking',
    moodValence = 'focused',
    activeLimbsCount = 4,
    totalLimbsCount = 4,
    latencyMs = 42,
  } = data;

  // Mood valence configurations
  const moodConfig = useMemo(() => {
    switch (moodValence) {
      case 'focused':
        return {
          title: 'Focused & Analytical',
          dotColor: '#2DD4BF',
          auraColor: 'rgba(45, 212, 191, 0.25)',
          badgeColor: 'border-[#2DD4BF]/40 bg-[#2DD4BF]/10 text-[#2DD4BF]',
        };
      case 'creative':
        return {
          title: 'Creative Synthesis',
          dotColor: '#EC4899',
          auraColor: 'rgba(236, 72, 153, 0.25)',
          badgeColor: 'border-[#EC4899]/40 bg-[#EC4899]/10 text-[#EC4899]',
        };
      case 'executive':
        return {
          title: 'Executive High-Throughput',
          dotColor: '#F59E0B',
          auraColor: 'rgba(245, 158, 11, 0.25)',
          badgeColor: 'border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]',
        };
      default:
        return {
          title: 'Calm Attentive',
          dotColor: '#8B5CF6',
          auraColor: 'rgba(139, 92, 246, 0.25)',
          badgeColor: 'border-[#8B5CF6]/40 bg-[#8B5CF6]/10 text-[#8B5CF6]',
        };
    }
  }, [moodValence]);

  // Voice state visual pulses
  const isSpeaking = voiceState === 'speaking';
  const isThinking = voiceState === 'thinking';
  const isListening = voiceState === 'listening';

  return (
    <div
      className={cn(
        'relative w-80 rounded-2xl border transition-all duration-300',
        selected
          ? 'border-white/40 shadow-[0_0_40px_rgba(45,212,191,0.3)]'
          : 'border-white/10 hover:border-white/20',
        'bg-[#0A0A0C]/95 p-4 text-white shadow-2xl backdrop-blur-xl'
      )}
    >
      {/* Dynamic mood valence aura halo behind the core */}
      <div
        className="pointer-events-none absolute -inset-1.5 -z-10 rounded-2xl opacity-60 blur-xl transition-all duration-700"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${moodConfig.auraColor}, transparent 70%)`,
        }}
      />

      {/* Handles connecting to the 4 limbs */}
      {/* Top Left -> Research */}
      <Handle
        type="source"
        position={Position.Left}
        id="left-top"
        style={{ top: '35%', background: '#A855F7', borderColor: '#FFFFFF', width: 8, height: 8 }}
      />
      {/* Bottom Left -> Memory */}
      <Handle
        type="source"
        position={Position.Left}
        id="left-bottom"
        style={{ top: '65%', background: '#10B981', borderColor: '#FFFFFF', width: 8, height: 8 }}
      />
      {/* Top Right -> Action */}
      <Handle
        type="source"
        position={Position.Right}
        id="right-top"
        style={{ top: '35%', background: '#F59E0B', borderColor: '#FFFFFF', width: 8, height: 8 }}
      />
      {/* Bottom Right -> Canvas */}
      <Handle
        type="source"
        position={Position.Right}
        id="right-bottom"
        style={{ top: '65%', background: '#06B6D4', borderColor: '#FFFFFF', width: 8, height: 8 }}
      />

      {/* Header Row: Identity & Status */}
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="relative flex size-9 items-center justify-center rounded-xl border border-white/10 bg-zinc-900 shadow-inner">
            <Brain className="size-5 text-[#2DD4BF]" />
            {/* Live voice pulse ping */}
            <span
              className={cn(
                'absolute -right-0.5 -top-0.5 size-2.5 rounded-full',
                isSpeaking
                  ? 'animate-ping bg-[#EC4899]'
                  : isListening
                  ? 'animate-pulse bg-[#2DD4BF]'
                  : 'bg-zinc-500'
              )}
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold tracking-tight text-white">{label}</span>
              <span className="rounded bg-white/[0.08] px-1 py-0.2 font-mono text-[9px] text-zinc-400">
                Core
              </span>
            </div>
            <p className="text-[10px] text-zinc-400">Supervisor & Voice Pipeline</p>
          </div>
        </div>

        {/* Mood valence pill */}
        <span
          className={cn(
            'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-tight',
            moodConfig.badgeColor
          )}
        >
          <span
            className="size-1.5 rounded-full"
            style={{ backgroundColor: moodConfig.dotColor }}
          />
          {moodConfig.title}
        </span>
      </div>

      {/* Executive Goal Banner */}
      <div className="mt-3 rounded-xl border border-white/[0.06] bg-zinc-900/60 p-2.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-mono uppercase tracking-wider text-zinc-400">Executive Goal</span>
          <span className="font-mono text-[#2DD4BF]">ACTIVE</span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs font-medium leading-snug text-zinc-200">
          {executiveGoal}
        </p>
      </div>

      {/* Real-time Voice Audio Visualizer Bars */}
      <div className="mt-3 flex items-center justify-between rounded-xl border border-white/[0.06] bg-zinc-900/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-5 items-center gap-1">
            <span
              className={cn(
                'w-1 rounded-full bg-[#EC4899] transition-all duration-200',
                isSpeaking ? 'h-5 animate-pulse' : isListening ? 'h-3' : 'h-1.5'
              )}
            />
            <span
              className={cn(
                'w-1 rounded-full bg-[#D946EF] transition-all duration-200',
                isSpeaking ? 'h-3.5 animate-pulse' : isListening ? 'h-4' : 'h-1.5'
              )}
            />
            <span
              className={cn(
                'w-1.5 rounded-full bg-[#2DD4BF] transition-all duration-200',
                isSpeaking ? 'h-5 animate-pulse' : isListening ? 'h-5' : 'h-2'
              )}
            />
            <span
              className={cn(
                'w-1 rounded-full bg-[#D946EF] transition-all duration-200',
                isSpeaking ? 'h-3 animate-pulse' : isListening ? 'h-3.5' : 'h-1.5'
              )}
            />
            <span
              className={cn(
                'w-1 rounded-full bg-[#EC4899] transition-all duration-200',
                isSpeaking ? 'h-4 animate-pulse' : isListening ? 'h-2' : 'h-1.5'
              )}
            />
          </div>
          <span className="text-[11px] font-medium capitalize text-zinc-300">
            {voiceState} state
          </span>
        </div>

        {/* Telemetry pill */}
        <div className="flex items-center gap-1 font-mono text-[10px] text-zinc-400">
          <Radio className="size-3 text-[#10B981]" />
          <span>{latencyMs}ms RTC</span>
        </div>
      </div>

      {/* Footer Metrics */}
      <div className="mt-3 flex items-center justify-between pt-1 text-[11px] text-zinc-400">
        <div className="flex items-center gap-1">
          <Layers className="size-3 text-zinc-400" />
          <span>Limbs:</span>
          <span className="font-semibold text-white">
            {activeLimbsCount}/{totalLimbsCount} Online
          </span>
        </div>
        <div className="font-mono text-[10px] text-[#2DD4BF]">DAG Concurrent</div>
      </div>
    </div>
  );
}

// ============================================================================
// Orbiting Subagent Hand Node Component
// ============================================================================

export function HandNodeComponent({ data, selected }: NodeProps<HandNodeType>) {
  const {
    role = 'research',
    title = 'Subagent Hand',
    subtitle = 'Autonomous Limb',
    themeColor = '#A855F7',
    glowColor = 'rgba(168, 85, 247, 0.3)',
    status = 'running',
    progress = 70,
    activeTask = 'Executing subagent tasks',
    tools = [],
    metrics = { latencyMs: 38, tasksCompleted: 4, lastActive: 'Now', dataRate: '42kb/s' },
  } = data;

  // Icon mapping based on role
  const HandIcon = useMemo(() => {
    switch (role) {
      case 'research':
        return Search;
      case 'action':
        return Terminal;
      case 'canvas':
        return Palette;
      case 'memory':
        return Clock;
      default:
        return Zap;
    }
  }, [role]);

  // Is target handle left or right?
  // Left side nodes (research, memory) connect to Cortex on the right;
  // Right side nodes (action, canvas) connect to Cortex on the left.
  const isLeftSide = role === 'research' || role === 'memory';

  const isRunning = status === 'running' || status === 'active';
  const isDone = status === 'done';

  return (
    <div
      className={cn(
        'relative w-72 rounded-2xl border transition-all duration-300',
        selected
          ? 'border-white/40 shadow-[0_0_35px_rgba(255,255,255,0.2)]'
          : 'border-white/10 hover:border-white/20',
        'bg-[#0A0A0C]/95 p-3.5 text-white shadow-2xl backdrop-blur-xl'
      )}
    >
      {/* Dynamic glow aura */}
      <div
        className="pointer-events-none absolute -inset-1 -z-10 rounded-2xl opacity-40 blur-lg transition-all duration-500"
        style={{
          background: isRunning
            ? `radial-gradient(circle at 50% 50%, ${glowColor}, transparent 70%)`
            : 'none',
        }}
      />

      {/* Synaptic Target Handle */}
      {isLeftSide ? (
        <Handle
          type="target"
          position={Position.Right}
          id="target"
          style={{
            background: themeColor,
            borderColor: '#FFFFFF',
            width: 8,
            height: 8,
          }}
        />
      ) : (
        <Handle
          type="target"
          position={Position.Left}
          id="target"
          style={{
            background: themeColor,
            borderColor: '#FFFFFF',
            width: 8,
            height: 8,
          }}
        />
      )}

      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="flex size-8 items-center justify-center rounded-xl border border-white/10"
            style={{ backgroundColor: `${themeColor}20` }}
          >
            <HandIcon className="size-4" style={{ color: themeColor }} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-bold tracking-tight text-white">{title}</h4>
            </div>
            <p className="text-[10px] text-zinc-400">{subtitle}</p>
          </div>
        </div>

        {/* Status indicator badge */}
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold',
            isDone
              ? 'bg-emerald-500/10 text-emerald-400'
              : isRunning
              ? 'bg-white/[0.06] text-white'
              : 'bg-zinc-800 text-zinc-400'
          )}
        >
          <span
            className={cn('size-1.5 rounded-full', isRunning && 'animate-ping')}
            style={{ backgroundColor: isDone ? '#10B981' : themeColor }}
          />
          <span>{isDone ? 'Done' : `${progress}%`}</span>
        </div>
      </div>

      {/* Active task label */}
      <div className="mt-2.5 rounded-lg border border-white/[0.05] bg-zinc-900/50 p-2">
        <p className="line-clamp-2 text-[11px] leading-tight text-zinc-300">{activeTask}</p>
      </div>

      {/* Progress Bar */}
      <div className="mt-2.5 space-y-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              backgroundColor: themeColor,
              boxShadow: isRunning ? `0 0 10px ${themeColor}` : 'none',
            }}
          />
        </div>
      </div>

      {/* Tool tags */}
      <div className="mt-2.5 flex flex-wrap gap-1">
        {tools.map((tool: string) => (
          <span
            key={tool}
            className="rounded border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9px] text-zinc-400 transition-colors hover:text-zinc-200"
          >
            {tool}
          </span>
        ))}
      </div>

      {/* Bottom Telemetry */}
      <div className="mt-2.5 flex items-center justify-between border-t border-white/[0.06] pt-2 text-[10px] text-zinc-500">
        <span className="font-mono">{metrics.dataRate}</span>
        <span className="font-mono text-zinc-400">{metrics.latencyMs}ms sync</span>
      </div>
    </div>
  );
}

// Custom Node Types Registry for React Flow
const nodeTypes = {
  cortexNode: CortexNodeComponent,
  handNode: HandNodeComponent,
};

// Custom Edge Types Registry for React Flow
const edgeTypes = {
  synapticEdge: SynapticEdge,
};

// ============================================================================
// Default Mock Data for the 4 Orbiting Hands
// ============================================================================

const initialHandData: Record<SubagentRole, SubagentHandData> = {
  research: {
    id: 'hand-research',
    role: 'research',
    title: 'Research Hand',
    subtitle: 'Web Search · Pinecone RAG',
    description:
      'Performs deep-dive document scraping, live web search, arXiv retrieval, and personal vector RAG without interrupting voice dialogue.',
    themeColor: '#A855F7',
    glowColor: 'rgba(168, 85, 247, 0.4)',
    status: 'running',
    progress: 72,
    activeTask: 'Scanning 12 documentation sources on cloud GPU topologies & pricing',
    tools: ['web_search', 'fetch_document', 'vector_rag_query'],
    metrics: {
      latencyMs: 34,
      tasksCompleted: 8,
      lastActive: '1s ago',
      dataRate: '128 kb/s',
    },
    recentLogs: [
      '18:24:02 - Parsed user query: cloud infrastructure comparison',
      '18:24:05 - Pinecone vector search retrieved 3 matching docs (score > 0.88)',
      '18:24:09 - Scraping AWS vs GCP GPU compute instance specs',
      '18:24:12 - Synthesizing comparison table for Canvas Hand render',
    ],
  },
  action: {
    id: 'hand-action',
    role: 'action',
    title: 'Action Hand',
    subtitle: 'MCP Tools · Sandbox Execution',
    description:
      'Manipulates files, runs code in isolated sandboxes, manages calendar events, and interacts with third-party software via FastMCP.',
    themeColor: '#F59E0B',
    glowColor: 'rgba(245, 158, 11, 0.4)',
    status: 'running',
    progress: 45,
    activeTask: 'Executing Python sandbox computation for cost optimization curve',
    tools: ['mcp_call_tool', 'python_sandbox_run', 'calendar_reschedule'],
    metrics: {
      latencyMs: 44,
      tasksCompleted: 5,
      lastActive: 'Just now',
      dataRate: '92 kb/s',
    },
    recentLogs: [
      '18:24:15 - FastMCP client connected to ephemeral Python sandbox',
      '18:24:18 - Executing numpy script for amortized compute amortization',
      '18:24:22 - Generated data matrix (100 rows)',
    ],
  },
  canvas: {
    id: 'hand-canvas',
    role: 'canvas',
    title: 'Canvas Hand',
    subtitle: 'Blackboard Drawings · LaTeX Math',
    description:
      'Translates ideas, mathematical proofs, and system designs into visual objects drawn sequentially on the blackboard over WebRTC.',
    themeColor: '#06B6D4',
    glowColor: 'rgba(6, 182, 212, 0.4)',
    status: 'active',
    progress: 30,
    activeTask: 'Drawing system architecture diagram & KaTeX formula nodes',
    tools: ['board_draw_shape', 'board_render_latex', 'board_plot_graph'],
    metrics: {
      latencyMs: 28,
      tasksCompleted: 14,
      lastActive: 'Just now',
      dataRate: '210 ops/s',
    },
    recentLogs: [
      '18:24:20 - Initialized SVG blackboard op stream on channel topic "board"',
      '18:24:24 - Emitted board_draw_shape for Cortex node container',
      '18:24:28 - Rendered KaTeX formula: \\mathcal{L}_{cortex} = \\mathbb{E}[\\log p(y|x)]',
    ],
  },
  memory: {
    id: 'hand-memory',
    role: 'memory',
    title: 'Memory Hand',
    subtitle: 'Temporal Graph · User Preferences',
    description:
      'Manages long-term user preferences, past project context, and episodic memory graphs using Graphiti & semantic entity recall.',
    themeColor: '#10B981',
    glowColor: 'rgba(168, 85, 247, 0.4)',
    status: 'done',
    progress: 100,
    activeTask: 'Synchronized user preference: personal agent v2 low-cost cloud setup',
    tools: ['memory_recall_profile', 'memory_search_episodic', 'memory_extract'],
    metrics: {
      latencyMs: 19,
      tasksCompleted: 12,
      lastActive: '4s ago',
      dataRate: 'Synced',
    },
    recentLogs: [
      '18:24:00 - User identity resolved: Arpan',
      '18:24:01 - Recalled active project: Personal Autonomous Agent v2',
      '18:24:02 - Preference injected: Prefers low-cost cloud setups over dedicated clusters',
      '18:24:03 - Episodic memory snapshot saved successfully',
    ],
  },
};

// Default initial nodes positioning
const createInitialNodes = (
  voiceState: VoiceState = 'speaking',
  moodValence: MoodValence = 'focused',
  executiveGoal: string = 'Decomposing intent & orchestrating subagent limbs concurrently'
): NeuralFlowNode[] => [
  // 1. Center Cortex Node
  {
    id: 'cortex-core',
    type: 'cortexNode',
    position: { x: 380, y: 220 },
    data: {
      id: 'cortex-core',
      label: 'Central Neural Cortex',
      executiveGoal,
      voiceState,
      moodValence,
      activeLimbsCount: 4,
      totalLimbsCount: 4,
      latencyMs: 42,
      telemetryStream: 'WebRTC Live Opus Stream',
    },
  },
  // 2. Top-Left: Research Hand
  {
    id: 'hand-research',
    type: 'handNode',
    position: { x: 40, y: 40 },
    data: initialHandData.research,
  },
  // 3. Top-Right: Action Hand
  {
    id: 'hand-action',
    type: 'handNode',
    position: { x: 740, y: 40 },
    data: initialHandData.action,
  },
  // 4. Bottom-Right: Canvas Hand
  {
    id: 'hand-canvas',
    type: 'handNode',
    position: { x: 740, y: 390 },
    data: initialHandData.canvas,
  },
  // 5. Bottom-Left: Memory Hand
  {
    id: 'hand-memory',
    type: 'handNode',
    position: { x: 40, y: 390 },
    data: initialHandData.memory,
  },
];

// Default initial synaptic connections
const initialEdges: Edge[] = [
  // Cortex -> Research
  {
    id: 'edge-cortex-research',
    source: 'cortex-core',
    sourceHandle: 'left-top',
    target: 'hand-research',
    targetHandle: 'target',
    type: 'synapticEdge',
    animated: true,
    data: {
      color: '#A855F7',
      glowColor: 'rgba(168, 85, 247, 0.4)',
      isActive: true,
      speed: 2.2,
      label: 'RAG Pipeline · 34ms',
    },
  },
  // Cortex -> Action
  {
    id: 'edge-cortex-action',
    source: 'cortex-core',
    sourceHandle: 'right-top',
    target: 'hand-action',
    targetHandle: 'target',
    type: 'synapticEdge',
    animated: true,
    data: {
      color: '#F59E0B',
      glowColor: 'rgba(245, 158, 11, 0.4)',
      isActive: true,
      speed: 2.6,
      label: 'MCP Sandbox · 44ms',
    },
  },
  // Cortex -> Canvas
  {
    id: 'edge-cortex-canvas',
    source: 'cortex-core',
    sourceHandle: 'right-bottom',
    target: 'hand-canvas',
    targetHandle: 'target',
    type: 'synapticEdge',
    animated: true,
    data: {
      color: '#06B6D4',
      glowColor: 'rgba(6, 182, 212, 0.4)',
      isActive: true,
      speed: 1.8,
      label: 'Board WebRTC · 28ms',
    },
  },
  // Cortex -> Memory
  {
    id: 'edge-cortex-memory',
    source: 'cortex-core',
    sourceHandle: 'left-bottom',
    target: 'hand-memory',
    targetHandle: 'target',
    type: 'synapticEdge',
    animated: true,
    data: {
      color: '#10B981',
      glowColor: 'rgba(16, 185, 129, 0.4)',
      isActive: true,
      speed: 3.0,
      label: 'Temporal Graph · 19ms',
    },
  },
];

// ============================================================================
// Props & Exported Component
// ============================================================================

export interface CortexNeuralFlowProps {
  className?: string;
  voiceState?: VoiceState;
  moodValence?: MoodValence;
  executiveGoal?: string;
  onClose?: () => void;
  isModal?: boolean;
}

export function CortexNeuralFlow({
  className,
  voiceState = 'speaking',
  moodValence = 'focused',
  executiveGoal = 'Decomposing user request & orchestrating subagent limbs',
  onClose,
  isModal = false,
}: CortexNeuralFlowProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<NeuralFlowNode>(
    createInitialNodes(voiceState, moodValence, executiveGoal)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const [selectedNode, setSelectedNode] = useState<NeuralFlowNode | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [filterRole, setFilterRole] = useState<'all' | SubagentRole>('all');

  // Sync prop changes into the central cortex node
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === 'cortex-core') {
          return {
            ...node,
            data: {
              ...node.data,
              voiceState,
              moodValence,
              executiveGoal,
            },
          };
        }
        return node;
      })
    );
  }, [voiceState, moodValence, executiveGoal, setNodes]);

  // Handle node selection for inspection drawer
  const onNodeClick = useCallback((_: React.MouseEvent, node: NeuralFlowNode) => {
    setSelectedNode(node);
  }, []);

  // Background simulation cycle to demonstrate dynamic multi-limb cognition
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.type === 'handNode') {
            const handData = node.data as SubagentHandData;
            const newProgress = handData.progress >= 100 ? 15 : handData.progress + 5;
            const newStatus: SubagentStatus = newProgress >= 100 ? 'done' : 'running';
            return {
              ...node,
              data: {
                ...handData,
                progress: newProgress,
                status: newStatus,
              },
            };
          }
          return node;
        })
      );
    }, 1200);

    return () => clearInterval(interval);
  }, [isSimulating, setNodes]);

  // Filter visible nodes or highlight selected
  const handleFilter = (role: 'all' | SubagentRole) => {
    setFilterRole(role);
    setEdges((eds) =>
      eds.map((edge) => {
        if (role === 'all') {
          return { ...edge, data: { ...edge.data, isActive: true } };
        }
        const matches = edge.id.includes(role);
        return { ...edge, data: { ...edge.data, isActive: matches } };
      })
    );
  };

  // MiniMap node color selector
  const nodeColor = useCallback((node: Node) => {
    if (node.id === 'cortex-core') return '#2DD4BF';
    if (node.id === 'hand-research') return '#A855F7';
    if (node.id === 'hand-action') return '#F59E0B';
    if (node.id === 'hand-canvas') return '#06B6D4';
    if (node.id === 'hand-memory') return '#10B981';
    return '#71717A';
  }, []);

  return (
    <div
      className={cn(
        'relative flex h-full w-full flex-col overflow-hidden bg-[#000000] text-white',
        className
      )}
      style={{ fontFamily: 'var(--font-public-sans), -apple-system, sans-serif' }}
    >
      {/* ── Embedded CSS Animation for Synaptic Flow ───────────────────────── */}
      <style jsx global>{`
        @keyframes synapseFlowAnimation {
          from {
            stroke-dashoffset: 36;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
        .react-flow__attribution {
          display: none !important;
        }
        .react-flow__controls {
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6) !important;
          border-radius: 12px !important;
          overflow: hidden !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          background: #0a0a0c !important;
        }
        .react-flow__controls-button {
          background: #0a0a0c !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
          fill: #a1a1aa !important;
        }
        .react-flow__controls-button:hover {
          background: #18181b !important;
          fill: #ffffff !important;
        }
      `}</style>

      {/* ── Top HUD Header ─────────────────────────────────────────────────── */}
      <header className="relative z-20 flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#0A0A0C]/90 px-6 backdrop-blur-md">
        {/* Title & Brand */}
        <div className="flex items-center gap-3">
          <div className="flex size-7 items-center justify-center rounded-lg border border-white/10 bg-zinc-900">
            <Brain className="size-4 text-[#2DD4BF]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-tight text-white">
                Neural Subagent Graph
              </span>
              <span className="rounded-full bg-[#2DD4BF]/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#2DD4BF]">
                Live Brain Architecture
              </span>
            </div>
          </div>
        </div>

        {/* Filter chips & Simulation trigger */}
        <div className="flex items-center gap-2">
          {/* Filter Pills */}
          <div className="hidden items-center gap-1 sm:flex">
            {(['all', 'research', 'action', 'canvas', 'memory'] as const).map((role) => (
              <button
                key={role}
                onClick={() => handleFilter(role)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition-colors',
                  filterRole === role
                    ? 'bg-white/10 text-white'
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                )}
              >
                {role}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-white/10" />

          {/* Simulate Task Burst */}
          <button
            onClick={() => setIsSimulating((prev) => !prev)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all',
              isSimulating
                ? 'border-[#2DD4BF]/40 bg-[#2DD4BF]/10 text-[#2DD4BF]'
                : 'border-white/10 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white'
            )}
          >
            <Activity className={cn('size-3.5', isSimulating && 'animate-spin')} />
            <span>{isSimulating ? 'Simulating...' : 'Simulate Load'}</span>
          </button>

          {/* Close button if in modal mode */}
          {onClose && (
            <button
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-lg border border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </header>

      {/* ── React Flow Interactive Canvas Stage ────────────────────────────── */}
      <main className="relative flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.4}
          maxZoom={1.6}
          proOptions={{ hideAttribution: true }}
          className="bg-[#000000]"
        >
          {/* Subtle neural dot matrix background */}
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1.2}
            color="#222228"
            className="opacity-80"
          />

          {/* Controls: Zoom In/Out, Fit View */}
          <Controls position="bottom-left" showInteractive={false} />

          {/* Dark theme styled MiniMap */}
          <MiniMap
            position="bottom-right"
            nodeColor={nodeColor}
            nodeStrokeWidth={2}
            maskColor="rgba(0, 0, 0, 0.75)"
            className="rounded-xl border border-white/10 !bg-[#0A0A0C]/90 shadow-2xl backdrop-blur-md"
            style={{ width: 140, height: 95 }}
          />
        </ReactFlow>

        {/* ── Synaptic Legend / Floating Overlay Pill ────────────────────────── */}
        <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-[#0A0A0C]/80 px-4 py-1.5 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-4 text-[11px] text-zinc-400">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#A855F7] shadow-[0_0_6px_#A855F7]" />
              <span>Research</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#F59E0B] shadow-[0_0_6px_#F59E0B]" />
              <span>Action/MCP</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#06B6D4] shadow-[0_0_6px_#06B6D4]" />
              <span>Canvas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#10B981] shadow-[0_0_6px_#10B981]" />
              <span>Memory</span>
            </div>
          </div>
        </div>

        {/* ── Side Inspector Drawer for Selected Node ──────────────────────── */}
        <AnimatePresence>
          {selectedNode && (
            <motion.aside
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className="absolute bottom-4 right-4 top-4 z-30 flex w-80 flex-col rounded-2xl border border-white/10 bg-[#0A0A0C]/95 p-5 shadow-2xl backdrop-blur-2xl"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white">Subagent Inspector</span>
                  <span className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[9px] text-zinc-400">
                    Live
                  </span>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Inspector Content */}
              <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1">
                {selectedNode.type === 'cortexNode' ? (
                  // Cortex Core Details
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-white">Central Neural Cortex</h3>
                      <p className="mt-1 text-xs text-zinc-400">
                        Primary Cognition Core, voice pipeline orchestration, and concurrent DAG
                        execution engine.
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/[0.06] bg-zinc-900/60 p-3 text-xs">
                      <span className="font-mono text-[10px] uppercase text-zinc-500">
                        Active Goal
                      </span>
                      <p className="mt-1 font-medium text-zinc-200">
                        {(selectedNode.data as CortexNodeData).executiveGoal}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl border border-white/[0.06] bg-zinc-900/40 p-2.5">
                        <span className="text-[10px] text-zinc-400">Voice Latency</span>
                        <p className="mt-1 font-mono text-sm font-bold text-[#10B981]">
                          {(selectedNode.data as CortexNodeData).latencyMs} ms
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/[0.06] bg-zinc-900/40 p-2.5">
                        <span className="text-[10px] text-zinc-400">Subagents Active</span>
                        <p className="mt-1 font-mono text-sm font-bold text-[#2DD4BF]">
                          {(selectedNode.data as CortexNodeData).activeLimbsCount}/4 Limbs
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Hand Node Details
                  <div className="space-y-4">
                    {(() => {
                      const hand = selectedNode.data as SubagentHandData;
                      return (
                        <>
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className="size-2 rounded-full"
                                style={{ backgroundColor: hand.themeColor }}
                              />
                              <h3 className="text-sm font-bold text-white">{hand.title}</h3>
                            </div>
                            <p className="mt-1 text-xs text-zinc-400">{hand.description}</p>
                          </div>

                          {/* Execution Status & Progress */}
                          <div className="rounded-xl border border-white/[0.06] bg-zinc-900/60 p-3 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-[10px] text-zinc-400">Progress</span>
                              <span
                                className="font-mono font-semibold"
                                style={{ color: hand.themeColor }}
                              >
                                {hand.progress}%
                              </span>
                            </div>
                            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${hand.progress}%`,
                                  backgroundColor: hand.themeColor,
                                }}
                              />
                            </div>
                            <p className="mt-2 text-[11px] text-zinc-300">{hand.activeTask}</p>
                          </div>

                          {/* Tools Installed */}
                          <div>
                            <span className="font-mono text-[10px] uppercase text-zinc-500">
                              Registered Tools
                            </span>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {hand.tools.map((t) => (
                                <span
                                  key={t}
                                  className="rounded border border-white/10 bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-300"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Live Execution Logs */}
                          <div>
                            <span className="font-mono text-[10px] uppercase text-zinc-500">
                              Synaptic Execution Stream
                            </span>
                            <div className="mt-2 space-y-1.5 rounded-xl border border-white/[0.06] bg-zinc-950 p-2.5 font-mono text-[10px]">
                              {hand.recentLogs.map((log, idx) => (
                                <div key={idx} className="leading-tight text-zinc-400">
                                  {log}
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Drawer Footer Actions */}
              <div className="mt-4 border-t border-white/10 pt-3">
                <button
                  onClick={() => {
                    if (selectedNode.type === 'handNode') {
                      setNodes((nds) =>
                        nds.map((n) =>
                          n.id === selectedNode.id
                            ? {
                                ...n,
                                data: {
                                  ...(n.data as SubagentHandData),
                                  progress: Math.min(
                                    100,
                                    ((n.data as SubagentHandData).progress || 0) + 10
                                  ),
                                },
                              }
                            : n
                        )
                      );
                    }
                  }}
                  className="w-full rounded-xl bg-white/[0.08] py-2 text-xs font-semibold text-white transition-colors hover:bg-white/[0.12]"
                >
                  Step Execution +10%
                </button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
