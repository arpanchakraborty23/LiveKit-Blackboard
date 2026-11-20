'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import {
  Home,
  Mic,
  CheckSquare,
  FolderGit2,
  Brain,
  Palette,
  Workflow,
  Settings,
  Search,
  Sparkles,
  ArrowRight,
  ChevronRight,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/shadcn/utils';

export interface CortexDashboardProps {
  userName?: string;
  onStartVoice: () => void;
  className?: string;
}

export function CortexDashboard({
  userName = 'Arpan',
  onStartVoice,
  className,
}: CortexDashboardProps) {
  const router = useRouter();
  const [activeNav, setActiveNav] = useState('home');
  const [inputText, setInputText] = useState('');

  const navItems = [
    { id: 'home', label: 'Home', icon: Home, href: '#' },
    { id: 'voice', label: 'Voice room', icon: Mic, href: '#', badge: null, onClick: onStartVoice },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare, href: '/prompts', badge: '3' },
    { id: 'projects', label: 'Projects', icon: FolderGit2, href: '/skills' },
    { id: 'memory', label: 'Memory', icon: Brain, href: '/memory' },
    { id: 'canvas', label: 'Canvas', icon: Palette, href: '/knowledge' },
    { id: 'automations', label: 'Automations', icon: Workflow, href: '/tools' },
    { id: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
  ];

  const helpers = [
    { name: 'Research', progress: 72, color: 'bg-blue-500', dot: 'bg-blue-400', status: '72%' },
    { name: 'Action', progress: 45, color: 'bg-purple-500', dot: 'bg-purple-400', status: '45%' },
    { name: 'Canvas', progress: 30, color: 'bg-amber-500', dot: 'bg-amber-400', status: '30%' },
    { name: 'Memory', progress: 100, color: 'bg-emerald-500', dot: 'bg-emerald-400', status: 'Done' },
  ];

  const activities = [
    { time: '18:24', text: 'Split your request into 3 tasks' },
    { time: '18:24', text: 'Research started, 12 sources' },
    { time: '18:25', text: 'Compared deployment options and pricing' },
    { time: '18:25', text: 'Drawing the architecture diagram' },
    { time: '18:25', text: 'Found 3 related notes in memory' },
  ];

  const todayStats = [
    { label: 'Priorities', value: 3 },
    { label: 'Tasks due', value: 5 },
    { label: 'Active projects', value: 2 },
    { label: 'Meetings', value: 1 },
  ];

  const handleNavClick = (item: (typeof navItems)[0]) => {
    setActiveNav(item.id);
    if (item.onClick) {
      item.onClick();
    } else if (item.href && item.href !== '#') {
      router.push(item.href);
    }
  };

  return (
    <div
      className={cn(
        'flex min-h-screen w-full bg-[#000000] text-white selection:bg-[#2DD4BF]/20',
        className
      )}
      style={{ fontFamily: 'var(--font-public-sans), -apple-system, sans-serif' }}
    >
      {/* ── Left Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-white/[0.06] bg-[#000000] px-4 py-6">
        {/* Brand */}
        <div className="mb-8 flex items-center gap-2.5 px-3">
          <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#2DD4BF] to-[#0D9488] shadow-[0_0_14px_rgba(45,212,191,0.35)]">
            <Sparkles className="size-4 text-black stroke-[2.5]" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-white">Cortex</h1>
        </div>

        {/* Navigation items */}
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item)}
                className={cn(
                  'group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-white/[0.08] text-white font-semibold'
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={cn(
                      'size-4 transition-colors',
                      isActive ? 'text-[#2DD4BF]' : 'text-zinc-400 group-hover:text-zinc-200'
                    )}
                  />
                  <span className="text-sm">{item.label}</span>
                </div>
                {item.badge && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-[#2DD4BF] text-[11px] font-bold text-black shadow-[0_0_8px_rgba(45,212,191,0.3)]">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer Indicator */}
        <div className="mt-auto px-3 pt-4 border-t border-white/[0.04]">
          <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Autonomous OS</span>
          </div>
        </div>
      </aside>

      {/* ── Main Content Area ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-8 py-7">
        {/* Top Header */}
        <header className="mb-7 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-zinc-400">Friday, 20 November</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">
              Good morning, {userName}
            </h2>
          </div>

          {/* Search Bar */}
          <div className="relative w-72">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search anything"
              className="w-full rounded-xl border border-white/[0.08] bg-zinc-900/60 py-2.5 pl-10 pr-12 text-xs text-white placeholder-zinc-500 outline-none transition-colors focus:border-[#2DD4BF]/40 focus:bg-zinc-900"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 text-[10px] text-zinc-500 font-mono bg-white/[0.05] px-1.5 py-0.5 rounded border border-white/[0.06]">
              <span>⌘K</span>
            </div>
          </div>
        </header>

        {/* ── Bento Grid ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-12 gap-5">
          {/* Card 1: How can I help? (Hero) */}
          <div className="col-span-12 rounded-2xl border border-white/[0.06] bg-[#0A0A0C] p-6 lg:col-span-8 shadow-sm">
            <div className="flex items-center gap-6">
              {/* Mint-teal audio waveform icon (5 bars) */}
              <div className="flex h-16 w-16 shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-[#3DD9B3]/10 border border-[#3DD9B3]/20 shadow-[0_0_24px_rgba(61,217,179,0.15)]">
                <motion.span
                  animate={{ height: [20, 28, 16, 20] }}
                  transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                  className="w-1.5 rounded-full bg-[#3DD9B3]"
                />
                <motion.span
                  animate={{ height: [32, 44, 28, 32] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut', delay: 0.2 }}
                  className="w-1.5 rounded-full bg-[#3DD9B3]"
                />
                <motion.span
                  animate={{ height: [46, 56, 38, 46] }}
                  transition={{ repeat: Infinity, duration: 2.1, ease: 'easeInOut', delay: 0.1 }}
                  className="w-2 rounded-full bg-[#3DD9B3]"
                />
                <motion.span
                  animate={{ height: [32, 42, 26, 32] }}
                  transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut', delay: 0.3 }}
                  className="w-1.5 rounded-full bg-[#3DD9B3]"
                />
                <motion.span
                  animate={{ height: [18, 26, 14, 18] }}
                  transition={{ repeat: Infinity, duration: 1.9, ease: 'easeInOut', delay: 0.15 }}
                  className="w-1.5 rounded-full bg-[#3DD9B3]"
                />
              </div>

              {/* Title & Input */}
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white">How can I help?</h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (inputText.trim()) onStartVoice();
                  }}
                  className="mt-3 flex items-center gap-3"
                >
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Ask, plan or hand off a task"
                      className="w-full rounded-full border border-white/[0.08] bg-zinc-900/80 px-4 py-2.5 text-xs text-white placeholder-zinc-500 outline-none transition-colors focus:border-[#3DD9B3]/40 focus:ring-1 focus:ring-[#3DD9B3]/20"
                    />
                  </div>
                </form>

                {/* Quick action chips & Start Voice Session CTA button */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {['Research', 'Automate', 'Create'].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setInputText(`${chip}: `)}
                        className="rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white active:scale-95"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={onStartVoice}
                    className="flex items-center gap-2 rounded-full bg-[#3DD9B3] px-5 py-2 text-xs font-semibold text-black transition-all hover:bg-[#34c4a3] hover:shadow-[0_0_16px_rgba(61,217,179,0.35)] active:scale-95"
                  >
                    <Mic className="size-3.5 fill-black" />
                    <span>Start voice session</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Helpers working now (Subagents) */}
          <div className="col-span-12 rounded-2xl border border-white/[0.06] bg-[#0A0A0C] p-6 lg:col-span-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-zinc-400">Helpers working now</h4>
              <span className="flex size-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="mt-4 space-y-3.5">
              {helpers.map((h) => (
                <div key={h.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className={cn('size-1.5 rounded-full', h.dot)} />
                      <span className="font-medium text-zinc-200">{h.name}</span>
                    </div>
                    <span className="font-mono text-[11px] text-zinc-400">{h.status}</span>
                  </div>
                  {/* Progress track */}
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', h.color)}
                      style={{ width: `${h.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 3: Recent activity */}
          <div className="col-span-12 rounded-2xl border border-white/[0.06] bg-[#0A0A0C] p-6 lg:col-span-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-zinc-400">Recent activity</h4>
              <Activity className="size-3.5 text-zinc-500" />
            </div>
            <div className="mt-4 space-y-3">
              {activities.map((act, i) => (
                <div key={i} className="flex items-start gap-4 text-xs">
                  <span className="font-mono text-zinc-500 shrink-0">{act.time}</span>
                  <span className="text-zinc-300 leading-relaxed">{act.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 4: Today metrics */}
          <div className="col-span-12 rounded-2xl border border-white/[0.06] bg-[#0A0A0C] p-6 lg:col-span-3 shadow-sm">
            <h4 className="text-xs font-semibold text-zinc-400">Today</h4>
            <div className="mt-4 space-y-3">
              {todayStats.map((stat) => (
                <div key={stat.label} className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">{stat.label}</span>
                  <span className="font-mono font-bold text-white text-sm">{stat.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 5: Memory */}
          <div className="col-span-12 rounded-2xl border border-white/[0.06] bg-[#0A0A0C] p-6 lg:col-span-3 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-zinc-400">Memory</h4>
                <Brain className="size-3.5 text-[#2DD4BF]" />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-zinc-300">
                You&apos;re working on your personal agent v2. You prefer low-cost cloud setups.
              </p>
            </div>
            <div className="mt-5">
              <button
                type="button"
                onClick={() => router.push('/memory')}
                className="group flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-zinc-900/80 px-4 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <span>Review memory</span>
                <ChevronRight className="size-3 text-zinc-500 group-hover:text-white transition-colors" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
