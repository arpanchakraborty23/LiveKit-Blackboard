'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Edit3,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Save,
  ScrollText,
  Search,
  Sparkles,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { TopNavBar } from '@/components/app/top-nav-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api-client';

export interface PromptItem {
  id: string;
  name: string;
  content: string;
  is_active: boolean;
  version?: number;
  created_at?: string;
  updated_at?: string;
}

export interface SkillItem {
  id: string;
  name: string;
  description?: string;
  instructions: string;
  is_enabled: boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

function PromptsSkillsContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'skills' ? 'skills' : 'prompts';

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<'prompts' | 'skills'>(initialTab);

  // Prompts, skills & static system prompt coming straight from the backend
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [systemPromptDraft, setSystemPromptDraft] = useState('');
  const [isSystemPromptOpen, setIsSystemPromptOpen] = useState(false);
  const [isSavingSystemPrompt, setIsSavingSystemPrompt] = useState(false);

  // Connection & loading state
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  // Filters & search
  const [promptSearch, setPromptSearch] = useState('');
  const [promptFilter, setPromptFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [skillSearch, setSkillSearch] = useState('');
  const [skillFilter, setSkillFilter] = useState<'all' | 'active' | 'disabled'>('all');

  // Dialogs: Prompts
  const [isCreatePromptOpen, setIsCreatePromptOpen] = useState(false);
  const [newPromptName, setNewPromptName] = useState('');
  const [newPromptContent, setNewPromptContent] = useState('');
  const [isSavingNewPrompt, setIsSavingNewPrompt] = useState(false);

  const [editingPrompt, setEditingPrompt] = useState<PromptItem | null>(null);
  const [editPromptName, setEditPromptName] = useState('');
  const [editPromptContent, setEditPromptContent] = useState('');
  const [isSavingEditPrompt, setIsSavingEditPrompt] = useState(false);

  // Dialogs: Skills
  const [isCreateSkillOpen, setIsCreateSkillOpen] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillDesc, setNewSkillDesc] = useState('');
  const [newSkillInstructions, setNewSkillInstructions] = useState('');
  const [isSavingNewSkill, setIsSavingNewSkill] = useState(false);

  const [editingSkill, setEditingSkill] = useState<SkillItem | null>(null);
  const [editSkillName, setEditSkillName] = useState('');
  const [editSkillDesc, setEditSkillDesc] = useState('');
  const [editSkillInstructions, setEditSkillInstructions] = useState('');
  const [isSavingEditSkill, setIsSavingEditSkill] = useState(false);

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3500);
  };

  // Load everything from the backend
  const fetchBackendData = async () => {
    setIsLoading(true);
    let connected = false;

    try {
      const promptRes = await api.get<{ count: number; data: PromptItem[] }>('/api/prompts');
      if (promptRes?.data) {
        setPrompts(promptRes.data);
        connected = true;
      }
    } catch (err: unknown) {
      console.warn('Failed to fetch prompts from backend:', err);
    }

    try {
      const systemRes = await api.get<{ data?: { content?: string }; content?: string }>(
        '/api/prompts/system'
      );
      const content = systemRes?.data?.content ?? systemRes?.content ?? '';
      setSystemPrompt(content);
      setSystemPromptDraft(content);
      connected = true;
    } catch (err: unknown) {
      console.warn('Failed to fetch system prompt from backend:', err);
    }

    try {
      const skillRes = await api.get<{ count: number; data?: SkillItem[]; skills?: SkillItem[] }>(
        '/api/skills'
      );
      const skillList = skillRes?.data || skillRes?.skills;
      if (skillList) {
        setSkills(skillList);
        connected = true;
      }
    } catch (err: unknown) {
      console.warn('Failed to fetch skills from backend:', err);
    }

    setBackendConnected(connected);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchBackendData();
  }, []);

  // ----------------------------------------------------
  // STATIC SYSTEM PROMPT (ALWAYS ACTIVE)
  // ----------------------------------------------------

  const handleSaveSystemPrompt = async () => {
    setIsSavingSystemPrompt(true);
    try {
      const res = await api.put<{ content?: string; data?: { content?: string } }>(
        '/api/prompts/system',
        { content: systemPromptDraft }
      );
      const saved = res?.data?.content ?? res?.content ?? systemPromptDraft;
      setSystemPrompt(saved);
      setSystemPromptDraft(saved);
      setIsSystemPromptOpen(false);
      showNotification('System prompt saved.');
    } catch (err: unknown) {
      showNotification(
        err instanceof Error ? err.message : 'Failed to save system prompt',
        'error'
      );
    } finally {
      setIsSavingSystemPrompt(false);
    }
  };

  // ----------------------------------------------------
  // PROMPTS CRUD (DIRECT BACKEND API)
  // ----------------------------------------------------

  // Multiple prompts can be active at the same time
  const handleTogglePrompt = async (id: string, current: boolean) => {
    const nextState = !current;

    // Optimistic UI update
    setPrompts((prev) => prev.map((p) => (p.id === id ? { ...p, is_active: nextState } : p)));

    try {
      await api.post('/api/prompts/toggle', { id, is_active: nextState });
      showNotification(nextState ? 'Prompt activated.' : 'Prompt deactivated.');
    } catch {
      // Revert if the API call failed
      setPrompts((prev) => prev.map((p) => (p.id === id ? { ...p, is_active: current } : p)));
      showNotification('Failed to update prompt status.', 'error');
    }
  };

  const handleCreatePrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPromptContent.trim()) {
      showNotification('Write your prompt before saving.', 'error');
      return;
    }

    setIsSavingNewPrompt(true);
    try {
      const res = await api.post<{ data: PromptItem }>('/api/prompts', {
        name: newPromptName.trim() || 'Untitled Prompt',
        content: newPromptContent.trim(),
        is_active: true,
      });

      if (res?.data) {
        setPrompts((prev) => [res.data, ...prev]);
        setNewPromptName('');
        setNewPromptContent('');
        setIsCreatePromptOpen(false);
        showNotification(`Prompt "${res.data.name}" saved.`);
      }
    } catch (err: unknown) {
      showNotification(err instanceof Error ? err.message : 'Failed to save prompt', 'error');
    } finally {
      setIsSavingNewPrompt(false);
    }
  };

  const handleOpenEditPrompt = (prompt: PromptItem) => {
    setEditingPrompt(prompt);
    setEditPromptName(prompt.name);
    setEditPromptContent(prompt.content);
  };

  const handleSaveEditPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPrompt || !editPromptContent.trim()) {
      showNotification('Write your prompt before saving.', 'error');
      return;
    }

    setIsSavingEditPrompt(true);
    try {
      const res = await api.put<{ data: PromptItem }>(`/api/prompts/update/${editingPrompt.id}`, {
        name: editPromptName.trim() || 'Untitled Prompt',
        content: editPromptContent.trim(),
      });

      if (res?.data) {
        setPrompts((prev) => prev.map((p) => (p.id === editingPrompt.id ? res.data : p)));
        setEditingPrompt(null);
        showNotification(`Prompt "${res.data.name}" saved.`);
      }
    } catch (err: unknown) {
      showNotification(err instanceof Error ? err.message : 'Failed to save prompt', 'error');
    } finally {
      setIsSavingEditPrompt(false);
    }
  };

  const handleDeletePrompt = async (id: string, name: string) => {
    try {
      await api.delete(`/api/prompts/delete/${id}`);
      setPrompts((prev) => prev.filter((p) => p.id !== id));
      showNotification(`Prompt "${name}" deleted.`);
    } catch (err: unknown) {
      showNotification(err instanceof Error ? err.message : 'Failed to delete prompt', 'error');
    }
  };

  // ----------------------------------------------------
  // SKILLS CRUD (DIRECT BACKEND API)
  // ----------------------------------------------------

  const handleToggleSkill = async (id: string, current: boolean) => {
    const nextState = !current;

    setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, is_enabled: nextState } : s)));

    try {
      await api.post('/api/skills/toggle', { id, is_enabled: nextState });
      showNotification('Skill status updated.');
    } catch {
      setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, is_enabled: current } : s)));
      showNotification('Failed to update skill status.', 'error');
    }
  };

  const handleCreateSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillName.trim() || !newSkillInstructions.trim()) {
      showNotification('Skill name and instructions are required.', 'error');
      return;
    }

    setIsSavingNewSkill(true);
    try {
      const res = await api.post<{ skill: SkillItem }>('/api/skills', {
        name: newSkillName.trim(),
        description: newSkillDesc.trim(),
        instructions: newSkillInstructions.trim(),
        is_enabled: true,
      });

      if (res?.skill) {
        setSkills((prev) => [...prev, res.skill]);
        setNewSkillName('');
        setNewSkillDesc('');
        setNewSkillInstructions('');
        setIsCreateSkillOpen(false);
        showNotification(`Skill "${res.skill.name}" saved.`);
      }
    } catch (err: unknown) {
      showNotification(err instanceof Error ? err.message : 'Failed to save skill', 'error');
    } finally {
      setIsSavingNewSkill(false);
    }
  };

  const handleOpenEditSkill = (skill: SkillItem) => {
    setEditingSkill(skill);
    setEditSkillName(skill.name);
    setEditSkillDesc(skill.description || '');
    setEditSkillInstructions(skill.instructions);
  };

  const handleSaveEditSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSkill || !editSkillName.trim() || !editSkillInstructions.trim()) return;

    setIsSavingEditSkill(true);
    try {
      const res = await api.put<{ skill: SkillItem }>(`/api/skills/update/${editingSkill.id}`, {
        name: editSkillName.trim(),
        description: editSkillDesc.trim(),
        instructions: editSkillInstructions.trim(),
      });

      if (res?.skill) {
        setSkills((prev) => prev.map((s) => (s.id === editingSkill.id ? res.skill : s)));
        setEditingSkill(null);
        showNotification(`Skill "${res.skill.name}" saved.`);
      }
    } catch (err: unknown) {
      showNotification(err instanceof Error ? err.message : 'Failed to save skill', 'error');
    } finally {
      setIsSavingEditSkill(false);
    }
  };

  const handleDeleteSkill = async (id: string, name: string) => {
    try {
      await api.delete(`/api/skills/delete/${id}`);
      setSkills((prev) => prev.filter((s) => s.id !== id));
      showNotification(`Skill "${name}" deleted.`);
    } catch {
      showNotification('Failed to delete skill.', 'error');
    }
  };

  // ----------------------------------------------------
  // FILTERED LISTS & COUNTS
  // ----------------------------------------------------

  const activePrompts = useMemo(() => prompts.filter((p) => p.is_active), [prompts]);
  const activeSkills = useMemo(() => skills.filter((s) => s.is_enabled), [skills]);

  const filteredPrompts = useMemo(() => {
    return prompts.filter((p) => {
      const query = promptSearch.toLowerCase();
      const matchesSearch =
        p.name.toLowerCase().includes(query) || p.content.toLowerCase().includes(query);
      if (!matchesSearch) return false;
      if (promptFilter === 'active') return p.is_active;
      if (promptFilter === 'inactive') return !p.is_active;
      return true;
    });
  }, [prompts, promptSearch, promptFilter]);

  const filteredSkills = useMemo(() => {
    return skills.filter((s) => {
      const query = skillSearch.toLowerCase();
      const matchesSearch =
        s.name.toLowerCase().includes(query) ||
        s.instructions.toLowerCase().includes(query) ||
        (s.description ? s.description.toLowerCase().includes(query) : false);
      if (!matchesSearch) return false;
      if (skillFilter === 'active') return s.is_enabled;
      if (skillFilter === 'disabled') return !s.is_enabled;
      return true;
    });
  }, [skills, skillSearch, skillFilter]);

  return (
    <div className="bg-background text-foreground min-h-svh w-full">
      <TopNavBar />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Page Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg">
                <Sparkles className="size-4" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight">Prompts & Skills Hub</h1>
            </div>
            <p className="text-muted-foreground max-w-2xl text-sm">
              One static system prompt plus any number of prompts you can switch on together.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {backendConnected === true && (
              <Badge
                variant="outline"
                className="gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-600 dark:text-emerald-400"
              >
                <Wifi className="size-3.5" />
                Backend Connected
              </Badge>
            )}
            {backendConnected === false && (
              <Badge variant="destructive" className="gap-1.5 text-xs">
                <WifiOff className="size-3.5" />
                Backend Offline
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              <span className="mr-1.5 font-semibold text-emerald-500">●</span>
              {activePrompts.length} Active {activePrompts.length === 1 ? 'Prompt' : 'Prompts'}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              <span className="mr-1.5 font-semibold text-sky-500">●</span>
              {activeSkills.length} Active {activeSkills.length === 1 ? 'Skill' : 'Skills'}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={fetchBackendData}
              disabled={isLoading}
              title="Reload from backend"
            >
              <RefreshCw className={`mr-1.5 size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Global Status Message */}
        {statusMessage && (
          <div
            className={`animate-in fade-in mb-6 flex items-center gap-2 rounded-lg border p-3.5 text-sm transition-all ${
              statusMessage.type === 'error'
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {statusMessage.type === 'error' ? (
              <AlertCircle className="size-4 shrink-0" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0" />
            )}
            <span className="font-medium">{statusMessage.text}</span>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div className="bg-muted/70 flex rounded-lg p-1">
            <button
              type="button"
              onClick={() => setActiveTab('prompts')}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium transition-all ${
                activeTab === 'prompts'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ScrollText className="size-3.5" />
              <span>Prompts</span>
              <span className="bg-muted text-muted-foreground ml-1 rounded-full px-1.5 font-mono text-[10px]">
                {prompts.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('skills')}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium transition-all ${
                activeTab === 'skills'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sparkles className="size-3.5" />
              <span>Skills</span>
              <span className="bg-muted text-muted-foreground ml-1 rounded-full px-1.5 font-mono text-[10px]">
                {skills.length}
              </span>
            </button>
          </div>

          <div>
            {activeTab === 'prompts' && (
              <Button size="sm" onClick={() => setIsCreatePromptOpen(true)}>
                <Plus className="mr-1.5 size-3.5" />
                New Prompt
              </Button>
            )}
            {activeTab === 'skills' && (
              <Button size="sm" onClick={() => setIsCreateSkillOpen(true)}>
                <Plus className="mr-1.5 size-3.5" />
                New Skill
              </Button>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* TAB 1: PROMPTS                                            */}
        {/* ======================================================== */}
        {activeTab === 'prompts' && (
          <div className="space-y-8">
            {/* Static system prompt */}
            <Card className="border-primary/25 bg-primary/[0.03]">
              <CardContent className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row">
                <div className="w-full space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Lock className="text-primary size-4 shrink-0" />
                    <h4 className="text-foreground text-base font-semibold">System Prompt</h4>
                    <Badge
                      variant="outline"
                      className="border-primary/30 bg-primary/10 text-[10px]"
                    >
                      Static · Always Active
                    </Badge>
                  </div>

                  <p className="text-muted-foreground line-clamp-2 font-mono text-xs leading-normal">
                    {systemPrompt ||
                      'No system prompt yet. It always runs first and cannot be switched off.'}
                  </p>

                  <div className="text-muted-foreground flex items-center gap-3 font-mono text-[10px]">
                    <span>{systemPrompt.length} chars</span>
                    <span>~{Math.ceil(systemPrompt.length / 4)} tokens</span>
                  </div>
                </div>

                <div className="flex w-full shrink-0 items-center justify-end border-t pt-2 sm:w-auto sm:border-t-0 sm:pt-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSystemPromptDraft(systemPrompt);
                      setIsSystemPromptOpen(true);
                    }}
                  >
                    <Edit3 className="mr-1.5 size-3.5" />
                    Edit
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Prompt library */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold tracking-tight">Your Prompts</h3>
                  <p className="text-muted-foreground text-xs">
                    Turn on as many prompts as you need at the same time.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-48 sm:w-64">
                    <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                    <Input
                      placeholder="Search prompts..."
                      value={promptSearch}
                      onChange={(e) => setPromptSearch(e.target.value)}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>

                  <div className="bg-muted inline-flex rounded-md p-0.5">
                    <button
                      type="button"
                      onClick={() => setPromptFilter('all')}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-all ${
                        promptFilter === 'all'
                          ? 'bg-background text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      All ({prompts.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromptFilter('active')}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-all ${
                        promptFilter === 'active'
                          ? 'bg-background text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Active ({activePrompts.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromptFilter('inactive')}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-all ${
                        promptFilter === 'inactive'
                          ? 'bg-background text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Inactive ({prompts.length - activePrompts.length})
                    </button>
                  </div>
                </div>
              </div>

              {/* Empty state */}
              {prompts.length === 0 && !isLoading && (
                <div className="border-border bg-card/40 flex flex-col items-center justify-center rounded-xl border border-dashed px-4 py-14 text-center">
                  <Database className="text-muted-foreground mb-3 size-10 opacity-40" />
                  <h4 className="text-foreground text-base font-semibold">No prompts yet</h4>
                  <p className="text-muted-foreground mt-1 max-w-md text-xs">
                    Add your first prompt and it will be stored in the database right away.
                  </p>
                  <Button size="sm" className="mt-5" onClick={() => setIsCreatePromptOpen(true)}>
                    <Plus className="mr-1.5 size-3.5" />
                    Add Prompt
                  </Button>
                </div>
              )}

              {/* No search results */}
              {prompts.length > 0 && filteredPrompts.length === 0 && (
                <div className="border-border bg-card/40 flex flex-col items-center justify-center rounded-xl border border-dashed py-10 text-center">
                  <Search className="text-muted-foreground mb-2 size-6 opacity-40" />
                  <p className="text-sm font-medium">No prompts match your search</p>
                  <Button
                    size="xs"
                    variant="outline"
                    className="mt-3"
                    onClick={() => {
                      setPromptSearch('');
                      setPromptFilter('all');
                    }}
                  >
                    Clear Filter
                  </Button>
                </div>
              )}

              <div className="grid gap-4">
                {filteredPrompts.map((prompt) => (
                  <Card
                    key={prompt.id}
                    className={`transition-all ${
                      prompt.is_active
                        ? 'border-emerald-500/50 bg-emerald-500/5 ring-1 ring-emerald-500/20'
                        : 'hover:border-border/80'
                    }`}
                  >
                    <CardContent className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row">
                      <div className="w-full space-y-1.5">
                        <div className="flex items-center gap-2">
                          <ScrollText className="text-primary size-4 shrink-0" />
                          <h4 className="text-foreground text-base font-semibold">{prompt.name}</h4>
                          <Badge
                            variant={prompt.is_active ? 'default' : 'secondary'}
                            className={`text-[10px] ${prompt.is_active ? 'bg-emerald-600 text-white' : ''}`}
                          >
                            {prompt.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>

                        <p className="text-muted-foreground line-clamp-2 font-mono text-xs leading-normal">
                          {prompt.content}
                        </p>

                        <div className="text-muted-foreground flex items-center gap-3 font-mono text-[10px]">
                          <span>{prompt.content.length} chars</span>
                          <span>~{Math.ceil(prompt.content.length / 4)} tokens</span>
                        </div>
                      </div>

                      <div className="flex w-full shrink-0 items-center justify-between gap-3 border-t pt-2 sm:w-auto sm:flex-col sm:items-end sm:justify-center sm:border-t-0 sm:pt-0">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={prompt.is_active}
                            onCheckedChange={() => handleTogglePrompt(prompt.id, prompt.is_active)}
                            title="Toggle active status"
                          />
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => handleOpenEditPrompt(prompt)}
                            title="Edit prompt"
                          >
                            <Edit3 className="size-3.5" />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeletePrompt(prompt.id, prompt.name)}
                            title="Delete prompt"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: SKILLS                                             */}
        {/* ======================================================== */}
        {activeTab === 'skills' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold tracking-tight">Your Skills</h3>
                <p className="text-muted-foreground text-xs">
                  Modular skills stored in your database. Enable the ones you need.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-48 sm:w-64">
                  <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                  <Input
                    placeholder="Search skills..."
                    value={skillSearch}
                    onChange={(e) => setSkillSearch(e.target.value)}
                    className="h-8 pl-8 text-xs"
                  />
                </div>

                <div className="bg-muted inline-flex rounded-md p-0.5">
                  <button
                    type="button"
                    onClick={() => setSkillFilter('all')}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-all ${
                      skillFilter === 'all'
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    All ({skills.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSkillFilter('active')}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-all ${
                      skillFilter === 'active'
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Active ({activeSkills.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSkillFilter('disabled')}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-all ${
                      skillFilter === 'disabled'
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Disabled ({skills.length - activeSkills.length})
                  </button>
                </div>
              </div>
            </div>

            {/* Empty state */}
            {skills.length === 0 && !isLoading && (
              <div className="border-border bg-card/40 flex flex-col items-center justify-center rounded-xl border border-dashed px-4 py-14 text-center">
                <Sparkles className="text-muted-foreground mb-3 size-10 opacity-40" />
                <h4 className="text-foreground text-base font-semibold">No skills yet</h4>
                <p className="text-muted-foreground mt-1 max-w-md text-xs">
                  Add your first skill and it will be stored in the database right away.
                </p>
                <Button size="sm" className="mt-5" onClick={() => setIsCreateSkillOpen(true)}>
                  <Plus className="mr-1.5 size-3.5" />
                  Add Skill
                </Button>
              </div>
            )}

            <div className="grid gap-4">
              {filteredSkills.map((skill) => (
                <Card key={skill.id} className="hover:border-border/80 transition-all">
                  <CardContent className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row">
                    <div className="w-full space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Sparkles className="text-primary size-4 shrink-0" />
                        <h4 className="text-foreground text-base font-semibold">{skill.name}</h4>
                        <Badge
                          variant={skill.is_enabled ? 'default' : 'secondary'}
                          className={`text-[10px] ${skill.is_enabled ? 'bg-sky-600 text-white' : ''}`}
                        >
                          {skill.is_enabled ? 'Active' : 'Disabled'}
                        </Badge>
                      </div>
                      {skill.description && (
                        <p className="text-muted-foreground line-clamp-1 text-xs leading-normal">
                          {skill.description}
                        </p>
                      )}
                      <p className="text-muted-foreground line-clamp-2 font-mono text-xs leading-normal">
                        {skill.instructions}
                      </p>
                      <div className="text-muted-foreground flex items-center gap-3 font-mono text-[10px]">
                        <span>{skill.instructions.length} chars</span>
                        <span>~{Math.ceil(skill.instructions.length / 4)} tokens</span>
                      </div>
                    </div>

                    <div className="flex w-full shrink-0 items-center justify-between gap-3 border-t pt-2 sm:w-auto sm:flex-col sm:items-end sm:justify-center sm:border-t-0 sm:pt-0">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={skill.is_enabled}
                          onCheckedChange={() => handleToggleSkill(skill.id, skill.is_enabled)}
                        />
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => handleOpenEditSkill(skill)}
                          title="Edit skill"
                        >
                          <Edit3 className="size-3.5" />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => handleDeleteSkill(skill.id, skill.name)}
                          className="text-muted-foreground hover:text-destructive"
                          title="Delete skill"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ======================================================== */}
      {/* DIALOG: SYSTEM PROMPT                                     */}
      {/* ======================================================== */}
      <Dialog open={isSystemPromptOpen} onOpenChange={setIsSystemPromptOpen}>
        <DialogContent className="max-h-[92dvh] overflow-hidden sm:max-w-2xl lg:max-w-3xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSaveSystemPrompt();
            }}
            className="flex max-h-[calc(92dvh-3rem)] min-h-0 flex-col"
          >
            <DialogHeader className="shrink-0 pr-6">
              <DialogTitle className="flex items-center gap-2">
                <Lock className="text-primary size-4" />
                System Prompt
              </DialogTitle>
              <DialogDescription>
                Always active and applied before every other prompt. It cannot be switched off.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 pr-1">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-foreground text-xs font-semibold">Base instructions</label>
                  <span className="text-muted-foreground font-mono text-[10px]">
                    {systemPromptDraft.length} chars · ~{Math.ceil(systemPromptDraft.length / 4)}{' '}
                    tokens
                  </span>
                </div>
                <Textarea
                  placeholder="Write the base instructions the agent always follows..."
                  value={systemPromptDraft}
                  onChange={(e) => setSystemPromptDraft(e.target.value)}
                  rows={8}
                  className="field-sizing-fixed h-64 resize-y font-mono text-sm leading-relaxed"
                  disabled={isLoading}
                />
              </div>
            </div>

            <DialogFooter className="shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSystemPromptDraft(systemPrompt);
                  setIsSystemPromptOpen(false);
                }}
                disabled={isSavingSystemPrompt}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSavingSystemPrompt}>
                {isSavingSystemPrompt ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 size-3.5" />
                )}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* DIALOG: NEW PROMPT                                        */}
      {/* ======================================================== */}
      <Dialog open={isCreatePromptOpen} onOpenChange={setIsCreatePromptOpen}>
        <DialogContent className="max-h-[92dvh] overflow-hidden sm:max-w-2xl lg:max-w-3xl">
          <form
            onSubmit={handleCreatePrompt}
            className="flex max-h-[calc(92dvh-3rem)] min-h-0 flex-col"
          >
            <DialogHeader className="shrink-0 pr-6">
              <DialogTitle className="flex items-center gap-2">
                <ScrollText className="text-primary size-4" />
                New Prompt
              </DialogTitle>
              <DialogDescription>
                Saved prompts are active immediately. You can switch them off any time.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 pr-1">
              <div className="space-y-1.5">
                <label className="text-foreground text-xs font-semibold">Title</label>
                <Input
                  placeholder="e.g. Socratic Mentor"
                  value={newPromptName}
                  onChange={(e) => setNewPromptName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-foreground text-xs font-semibold">Prompt *</label>
                  <span className="text-muted-foreground font-mono text-[10px]">
                    {newPromptContent.length} chars
                  </span>
                </div>
                <Textarea
                  placeholder="Write the instructions this prompt should add..."
                  value={newPromptContent}
                  onChange={(e) => setNewPromptContent(e.target.value)}
                  rows={8}
                  required
                  className="field-sizing-fixed h-56 resize-y font-mono text-sm leading-relaxed"
                />
              </div>
            </div>

            <DialogFooter className="shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreatePromptOpen(false)}
                disabled={isSavingNewPrompt}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSavingNewPrompt}>
                {isSavingNewPrompt ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 size-3.5" />
                )}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* DIALOG: EDIT PROMPT                                       */}
      {/* ======================================================== */}
      <Dialog
        open={editingPrompt !== null}
        onOpenChange={(open) => {
          if (!open) setEditingPrompt(null);
        }}
      >
        <DialogContent className="max-h-[92dvh] overflow-hidden sm:max-w-2xl lg:max-w-3xl">
          <form
            onSubmit={handleSaveEditPrompt}
            className="flex max-h-[calc(92dvh-3rem)] min-h-0 flex-col"
          >
            <DialogHeader className="shrink-0 pr-6">
              <DialogTitle className="flex items-center gap-2">
                <Edit3 className="text-primary size-4" />
                Edit Prompt
              </DialogTitle>
              <DialogDescription>Update the title or the prompt text.</DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 pr-1">
              <div className="space-y-1.5">
                <label className="text-foreground text-xs font-semibold">Title</label>
                <Input value={editPromptName} onChange={(e) => setEditPromptName(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-foreground text-xs font-semibold">Prompt *</label>
                  <span className="text-muted-foreground font-mono text-[10px]">
                    {editPromptContent.length} chars
                  </span>
                </div>
                <Textarea
                  value={editPromptContent}
                  onChange={(e) => setEditPromptContent(e.target.value)}
                  rows={8}
                  required
                  className="field-sizing-fixed h-56 resize-y font-mono text-sm leading-relaxed"
                />
              </div>
            </div>

            <DialogFooter className="shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingPrompt(null)}
                disabled={isSavingEditPrompt}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSavingEditPrompt}>
                {isSavingEditPrompt ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 size-3.5" />
                )}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* DIALOG: NEW SKILL                                         */}
      {/* ======================================================== */}
      <Dialog open={isCreateSkillOpen} onOpenChange={setIsCreateSkillOpen}>
        <DialogContent className="max-h-[92dvh] overflow-hidden sm:max-w-2xl lg:max-w-3xl">
          <form
            onSubmit={handleCreateSkill}
            className="flex max-h-[calc(92dvh-3rem)] min-h-0 flex-col"
          >
            <DialogHeader className="shrink-0 pr-6">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="text-primary size-4" />
                New Skill
              </DialogTitle>
              <DialogDescription>
                Define a modular skill with targeted behavior rules.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 pr-1">
              <div className="space-y-1.5">
                <label className="text-foreground text-xs font-semibold">Skill Name *</label>
                <Input
                  placeholder="e.g. Socratic Method"
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-foreground text-xs font-semibold">Short Summary</label>
                <Input
                  placeholder="One line explaining when to use this skill..."
                  value={newSkillDesc}
                  onChange={(e) => setNewSkillDesc(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-foreground text-xs font-semibold">
                    Execution Instructions *
                  </label>
                  <span className="text-muted-foreground font-mono text-[10px]">
                    {newSkillInstructions.length} chars
                  </span>
                </div>
                <Textarea
                  placeholder="Specific rules for how the agent executes this skill..."
                  value={newSkillInstructions}
                  onChange={(e) => setNewSkillInstructions(e.target.value)}
                  rows={8}
                  required
                  className="field-sizing-fixed h-56 resize-y font-mono text-sm leading-relaxed"
                />
              </div>
            </div>

            <DialogFooter className="shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateSkillOpen(false)}
                disabled={isSavingNewSkill}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSavingNewSkill}>
                {isSavingNewSkill ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 size-3.5" />
                )}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* DIALOG: EDIT SKILL                                        */}
      {/* ======================================================== */}
      <Dialog
        open={editingSkill !== null}
        onOpenChange={(open) => {
          if (!open) setEditingSkill(null);
        }}
      >
        <DialogContent className="max-h-[92dvh] overflow-hidden sm:max-w-2xl lg:max-w-3xl">
          <form
            onSubmit={handleSaveEditSkill}
            className="flex max-h-[calc(92dvh-3rem)] min-h-0 flex-col"
          >
            <DialogHeader className="shrink-0 pr-6">
              <DialogTitle className="flex items-center gap-2">
                <Edit3 className="text-primary size-4" />
                Edit Skill
              </DialogTitle>
              <DialogDescription>
                Update the skill name, summary, and instructions.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 pr-1">
              <div className="space-y-1.5">
                <label className="text-foreground text-xs font-semibold">Skill Name *</label>
                <Input
                  value={editSkillName}
                  onChange={(e) => setEditSkillName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-foreground text-xs font-semibold">Short Summary</label>
                <Input value={editSkillDesc} onChange={(e) => setEditSkillDesc(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-foreground text-xs font-semibold">
                    Execution Instructions *
                  </label>
                  <span className="text-muted-foreground font-mono text-[10px]">
                    {editSkillInstructions.length} chars
                  </span>
                </div>
                <Textarea
                  value={editSkillInstructions}
                  onChange={(e) => setEditSkillInstructions(e.target.value)}
                  rows={8}
                  required
                  className="field-sizing-fixed h-56 resize-y font-mono text-sm leading-relaxed"
                />
              </div>
            </div>

            <DialogFooter className="shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingSkill(null)}
                disabled={isSavingEditSkill}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSavingEditSkill}>
                {isSavingEditSkill ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 size-3.5" />
                )}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PromptsPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-background flex min-h-svh w-full items-center justify-center">
          <RefreshCw className="text-primary size-6 animate-spin" />
        </div>
      }
    >
      <PromptsSkillsContent />
    </Suspense>
  );
}
