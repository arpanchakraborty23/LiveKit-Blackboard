'use client';

import { useState, useEffect } from 'react';
import { TopNavBar } from '@/components/app/top-nav-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Sparkles, Plus, Download, Upload, Check, Trash2 } from 'lucide-react';
import { api } from '@/lib/api-client';

interface SkillItem {
  id: string;
  name: string;
  description?: string;
  instructions: string;
  is_enabled: boolean;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillItem[]>([
    {
      id: '1',
      name: 'Socratic Method',
      description: 'Guide the user by asking targeted questions instead of immediately giving answers.',
      instructions: 'When the student asks for a solution, ask a guiding follow-up question that helps them discover the principle themselves.',
      is_enabled: true,
    },
    {
      id: '2',
      name: 'Code Explainer',
      description: 'Break down complex algorithms and syntax clearly with analogies.',
      instructions: 'Use concrete metaphors and step-by-step logic when describing programming concepts.',
      is_enabled: true,
    },
  ]);

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newInstructions, setNewInstructions] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadSkills() {
      try {
        const data = await api.get<SkillItem[]>('/api/skills');
        if (data && Array.isArray(data) && data.length > 0) {
          setSkills(data);
        }
      } catch (err) {
        console.warn('Backend not running locally, using default skills:', err);
      }
    }
    loadSkills();
  }, []);

  const toggleSkill = async (id: string, current: boolean) => {
    const updated = !current;
    setSkills((prev) =>
      prev.map((s) => (s.id === id ? { ...s, is_enabled: updated } : s))
    );
    try {
      await api.post('/api/skills', { action: 'toggle', id, is_enabled: updated });
    } catch {}
  };

  const handleCreateSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newInstructions) return;

    const skill: SkillItem = {
      id: Math.random().toString(36).slice(2, 10),
      name: newName,
      description: newDesc,
      instructions: newInstructions,
      is_enabled: true,
    };

    setSkills((prev) => [...prev, skill]);
    setNewName('');
    setNewDesc('');
    setNewInstructions('');
    setShowAddForm(false);

    try {
      await api.post('/api/skills', skill);
      setStatusMessage(`Skill "${skill.name}" created successfully.`);
    } catch {
      setStatusMessage(`Skill "${skill.name}" added locally.`);
    }
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleDeleteSkill = async (id: string) => {
    setSkills((prev) => prev.filter((s) => s.id !== id));
    try {
      await api.delete(`/api/skills/${id}`);
    } catch {}
  };

  return (
    <div className="bg-background min-h-svh w-full">
      <TopNavBar />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-foreground text-2xl font-bold tracking-tight">Skills Workbench</h1>
            <p className="text-muted-foreground text-sm">
              Define modular domain behaviors, workflows, and pedagogical capabilities.
            </p>
          </div>
          <Button onClick={() => setShowAddForm((p) => !p)} size="sm">
            <Plus className="mr-1.5 size-3.5" />
            {showAddForm ? 'Cancel' : 'New Skill'}
          </Button>
        </div>

        {statusMessage && (
          <div className="border-border bg-muted text-foreground mb-6 flex items-center gap-2 rounded-lg border p-3 text-sm">
            <Check className="size-4 text-emerald-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {showAddForm && (
          <Card className="mb-6 border-primary/30">
            <CardHeader>
              <CardTitle className="text-base">Create New Skill</CardTitle>
              <CardDescription>Specify the skill name, short summary, and execution instructions.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateSkill} className="space-y-4">
                <Input
                  placeholder="Skill Name (e.g. Interactive Quizzer)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
                <Input
                  placeholder="Short Description"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                />
                <Textarea
                  placeholder="Skill instructions and guidelines for the agent..."
                  value={newInstructions}
                  onChange={(e) => setNewInstructions(e.target.value)}
                  rows={4}
                  required
                  className="font-mono text-sm"
                />
                <Button type="submit" size="sm">
                  Save Skill
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4">
          {skills.map((skill) => (
            <Card key={skill.id}>
              <CardContent className="flex items-start justify-between p-5">
                <div className="space-y-1.5 pr-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    <h3 className="text-foreground font-semibold text-base">{skill.name}</h3>
                    <Badge variant={skill.is_enabled ? 'default' : 'secondary'} className="text-[10px]">
                      {skill.is_enabled ? 'Active' : 'Disabled'}
                    </Badge>
                  </div>
                  {skill.description && (
                    <p className="text-muted-foreground text-sm">{skill.description}</p>
                  )}
                  <div className="bg-muted text-muted-foreground rounded-md p-2.5 font-mono text-xs mt-2">
                    {skill.instructions}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    checked={skill.is_enabled}
                    onCheckedChange={() => toggleSkill(skill.id, skill.is_enabled)}
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteSkill(skill.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                    title="Delete Skill"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
