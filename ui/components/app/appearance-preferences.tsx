'use client';

import { useEffect, useState } from 'react';
import { Check, Paintbrush, Type } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export interface AccentOption {
  id: string;
  name: string;
  color: string;
  dotClass: string;
}

export const ACCENT_OPTIONS: AccentOption[] = [
  { id: 'default', name: 'Indigo (Default)', color: '#6366f1', dotClass: 'bg-indigo-500' },
  { id: 'sky', name: 'Sky Blue', color: '#0ea5e9', dotClass: 'bg-sky-500' },
  { id: 'emerald', name: 'Emerald Green', color: '#10b981', dotClass: 'bg-emerald-500' },
  { id: 'violet', name: 'Violet Purple', color: '#8b5cf6', dotClass: 'bg-violet-500' },
  { id: 'amber', name: 'Amber Gold', color: '#f59e0b', dotClass: 'bg-amber-500' },
  { id: 'rose', name: 'Rose Pink', color: '#f43f5e', dotClass: 'bg-rose-500' },
];

export interface FontOption {
  id: string;
  name: string;
  description: string;
  fontFamily: string;
}

export const FONT_OPTIONS: FontOption[] = [
  {
    id: 'public-sans',
    name: 'Public Sans',
    description: 'Clean, balanced geometric sans',
    fontFamily: 'var(--font-public-sans), system-ui, sans-serif',
  },
  {
    id: 'inter',
    name: 'Inter',
    description: 'Highly legible modern UI standard',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  {
    id: 'geist',
    name: 'Geist',
    description: 'Crisp developer-crafted typography',
    fontFamily: 'Geist, system-ui, sans-serif',
  },
  {
    id: 'mono',
    name: 'Commit / JetBrains Mono',
    description: 'High-contrast monospaced font',
    fontFamily: 'var(--font-commit-mono), monospace',
  },
];

export function applyAccent(accent: string) {
  if (typeof document === 'undefined') return;
  if (accent === 'default') {
    document.documentElement.removeAttribute('data-accent');
  } else {
    document.documentElement.setAttribute('data-accent', accent);
  }
  try {
    localStorage.setItem('app_accent', accent);
  } catch {}
}

export function applyFont(font: string) {
  if (typeof document === 'undefined') return;
  if (font === 'public-sans') {
    document.documentElement.removeAttribute('data-font');
  } else {
    document.documentElement.setAttribute('data-font', font);
  }
  try {
    localStorage.setItem('app_font', font);
  } catch {}
}

export function AppearancePreferences() {
  const [currentAccent, setCurrentAccent] = useState<string>('default');
  const [currentFont, setCurrentFont] = useState<string>('public-sans');

  useEffect(() => {
    try {
      const savedAccent = localStorage.getItem('app_accent') || 'default';
      const savedFont = localStorage.getItem('app_font') || 'public-sans';
      setCurrentAccent(savedAccent);
      setCurrentFont(savedFont);
      applyAccent(savedAccent);
      applyFont(savedFont);
    } catch {}
  }, []);

  const handleSelectAccent = (id: string) => {
    setCurrentAccent(id);
    applyAccent(id);
  };

  const handleSelectFont = (id: string) => {
    setCurrentFont(id);
    applyFont(id);
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Paintbrush className="size-4 text-primary" />
          Appearance & Typography
        </CardTitle>
        <CardDescription className="text-xs">
          Personalize the button accent color and typography across the control plane. Changes take effect immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Accent Colors */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Button Accent Color</Label>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-6">
            {ACCENT_OPTIONS.map((accent) => {
              const isSelected = currentAccent === accent.id;
              return (
                <button
                  key={accent.id}
                  type="button"
                  onClick={() => handleSelectAccent(accent.id)}
                  className={`group relative flex flex-col items-center gap-2 rounded-xl border p-3 text-left transition-all ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                      : 'border-border/70 hover:border-border hover:bg-muted/40'
                  }`}
                >
                  <span
                    className={`size-6 rounded-full shadow-xs transition-transform group-hover:scale-110 flex items-center justify-center ${accent.dotClass}`}
                  >
                    {isSelected && <Check className="size-3.5 text-white" />}
                  </span>
                  <span className="text-xs font-medium truncate max-w-full">
                    {accent.name.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Font Family */}
        <div className="space-y-3">
          <Label className="flex items-center gap-1.5 text-sm font-medium">
            <Type className="size-4" />
            Font Family
          </Label>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-4">
            {FONT_OPTIONS.map((font) => {
              const isSelected = currentFont === font.id;
              return (
                <button
                  key={font.id}
                  type="button"
                  onClick={() => handleSelectFont(font.id)}
                  style={{ fontFamily: font.fontFamily }}
                  className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition-all ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/30 bg-primary/5'
                      : 'border-border/70 hover:border-border hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{font.name}</span>
                    {isSelected && <Check className="size-3.5 text-primary" />}
                  </div>
                  <span className="text-muted-foreground text-xs leading-snug">
                    {font.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Preview Bar */}
        <div className="border-border/70 bg-muted/20 space-y-3 rounded-xl border p-4">
          <span className="text-muted-foreground block text-xs font-semibold uppercase tracking-wider">
            Live Preview
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Primary Button</Button>
            <Button size="sm" variant="outline">
              Outline Button
            </Button>
            <Button size="sm" variant="secondary">
              Secondary
            </Button>
            <Badge>Active Accent</Badge>
            <Badge variant="outline">Outline Badge</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
