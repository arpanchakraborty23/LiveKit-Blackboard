'use client';

import { useEffect, useRef, useState } from 'react';
import chroma from 'chroma-js';
import { animate } from 'motion/react';
import { type AgentMood, useAgentExpression, useVoiceAssistant } from '@livekit/components-react';
import { AgentAudioVisualizerAura } from '@/components/agents-ui/agent-audio-visualizer-aura';
import { cn } from '@/lib/shadcn/utils';

/**
 * Mood → hue. Warm for high-arousal states, cool for low-arousal ones, so the shift reads as
 * a change in energy rather than an arbitrary palette change.
 */
export const MOOD_COLORS: Record<AgentMood, string> = {
  excited: '#ff7a18',
  happy: '#ffc94d',
  playful: '#ff5da2',
  curious: '#38bdf8',
  surprised: '#a78bfa',
  hopeful: '#34d399',
  empathetic: '#7dd3fc',
  sad: '#6366f1',
  angry: '#ef4444',
  anxious: '#f59e0b',
  calm: '#14b8a6',
};

/** Colour when the agent has not expressed anything recently. */
export const NEUTRAL_AURA_COLOR = '#1fd5f9';

interface ExpressionAuraProps {
  size?: 'icon' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

/**
 * The session's visual mood.
 *
 * `useAgentExpression` reads the agent's latest delivery tag, normalises it to an `AgentMood`
 * and — by default — decays to `null` after two turns so one excited sentence does not tint
 * the rest of the call. The colour is tweened in OKLCH-ish space via chroma so the change is
 * a smooth shift instead of a hard swap; the shader receives a uniform per frame, so the
 * tween costs nothing beyond a re-render.
 */
export function ExpressionAura({ size = 'xl', className }: ExpressionAuraProps) {
  const { mood, expression } = useAgentExpression({ ttlTurns: 2 });
  const { state, audioTrack } = useVoiceAssistant();

  const target = mood ? MOOD_COLORS[mood] : NEUTRAL_AURA_COLOR;
  const [color, setColor] = useState(target);
  const currentRef = useRef(target);

  useEffect(() => {
    const from = currentRef.current;
    if (from === target) return;

    const controls = animate(0, 1, {
      duration: 0.7,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (progress) => {
        // `chroma` is an `export =` namespace, so every helper reads as a "named export"
        // to the linter even though `chroma.mix` is the documented call form.
        // eslint-disable-next-line import/no-named-as-default-member
        const next = chroma.mix(from, target, progress).hex();
        if (next === currentRef.current) return;
        currentRef.current = next;
        setColor(next);
      },
    });

    return () => controls.stop();
  }, [target]);

  return (
    <div
      className={cn('relative', className)}
      data-mood={mood ?? 'neutral'}
      title={expression ?? undefined}
    >
      <AgentAudioVisualizerAura
        size={size}
        state={state}
        audioTrack={audioTrack}
        color={color as `#${string}`}
        className="h-full w-full"
      />
    </div>
  );
}
