'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { TokenSource } from 'livekit-client';
import { useSession, useSessionContext } from '@livekit/components-react';
import { WarningIcon } from '@phosphor-icons/react/dist/ssr';
import type { AppConfig } from '@/app-config';
import { AgentSessionProvider } from '@/components/agents-ui/agent-session-provider';
import { CortexDashboard } from '@/components/cortex/cortex-dashboard';
import { CortexVoiceRoom } from '@/components/cortex/cortex-voice-room';
import { Toaster } from '@/components/ui/sonner';
import { useAgentErrors } from '@/hooks/useAgentErrors';
import { useDebugMode } from '@/hooks/useDebug';
import { getSandboxTokenSource } from '@/lib/utils';

const IN_DEVELOPMENT = process.env.NODE_ENV !== 'production';

function AppSetup() {
  useDebugMode({ enabled: IN_DEVELOPMENT });
  useAgentErrors();
  return null;
}

/**
 * Inner session runner - only mounted after user explicitly clicks "Start voice session".
 * Connects to LiveKit and manages the active in-call experience.
 */
function ActiveSessionContent({
  appConfig,
  onEndSession,
}: {
  appConfig: AppConfig;
  onEndSession: () => void;
}) {
  const session = useSessionContext();
  const { start, isConnected, connectionState } = session;

  // Immediately start connecting upon mounting
  useEffect(() => {
    start().catch((err) => {
      console.error('Failed to start LiveKit session:', err);
    });
  }, [start]);

  // If user ends call or connection drops, return to dashboard
  useEffect(() => {
    if (isConnected === false && connectionState === 'disconnected') {
      onEndSession();
    }
  }, [isConnected, connectionState, onEndSession]);

  return (
    <CortexVoiceRoom
      onEndSession={onEndSession}
      className="fixed inset-0 z-50"
    />
  );
}

/**
 * Wrapper for LiveKit session provider.
 * Keeps useSession unmounted until the user triggers session start.
 */
function ActiveSession({
  appConfig,
  onEndSession,
}: {
  appConfig: AppConfig;
  onEndSession: () => void;
}) {
  const tokenSource = useMemo(() => {
    return typeof process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT === 'string'
      ? getSandboxTokenSource(appConfig)
      : TokenSource.endpoint('/api/token');
  }, [appConfig]);

  const session = useSession(
    tokenSource,
    appConfig.agentName ? { agentName: appConfig.agentName } : undefined
  );

  return (
    <AgentSessionProvider session={session}>
      <AppSetup />
      <ActiveSessionContent appConfig={appConfig} onEndSession={onEndSession} />
    </AgentSessionProvider>
  );
}

interface AppProps {
  appConfig: AppConfig;
}

export function App({ appConfig }: AppProps) {
  const [isSessionStarted, setIsSessionStarted] = useState(false);

  const handleStartSession = useCallback(() => {
    setIsSessionStarted(true);
  }, []);

  const handleEndSession = useCallback(() => {
    setIsSessionStarted(false);
  }, []);

  return (
    <div className="bg-[#000000] relative min-h-svh w-full overflow-x-hidden">
      {/* When idle: Show Cortex Dashboard. Does NOT call /api/token */}
      {!isSessionStarted && (
        <CortexDashboard
          userName="Arpan"
          onStartVoice={handleStartSession}
        />
      )}

      {/* When active: Mounts LiveKit session on demand, requests /api/token and starts audio */}
      {isSessionStarted && (
        <ActiveSession
          appConfig={appConfig}
          onEndSession={handleEndSession}
        />
      )}

      <Toaster
        icons={{
          warning: <WarningIcon weight="bold" />,
        }}
        position="top-center"
        className="toaster group"
        style={
          {
            '--normal-bg': 'var(--popover)',
            '--normal-text': 'var(--popover-foreground)',
            '--normal-border': 'var(--border)',
          } as React.CSSProperties
        }
      />
    </div>
  );
}
