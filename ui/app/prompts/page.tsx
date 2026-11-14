'use client';

import { useState, useEffect } from 'react';
import { TopNavBar } from '@/components/app/top-nav-bar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollText, Sparkles, Check, RefreshCw, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api-client';

const VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'];

export default function PromptsPage() {
  const [prompt, setPrompt] = useState('You are a capable, proactive, and empathetic personal autonomous AI agent.');
  const [voice, setVoice] = useState('alloy');
  const [temperature, setTemperature] = useState(0.7);
  const [configVersion, setConfigVersion] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadConfig() {
      try {
        const data = await api.get<{
          system_prompt?: string;
          voice?: string;
          temperature?: number;
          config_version?: number;
        }>('/api/assistant/config');
        if (data) {
          if (data.system_prompt) setPrompt(data.system_prompt);
          if (data.voice) setVoice(data.voice);
          if (data.temperature !== undefined) setTemperature(data.temperature);
          if (data.config_version) setConfigVersion(data.config_version);
        }
      } catch (err: unknown) {
        console.warn('Backend not running locally, using default prompt state:', err);
      }
    }
    loadConfig();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      const res = await api.put<{ config_version?: number }>('/api/assistant/config', {
        system_prompt: prompt,
        voice,
        temperature,
      });
      if (res?.config_version) {
        setConfigVersion(res.config_version);
      } else {
        setConfigVersion((v) => v + 1);
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-background min-h-svh w-full">
      <TopNavBar />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-foreground text-2xl font-bold tracking-tight">Prompts & Persona</h1>
            <p className="text-muted-foreground text-sm">
              Tune your personal autonomous agent&apos;s personality, instructions, voice, and response behavior.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              Config v{configVersion}
            </Badge>
            <Button onClick={handleSave} disabled={isSaving} size="sm">
              {isSaving ? (
                <RefreshCw className="mr-1.5 size-3.5 animate-spin" />
              ) : saveSuccess ? (
                <Check className="mr-1.5 size-3.5 text-emerald-400" />
              ) : (
                <Sparkles className="mr-1.5 size-3.5" />
              )}
              {isSaving ? 'Saving...' : saveSuccess ? 'Saved' : 'Save Changes'}
            </Button>
          </div>
        </div>

        {error && (
          <div className="border-destructive/30 bg-destructive/10 text-destructive mb-6 flex items-center gap-2 rounded-lg border p-3 text-sm">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ScrollText className="size-4 text-primary" />
                System Instructions
              </CardTitle>
              <CardDescription>
                Define the core behavior, pedagogical style, and tone for your voice assistant.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={8}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter system prompt instructions..."
                className="font-mono text-sm"
              />
            </CardContent>
          </Card>

          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Voice Model</CardTitle>
                <CardDescription>Select the voice timbre for audio synthesis.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  {VOICES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVoice(v)}
                      className={`rounded-lg border px-3 py-2 text-center text-xs font-medium capitalize transition-all ${
                        voice === v
                          ? 'border-primary bg-primary/10 text-primary ring-primary/20 ring-1'
                          : 'border-border text-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Temperature ({temperature})</CardTitle>
                <CardDescription>
                  Lower is more predictable; higher is more creative.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <input
                  type="range"
                  min="0.0"
                  max="1.2"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="text-muted-foreground flex justify-between text-xs font-mono">
                  <span>0.0 (Precise)</span>
                  <span>0.7 (Balanced)</span>
                  <span>1.2 (Creative)</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
