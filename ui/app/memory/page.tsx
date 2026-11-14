'use client';

import { useState, useEffect } from 'react';
import { TopNavBar } from '@/components/app/top-nav-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brain, History, Plus, Check, Trash2, Clock } from 'lucide-react';
import { api } from '@/lib/api-client';

interface SessionItem {
  id: string;
  room_name: string;
  started_at: string;
  duration?: string;
  summary?: string;
}

export default function MemoryPage() {
  const [facts, setFacts] = useState<string[]>([
    'Student prefers visual geometric analogies when explaining calculus concepts.',
    'Currently preparing for advanced Python algorithms interview.',
    'Likes short, interactive exercises after each topic explanation.',
  ]);

  const [sessions, setSessions] = useState<SessionItem[]>([
    {
      id: '1',
      room_name: 'agent_session_8f92',
      started_at: 'Today, 2:30 PM',
      duration: '14 min',
      summary: 'Reviewed system architecture and autonomous task scheduling options.',
    },
    {
      id: '2',
      room_name: 'agent_session_31a0',
      started_at: 'Yesterday, 11:15 AM',
      duration: '22 min',
      summary: 'Configured MCP server tools and workspace automation workflows.',
    },
  ]);

  const [newFact, setNewFact] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadMemory() {
      try {
        const profile = await api.get<{ facts?: string[] }>('/api/memory/profile');
        if (profile?.facts && profile.facts.length > 0) {
          setFacts(profile.facts);
        }
        const sessionData = await api.get<SessionItem[]>('/api/sessions');
        if (sessionData && Array.isArray(sessionData) && sessionData.length > 0) {
          setSessions(sessionData);
        }
      } catch (err) {
        console.warn('Backend not running locally, using default memory state:', err);
      }
    }
    loadMemory();
  }, []);

  const handleAddFact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFact.trim()) return;

    const updated = [...facts, newFact.trim()];
    setFacts(updated);
    setNewFact('');

    try {
      await api.put('/api/memory/profile', { facts: updated });
      setStatusMessage('Added memory fact.');
    } catch {
      setStatusMessage('Fact added locally.');
    }
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleDeleteFact = async (index: number) => {
    const updated = facts.filter((_, i) => i !== index);
    setFacts(updated);
    try {
      await api.put('/api/memory/profile', { facts: updated });
    } catch {}
  };

  return (
    <div className="bg-background min-h-svh w-full">
      <TopNavBar />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-foreground text-2xl font-bold tracking-tight">Memory & Sessions</h1>
            <p className="text-muted-foreground text-sm">
              Long-term user knowledge, learned preferences, and previous voice conversation history.
            </p>
          </div>
        </div>

        {statusMessage && (
          <div className="border-border bg-muted text-foreground mb-6 flex items-center gap-2 rounded-lg border p-3 text-sm">
            <Check className="size-4 text-emerald-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        <div className="grid gap-6">
          {/* User Profile Facts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Brain className="size-4 text-primary" />
                Learned Student Facts
              </CardTitle>
              <CardDescription>
                Persistent traits, goals, and learning styles remembered across sessions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleAddFact} className="flex gap-2">
                <Input
                  placeholder="Add a new fact or preference about the student..."
                  value={newFact}
                  onChange={(e) => setNewFact(e.target.value)}
                  className="text-sm"
                />
                <Button type="submit" size="sm" className="shrink-0">
                  <Plus className="mr-1.5 size-3.5" />
                  Add Fact
                </Button>
              </form>

              <div className="divide-border divide-y rounded-lg border">
                {facts.map((fact, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 text-sm">
                    <span className="text-foreground flex-1 pr-4">{fact}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteFact(idx)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Session History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-4 text-primary" />
                Session History ({sessions.length})
              </CardTitle>
              <CardDescription>Previous conversations with durations and key takeaways.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sessions.map((s) => (
                  <div key={s.id} className="border-border bg-muted/30 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-mono text-xs font-semibold">{s.room_name}</span>
                        {s.duration && (
                          <Badge variant="outline" className="text-[10px] font-mono">
                            <Clock className="mr-1 size-3" />
                            {s.duration}
                          </Badge>
                        )}
                      </div>
                      <span className="text-muted-foreground text-xs">{s.started_at}</span>
                    </div>
                    {s.summary && (
                      <p className="text-muted-foreground text-xs leading-relaxed mt-2">{s.summary}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
