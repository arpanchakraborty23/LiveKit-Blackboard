'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { TokenSource } from 'livekit-client';
import { useSession, useSessionContext } from '@livekit/components-react';
import { WarningIcon } from '@phosphor-icons/react/dist/ssr';
import type { AppConfig } from '@/app-config';
import { AgentSessionProvider } from '@/components/agents-ui/agent-session-provider';
import { StartAudioButton } from '@/components/agents-ui/start-audio-button';
import { AgentSessionView_01 } from '@/components/agents-ui/blocks/agent-session-view-01';
import { WelcomeView } from '@/components/app/welcome-view';
import { TopNavBar } from '@/components/app/top-nav-bar';
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
 * Inner session runner - only mounted after user explicitly clicks "Start session".
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

  // If user ends call or connection drops, return to welcome screen
  useEffect(() => {
    if (isConnected === false && connectionState === 'disconnected') {
      onEndSession();
    }
  }, [isConnected, connectionState, onEndSession]);

  return (
    <main className="fixed inset-0 z-50 grid h-svh grid-cols-1 place-content-center bg-background">
      <AgentSessionView_01
        supportsChatInput={appConfig.supportsChatInput}
        supportsVideoInput={appConfig.supportsVideoInput}
        supportsScreenShare={appConfig.supportsScreenShare}
        isPreConnectBufferEnabled={appConfig.isPreConnectBufferEnabled}
        className="fixed inset-0"
      />
      <StartAudioButton label="Start Audio" />
    </main>
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
    <div className="bg-background relative min-h-svh w-full overflow-x-hidden">
      {/* 
        Top Navigation Bar:
        Visible on the welcome screen; automatically hidden during active voice session.
      */}
      {!isSessionStarted && <TopNavBar />}

      {/* When idle: Show Welcome view with Start button. Does NOT call /api/token */}
      {!isSessionStarted && (
        <main className="flex min-h-[calc(100svh-4rem)] items-center justify-center p-6">
          <WelcomeView
            startButtonText={appConfig.startButtonText}
            onStartCall={handleStartSession}
          />
        </main>
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
