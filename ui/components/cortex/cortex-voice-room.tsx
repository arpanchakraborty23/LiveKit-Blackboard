'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic,
  MicOff,
  Monitor,
  MessageSquare,
  PhoneOff,
  Layout,
  ChevronUp,
} from 'lucide-react';
import {
  useAgent,
  useSessionContext,
  useVoiceAssistant,
} from '@livekit/components-react';
import { BoardCanvas } from '@/components/board/board-canvas';
import { useBoard } from '@/hooks/use-board';
import { cn } from '@/lib/shadcn/utils';

export interface CortexVoiceRoomProps {
  onEndSession: () => void;
  className?: string;
}

export function CortexVoiceRoom({ onEndSession, className }: CortexVoiceRoomProps) {
  const session = useSessionContext();
  const { state: agentState } = useAgent();
  const { audioTrack } = useVoiceAssistant();
  const boardOps = useBoard();
  const hasOps = boardOps.length > 0;

  const [isMuted, setIsMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isBoardOpen, setIsBoardOpen] = useState(false);
  const [latency, setLatency] = useState(42);

  // Mock jitter around realistic 40-48ms latency
  useEffect(() => {
    const interval = setInterval(() => {
      setLatency(40 + Math.floor(Math.random() * 8));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Compute status text
  const statusLabel =
    agentState === 'speaking'
      ? 'Speaking'
      : agentState === 'thinking'
      ? 'Thinking'
      : 'Listening';

  // Compute 5 bar heights based on state & pseudo-frequency
  const isSpeaking = agentState === 'speaking';
  const isListening = agentState === 'listening';

  return (
    <div
      className={cn(
        'relative flex h-screen w-full flex-col justify-between overflow-hidden bg-[#000000] text-white',
        className
      )}
      style={{ fontFamily: 'var(--font-public-sans), -apple-system, sans-serif' }}
    >
      {/* ── Top Header ────────────────────────────────────────────────────────── */}
      <header className="flex h-16 w-full items-center justify-between px-8">
        <span className="text-base font-semibold tracking-tight text-white">Cortex</span>

        {/* Telemetry connection indicator */}
        <div className="flex items-center gap-2 font-mono text-xs text-zinc-400">
          <span className="size-2 rounded-full bg-[#10B981] shadow-[0_0_8px_#10B981]" />
          <span>Connected {latency} ms</span>
        </div>
      </header>

      {/* ── Center Stage: Giant Magenta Waveform & Status ─────────────────────── */}
      <main className="relative flex flex-1 flex-col items-center justify-center">
        {/* Animated 5-bar vertical waveform (Reference: Magenta/Pink #EC4899) */}
        <div className="flex items-center justify-center gap-4">
          {/* Bar 1 */}
          <motion.div
            animate={{
              height: isSpeaking ? [48, 90, 60, 48] : isListening ? [40, 56, 40] : 44,
              opacity: isSpeaking ? 1 : 0.85,
            }}
            transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }}
            className="w-10 rounded-full bg-[#D946EF]"
            style={{ minHeight: 40 }}
          />

          {/* Bar 2 */}
          <motion.div
            animate={{
              height: isSpeaking ? [90, 160, 110, 90] : isListening ? [75, 110, 80] : 85,
              opacity: isSpeaking ? 1 : 0.9,
            }}
            transition={{ repeat: Infinity, duration: 0.9, ease: 'easeInOut', delay: 0.15 }}
            className="w-11 rounded-full bg-[#EC4899]"
            style={{ minHeight: 70 }}
          />

          {/* Bar 3 (Center tallest) */}
          <motion.div
            animate={{
              height: isSpeaking ? [160, 260, 190, 160] : isListening ? [130, 180, 140] : 150,
              opacity: 1,
            }}
            transition={{ repeat: Infinity, duration: 1.0, ease: 'easeInOut', delay: 0.05 }}
            className="w-12 rounded-full bg-[#F43F5E] shadow-[0_0_30px_rgba(244,63,94,0.3)]"
            style={{ minHeight: 120 }}
          />

          {/* Bar 4 */}
          <motion.div
            animate={{
              height: isSpeaking ? [90, 150, 100, 90] : isListening ? [75, 110, 80] : 85,
              opacity: isSpeaking ? 1 : 0.9,
            }}
            transition={{ repeat: Infinity, duration: 0.95, ease: 'easeInOut', delay: 0.2 }}
            className="w-11 rounded-full bg-[#EC4899]"
            style={{ minHeight: 70 }}
          />

          {/* Bar 5 */}
          <motion.div
            animate={{
              height: isSpeaking ? [48, 85, 55, 48] : isListening ? [40, 56, 40] : 44,
              opacity: isSpeaking ? 1 : 0.85,
            }}
            transition={{ repeat: Infinity, duration: 1.15, ease: 'easeInOut', delay: 0.1 }}
            className="w-10 rounded-full bg-[#D946EF]"
            style={{ minHeight: 40 }}
          />
        </div>

        {/* Status text */}
        <div className="mt-8 text-center">
          <h2 className="text-xl font-semibold tracking-tight text-white">{statusLabel}</h2>
          <p className="mt-1 text-xs text-zinc-500">Charts, docs and files open in chat.</p>
        </div>

        {/* Floating blackboard preview button if agent has drawn something */}
        {hasOps && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setIsBoardOpen((prev) => !prev)}
            className="mt-6 flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900/80 px-4 py-1.5 text-xs font-medium text-[#2DD4BF] shadow-lg backdrop-blur-md transition-all hover:bg-zinc-800"
          >
            <Layout className="size-3.5" />
            <span>Blackboard active ({boardOps.length} ops)</span>
            <ChevronUp className={cn('size-3.5 transition-transform', isBoardOpen && 'rotate-180')} />
          </motion.button>
        )}
      </main>

      {/* ── Slide-up Blackboard Drawer when board is active ──────────────────── */}
      <AnimatePresence>
        {isBoardOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-x-8 bottom-28 top-20 z-40 rounded-2xl border border-white/10 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur-xl"
          >
            <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
              <span className="font-mono text-xs text-zinc-400">Live Blackboard</span>
              <button
                onClick={() => setIsBoardOpen(false)}
                className="text-xs text-zinc-400 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="h-[calc(100%-2rem)] w-full overflow-hidden">
              <BoardCanvas ops={boardOps} className="h-full w-full" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom Floating Pill Control Bar (Reference Image 2) ─────────────── */}
      <footer className="mb-8 flex w-full items-center justify-center">
        <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#121214]/90 px-3 py-2 shadow-2xl backdrop-blur-xl">
          {/* Mic Button */}
          <button
            onClick={() => setIsMuted((prev) => !prev)}
            className={cn(
              'flex size-10 items-center justify-center rounded-full transition-colors',
              isMuted ? 'bg-zinc-800 text-zinc-500' : 'bg-zinc-800/80 text-white hover:bg-zinc-700'
            )}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </button>

          {/* Screen Share Button */}
          <button
            onClick={() => setIsScreenSharing((prev) => !prev)}
            className={cn(
              'flex size-10 items-center justify-center rounded-full transition-colors',
              isScreenSharing
                ? 'bg-[#2DD4BF]/20 text-[#2DD4BF]'
                : 'bg-zinc-800/80 text-white hover:bg-zinc-700'
            )}
            title="Share screen"
          >
            <Monitor className="size-4" />
          </button>

          {/* Chat Button with Notification Badge */}
          <button
            onClick={() => setIsChatOpen((prev) => !prev)}
            className="relative flex size-10 items-center justify-center rounded-full bg-zinc-800/80 text-white transition-colors hover:bg-zinc-700"
            title="Chat"
          >
            <MessageSquare className="size-4" />
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-[#F43F5E] text-[10px] font-bold text-white">
              2
            </span>
          </button>

          {/* End Session Button */}
          <button
            onClick={onEndSession}
            className="flex h-10 items-center rounded-full bg-zinc-900/90 px-4 text-xs font-semibold text-[#F43F5E] transition-colors hover:bg-red-500/20"
          >
            End session
          </button>
        </div>
      </footer>
    </div>
  );
}
