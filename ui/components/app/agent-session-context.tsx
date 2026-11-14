'use client';

import React, { createContext, useContext, useState, useMemo, useEffect, useCallback, ReactNode } from 'react';
import { TokenSource } from 'livekit-client';
import { useSession, useSessionContext } from '@livekit/components-react';
import { WarningIcon } from '@phosphor-icons/react/dist/ssr';
import { Radio, PhoneOff } from 'lucide-react';
import type { AppConfig } from '@/app-config';
import { AgentSessionProvider } from '@/components/agents-ui/agent-session-provider';
import { StartAudioButton } from '@/components/agents-ui/start-audio-button';
import { AgentSessionView_01 } from '@/components/agents-ui/blocks/agent-session-view-01';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { useAgentErrors } from '@/hooks/useAgentErrors';
import { useDebugMode } from '@/hooks/useDebug';
import { getSandboxTokenSource } from '@/lib/utils';
import { cn } from '@/lib/shadcn/utils';

const IN_DEVELOPMENT = process.env.NODE_ENV !== 'production';

function AppSetup() {
  useDebugMode({ enabled: IN_DEVELOPMENT });
  useAgentErrors();
  return null;
}

interface AgentSessionContextType {
  isSessionStarted: boolean;
  startSession: () => void;
  endSession: () => void;
  toggleSession: () => void;
}

const AgentSessionContext = createContext<AgentSessionContextType | null>(null);

export function useAgentSession() {
  const context = useContext(AgentSessionContext);
  if (!context) {
    throw new Error('useAgentSession must be used within an AgentSessionModalProvider');
  }
  return context;
}

/**
 * Inner session runner - mounted after user explicitly starts the session.
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

  // If user ends call or connection drops, return to previous view
  useEffect(() => {
    if (isConnected === false && connectionState === 'disconnected') {
      onEndSession();
    }
  }, [isConnected, connectionState, onEndSession]);

  return (
    <main className="fixed inset-0 z-50 grid h-svh grid-cols-1 place-content-center bg-background">
      {/* Top right quick exit button inside the active session view */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
        <Button
          size="sm"
          variant="destructive"
          onClick={onEndSession}
          className="h-8 rounded-full px-3 text-xs font-mono font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur"
        >
          <PhoneOff className="size-3.5" />
          <span>End Session</span>
        </Button>
      </div>

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

interface AgentSessionModalProviderProps {
  appConfig: AppConfig;
  children: ReactNode;
}

export function AgentSessionModalProvider({
  appConfig,
  children,
}: AgentSessionModalProviderProps) {
  const [isSessionStarted, setIsSessionStarted] = useState(false);

  const startSession = useCallback(() => {
    setIsSessionStarted(true);
  }, []);

  const endSession = useCallback(() => {
    setIsSessionStarted(false);
  }, []);

  const toggleSession = useCallback(() => {
    setIsSessionStarted((prev) => !prev);
  }, []);

  const value = useMemo(
    () => ({
      isSessionStarted,
      startSession,
      endSession,
      toggleSession,
    }),
    [isSessionStarted, startSession, endSession, toggleSession]
  );

  return (
    <AgentSessionContext.Provider value={value}>
      {children}

      {/* Render the full-screen voice session when started */}
      {isSessionStarted && (
        <ActiveSession
          appConfig={appConfig}
          onEndSession={endSession}
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
    </AgentSessionContext.Provider>
  );
}

/**
 * Static Agent Session Button for the top-right corner of the application.
 */
export function AgentSessionButton({ className }: { className?: string }) {
  const { isSessionStarted, startSession, endSession } = useAgentSession();

  if (isSessionStarted) {
    return (
      <Button
        size="sm"
        variant="destructive"
        onClick={endSession}
        className={cn(
          'h-8.5 rounded-full px-3.5 font-mono text-xs font-semibold shadow-sm transition-all flex items-center gap-2',
          className
        )}
      >
        <span className="size-2 rounded-full bg-white animate-pulse" />
        <span>End Session</span>
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      onClick={startSession}
      className={cn(
        'h-8.5 rounded-full px-3.5 font-mono text-xs font-semibold shadow-sm transition-all flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90',
        className
      )}
    >
      <Radio className="size-3.5 text-emerald-400 animate-pulse" />
      <span>Start Session</span>
    </Button>
  );
}

