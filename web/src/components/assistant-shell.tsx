import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  Activity, ArrowUpRight, Bell, BookOpen, Bot, Brain, ChevronDown, Command,
  FileText, LayoutDashboard, Menu, Mic2, Moon, MoreHorizontal, Network, PanelLeftClose,
  PanelLeftOpen, Search, Settings2, Sparkles, Sun, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { applyAppearance, useAppearance, type Appearance } from "@/lib/appearance";

const navGroups: { label: string; links: { to: "/" | "/prompts" | "/mcp" | "/knowledgebase" | "/memory" | "/usage" | "/settings"; label: string; icon: typeof LayoutDashboard }[] }[] = [
  {
    label: "Workspace",
    links: [
      { to: "/", label: "Overview", icon: LayoutDashboard },
      { to: "/prompts", label: "Prompt & Skills", icon: Sparkles },
      { to: "/mcp", label: "MCP connections", icon: Network },
      { to: "/knowledgebase", label: "Knowledgebase", icon: BookOpen },
      { to: "/memory", label: "Memory", icon: Brain },
    ],
  },
  {
    label: "Manage",
    links: [
      { to: "/usage", label: "Usage & activity", icon: Activity },
      { to: "/settings", label: "Settings", icon: Settings2 },
    ],
  },
];

export function AssistantShell({ children }: { children?: ReactNode }) {
  const { appearance } = useAppearance();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = useRouterState({ select: (router) => router.location.pathname });
  const navigate = useNavigate();

  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance]);

  useEffect(() => {
    setSidebarCollapsed(localStorage.getItem("personal-ai-sidebar-collapsed") === "true");
  }, []);

  useEffect(() => {
    function handleShortcuts(event: KeyboardEvent) {
      const target = event.target;
      const isTyping = target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (event.key === "Escape") {
        setMobileMenu(false);
        return;
      }
      if (event.key === "/" && !isTyping && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const searchField = document.querySelector<HTMLInputElement>(".search-field");
        if (searchField) {
          event.preventDefault();
          searchField.focus();
        }
      }
    }

    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, []);

  useEffect(() => {
    if (appearance.theme !== "system") return;
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => document.documentElement.classList.toggle("dark", preference.matches);
    updateTheme();
    preference.addEventListener("change", updateTheme);
    return () => preference.removeEventListener("change", updateTheme);
  }, [appearance.theme]);

  const navigation = (mobile = false) => navGroups.map((group) => (
    <div className="nav-group" key={group.label}>
      <div className="nav-group-label">{group.label}</div>
      {group.links.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setMobileMenu(false)}
            className={`nav-link${active ? " is-active" : ""}`}
            aria-label={item.label}
            title={sidebarCollapsed && !mobile ? item.label : undefined}
            aria-current={active ? "page" : undefined}
          >
            <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
            <span>{item.label}</span>
            {item.to === "/mcp" && !sidebarCollapsed && <span className="nav-count">2</span>}
          </Link>
        );
      })}
    </div>
  ));

  return (
    <div className={`app-frame${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside className="app-sidebar" aria-label="Main navigation">
        <div className="brand-lockup">
          <Link to="/" className="brand-home" aria-label="Personal AI home" title="Personal AI home">
            <span className="brand-mark"><Bot size={20} strokeWidth={2.1} /></span>
            <span className="brand-name">Personal<span>AI</span></span>
          </Link>
          <Button className="sidebar-collapse-button" variant="ghost" size="icon" aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation to icons"} title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation to icons"} aria-expanded={!sidebarCollapsed} onClick={() => {
            const next = !sidebarCollapsed;
            setSidebarCollapsed(next);
            localStorage.setItem("personal-ai-sidebar-collapsed", String(next));
          }}>
            {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </Button>
        </div>
        <button className="assistant-switcher" type="button" aria-label="Current assistant: Personal Assistant" title={sidebarCollapsed ? "Personal Assistant" : undefined}>
          <span className="assistant-avatar"><Sparkles size={16} /></span>
          <span className="assistant-switcher-copy"><strong>Personal Assistant</strong><small>Personal workspace</small></span>
          <ChevronDown size={16} />
        </button>
        <nav className="primary-nav">{navigation()}</nav>
        <div className="sidebar-bottom">
          <div className="plan-meter">
            <div className="plan-meter-top"><span>Monthly usage</span><span>68%</span></div>
            <div className="meter-track"><span /></div>
            <div className="plan-meter-bottom">6,820 of 10,000 credits</div>
          </div>
          <Link to="/settings" className="profile-link">
            <span className="profile-avatar">A</span>
            <span className="profile-copy"><strong>Alex Morgan</strong><small>Personal workspace</small></span>
          <MoreHorizontal size={18} />
          </Link>
        </div>
      </aside>

      {mobileMenu && <button aria-label="Close navigation" className="mobile-scrim" onClick={() => setMobileMenu(false)} />}
      <aside className={`mobile-drawer${mobileMenu ? " is-open" : ""}`} aria-label="Mobile navigation" aria-hidden={!mobileMenu} inert={!mobileMenu}>
        <div className="mobile-drawer-top"><span className="brand-name">Personal<span>AI</span></span><Button variant="ghost" size="icon" aria-label="Close navigation" onClick={() => setMobileMenu(false)}><X /></Button></div>
        <nav className="primary-nav">{navigation(true)}</nav>
        <Link to="/settings" className="profile-link"><span className="profile-avatar">A</span><span className="profile-copy"><strong>Alex Morgan</strong><small>Personal workspace</small></span></Link>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <Button className="mobile-menu-trigger" variant="ghost" size="icon" aria-label="Open navigation" aria-expanded={mobileMenu} onClick={() => setMobileMenu(true)}><Menu /></Button>
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{navGroups.flatMap((group) => group.links).find((link) => link.to === pathname)?.label ?? "Overview"}</strong></div>
          <div className="topbar-actions">
            <span className="environment-pill"><span /> Preview data</span>
            <Button variant="ghost" size="icon" aria-label="Search and navigate" title="Search and navigate · ⌘K" onClick={() => setPaletteOpen(true)}><Search size={17} /></Button>
            <Button variant="ghost" size="icon" aria-label="Notifications"><Bell size={17} /></Button>
            <span className="topbar-divider" />
            <Button variant="outline" className="voice-unavailable" disabled title="No LiveKit voice agent is configured in this project"><Mic2 size={15} /> Voice agent unavailable</Button>
          </div>
        </header>
        <main className="page-content">{children ?? <Outlet />}</main>
        <footer className="app-footer"><span><Command size={13} /> PERSONAL AI</span><span>Preview workspace · Sample activity</span><a href="https://docs.livekit.io/frontends/start/starter-apps/react/" target="_blank" rel="noreferrer">LiveKit starter <ArrowUpRight size={13} /></a></footer>
      </div>
      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput placeholder="Search pages…" aria-label="Search workspace pages" />
        <CommandList>
          <CommandEmpty>No pages found.</CommandEmpty>
          <CommandGroup heading="Workspace">
            {navGroups.flatMap((group) => group.links).map((item) => {
              const Icon = item.icon;
              return <CommandItem key={item.to} value={item.label} onSelect={() => { setPaletteOpen(false); void navigate({ to: item.to }); }}><Icon aria-hidden="true" /><span>{item.label}</span><CommandShortcut>↵</CommandShortcut></CommandItem>;
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}

export function ThemeGlyph({ theme }: { theme: Appearance["theme"] }) {
  if (theme === "dark") return <Moon size={16} />;
  if (theme === "system") return <Command size={16} />;
  return <Sun size={16} />;
}

export const PageIcons = { FileText, Sun, Moon };