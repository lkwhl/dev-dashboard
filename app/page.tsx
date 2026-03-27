"use client";

import { useState, useEffect, useCallback } from "react";
import { JiraIssue } from "@/lib/jira";
import { BitbucketPR } from "@/lib/bitbucket";
import { AISummary } from "@/lib/ai";
import { GmailMessage } from "@/lib/gmail";
import {
  RefreshCw, GitPullRequest, AlertCircle, Clock, CheckCircle2,
  Zap, MessageSquare, ChevronRight, ExternalLink, Loader2,
  AlertTriangle, Star, Eye, Code2, Calendar, Send, Bell, Mail
} from "lucide-react";

interface DashboardData {
  issues: JiraIssue[];
  prs: BitbucketPR[];
  emails: GmailMessage[];
  gmailAuthorized: boolean;
  summary: AISummary | null;
  errors: { jira: string | null; bitbucket: string | null; gmail: string | null; ai: string | null };
  generatedAt: string;
}

const PRIORITY_ORDER: Record<string, number> = {
  Highest: 0, High: 1, Medium: 2, Low: 3, Lowest: 4,
};

const PRIORITY_COLOR: Record<string, string> = {
  Highest: "#f76a6a",
  High: "#f7a26a",
  Medium: "#f7c26a",
  Low: "#6af7a2",
  Lowest: "#6b6b8a",
};

const STATUS_COLOR: Record<string, string> = {
  "To Do": "#3a3a5c",
  "In Progress": "#7c6af7",
  "In Review": "#f7c26a",
  "Done": "#6af7a2",
  "Blocked": "#f76a6a",
};

function Badge({ text, color, bg }: { text: string; color: string; bg?: string }) {
  return (
    <span style={{
      fontSize: "10px",
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color,
      background: bg ?? `${color}18`,
      padding: "2px 8px",
      borderRadius: "4px",
      fontFamily: "'DM Mono', monospace",
      whiteSpace: "nowrap",
    }}>
      {text}
    </span>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      padding: "20px",
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
      <span style={{ color: "var(--accent)", display: "flex" }}>{icon}</span>
      <span style={{ fontWeight: 700, fontSize: "13px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>{title}</span>
      {count !== undefined && (
        <span style={{ marginLeft: "auto", background: "var(--bg)", border: "1px solid var(--border-light)", borderRadius: "20px", padding: "1px 10px", fontSize: "12px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>
          {count}
        </span>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: JiraIssue }) {
  const isOverdue = issue.dueDate && new Date(issue.dueDate) < new Date();
  const isDueSoon = issue.dueDate && !isOverdue && new Date(issue.dueDate) <= new Date(Date.now() + 2 * 86400000);

  const needsSoftdeskFollowup =
    issue.project.toLowerCase().includes("relat") &&
    issue.status.toLowerCase().includes("homolog");

  const isScout = issue.project.toLowerCase().includes("scout");
  const summaryAndType = (issue.summary + " " + issue.issueType).toLowerCase();
  const crQaLevel = isScout
    ? summaryAndType.includes("n3") ? "n3"
      : summaryAndType.includes("n1") ? "n1"
      : null
    : null;

  const accentColor = crQaLevel === "n3" ? "var(--danger)"
    : crQaLevel === "n1" ? "var(--accent-3)"
    : PRIORITY_COLOR[issue.priority] ?? "var(--text-dim)";

  return (
    <a href={issue.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
      <div style={{
        display: "flex", alignItems: "flex-start", gap: "12px",
        borderBottom: "1px solid var(--border)", cursor: "pointer",
        transition: "opacity 0.15s",
        background: needsSoftdeskFollowup ? "rgba(212, 135, 10, 0.05)" : "transparent",
        margin: needsSoftdeskFollowup ? "0 -8px" : "0",
        padding: needsSoftdeskFollowup ? "12px 8px" : "12px 0",
        borderRadius: needsSoftdeskFollowup ? "var(--radius-sm)" : "0",
      }}
        onMouseEnter={e => (e.currentTarget.style.opacity = "0.75")}
        onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
      >
        <div style={{ width: "3px", borderRadius: "2px", alignSelf: "stretch", minHeight: "40px", background: accentColor, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "var(--accent)", fontWeight: 500 }}>{issue.key}</span>
            <Badge text={issue.status} color={STATUS_COLOR[issue.status] ?? "var(--text-muted)"} />
            {isOverdue && <Badge text="OVERDUE" color="var(--danger)" />}
            {isDueSoon && !isOverdue && <Badge text="DUE SOON" color="var(--warn)" />}
            {crQaLevel === "n3" && <Badge text="CR+QA N3" color="var(--danger)" />}
            {crQaLevel === "n1" && <Badge text="CR+QA N1" color="var(--accent-3)" />}
          </div>
          <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--text)", lineHeight: 1.4, marginBottom: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {issue.summary}
          </p>
          <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", flexWrap: "wrap" }}>
            <span>{issue.issueType}</span>
            {issue.dueDate && (
              <span style={{ color: isOverdue ? "var(--danger)" : isDueSoon ? "var(--warn)" : "var(--text-muted)" }}>
                Due {new Date(issue.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
            {needsSoftdeskFollowup && (
              <span style={{ color: "var(--warn)", display: "flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
                <Bell size={10} /> Follow up in Softdesk
              </span>
            )}
          </div>
        </div>
        <ExternalLink size={12} style={{ color: "var(--text-dim)", flexShrink: 0, marginTop: "4px" }} />
      </div>
    </a>
  );
}

function PRRow({ pr }: { pr: BitbucketPR }) {
  return (
    <a href={pr.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
      <div style={{
        display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 0",
        borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "opacity 0.15s",
      }}
        onMouseEnter={e => (e.currentTarget.style.opacity = "0.75")}
        onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
      >
        <div style={{ width: "3px", borderRadius: "2px", alignSelf: "stretch", minHeight: "36px", background: pr.isAuthor ? "var(--accent)" : "var(--accent-2)", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "var(--text-muted)" }}>#{pr.id}</span>
            <Badge text={pr.isAuthor ? "Author" : "Reviewer"} color={pr.isAuthor ? "var(--accent)" : "var(--accent-2)"} />
            <Badge
              text={pr.state}
              color={pr.state === "OPEN" ? "var(--accent-3)" : pr.state === "MERGED" ? "var(--accent)" : "var(--text-muted)"}
            />
            <Badge text={pr.repo} color="var(--text-muted)" bg="var(--bg)" />
          </div>
          <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--text)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {pr.title}
          </p>
          {pr.commentCount > 0 && (
            <span style={{ fontSize: "11px", color: "var(--warn)", fontFamily: "'DM Mono', monospace", display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" }}>
              <MessageSquare size={10} /> {pr.commentCount} comments
            </span>
          )}
        </div>
        <ExternalLink size={12} style={{ color: "var(--text-dim)", flexShrink: 0, marginTop: "4px" }} />
      </div>
    </a>
  );
}

// Parses text and turns Jira keys (e.g. ABC-123) into clickable links
function LinkedText({ text, issueMap }: { text: string; issueMap: Record<string, string> }) {
  const parts = text.split(/([A-Z]+-\d+)/g);
  return (
    <>
      {parts.map((part, i) =>
        issueMap[part] ? (
          <a key={i} href={issueMap[part]} target="_blank" rel="noopener noreferrer"
            style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: "2px" }}>
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function SummaryItem({ icon, text, color, issueMap, onDismiss, isDismissed }: {
  icon: React.ReactNode; text: string; color: string; issueMap?: Record<string, string>;
  onDismiss?: () => void; isDismissed?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 0", borderBottom: "1px solid var(--border)", opacity: isDismissed ? 0.38 : 1, transition: "opacity 0.2s" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ color: isDismissed ? "var(--text-dim)" : color, flexShrink: 0, marginTop: "1px" }}>{icon}</span>
      <p style={{ fontSize: "13px", color: "var(--text)", lineHeight: 1.5, flex: 1, textDecoration: isDismissed ? "line-through" : "none", textDecorationColor: "var(--text-dim)" }}>
        {issueMap ? <LinkedText text={text} issueMap={issueMap} /> : text}
      </p>
      {onDismiss && (hovered || isDismissed) && (
        <button
          onClick={(e) => { e.stopPropagation(); if (!isDismissed) onDismiss(); }}
          title={isDismissed ? "Done" : "Mark as done"}
          style={{
            flexShrink: 0, background: "none", border: "none", cursor: isDismissed ? "default" : "pointer",
            color: isDismissed ? "var(--accent-3)" : "var(--text-dim)", padding: "2px 0", display: "flex", alignItems: "center",
          }}
        >
          <CheckCircle2 size={14} />
        </button>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatActions, setChatActions] = useState<string[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [activeProject, setActiveProject] = useState<string>("all");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [dismissedItems, setDismissedItems] = useState<Set<string>>(new Set());

  // Load dismissed items from localStorage, scoped to the current data snapshot
  useEffect(() => {
    if (!data?.generatedAt) return;
    try {
      const stored = localStorage.getItem("ai_briefing_dismissed");
      if (stored) {
        const { generatedAt, items } = JSON.parse(stored) as { generatedAt: string; items: string[] };
        if (generatedAt === data.generatedAt) {
          setDismissedItems(new Set(items));
          return;
        }
      }
    } catch { /* ignore */ }
    setDismissedItems(new Set());
  }, [data?.generatedAt]);

  const dismissItem = useCallback((text: string) => {
    if (!data?.generatedAt) return;
    setDismissedItems((prev) => {
      const next = new Set(prev);
      next.add(text);
      localStorage.setItem("ai_briefing_dismissed", JSON.stringify({
        generatedAt: data.generatedAt,
        items: Array.from(next),
      }));
      return next;
    });
  }, [data?.generatedAt]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleParseChat = async () => {
    if (!chatInput.trim()) return;
    setChatLoading(true);
    try {
      const res = await fetch("/api/parse-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: chatInput }),
      });
      const json = await res.json();
      setChatActions(json.actions ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setChatLoading(false);
    }
  };

  const projects = data
    ? ["all", ...Array.from(new Set(data.issues.map((i) => i.project)))]
    : ["all"];

  const filteredIssues = data?.issues.filter(
    (i) => activeProject === "all" || i.project === activeProject
  ) ?? [];

  const getDueGroup = (issue: JiraIssue) => {
    if (!issue.dueDate) return 0;
    const due = new Date(issue.dueDate);
    const now = new Date();
    if (due < now) return 2; // overdue — last
    if (due <= new Date(Date.now() + 2 * 86400000)) return 1; // due soon — middle
    return 0; // not due — first
  };

  const sortedIssues = [...filteredIssues].sort((a, b) => {
    const groupDiff = getDueGroup(a) - getDueGroup(b);
    if (groupDiff !== 0) return groupDiff;
    return (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
  });

  const overdueCount = data?.issues.filter(
    (i) => i.dueDate && new Date(i.dueDate) < new Date()
  ).length ?? 0;

  // Map Jira key -> URL for linking AI briefing text
  const issueMap = Object.fromEntries(
    (data?.issues ?? []).map((i) => [i.key, i.url])
  );

  return (
    <div style={{ minHeight: "100vh", position: "relative", zIndex: 1 }}>
      {/* Header */}
      <header style={{
        padding: "24px 32px 0",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        borderBottom: "1px solid var(--border)", paddingBottom: "20px",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <Code2 size={18} style={{ color: "var(--accent)" }} />
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "var(--text-muted)", letterSpacing: "0.1em" }}>
              DEV DASHBOARD
            </span>
          </div>
          <h1 style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "-0.02em" }}>
            {data?.summary?.greeting ?? "Good day!"}
          </h1>
          {lastRefresh && (
            <p style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "4px", fontFamily: "'DM Mono', monospace" }}>
              Updated {lastRefresh.toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: "var(--bg-card)", border: "1px solid var(--border-light)",
            borderRadius: "var(--radius-sm)", padding: "10px 16px",
            color: "var(--text-muted)", cursor: "pointer", fontSize: "13px", fontFamily: "'Syne', sans-serif",
            transition: "all 0.2s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-light)"; e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          Refresh
        </button>
      </header>

      {error && (
        <div style={{ margin: "16px 32px", padding: "12px 16px", background: "#f76a6a18", border: "1px solid #f76a6a44", borderRadius: "var(--radius-sm)", color: "#f76a6a", fontSize: "13px", fontFamily: "'DM Mono', monospace" }}>
          ⚠ {error}
        </div>
      )}

      {/* Stats bar */}
      {data && (
        <div style={{ display: "flex", gap: "1px", padding: "0 32px", marginTop: "20px" }}>
          {[
            { label: "Jira Issues", value: data.issues.length, color: "var(--accent)", icon: <CheckCircle2 size={14} /> },
            { label: "Overdue", value: overdueCount, color: "#f76a6a", icon: <AlertCircle size={14} /> },
            { label: "Total PRs", value: data.prs.length, color: "var(--accent-3)", icon: <GitPullRequest size={14} /> },
            { label: "Opened", value: data.prs.filter(p => p.state === "OPEN").length, color: "var(--accent)", icon: <Star size={14} /> },
            { label: "Reviewing", value: data.prs.filter(p => p.isReviewer).length, color: "var(--accent-2)", icon: <Eye size={14} /> },
          ].map((stat, i) => (
            <div key={i} style={{
              flex: 1, background: "var(--bg-card)", border: "1px solid var(--border)", padding: "16px",
              borderRadius: i === 0 ? "var(--radius) 0 0 var(--radius)" : i === 4 ? "0 var(--radius) var(--radius) 0" : "0",
              display: "flex", flexDirection: "column", gap: "6px",
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px", color: stat.color, fontSize: "11px", fontFamily: "'DM Mono', monospace", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {stat.icon} {stat.label}
              </span>
              <span style={{ fontSize: "28px", fontWeight: 800, color: stat.value > 0 ? stat.color : "var(--text-dim)" }}>
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Main content */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "20px", padding: "20px 32px 40px", maxWidth: "1400px" }}>

        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Gmail connect prompt */}
          {data && !data.gmailAuthorized && (
            <Card style={{ border: "1px solid var(--accent)44", background: "var(--accent-glow)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Mail size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
                  <p style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.4 }}>
                    Connect Gmail so the AI can prioritize your emails alongside Jira and PRs.
                  </p>
                </div>
                <a href="/api/auth/google" style={{
                  flexShrink: 0, background: "var(--accent)", color: "#fff", textDecoration: "none",
                  padding: "8px 16px", borderRadius: "var(--radius-sm)", fontSize: "12px",
                  fontFamily: "'Syne', sans-serif", fontWeight: 600, whiteSpace: "nowrap",
                }}>
                  Connect Gmail
                </a>
              </div>
            </Card>
          )}

          {/* AI Summary */}
          {data?.summary && (
            <Card>
              <SectionTitle icon={<Zap size={15} />} title="AI Briefing" />
              <div style={{ display: "flex", flexDirection: "column" }}>
                {data.summary.topPriorities.length > 0 && (
                  <div style={{ marginBottom: "8px" }}>
                    <p style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", marginBottom: "6px", letterSpacing: "0.06em" }}>TODAY'S FOCUS</p>
                    {data.summary.topPriorities.map((p, i) => (
                      <SummaryItem key={i} icon={<ChevronRight size={14} />} text={p} color="var(--accent)" issueMap={issueMap}
                        onDismiss={() => dismissItem(p)} isDismissed={dismissedItems.has(p)} />
                    ))}
                  </div>
                )}
                {data.summary.overdue.length > 0 && (
                  <div style={{ marginBottom: "8px" }}>
                    <p style={{ fontSize: "11px", color: "var(--danger)", fontFamily: "'DM Mono', monospace", marginBottom: "6px", letterSpacing: "0.06em" }}>OVERDUE / DUE TODAY</p>
                    {data.summary.overdue.map((p, i) => (
                      <SummaryItem key={i} icon={<AlertTriangle size={14} />} text={p} color="var(--danger)" issueMap={issueMap}
                        onDismiss={() => dismissItem(p)} isDismissed={dismissedItems.has(p)} />
                    ))}
                  </div>
                )}
                {data.summary.blockers.length > 0 && (
                  <div style={{ marginBottom: "8px" }}>
                    <p style={{ fontSize: "11px", color: "var(--warn)", fontFamily: "'DM Mono', monospace", marginBottom: "6px", letterSpacing: "0.06em" }}>BLOCKERS</p>
                    {data.summary.blockers.map((p, i) => (
                      <SummaryItem key={i} icon={<AlertCircle size={14} />} text={p} color="var(--warn)" issueMap={issueMap}
                        onDismiss={() => dismissItem(p)} isDismissed={dismissedItems.has(p)} />
                    ))}
                  </div>
                )}
                {data.summary.prActions.length > 0 && (
                  <div style={{ marginBottom: "8px" }}>
                    <p style={{ fontSize: "11px", color: "var(--accent-3)", fontFamily: "'DM Mono', monospace", marginBottom: "6px", letterSpacing: "0.06em" }}>PR ACTIONS NEEDED</p>
                    {data.summary.prActions.map((p, i) => (
                      <SummaryItem key={i} icon={<GitPullRequest size={14} />} text={p} color="var(--accent-3)" issueMap={issueMap}
                        onDismiss={() => dismissItem(p)} isDismissed={dismissedItems.has(p)} />
                    ))}
                  </div>
                )}
                {data.summary.waitingOnOthers && data.summary.waitingOnOthers.length > 0 && (
                  <div style={{ marginBottom: "8px" }}>
                    <p style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", marginBottom: "6px", letterSpacing: "0.06em" }}>WAITING ON OTHERS</p>
                    {data.summary.waitingOnOthers.map((p, i) => (
                      <SummaryItem key={i} icon={<Clock size={14} />} text={p} color="var(--text-muted)" issueMap={issueMap}
                        onDismiss={() => dismissItem(p)} isDismissed={dismissedItems.has(p)} />
                    ))}
                  </div>
                )}
                {data.summary.insight && (
                  <div style={{ marginTop: "8px", padding: "12px", background: "var(--accent-glow)", border: "1px solid var(--accent)33", borderRadius: "var(--radius-sm)" }}>
                    <p style={{ fontSize: "12px", color: "var(--accent)", fontStyle: "italic", lineHeight: 1.5 }}>💡 {data.summary.insight}</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Gmail Briefing */}
          {data?.gmailAuthorized && (
            <Card>
              <SectionTitle icon={<Mail size={15} />} title="Gmail Briefing" count={data.emails.length} />
              {data.emails.length === 0 ? (
                <p style={{ color: "var(--text-dim)", fontSize: "14px", padding: "12px 0", textAlign: "center" }}>No unread emails in the last 24h</p>
              ) : (
                <div>
                  {data.summary?.urgentEmails && data.summary.urgentEmails.length > 0 && (
                    <div style={{ marginBottom: "12px", padding: "10px 12px", background: "rgba(232, 53, 106, 0.06)", border: "1px solid var(--accent-2)33", borderRadius: "var(--radius-sm)" }}>
                      <p style={{ fontSize: "11px", color: "var(--accent-2)", fontFamily: "'DM Mono', monospace", marginBottom: "6px", letterSpacing: "0.06em" }}>AI: READ ASAP</p>
                      {data.summary.urgentEmails.map((item, i) => (
                        <p key={i} style={{ fontSize: "13px", color: "var(--text)", lineHeight: 1.5, padding: "4px 0", borderBottom: i < data.summary!.urgentEmails.length - 1 ? "1px solid var(--border)" : "none" }}>
                          {item}
                        </p>
                      ))}
                    </div>
                  )}
                  <div style={{ maxHeight: "420px", overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
                  {data.emails.map((email, i) => (
                    <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)", display: "flex", gap: "10px", alignItems: "flex-start" }}>
                      <div style={{ width: "3px", borderRadius: "2px", alignSelf: "stretch", minHeight: "36px", background: "var(--accent-2)", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)", fontFamily: "'DM Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "220px" }}>
                            {email.from.replace(/<.*>/, "").trim() || email.from}
                          </span>
                          <span style={{ fontSize: "10px", color: "var(--text-dim)", fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap", marginLeft: "auto" }}>
                            {new Date(email.date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", lineHeight: 1.4, marginBottom: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {email.subject}
                        </p>
                        <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {email.snippet}
                        </p>
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Jira Issues */}
          <Card>
            <SectionTitle icon={<CheckCircle2 size={15} />} title="Jira Issues" count={filteredIssues.length} />

            {/* Project filter */}
            <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" }}>
              {projects.map((p) => (
                <button key={p} onClick={() => setActiveProject(p)} style={{
                  padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontFamily: "'Syne', sans-serif",
                  cursor: "pointer", border: "1px solid",
                  borderColor: activeProject === p ? "var(--accent)" : "var(--border-light)",
                  background: activeProject === p ? "var(--accent-glow)" : "transparent",
                  color: activeProject === p ? "var(--accent)" : "var(--text-muted)",
                  transition: "all 0.15s",
                }}>
                  {p === "all" ? "All Projects" : p}
                </button>
              ))}
            </div>

            {loading ? (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--text-muted)", padding: "20px 0" }}>
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Loading issues...
              </div>
            ) : sortedIssues.length === 0 ? (
              <p style={{ color: "var(--text-dim)", fontSize: "14px", padding: "20px 0", textAlign: "center" }}>No open issues 🎉</p>
            ) : (
              sortedIssues.map((issue) => <IssueRow key={issue.id} issue={issue} />)
            )}
          </Card>

          {/* Google Chat Parser */}
          <Card>
            <SectionTitle icon={<MessageSquare size={15} />} title="Google Chat Parser" />
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px", lineHeight: 1.5 }}>
              Paste your morning messages below. AI will extract all action items for you.
            </p>
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Paste Google Chat messages here..."
              style={{
                width: "100%", minHeight: "140px", background: "var(--bg)", border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)", padding: "12px", color: "var(--text)", fontSize: "13px",
                fontFamily: "'DM Mono', monospace", resize: "vertical", outline: "none", lineHeight: 1.5,
                transition: "border-color 0.15s",
              }}
              onFocus={e => (e.target.style.borderColor = "var(--accent)")}
              onBlur={e => (e.target.style.borderColor = "var(--border-light)")}
            />
            <button
              onClick={handleParseChat}
              disabled={chatLoading || !chatInput.trim()}
              style={{
                display: "flex", alignItems: "center", gap: "8px", marginTop: "10px",
                background: "var(--accent)", border: "none", borderRadius: "var(--radius-sm)",
                padding: "10px 18px", color: "#fff", cursor: "pointer", fontSize: "13px",
                fontFamily: "'Syne', sans-serif", fontWeight: 600, opacity: chatLoading || !chatInput.trim() ? 0.5 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {chatLoading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={14} />}
              Extract Action Items
            </button>

            {chatActions.length > 0 && (
              <div style={{ marginTop: "16px" }}>
                <p style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", marginBottom: "8px", letterSpacing: "0.06em" }}>EXTRACTED ACTIONS</p>
                {chatActions.map((action, i) => (
                  <div key={i} style={{ display: "flex", gap: "10px", padding: "8px 0", borderBottom: "1px solid var(--border)", alignItems: "flex-start" }}>
                    <span style={{ color: "var(--accent-3)", fontFamily: "'DM Mono', monospace", fontSize: "11px", flexShrink: 0, marginTop: "2px" }}>{String(i + 1).padStart(2, "0")}</span>
                    <p style={{ fontSize: "13px", color: "var(--text)", lineHeight: 1.5 }}>{action}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right column — PRs */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <Card>
            <SectionTitle icon={<GitPullRequest size={15} />} title="Pull Requests" count={data?.prs.length} />
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--text-muted)", padding: "20px 0" }}>
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Loading PRs...
              </div>
            ) : !data?.prs.length ? (
              <p style={{ color: "var(--text-dim)", fontSize: "14px", padding: "20px 0", textAlign: "center" }}>No open PRs</p>
            ) : (
              <div style={{ maxHeight: "252px", overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
                {data.prs.map((pr) => <PRRow key={`${pr.id}-${pr.repo}`} pr={pr} />)}
              </div>
            )}
          </Card>

          {/* Errors panel */}
          {data?.errors && (data.errors.jira || data.errors.bitbucket || data.errors.gmail) && (
            <Card style={{ border: "1px solid #f7a26a44" }}>
              <SectionTitle icon={<AlertTriangle size={15} />} title="Config Issues" />
              {data.errors.jira && (
                <div style={{ marginBottom: "8px" }}>
                  <p style={{ fontSize: "11px", color: "var(--warn)", fontFamily: "'DM Mono', monospace", marginBottom: "4px" }}>JIRA</p>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 }}>{data.errors.jira}</p>
                </div>
              )}
              {data.errors.bitbucket && (
                <div style={{ marginBottom: "8px" }}>
                  <p style={{ fontSize: "11px", color: "var(--warn)", fontFamily: "'DM Mono', monospace", marginBottom: "4px" }}>BITBUCKET</p>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 }}>{data.errors.bitbucket}</p>
                </div>
              )}
              {data.errors.gmail && (
                <div>
                  <p style={{ fontSize: "11px", color: "var(--warn)", fontFamily: "'DM Mono', monospace", marginBottom: "4px" }}>GMAIL</p>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 }}>{data.errors.gmail}</p>
                </div>
              )}
            </Card>
          )}

          {/* Quick links */}
          <Card>
            <SectionTitle icon={<Calendar size={15} />} title="Quick Links" />
            {[
              { label: "Jira Board", url: `${process.env.NEXT_PUBLIC_JIRA_BASE_URL}/jira/software/projects` },
              { label: "Bitbucket PRs", url: "https://bitbucket.org/dashboard/pullrequests" },
            ].map((link, i) => (
              <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 0", borderBottom: "1px solid var(--border)", textDecoration: "none",
                color: "var(--text-muted)", fontSize: "13px", transition: "color 0.15s",
              }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--accent)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
              >
                {link.label}
                <ExternalLink size={12} />
              </a>
            ))}
          </Card>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
