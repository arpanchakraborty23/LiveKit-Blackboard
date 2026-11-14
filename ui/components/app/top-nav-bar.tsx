'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bot,
  ScrollText,
  Wrench,
  Sparkles,
  BookOpen,
  Brain,
  Settings,
} from 'lucide-react';
import { IconBar, IconBarItem } from '@/components/ui/icon-bar';
import { ThemeToggle } from '@/components/app/theme-toggle';
import { AgentSessionButton } from '@/components/app/agent-session-context';
import { cn } from '@/lib/shadcn/utils';

const NAV_ITEMS = [
  { href: '/prompts', label: 'Prompts', icon: ScrollText },
  { href: '/tools', label: 'MCP & Tools', icon: Wrench },
  { href: '/skills', label: 'Skills', icon: Sparkles },
  { href: '/knowledge', label: 'Knowledge', icon: BookOpen },
  { href: '/memory', label: 'Memory', icon: Brain },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function TopNavBar({ className }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  // Determine active tab based on current route
  const currentTab = NAV_ITEMS.find(
    (item) => item.href === pathname || (item.href !== '/' && pathname.startsWith(item.href))
  )?.href ?? '/prompts';

  return (
    <header
      className={cn(
        'border-border/60 bg-background/80 sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b px-4 sm:px-6 backdrop-blur transition-all duration-300',
        className
      )}
    >
      {/* Brand / Logo */}
      <Link href="/prompts" className="group flex items-center gap-2.5">
        <span className="bg-primary/15 text-primary flex size-8 items-center justify-center rounded-lg shadow-sm transition-transform group-hover:scale-105">
          <Bot className="size-4" />
        </span>
        <div className="hidden sm:flex sm:flex-col">
          <span className="text-foreground text-sm font-semibold leading-tight tracking-tight">
            Personal Agent
          </span>
          <span className="text-muted-foreground text-[11px] leading-tight font-mono">
            Control Plane
          </span>
        </div>
      </Link>

      {/* Center IconBar with fluid navigation */}
      <nav className="flex max-w-full items-center justify-center overflow-x-auto px-2">
        <IconBar
          value={currentTab}
          onValueChange={(val) => {
            if (val && val !== currentTab) {
              router.push(val);
            }
          }}
        >
          {NAV_ITEMS.map((item) => (
            <IconBarItem
              key={item.href}
              icon={item.icon}
              label={item.label}
              value={item.href}
              aria-current={currentTab === item.href ? 'page' : undefined}
            />
          ))}
        </IconBar>
      </nav>

      {/* Right controls - static agent session button & theme toggle */}
      <div className="flex items-center gap-2.5">
        <AgentSessionButton />
        <ThemeToggle />
      </div>
    </header>
  );
}
