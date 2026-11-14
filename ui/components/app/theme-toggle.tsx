'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { MoonIcon, SunIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/shadcn/utils';

interface ThemeToggleProps {
  className?: string;
  /** `inline` renders a single icon button; `pill` keeps the two-button segmented look. */
  variant?: 'inline' | 'pill';
}

/**
 * Theme switch.
 *
 * Always rendered and always hit-testable. `mounted` and `suppressHydrationWarning`
 * prevent hydration mismatches between server-rendered default and client localStorage theme.
 */
export function ThemeToggle({ className, variant = 'inline' }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === 'dark';

  if (variant === 'pill') {
    return (
      <div
        className={cn(
          'text-foreground bg-background flex w-fit flex-row justify-end divide-x overflow-hidden rounded-full border',
          className
        )}
      >
        <span className="sr-only">Color scheme toggle</span>
        <button
          type="button"
          onClick={() => setTheme('dark')}
          className="cursor-pointer p-1 pl-1.5"
          suppressHydrationWarning
        >
          <span className="sr-only">Enable midnight color scheme</span>
          <MoonIcon size={16} weight="bold" className={cn(!isDark && 'opacity-25')} />
        </button>
        <button
          type="button"
          onClick={() => setTheme('light')}
          className="cursor-pointer p-1 pr-1.5 pl-1.5"
          suppressHydrationWarning
        >
          <span className="sr-only">Enable light color scheme</span>
          <SunIcon size={16} weight="bold" className={cn(isDark && 'opacity-25')} />
        </button>
      </div>
    );
  }

  const label = mounted
    ? isDark
      ? 'Switch to light theme'
      : 'Switch to midnight theme'
    : 'Toggle color scheme';

  return (
    <button
      type="button"
      suppressHydrationWarning
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className={cn(
        'text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring inline-flex size-9 items-center justify-center rounded-lg border transition-colors outline-none focus-visible:ring-[3px]',
        className
      )}
    >
      {mounted && !isDark ? (
        <SunIcon size={17} weight="bold" />
      ) : (
        <MoonIcon size={17} weight="bold" className={cn(!mounted && 'opacity-40')} />
      )}
      <span className="sr-only">Toggle color scheme</span>
    </button>
  );
}
