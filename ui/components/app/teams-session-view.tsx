'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  useAgent,
  useAgentExpression,
  useSessionContext,
  useSessionMessages,
  useVoiceAssistant,
} from '@livekit/components-react';
import {
  MessageSquare,
  Layout,
  Phone,
  FolderOpen,
  Grid3X3,
  Search,
  Video,
  PhoneCall,
  MoreHorizontal,
  Paperclip,
  Smile,
  Send,
  Mic,
  MicOff,
  X,
  ChevronDown,
  Eraser,
} from 'lucide-react';
import { AgentChatTranscript } from '@/components/agents-ui/agent-chat-transcript';
import { AgentControlBar } from '@/components/agents-ui/agent-control-bar';
import { AgentAudioVisualizerBar } from '@/components/agents-ui/agent-audio-visualizer-bar';
import { MoodAura, useMoodColor } from '@/components/agents-ui/mood-visualizer';
import { BoardCanvas } from '@/components/board/board-canvas';
import { useBoard } from '@/hooks/use-board';
import { useNeedleDiagrams } from '@/hooks/use-needle-diagrams';
import { cn } from '@/lib/shadcn/utils';

/* ─────────────────────────── palette ─────────────────────────────────────── */
// Microsoft Teams-inspired dark palette
const T = {
  rail:     '#141414',  // icon rail
  sidebar:  '#1a1a1a',  // left sidebar
  chat:     '#0d0d0d',  // main chat bg
  board:    '#111111',  // right board panel
  accent:   '#7C6FDF',  // indigo-purple brand accent
  accentHi: '#9B8EF0',  // lighter accent
  surface:  '#1e1e1e',  // card surfaces
  border:   '#2a2a2a',
  muted:    '#666',
  text:     '#e6e6e6',
  textSub:  '#999',
};

/* ─────────────────────────── types ───────────────────────────────────────── */
export interface TeamsSessionViewProps {
  preConnectMessage?: string;
  supportsChatInput?: boolean;
  supportsVideoInput?: boolean;
  supportsScreenShare?: boolean;
  isPreConnectBufferEnabled?: boolean;
  className?: string;
}

/* ─────────────────────────── sub-components ──────────────────────────────── */

/** Narrow vertical icon rail — Teams left-most strip */
function NavRail({ activeNav, onNav }: { activeNav: string; onNav: (n: string) => void }) {
  const items = [
    { id: 'chat',      icon: MessageSquare, label: 'Chat' },
    { id: 'board',     icon: Layout,        label: 'Blackboard' },
    { id: 'calls',     icon: Phone,         label: 'Calls' },
    { id: 'files',     icon: FolderOpen,    label: 'Files' },
    { id: 'apps',      icon: Grid3X3,       label: 'Apps' },
  ];

  return (
    <nav
      className="flex h-full w-12 shrink-0 flex-col items-center gap-1 py-3"
      style={{ background: T.rail, borderRight: `1px solid ${T.border}` }}
      aria-label="Primary navigation"
    >
      {items.map(({ id, icon: Icon, label }) => {
        const active = activeNav === id;
        return (
          <button
            key={id}
            onClick={() => onNav(id)}
            title={label}
            aria-current={active ? 'page' : undefined}
            className="group relative flex size-10 items-center justify-center rounded-lg transition-colors"
            style={{
              background: active ? `${T.accent}22` : 'transparent',
              color: active ? T.accentHi : T.muted,
            }}
          >
            {/* Active indicator pill */}
            {active && (
              <span
                className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full"
                style={{ background: T.accentHi }}
              />
            )}
            <Icon
              size={18}
              className="transition-colors group-hover:text-white"
              style={{ color: active ? T.accentHi : undefined }}
            />
          </button>
        );
      })}
    </nav>
  );
}

/** Sidebar: session list (Teams "Recent chats" panel) */
function SessionSidebar() {
  const sessions = [
    { name: 'Math Tutor', sub: 'Let me draw this on the board…', time: 'Now',   dot: '#22c55e', active: true  },
    { name: 'Physics Agent', sub: 'Free body diagram ready',    time: '10 min', dot: '#f59e0b', active: false },
    { name: 'Calculus Bot',  sub: 'Integration by parts…',      time: '1 hr',   dot: T.muted,   active: false },
    { name: 'Chemistry AI',  sub: 'Molecular structure drawn',   time: 'Mon',    dot: T.muted,   active: false },
  ];

  return (
    <aside
      className="flex h-full w-56 shrink-0 flex-col"
      style={{ background: T.sidebar, borderRight: `1px solid ${T.border}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-sm font-semibold" style={{ color: T.text }}>
          Blackboard AI
        </span>
        <button
          className="rounded p-1 transition-colors hover:bg-white/5"
          style={{ color: T.muted }}
          title="New session"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-3">
        <div
          className="flex items-center gap-2 rounded-md px-3 py-1.5"
          style={{ background: T.surface }}
        >
          <Search size={13} style={{ color: T.muted }} />
          <span className="text-xs" style={{ color: T.muted }}>Search sessions</span>
        </div>
      </div>

      {/* Recent label */}
      <p className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-widest"
         style={{ color: T.muted }}>
        Recent
      </p>

      {/* Session list */}
      <ul className="flex-1 overflow-y-auto px-2">
        {sessions.map((s) => (
          <li key={s.name}>
            <button
              className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors"
              style={{ background: s.active ? `${T.accent}18` : 'transparent' }}
            >
              {/* Avatar */}
              <div className="relative mt-0.5 shrink-0">
                <div
                  className="flex size-8 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: s.active ? T.accent : T.surface }}
                >
                  {s.name[0]}
                </div>
                <span
                  className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2"
                  style={{ background: s.dot, borderColor: T.sidebar }}
                />
              </div>

              {/* Text */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span
                    className="truncate text-xs font-medium"
                    style={{ color: s.active ? T.accentHi : T.text }}
                  >
                    {s.name}
                  </span>
                  <span className="ml-1 shrink-0 text-[10px]" style={{ color: T.muted }}>
                    {s.time}
                  </span>
                </div>
                <p className="truncate text-[11px]" style={{ color: T.muted }}>{s.sub}</p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** Chat area top bar */
function ChatTopBar({
  agentState,
  audioTrack,
  moodColor,
  onEnd,
}: {
  agentState: string;
  audioTrack: Parameters<typeof AgentAudioVisualizerBar>[0]['audioTrack'];
  moodColor: string;
  onEnd: () => void;
}) {
  return (
    <div
      className="flex h-12 shrink-0 items-center gap-3 px-4"
      style={{ background: T.chat, borderBottom: `1px solid ${T.border}` }}
    >
      {/* Agent identity */}
      <div
        className="flex size-7 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ background: T.accent }}
      >
        M
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: T.text }}>
            Math Tutor Agent
          </span>
          <span
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: '#16a34a22', color: '#22c55e' }}
          >
            <span className="size-1.5 rounded-full bg-green-500" />
            Connected
          </span>
        </div>
      </div>

      {/* Audio visualizer */}
      <AgentAudioVisualizerBar
        size="sm"
        state={agentState as 'connecting' | 'initializing' | 'listening' | 'thinking' | 'speaking' | 'disconnected'}
        audioTrack={audioTrack}
        color={moodColor}
        className="h-4 w-20"
        style={{ color: moodColor }}
      />

      {/* Top-right action icons */}
      <div className="flex items-center gap-1">
        {[Video, PhoneCall, MoreHorizontal].map((Icon, i) => (
          <button
            key={i}
            className="rounded-md p-1.5 transition-colors hover:bg-white/5"
            style={{ color: T.muted }}
          >
            <Icon size={15} />
          </button>
        ))}
        <button
          onClick={onEnd}
          className="ml-1 rounded-md p-1.5 transition-colors hover:bg-red-500/20"
          style={{ color: '#ef4444' }}
          title="End session"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

/** Compose bar at the bottom */
function ComposeBar({
  isMicOn,
  onToggleMic,
  agentState,
}: {
  isMicOn: boolean;
  onToggleMic: () => void;
  agentState: string;
}) {
  return (
    <div
      className="shrink-0 px-4 py-3"
      style={{ background: T.chat, borderTop: `1px solid ${T.border}` }}
    >
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2"
        style={{ background: T.surface, border: `1px solid ${T.border}` }}
      >
        {/* Text input area */}
        <div className="flex-1">
          <p className="text-sm" style={{ color: T.muted }}>Type a message…</p>
        </div>

        {/* Toolbar icons */}
        <div className="flex items-center gap-1">
          {[Paperclip, Smile].map((Icon, i) => (
            <button
              key={i}
              className="rounded p-1 transition-colors hover:bg-white/5"
              style={{ color: T.muted }}
            >
              <Icon size={15} />
            </button>
          ))}

          {/* Send */}
          <button
            className="ml-1 flex size-7 items-center justify-center rounded-lg transition-opacity hover:opacity-80"
            style={{ background: T.accent }}
          >
            <Send size={13} className="text-white" />
          </button>

          {/* Mic — pulsing when listening */}
          <button
            onClick={onToggleMic}
            className="relative ml-1 flex size-7 items-center justify-center rounded-lg transition-all"
            style={{
              background: isMicOn ? T.accent : T.surface,
              border: `1px solid ${isMicOn ? T.accentHi : T.border}`,
            }}
            title={isMicOn ? 'Mute' : 'Unmute'}
          >
            {isMicOn && agentState === 'listening' && (
              <span
                className="absolute inset-0 animate-ping rounded-lg opacity-40"
                style={{ background: T.accent }}
              />
            )}
            {isMicOn
              ? <Mic size={13} className="text-white" />
              : <MicOff size={13} style={{ color: T.muted }} />
            }
          </button>
        </div>
      </div>

      {/* Teams-style format bar */}
      <div className="mt-1.5 flex items-center gap-3 px-1">
        <span className="text-[10px]" style={{ color: T.muted }}>
          {agentState === 'speaking'
            ? '🎙 Agent is speaking…'
            : agentState === 'thinking'
            ? '💭 Thinking…'
            : '🎤 Listening'}
        </span>
      </div>
    </div>
  );
}

/** Right panel: live blackboard */
function BoardPanel({ ops }: { ops: ReturnType<typeof useBoard> }) {
  const hasOps = ops.length > 0;

  return (
    <aside
      className="flex h-full w-72 shrink-0 flex-col"
      style={{ background: T.board, borderLeft: `1px solid ${T.border}` }}
    >
      {/* Header */}
      <div
        className="flex h-12 shrink-0 items-center justify-between px-4"
        style={{ borderBottom: `1px solid ${T.border}` }}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'size-2 rounded-full transition-colors',
              hasOps ? 'bg-green-500' : 'bg-zinc-600'
            )}
          />
          <span className="text-xs font-semibold" style={{ color: T.text }}>
            Live Blackboard
          </span>
        </div>
        {hasOps && (
          <div className="flex items-center gap-1.5">
            <span
              className="rounded-full px-2 py-0.5 font-mono text-[10px]"
              style={{ background: `${T.accent}22`, color: T.accentHi }}
            >
              {ops.length} ops
            </span>
            <button
              className="rounded p-1 transition-colors hover:bg-white/5"
              style={{ color: T.muted }}
              title="Clear board"
            >
              <Eraser size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Canvas */}
      <div className="relative flex-1 overflow-hidden">
        {hasOps ? (
          <BoardCanvas ops={ops} className="h-full w-full" />
        ) : (
          <div
            className="flex h-full flex-col items-center justify-center gap-3 select-none"
            style={{ color: T.muted }}
          >
            <svg viewBox="0 0 48 48" className="size-10 opacity-40" fill="none">
              <rect x="2" y="8" width="44" height="32" rx="3"
                stroke="currentColor" strokeWidth="1.5" />
              <line x1="8" y1="24" x2="40" y2="24"
                stroke="currentColor" strokeWidth="1" strokeDasharray="4 3" />
              <circle cx="24" cy="24" r="5"
                stroke="currentColor" strokeWidth="1" />
            </svg>
            <p className="text-center font-mono text-[11px]">
              Board is empty.<br />Ask the agent to draw!
            </p>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div
        className="shrink-0 px-3 py-2"
        style={{ borderTop: `1px solid ${T.border}` }}
      >
        <p className="text-[10px] uppercase tracking-wider" style={{ color: T.muted }}>
          Board ops
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {['Shape', 'Graph', 'LaTeX', 'Text'].map((op) => (
            <span
              key={op}
              className="rounded px-2 py-0.5 text-[10px]"
              style={{ background: T.surface, color: T.textSub }}
            >
              {op}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}

/* ─────────────────────────── main component ──────────────────────────────── */

export function TeamsSessionView({
  supportsChatInput = true,
  supportsVideoInput = true,
  supportsScreenShare = true,
  isPreConnectBufferEnabled = false,
  preConnectMessage = 'Agent is listening…',
  className,
  ...props
}: TeamsSessionViewProps & React.ComponentProps<'div'>) {
  const session = useSessionContext();
  const { messages } = useSessionMessages(session);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [activeNav, setActiveNav] = useState('chat');
  const [isMicOn, setIsMicOn] = useState(true);
  const { state: agentState } = useAgent();
  const { audioTrack } = useVoiceAssistant();
  const { mood } = useAgentExpression();
  const moodColor = useMoodColor(mood);
  const boardOps = useBoard();
  useNeedleDiagrams();

  const controls = {
    leave: true,
    microphone: true,
    chat: supportsChatInput,
    camera: supportsVideoInput,
    screenShare: supportsScreenShare,
  };

  return (
    <div
      className={cn('flex h-svh w-full overflow-hidden', className)}
      style={{ background: T.chat, fontFamily: 'var(--font-public-sans)' }}
      {...props}
    >
      {/* ── 1. Icon rail ── */}
      <NavRail activeNav={activeNav} onNav={setActiveNav} />

      {/* ── 2. Session sidebar ── */}
      <SessionSidebar />

      {/* ── 3. Main chat column ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <ChatTopBar
          agentState={agentState}
          audioTrack={audioTrack}
          moodColor={moodColor}
          onEnd={session.end}
        />

        {/* Chat / board toggle tab strip */}
        <div
          className="flex shrink-0 items-center gap-0 border-b"
          style={{ background: T.chat, borderColor: T.border }}
        >
          {[
            { id: 'board', label: 'Blackboard' },
            { id: 'chat',  label: 'Transcript' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setIsChatOpen(tab.id === 'chat')}
              className="relative px-5 py-2.5 text-xs font-medium transition-colors"
              style={{
                color: (tab.id === 'chat') === isChatOpen ? T.accentHi : T.muted,
              }}
            >
              {tab.label}
              {(tab.id === 'chat') === isChatOpen && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ background: T.accentHi }}
                />
              )}
            </button>
          ))}

          {/* Agent mood */}
          <div className="ml-auto flex items-center gap-2 px-4">
            <AgentAudioVisualizerBar
              size="sm"
              state={agentState as 'connecting' | 'initializing' | 'listening' | 'thinking' | 'speaking' | 'disconnected'}
              audioTrack={audioTrack}
              color={moodColor}
              className="h-3 w-16"
              style={{ color: moodColor }}
            />
            <span className="text-[10px] capitalize font-mono" style={{ color: moodColor }}>
              {mood ?? agentState}
            </span>
          </div>
        </div>

        {/* Content area */}
        <div className="relative flex-1 overflow-hidden">
          {/* Blackboard view */}
          <AnimatePresence>
            {!isChatOpen && (
              <motion.div
                key="board-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0"
              >
                {/* Mood aura behind board */}
                <div className="pointer-events-none absolute inset-0 z-0 grid place-items-center opacity-30">
                  <MoodAura size="lg" state={agentState} audioTrack={audioTrack} />
                </div>
                <BoardCanvas ops={boardOps} className="relative z-10 h-full w-full" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Transcript view */}
          <AnimatePresence>
            {isChatOpen && (
              <motion.div
                key="chat-view"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 overflow-hidden"
              >
                {/* Fade gradient at top */}
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16"
                  style={{ background: `linear-gradient(to bottom, ${T.chat}, transparent)` }}
                />

                {isPreConnectBufferEnabled && messages.length === 0 && (
                  <p
                    className="absolute inset-x-0 top-16 text-center text-sm font-medium"
                    style={{ color: T.muted }}
                  >
                    {preConnectMessage}
                  </p>
                )}

                <AgentChatTranscript
                  agentState={agentState}
                  messages={messages}
                  className="mx-auto max-w-2xl h-full **:data-[slot=message-scroller-content]:p-4 **:data-[slot=message-scroller-content]:pt-20!"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Control bar */}
        <div className="shrink-0" style={{ borderTop: `1px solid ${T.border}` }}>
          <div className="mx-auto max-w-2xl px-4 py-3">
            <AgentControlBar
              variant="pill"
              controls={controls}
              isChatOpen={isChatOpen}
              isConnected={session.isConnected}
              onDisconnect={session.end}
              onIsChatOpenChange={setIsChatOpen}
            />
          </div>
        </div>

        {/* Compose bar */}
        <ComposeBar
          isMicOn={isMicOn}
          onToggleMic={() => setIsMicOn((v) => !v)}
          agentState={agentState}
        />
      </div>

      {/* ── 4. Right board panel ── */}
      <BoardPanel ops={boardOps} />
    </div>
  );
}
