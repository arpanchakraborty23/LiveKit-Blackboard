'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, type MotionProps, motion } from 'motion/react';
import {
  useAgent,
  useAgentExpression,
  useSessionContext,
  useSessionMessages,
  useVoiceAssistant,
} from '@livekit/components-react';
import { AgentAudioVisualizerBar } from '@/components/agents-ui/agent-audio-visualizer-bar';
import { AgentChatTranscript } from '@/components/agents-ui/agent-chat-transcript';
import {
  AgentControlBar,
  type AgentControlBarControls,
} from '@/components/agents-ui/agent-control-bar';
import { MoodAura, useMoodColor } from '@/components/agents-ui/mood-visualizer';
import { BoardCanvas } from '@/components/board/board-canvas';
import { useBoard } from '@/hooks/use-board';
import { useNeedleDiagrams } from '@/hooks/use-needle-diagrams';
import { cn } from '@/lib/shadcn/utils';

const BOTTOM_VIEW_MOTION_PROPS: MotionProps = {
  variants: {
    visible: {
      opacity: 1,
      translateY: '0%',
    },
    hidden: {
      opacity: 0,
      translateY: '100%',
    },
  },
  initial: 'hidden',
  animate: 'visible',
  exit: 'hidden',
  transition: {
    duration: 0.3,
    delay: 0.5,
    ease: 'easeOut',
  },
};

const CHAT_MOTION_PROPS: MotionProps = {
  variants: {
    visible: {
      opacity: 1,
      translateY: '0%',
    },
    hidden: {
      opacity: 0,
      translateY: '100%',
    },
  },
  initial: 'hidden',
  animate: 'visible',
  exit: 'hidden',
  transition: {
    duration: 0.3,
    ease: 'easeOut',
  },
};

const SHIMMER_MOTION_PROPS: MotionProps = {
  variants: {
    visible: {
      opacity: 1,
    },
    hidden: {
      opacity: 0,
    },
  },
  initial: 'hidden',
  animate: 'visible',
  exit: 'hidden',
  transition: {
    duration: 0.3,
    ease: 'easeOut',
  },
};

export interface AgentSessionView_01Props {
  preConnectMessage?: string;
  supportsChatInput?: boolean;
  supportsVideoInput?: boolean;
  supportsScreenShare?: boolean;
  isPreConnectBufferEnabled?: boolean;
}

export function AgentSessionView_01({
  preConnectMessage = 'Agent is listening, ask it a question',
  supportsChatInput = true,
  supportsVideoInput = true,
  supportsScreenShare = true,
  isPreConnectBufferEnabled = false,
  ref,
  className,
  ...props
}: React.ComponentProps<'section'> & AgentSessionView_01Props) {
  const session = useSessionContext();
  const { messages } = useSessionMessages(session);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { state: agentState } = useAgent();
  const { audioTrack } = useVoiceAssistant();
  const { mood, expression } = useAgentExpression();
  const moodColor = useMoodColor(mood);
  const boardOps = useBoard();
  useNeedleDiagrams();

  const controls: AgentControlBarControls = {
    leave: true,
    microphone: true,
    chat: supportsChatInput,
    camera: supportsVideoInput,
    screenShare: supportsScreenShare,
  };

  useEffect(() => {
    const lastMessage = messages.at(-1);
    const lastMessageIsLocal = lastMessage?.from?.isLocal === true;

    if (scrollAreaRef.current && lastMessageIsLocal) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <section
      ref={ref}
      className={cn('bg-background relative z-10 h-full w-full overflow-hidden', className)}
      {...props}
    >
      {/* Blackboard (above the aura orb) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="absolute inset-x-2 top-2 bottom-[135px] z-10 sm:inset-x-4 md:inset-x-10 md:bottom-[170px]"
      >
        <BoardCanvas ops={boardOps} />
      </motion.div>

      {/* Agent presence orb (mood-driven, big and centered behind the board) */}
      <AnimatePresence>
        {!isChatOpen && (
          <motion.div
            {...SHIMMER_MOTION_PROPS}
            className="pointer-events-none absolute inset-x-2 top-2 bottom-[135px] z-0 grid place-items-center sm:inset-x-4 md:inset-x-10 md:bottom-[170px]"
          >
            <div className="opacity-70">
              <MoodAura size="lg" state={agentState} audioTrack={audioTrack} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice status pill */}
      <AnimatePresence>
        {!isChatOpen && (
          <motion.div
            {...SHIMMER_MOTION_PROPS}
            className="pointer-events-none absolute top-4 right-4 z-30 md:top-5 md:right-12"
          >
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/35 px-4 py-2 backdrop-blur-sm">
              <AgentAudioVisualizerBar
                size="sm"
                state={agentState}
                audioTrack={audioTrack}
                color={moodColor}
                className="h-5 w-28 **:data-[slot=bar]:w-[3px]"
                style={{ color: moodColor }}
              />
              {mood ? (
                <span
                  title={expression ?? undefined}
                  className="font-mono text-[10px] font-medium tracking-wider capitalize"
                  style={{ color: moodColor }}
                >
                  {mood}
                </span>
              ) : (
                <span className="text-xs font-medium text-white/70">
                  {agentState === 'speaking' ? 'Agent is speaking…' : 'Listening'}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* transcript */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div
            {...CHAT_MOTION_PROPS}
            className="absolute inset-x-0 top-0 bottom-[135px] overflow-hidden md:bottom-[170px]"
          >
            <div className="from-background absolute inset-x-0 top-0 z-10 h-16 bg-linear-to-b to-transparent" />
            <AgentChatTranscript
              agentState={agentState}
              messages={messages}
              className="mx-auto max-w-2xl **:data-[slot=message-scroller-content]:p-4 **:data-[slot=message-scroller-content]:pt-24! md:**:data-[slot=message-scroller-content]:p-6"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom */}
      <motion.div
        {...BOTTOM_VIEW_MOTION_PROPS}
        className="absolute inset-x-3 bottom-0 z-50 md:inset-x-12"
      >
        {/* Pre-connect message */}
        {isPreConnectBufferEnabled && (
          <AnimatePresence>
            {messages.length === 0 && (
              <motion.p
                key="pre-connect-message"
                aria-hidden={messages.length > 0}
                {...SHIMMER_MOTION_PROPS}
                className="shimmer shimmer-duration-2000 pointer-events-none mx-auto block w-full max-w-2xl pb-4 text-center text-sm font-semibold"
              >
                {preConnectMessage}
              </motion.p>
            )}
          </AnimatePresence>
        )}
        <div className="bg-background relative mx-auto max-w-2xl pb-3 md:pb-12">
          <AgentControlBar
            variant="pill"
            controls={controls}
            isChatOpen={isChatOpen}
            isConnected={session.isConnected}
            onDisconnect={session.end}
            onIsChatOpenChange={setIsChatOpen}
          />
        </div>
      </motion.div>
    </section>
  );
}
