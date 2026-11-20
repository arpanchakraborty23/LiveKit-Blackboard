export const sampleConversations = [
  { title: "Weekly planning", detail: "Today, 10:42 AM", duration: "12 min", tone: "mint" },
  { title: "Researching Lisbon", detail: "Yesterday, 4:18 PM", duration: "8 min", tone: "blue" },
  { title: "A note for Friday", detail: "Yesterday, 11:06 AM", duration: "3 min", tone: "coral" },
];

export const sampleMemories = [
  { id: "m1", category: "Work", title: "I prefer short meeting summaries", note: "Lead with decisions and action items; keep the rest concise.", source: "Conversation", date: "Nov 19, 2026" },
  { id: "m2", category: "Travel", title: "Window seat, when possible", note: "For longer trips, I usually prefer a window seat.", source: "Added manually", date: "Nov 16, 2026" },
  { id: "m3", category: "Work", title: "Planning review is on Thursday", note: "Bring the project timeline and open questions to the weekly review.", source: "Conversation", date: "Nov 12, 2026" },
];

export const sampleDocuments = [
  { id: "d1", name: "Product roadmap.pdf", detail: "PDF · 2.4 MB · Added Nov 18", status: "Ready" },
  { id: "d2", name: "Brand voice guide.docx", detail: "DOCX · 840 KB · Added Nov 16", status: "Ready" },
  { id: "d3", name: "Meeting notes — Q4.txt", detail: "TXT · 18 KB · Added Nov 12", status: "Processing" },
];

export const sampleSkills = [
  { id: "calendar", title: "Calendar planning", category: "Productivity", description: "Help organize events and make room for focused work.", enabled: true },
  { id: "research", title: "Web research", category: "Research", description: "Collect useful sources and summarize the key findings.", enabled: true },
  { id: "writing", title: "Writing partner", category: "Creative", description: "Draft, refine, and adapt writing to your preferred tone.", enabled: false },
  { id: "tasks", title: "Task capture", category: "Productivity", description: "Turn ideas and conversations into clear next steps.", enabled: true },
];

export const sampleServers = [
  { id: "workspace", name: "Workspace tools", address: "workspace.example", tools: ["Search files", "Read document", "List projects"], enabled: true },
  { id: "calendar-server", name: "Calendar", address: "calendar.example", tools: ["List events", "Check availability"], enabled: false },
];

export const sampleActivities = [
  { title: "Weekly planning completed", detail: "A 5-point summary was prepared", time: "10:42 AM", icon: "check" },
  { title: "New document added", detail: "Product roadmap.pdf", time: "Yesterday", icon: "file" },
  { title: "Memory saved", detail: "Prefers short meeting summaries", time: "Yesterday", icon: "memory" },
];