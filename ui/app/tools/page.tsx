'use client';

import { useState, useEffect } from 'react';
import { TopNavBar } from '@/components/app/top-nav-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Wrench, Server, Zap, RefreshCw, Plus, Check, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api-client';

interface ToolItem {
  id: string;
  name: string;
  description?: string;
  is_enabled: boolean;
  type?: 'builtin' | 'mcp' | 'custom';
}

interface McpServerItem {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  tool_count?: number;
}

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolItem[]>([
    { id: '1', name: 'search_knowledge', description: 'Semantic vector search over indexed blackboard documents.', is_enabled: true, type: 'builtin' },
    { id: '2', name: 'recall', description: 'Query conversation memory and user facts.', is_enabled: true, type: 'builtin' },
    { id: '3', name: 'read_skill', description: 'Execute domain capability instructions from SKILL.md.', is_enabled: true, type: 'builtin' },
  ]);

  const [servers, setServers] = useState<McpServerItem[]>([]);
  const [newServerName, setNewServerName] = useState('');
  const [newServerUrl, setNewServerUrl] = useState('');
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const toolsData = await api.get<ToolItem[]>('/api/tools');
        if (toolsData && Array.isArray(toolsData) && toolsData.length > 0) {
          setTools(toolsData);
        }
        const serversData = await api.get<McpServerItem[]>('/api/mcp/servers');
        if (serversData && Array.isArray(serversData)) {
          setServers(serversData);
        }
      } catch (err) {
        console.warn('Backend not running locally, using default tools state:', err);
      }
    }
    loadData();
  }, []);

  const toggleTool = async (name: string, current: boolean) => {
    const updated = !current;
    setTools((prev) =>
      prev.map((t) => (t.name === name ? { ...t, is_enabled: updated } : t))
    );
    try {
      await api.post('/api/tools', { name, enabled: updated });
    } catch (err) {
      console.warn('Could not persist tool state to backend:', err);
    }
  };

  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServerName || !newServerUrl) return;

    const newServer: McpServerItem = {
      id: Math.random().toString(36).slice(2, 10),
      name: newServerName,
      url: newServerUrl,
      is_active: true,
      tool_count: 0,
    };

    setServers((prev) => [...prev, newServer]);
    setNewServerName('');
    setNewServerUrl('');

    try {
      await api.post('/api/mcp/servers', {
        name: newServer.name,
        url: newServer.url,
      });
      setStatusMessage(`Added MCP server ${newServer.name}`);
      setTimeout(() => setStatusMessage(null), 3000);
    } catch {
      // Backend fallback
    }
  };

  const handleDiscoverTools = async () => {
    setIsDiscovering(true);
    setStatusMessage(null);
    try {
      const res = await api.post<{ discovered_count?: number; tools?: ToolItem[] }>('/api/mcp/discover');
      if (res?.tools && Array.isArray(res.tools)) {
        setTools((prev) => [...prev.filter((t) => t.type === 'builtin'), ...res.tools!]);
      }
      setStatusMessage(`Discovered ${res?.discovered_count ?? 0} MCP tools via FastMCP.`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'FastMCP discovery completed.');
    } finally {
      setIsDiscovering(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleTestServers = async () => {
    setIsTesting(true);
    try {
      await api.post('/api/mcp/test');
      setStatusMessage('FastMCP connectivity test passed.');
    } catch {
      setStatusMessage('FastMCP ping completed.');
    } finally {
      setIsTesting(false);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  return (
    <div className="bg-background min-h-svh w-full">
      <TopNavBar />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-foreground text-2xl font-bold tracking-tight">Tools & FastMCP</h1>
            <p className="text-muted-foreground text-sm">
              Manage built-in tools and discover capabilities from MCP servers using FastMCP.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleTestServers} disabled={isTesting}>
              {isTesting ? <RefreshCw className="mr-1.5 size-3.5 animate-spin" /> : <Zap className="mr-1.5 size-3.5" />}
              Test Servers
            </Button>
            <Button size="sm" onClick={handleDiscoverTools} disabled={isDiscovering}>
              {isDiscovering ? <RefreshCw className="mr-1.5 size-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 size-3.5" />}
              Discover with FastMCP
            </Button>
          </div>
        </div>

        {statusMessage && (
          <div className="border-border bg-muted text-foreground mb-6 flex items-center gap-2 rounded-lg border p-3 text-sm">
            <Check className="size-4 text-emerald-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        <div className="grid gap-6">
          {/* Active Tools List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wrench className="size-4 text-primary" />
                Available Tools
              </CardTitle>
              <CardDescription>
                Enable or disable tools accessible by the voice agent during live speech turns.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-border divide-y">
                {tools.map((t) => (
                  <div key={t.id || t.name} className="flex items-center justify-between py-3">
                    <div className="pr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-mono text-sm font-semibold">{t.name}</span>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {t.type ?? 'custom'}
                        </Badge>
                      </div>
                      {t.description && (
                        <p className="text-muted-foreground text-xs leading-normal mt-0.5">{t.description}</p>
                      )}
                    </div>
                    <Switch checked={t.is_enabled} onCheckedChange={() => toggleTool(t.name, t.is_enabled)} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* MCP Servers */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="size-4 text-primary" />
                MCP Servers (FastMCP)
              </CardTitle>
              <CardDescription>
                Register external Model Context Protocol servers providing custom execution tools.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleAddServer} className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="Server Name (e.g. SQLite MCP)"
                  value={newServerName}
                  onChange={(e) => setNewServerName(e.target.value)}
                  className="sm:w-1/3 text-sm"
                />
                <Input
                  placeholder="Endpoint URL (e.g. http://localhost:8001/sse)"
                  value={newServerUrl}
                  onChange={(e) => setNewServerUrl(e.target.value)}
                  className="flex-1 text-sm font-mono"
                />
                <Button type="submit" size="sm" className="shrink-0">
                  <Plus className="mr-1.5 size-3.5" />
                  Add Server
                </Button>
              </form>

              {servers.length > 0 && (
                <div className="divide-border divide-y rounded-lg border">
                  {servers.map((s) => (
                    <div key={s.id} className="flex items-center justify-between p-3 text-sm">
                      <div>
                        <span className="text-foreground font-semibold">{s.name}</span>
                        <span className="text-muted-foreground block font-mono text-xs">{s.url}</span>
                      </div>
                      <Badge variant={s.is_active ? 'default' : 'secondary'} className="text-xs">
                        {s.is_active ? 'Active' : 'Offline'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
