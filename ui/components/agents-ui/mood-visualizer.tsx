'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import chroma from 'chroma-js';
import type { LocalAudioTrack, RemoteAudioTrack } from 'livekit-client';
import { animate, useMotionValue, useMotionValueEvent, useTransform } from 'motion/react';
import {
  type AgentMood,
  type AgentState,
  type TrackReferenceOrPlaceholder,
  useAgentExpression,
} from '@livekit/components-react';
import { AgentAudioVisualizerAura } from '@/components/agents-ui/agent-audio-visualizer-aura';

// Hue carries valence (warm for bright moments, cool for heavy ones); saturation
// carries intensity, so a quiet mood never out-shouts a strong one.
export const MOOD_COLORS: Record<AgentMood, `#${string}`> = {
  angry: '#F5222D',
  excited: '#FF7A45',
  happy: '#FFC53D',
  playful: '#F759AB',
  surprised: '#B37FEB',
  anxious: '#D46B08',
  hopeful: '#52C41A',
  empathetic: '#36CFC9',
  curious: '#6600FF',
  sad: '#2F54EB',
  calm: '#1FD5F9',
};

// Shown when the agent hasn't expressed anything recently.
export const NEUTRAL_COLOR: `#${string}` = '#1FD5F9';

/** Smoothly animated mood color (snapping reads as a glitch, so we interpolate). */
export function useMoodColor(mood: AgentMood | null): `#${string}` {
  const targetColor = mood ? MOOD_COLORS[mood] : NEUTRAL_COLOR;
  const colorProgress = useMotionValue<string>(targetColor);
  const hexColor = useTransform(colorProgress, (latestRgba) => chroma(latestRgba).hex());
  const [color, setColor] = useState<`#${string}`>(targetColor);

  useMotionValueEvent(hexColor, 'change', (latestHex) => setColor(`#${latestHex.slice(1)}`));

  useEffect(() => {
    const controls = animate(colorProgress, targetColor, { duration: 1, ease: 'linear' });
    return () => controls.stop();
  }, [targetColor, colorProgress]);

  return color;
}

interface MoodAuraProps {
  size?: 'icon' | 'sm' | 'md' | 'lg' | 'xl';
  state?: AgentState;
  audioTrack?: LocalAudioTrack | RemoteAudioTrack | TrackReferenceOrPlaceholder;
}

/** Agent presence orb: aura shader tinted by the live expressive mood + label. */
export function MoodAura({ size = 'sm', state = 'connecting', audioTrack }: MoodAuraProps) {
  const { mood, expression } = useAgentExpression();
  const color = useMoodColor(mood);
  const { resolvedTheme } = useTheme();
  const themeMode = resolvedTheme === 'light' ? 'light' : 'dark';

  return (
    <div className="flex flex-col items-center gap-1">
      <AgentAudioVisualizerAura
        size={size}
        state={state}
        color={color}
        audioTrack={audioTrack}
        themeMode={themeMode}
      />
      {mood && (
        <span
          title={expression ?? undefined}
          className="font-mono text-[10px] font-medium tracking-wider capitalize"
          style={{ color }}
        >
          {mood}
        </span>
      )}
    </div>
  );
}
