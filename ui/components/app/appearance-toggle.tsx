'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Paintbrush } from 'lucide-react';
import {
  ACCENT_OPTIONS,
  FONT_OPTIONS,
  applyAccent,
  applyFont,
} from '@/components/app/appearance-preferences';
import { Button } from '@/components/ui/button';

export function AppearanceToggle() {
  const [open, setOpen] = useState(false);
  const [accent, setAccent] = useState('default');
  const [font, setFont] = useState('public-sans');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const savedAccent = localStorage.getItem('app_accent') || 'default';
      const savedFont = localStorage.getItem('app_font') || 'public-sans';
      setAccent(savedAccent);
      setFont(savedFont);
      applyAccent(savedAccent);
      applyFont(savedFont);
    } catch {}
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const handleAccent = (id: string) => {
    setAccent(id);
    applyAccent(id);
  };

  const handleFont = (id: string) => {
    setFont(id);
    applyFont(id);
  };

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Appearance & Accent preferences"
        title="Customize accent color & font"
        onClick={() => setOpen(!open)}
        className="border-border/70 text-muted-foreground hover:text-foreground size-8 rounded-lg border"
      >
        <Paintbrush className="size-4" />
      </Button>

      {open && (
        <div className="border-border/80 bg-popover text-popover-foreground absolute right-0 z-50 mt-2 w-64 rounded-xl border p-3 shadow-xl backdrop-blur-md">
          {/* Accent Colors */}
          <div className="space-y-2">
            <span className="text-muted-foreground block text-[11px] font-semibold uppercase tracking-wider">
              Accent Color
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {ACCENT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleAccent(opt.id)}
                  className={`flex items-center gap-1.5 rounded-lg p-1.5 text-xs transition-colors hover:bg-muted ${
                    accent === opt.id ? 'bg-primary/10 text-primary font-semibold' : ''
                  }`}
                >
                  <span className={`size-3 rounded-full ${opt.dotClass}`} />
                  <span className="truncate">{opt.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-border/60 my-3 border-t" />

          {/* Fonts */}
          <div className="space-y-1.5">
            <span className="text-muted-foreground block text-[11px] font-semibold uppercase tracking-wider">
              Font Family
            </span>
            <div className="space-y-1">
              {FONT_OPTIONS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => handleFont(f.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-muted ${
                    font === f.id ? 'bg-primary/10 text-primary font-semibold' : ''
                  }`}
                >
                  <span>{f.name}</span>
                  {font === f.id && <Check className="size-3.5 text-primary" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
