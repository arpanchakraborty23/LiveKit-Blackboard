'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic,
  MicOff,
  Monitor,
  MessageSquare,
  PhoneOff,
  Layout,
  ChevronUp,
  X,
  FileText,
  BarChart3,
  Send,
} from 'lucide-react';
import {
  useAgent,
  useSessionContext,
  useVoiceAssistant,
} from '@livekit/components-react';
import { cn } from '@/lib/shadcn/utils';

export interface CortexVoiceRoomProps {
  onEndSession: () => void;
  className?: string;
}

export function CortexVoiceRoom({ onEndSession, className }: CortexVoiceRoomProps) {
  const session = useSessionContext();
  const { state: agentState } = useAgent();
  const { audioTrack } = useVoiceAssistant();

  const [isMuted, setIsMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [latency, setLatency] = useState(42);
  const [chatInput, setChatInput] = useState('');

  // Mock jitter around realistic 40-48ms latency
  useEffect(() => {
    const interval = setInterval(() => {
      setLatency(40 + Math.floor(Math.random() * 8));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Sync mic toggle with LiveKit room if available
  const handleToggleMute = useCallback(async () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    try {
      if (session?.room?.localParticipant) {
        await session.room.localParticipant.setMicrophoneEnabled(!nextMuted);
      }
    } catch (err) {
      console.warn('Could not toggle microphone track:', err);
    }
  }, [isMuted, session]);

  // Sync screen share with LiveKit room if available
  const handleToggleScreenShare = useCallback(async () => {
    const nextSharing = !isScreenSharing;
    setIsScreenSharing(nextSharing);
    try {
      if (session?.room?.localParticipant) {
        await session.room.localParticipant.setScreenShareEnabled(nextSharing);
      }
    } catch (err) {
      console.warn('Could not toggle screen share track:', err);
    }
  }, [isScreenSharing, session]);

  // End session handler
  const handleEndSession = useCallback(() => {
    try {
      if (typeof session?.end === 'function') {
        session.end();
      } else if (session?.room) {
        session.room.disconnect();
      }
    } catch (err) {
      console.warn('Error terminating session:', err);
    }
    onEndSession();
  }, [session, onEndSession]);

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
        'relative flex h-screen w-full flex-col justify-between overflow-hidden bg-[#000000] text-white select-none',
        className
      )}
      style={{ fontFamily: 'var(--font-public-sans), -apple-system, sans-serif' }}
    >
      {/* ── Top Header ────────────────────────────────────────────────────────── */}
      <header className="flex h-16 w-full items-center justify-between px-8 z-20">
        <span className="text-base font-semibold tracking-tight text-white">Cortex</span>

        {/* Telemetry connection indicator: ● Connected 42 ms */}
        <div className="flex items-center gap-2 font-mono text-xs text-zinc-400">
          <span className="size-2 rounded-full bg-[#10B981] shadow-[0_0_8px_#10B981]" />
          <span>Connected {latency} ms</span>
        </div>
      </header>

      {/* ── Center Stage: Giant Magenta Waveform & Status ─────────────────────── */}
      <main className="relative flex flex-1 flex-col items-center justify-center z-10">
        {/* Animated 5-bar vertical waveform (Reference Image 2: Magenta/Pink #EC4899) */}
        <div className="flex items-center justify-center gap-4">
          {/* Bar 1: Magenta */}
          <motion.div
            animate={{
              height: isSpeaking ? [48, 92, 62, 48] : isListening ? [40, 56, 40] : 44,
              opacity: isSpeaking ? 1 : 0.85,
            }}
            transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }}
            className="w-10 min-h-[40px] rounded-full bg-[#D946EF] shadow-[0_0_20px_rgba(217,70,239,0.35)]"
          />

          {/* Bar 2: Pink */}
          <motion.div
            animate={{
              height: isSpeaking ? [90, 165, 115, 90] : isListening ? [75, 110, 80] : 85,
              opacity: isSpeaking ? 1 : 0.9,
            }}
            transition={{ repeat: Infinity, duration: 0.9, ease: 'easeInOut', delay: 0.15 }}
            className="w-11 min-h-[70px] rounded-full bg-[#EC4899] shadow-[0_0_25px_rgba(236,72,153,0.4)]"
          />

          {/* Bar 3 (Center tallest): Rose-Pink */}
          <motion.div
            animate={{
              height: isSpeaking ? [160, 270, 195, 160] : isListening ? [130, 180, 140] : 150,
              opacity: 1,
            }}
            transition={{ repeat: Infinity, duration: 1.0, ease: 'easeInOut', delay: 0.05 }}
            className="w-12 min-h-[120px] rounded-full bg-[#F43F5E] shadow-[0_0_35px_rgba(244,63,94,0.5)]"
          />

          {/* Bar 4: Pink */}
          <motion.div
            animate={{
              height: isSpeaking ? [90, 155, 105, 90] : isListening ? [75, 110, 80] : 85,
              opacity: isSpeaking ? 1 : 0.9,
            }}
            transition={{ repeat: Infinity, duration: 0.95, ease: 'easeInOut', delay: 0.2 }}
            className="w-11 min-h-[70px] rounded-full bg-[#EC4899] shadow-[0_0_25px_rgba(236,72,153,0.4)]"
          />

          {/* Bar 5: Magenta */}
          <motion.div
            animate={{
              height: isSpeaking ? [48, 88, 58, 48] : isListening ? [40, 56, 40] : 44,
              opacity: isSpeaking ? 1 : 0.85,
            }}
            transition={{ repeat: Infinity, duration: 1.15, ease: 'easeInOut', delay: 0.1 }}
            className="w-10 min-h-[40px] rounded-full bg-[#D946EF] shadow-[0_0_20px_rgba(217,70,239,0.35)]"
          />
        </div>

        {/* Status text */}
        <div className="mt-8 text-center">
          <h2 className="text-xl font-semibold tracking-tight text-white">{statusLabel}</h2>
          <p className="mt-1 text-xs text-zinc-500">Charts, docs and files open in chat.</p>
        </div>
      </main>

      {/* ── Slide-over Chat & Artifacts Drawer ──────────────────────────────── */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 240 }}
            className="absolute inset-y-0 right-0 z-50 w-80 md:w-96 border-l border-white/10 bg-zinc-950/95 p-5 shadow-2xl backdrop-blur-2xl flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="size-4 text-[#F43F5E]" />
                <h3 className="text-sm font-semibold text-white">Chat & Artifacts</h3>
                <span className="rounded-full bg-[#F43F5E]/20 px-2 py-0.5 text-[10px] font-bold text-[#F43F5E]">
                  2 new
                </span>
              </div>
              <button
                onClick={() => setIsChatOpen(false)}
                className="rounded p-1 text-zinc-400 hover:text-white transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* List of files and docs open in chat */}
            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              <div className="rounded-xl border border-white/[0.08] bg-zinc-900/70 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-[#2DD4BF]">
                  <BarChart3 className="size-3.5" />
                  <span>Architecture & Latency Chart</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">
                  Rendered real-time performance metrics and multi-hand execution telemetry.
                </p>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-zinc-900/70 p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-[#EC4899]">
                  <FileText className="size-3.5" />
                  <span>Executive Briefing Document</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">
                  Synthesized key takeaways from 12 research documents and vector memory.
                </p>
              </div>
            </div>

            {/* Chat text input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setChatInput('');
              }}
              className="mt-2 flex items-center gap-2 border-t border-white/10 pt-3"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask or reply to Cortex..."
                className="flex-1 rounded-lg border border-white/10 bg-zinc-900/90 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#EC4899]"
              />
              <button
                type="submit"
                className="rounded-lg bg-[#EC4899] p-2 text-white transition-colors hover:bg-[#D946EF]"
              >
                <Send className="size-3.5" />
              </button>
            </form>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Bottom Floating Pill Control Bar (Reference Image 2) ─────────────── */}
      <footer className="mb-8 flex w-full items-center justify-center z-20">
        <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#121214]/90 px-3 py-2 shadow-2xl backdrop-blur-xl">
          {/* Mic Button */}
          <button
            onClick={handleToggleMute}
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
            onClick={handleToggleScreenShare}
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

          {/* Chat Button with Notification Badge (2) */}
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
            onClick={handleEndSession}
            className="flex h-10 items-center rounded-full bg-zinc-900/90 px-4 text-xs font-semibold text-[#F43F5E] transition-colors hover:bg-red-500/20"
          >
            End session
          </button>
        </div>
      </footer>
    </div>
  );
}
