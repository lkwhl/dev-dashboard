"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { JiraIssue } from "@/lib/jira";
import { BitbucketPR } from "@/lib/bitbucket";
import { AISummary } from "@/lib/ai";
import { GmailMessage } from "@/lib/gmail";
import {
  RefreshCw, GitPullRequest, AlertCircle, Clock, CheckCircle2,
  Zap, MessageSquare, ChevronRight, ExternalLink, Loader2,
  AlertTriangle, Star, Eye, Code2, Calendar, Send, Bell, Mail,
  GitCommit, ListChecks, Trash2, ChevronUp, ChevronDown, Plus
} from "lucide-react";

interface Commit {
  hash: string;
  date: string;
  dateStr: string;
  message: string;
  repo: string;
  repoSlug: string;
  url: string;
  jiraKeys: string[];
}

interface JiraWorklogDay {
  issueKey: string;
  issueSummary: string;
  timeSpentSeconds: number;
  timeSpent: string;
  url: string;
}

interface JiraCardMovement {
  issueKey: string;
  issueSummary: string;
  url: string;
  movements: { from: string; to: string; time: string }[];
}

interface DashboardData {
  issues: JiraIssue[];
  prs: BitbucketPR[];
  emails: GmailMessage[];
  gmailAuthorized: boolean;
  summary: AISummary | null;
  errors: { jira: string | null; bitbucket: string | null; gmail: string | null; ai: string | null };
  generatedAt: string;
}

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  source: "ai" | "user";
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
      fontSize: "13px",
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
      <span style={{ fontWeight: 700, fontSize: "17px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>{title}</span>
      {count !== undefined && (
        <span style={{ marginLeft: "auto", background: "var(--bg)", border: "1px solid var(--border-light)", borderRadius: "20px", padding: "1px 10px", fontSize: "16px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>
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
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "14px", color: "var(--accent)", fontWeight: 500 }}>{issue.key}</span>
            <Badge text={issue.status} color={STATUS_COLOR[issue.status] ?? "var(--text-muted)"} />
            {isOverdue && <Badge text="OVERDUE" color="var(--danger)" />}
            {isDueSoon && !isOverdue && <Badge text="DUE SOON" color="var(--warn)" />}
            {crQaLevel === "n3" && <Badge text="CR+QA N3" color="var(--danger)" />}
            {crQaLevel === "n1" && <Badge text="CR+QA N1" color="var(--accent-3)" />}
          </div>
          <p style={{ fontSize: "18px", fontWeight: 500, color: "var(--text)", lineHeight: 1.4, marginBottom: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {issue.summary}
          </p>
          <div style={{ display: "flex", gap: "12px", fontSize: "14px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", flexWrap: "wrap" }}>
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
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "14px", color: "var(--text-muted)" }}>#{pr.id}</span>
            <Badge text={pr.isAuthor ? "Author" : "Reviewer"} color={pr.isAuthor ? "var(--accent)" : "var(--accent-2)"} />
            <Badge
              text={pr.state}
              color={pr.state === "OPEN" ? "var(--accent-3)" : pr.state === "MERGED" ? "var(--accent)" : "var(--text-muted)"}
            />
            <Badge text={pr.repo} color="var(--text-muted)" bg="var(--bg)" />
          </div>
          <p style={{ fontSize: "18px", fontWeight: 500, color: "var(--text)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {pr.title}
          </p>
          {pr.commentCount > 0 && (
            <span style={{ fontSize: "14px", color: "var(--warn)", fontFamily: "'DM Mono', monospace", display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" }}>
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
      <p style={{ fontSize: "17px", color: "var(--text)", lineHeight: 1.5, flex: 1, textDecoration: isDismissed ? "line-through" : "none", textDecorationColor: "var(--text-dim)" }}>
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

const MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTHS_LONG = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function WorkingHoursView({ prs }: { prs: BitbucketPR[] }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [calView, setCalView] = useState<"year" | "month">("year");
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState<Record<string, number>>({});
  const [inputHours, setInputHours] = useState<string>("");
  const [commits, setCommits] = useState<Commit[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(true);
  const [jiraWorklogs, setJiraWorklogs] = useState<JiraWorklogDay[]>([]);
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraMovements, setJiraMovements] = useState<JiraCardMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("working_hours");
      if (stored) setHours(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (hours[selectedDate] !== undefined) {
      setInputHours(String(hours[selectedDate]));
    } else if (jiraWorklogs.length > 0) {
      const totalSec = jiraWorklogs.reduce((s, w) => s + w.timeSpentSeconds, 0);
      setInputHours(String(+(totalSec / 3600).toFixed(2)));
    } else {
      setInputHours("");
    }
  }, [selectedDate, hours, jiraWorklogs]);

  useEffect(() => {
    setCommitsLoading(true);
    setCommits([]);
    fetch(`/api/commits?year=${year}`)
      .then(r => r.json())
      .then(d => setCommits(d.commits ?? []))
      .catch(() => {})
      .finally(() => setCommitsLoading(false));
  }, [year]);

  useEffect(() => {
    const commitsOnDay = commits.filter(c => c.dateStr === selectedDate);
    const keys = Array.from(new Set(commitsOnDay.flatMap(c => c.jiraKeys)));
    if (keys.length === 0) { setJiraWorklogs([]); return; }
    setJiraLoading(true);
    fetch(`/api/jira-hours?keys=${keys.join(",")}&date=${selectedDate}`)
      .then(r => r.json())
      .then(d => setJiraWorklogs(d.worklogs ?? []))
      .catch(() => setJiraWorklogs([]))
      .finally(() => setJiraLoading(false));
  }, [selectedDate, commits]);

  useEffect(() => {
    setMovementsLoading(true);
    setJiraMovements([]);
    fetch(`/api/jira-movements?date=${selectedDate}`)
      .then(r => r.json())
      .then(d => setJiraMovements(d.movements ?? []))
      .catch(() => {})
      .finally(() => setMovementsLoading(false));
  }, [selectedDate]);

  const saveHours = (date: string, val: number) => {
    const next = { ...hours, [date]: val };
    setHours(next);
    localStorage.setItem("working_hours", JSON.stringify(next));
  };

  const commitsByDate = useMemo(() => {
    const map: Record<string, Commit[]> = {};
    for (const c of commits) {
      if (!map[c.dateStr]) map[c.dateStr] = [];
      map[c.dateStr].push(c);
    }
    return map;
  }, [commits]);

  const prsByDate = useMemo(() => {
    const map: Record<string, BitbucketPR[]> = {};
    for (const pr of prs) {
      if (!pr.isAuthor) continue;
      const dateStr = (pr.updatedOn ?? "").slice(0, 10);
      if (!dateStr) continue;
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(pr);
    }
    return map;
  }, [prs]);

  const totalHoursYear = useMemo(() =>
    Object.entries(hours)
      .filter(([d]) => d.startsWith(String(year)))
      .reduce((sum, [, h]) => sum + h, 0),
    [hours, year]
  );

  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

  const getCellBg = (dateStr: string) => {
    const h = hours[dateStr];
    if (h === undefined || h === 0) return "var(--bg)";
    if (h <= 4) return "#6af7a230";
    if (h <= 7) return "#6af7a260";
    return "#6af7a290";
  };

  const getCellBorder = (dateStr: string) => {
    if (dateStr === selectedDate) return "var(--accent)";
    const hasCommits = (commitsByDate[dateStr]?.length ?? 0) > 0;
    const hasHours = hours[dateStr] !== undefined && hours[dateStr] > 0;
    if (hasCommits && !hasHours) return "var(--warn)";
    return "var(--border)";
  };

  const isWeekend = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00").getDay();
    return d === 0 || d === 6;
  };

  // Month view navigation
  const viewYear = parseInt(selectedDate.slice(0, 4));
  const viewMonth = parseInt(selectedDate.slice(5, 7)) - 1;

  const goPrevMonth = () => {
    const d = new Date(viewYear, viewMonth - 1, 1);
    const ny = d.getFullYear(); const nm = d.getMonth();
    setSelectedDate(`${ny}-${String(nm + 1).padStart(2, "0")}-01`);
    if (ny !== year) setYear(ny);
  };
  const goNextMonth = () => {
    const d = new Date(viewYear, viewMonth + 1, 1);
    const ny = d.getFullYear(); const nm = d.getMonth();
    setSelectedDate(`${ny}-${String(nm + 1).padStart(2, "0")}-01`);
    if (ny !== year) setYear(ny);
  };

  const selectedCommits = commitsByDate[selectedDate] ?? [];
  const selectedPRs = prsByDate[selectedDate] ?? [];
  const jiraTotalSeconds = jiraWorklogs.reduce((s, w) => s + w.timeSpentSeconds, 0);
  const jiraTotalHours = +(jiraTotalSeconds / 3600).toFixed(2);
  const hasManualHours = hours[selectedDate] !== undefined;
  const selectedDayDate = new Date(selectedDate + "T12:00:00");
  const weekdayLong = selectedDayDate.toLocaleDateString("pt-BR", { weekday: "long" });
  const dateFull = selectedDayDate.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });

  const btnStyle = (active: boolean) => ({
    padding: "6px 16px", background: active ? "var(--accent)" : "var(--bg-card)",
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: "14px",
    fontFamily: "'Syne', sans-serif", fontWeight: 700,
    color: active ? "#fff" : "var(--text-muted)", transition: "all 0.15s",
  });

  const navBtnStyle = {
    background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
    padding: "5px 14px", cursor: "pointer", color: "var(--text-muted)", fontSize: "16px",
    fontFamily: "'DM Mono', monospace",
  };

  return (
    <div style={{ padding: "20px 32px 40px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: "var(--accent)", display: "flex" }}><Clock size={16} /></span>
          <span style={{ fontWeight: 700, fontSize: "17px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>Working Hours</span>
        </div>
        {/* View toggle */}
        <div style={{ display: "flex", gap: "4px" }}>
          <button style={btnStyle(calView === "year")} onClick={() => setCalView("year")}>Ano</button>
          <button style={btnStyle(calView === "month")} onClick={() => setCalView("month")}>Mês</button>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
          {totalHoursYear > 0 && calView === "year" && (
            <span style={{ fontSize: "16px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>
              <span style={{ color: "var(--accent-3)", fontWeight: 700 }}>{totalHoursYear}h</span> em {year}
            </span>
          )}
          {calView === "year" && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button onClick={() => setYear(y => y - 1)} style={navBtnStyle}>← {year - 1}</button>
              <span style={{ fontWeight: 800, fontSize: "21px", minWidth: "52px", textAlign: "center" }}>{year}</span>
              {year < currentYear && (
                <button onClick={() => setYear(y => y + 1)} style={navBtnStyle}>{year + 1} →</button>
              )}
            </div>
          )}
          {calView === "month" && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button onClick={goPrevMonth} style={navBtnStyle}>←</button>
              <span style={{ fontWeight: 800, fontSize: "21px", minWidth: "200px", textAlign: "center" }}>
                {MONTHS_LONG[viewMonth]} {viewYear}
              </span>
              <button onClick={goNextMonth} style={navBtnStyle}>→</button>
            </div>
          )}
        </div>
      </div>

      {/* Calendar — full width */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "24px", marginBottom: "20px" }}>
        {commitsLoading && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)", fontSize: "16px", fontFamily: "'DM Mono', monospace", marginBottom: "14px" }}>
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
            Carregando commits do Bitbucket...
          </div>
        )}

        {/* ── YEAR VIEW ── */}
        {calView === "year" && (
          <>
            <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ width: "52px" }} />
                  {Array.from({ length: 31 }, (_, i) => (
                    <th key={i} style={{ textAlign: "center", fontSize: "13px", color: "var(--text-dim)", fontFamily: "'DM Mono', monospace", padding: "0 2px 10px" }}>
                      {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 12 }, (_, month) => {
                  const daysInMonth = getDaysInMonth(year, month);
                  return (
                    <tr key={month}>
                      <td style={{ fontSize: "14px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", paddingRight: "10px", paddingBottom: "4px", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                        {MONTHS_SHORT[month]}
                      </td>
                      {Array.from({ length: 31 }, (_, day) => {
                        if (day >= daysInMonth) return <td key={day} style={{ padding: "2px" }} />;
                        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day + 1).padStart(2, "0")}`;
                        const isSelected = dateStr === selectedDate;
                        const hasCommits = (commitsByDate[dateStr]?.length ?? 0) > 0;
                        const hasHours = hours[dateStr] !== undefined && hours[dateStr] > 0;
                        const hoursVal = hours[dateStr] ?? 0;
                        const weekend = isWeekend(dateStr);
                        return (
                          <td key={day} style={{ padding: "2px" }}>
                            <div
                              onClick={() => setSelectedDate(dateStr)}
                              title={`${dateStr}${hoursVal ? ` · ${hoursVal}h` : ""}${hasCommits ? ` · ${commitsByDate[dateStr].length} commits` : ""}`}
                              style={{
                                width: "100%", aspectRatio: "1", borderRadius: "5px",
                                background: hasHours ? getCellBg(dateStr) : weekend ? "#00000012" : getCellBg(dateStr),
                                border: `1.5px solid ${getCellBorder(dateStr)}`,
                                cursor: "pointer", position: "relative",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                boxShadow: isSelected ? "0 0 0 2px var(--accent)50" : "none",
                                transition: "opacity 0.1s",
                                minWidth: "18px", minHeight: "18px",
                              }}
                              onMouseEnter={e => (e.currentTarget.style.opacity = "0.75")}
                              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                            >
                              {hasHours && (
                                <span style={{ fontSize: "11px", fontFamily: "'DM Mono', monospace", color: "var(--text)", fontWeight: 700, lineHeight: 1, userSelect: "none" }}>
                                  {hoursVal}
                                </span>
                              )}
                              {hasCommits && (
                                <div style={{ position: "absolute", bottom: "2px", right: "2px", width: "4px", height: "4px", borderRadius: "50%", background: hasHours ? "var(--accent)" : "var(--warn)" }} />
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Legend */}
            <div style={{ display: "flex", gap: "16px", marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
              {[
                { bg: "var(--bg)", border: "var(--border)", label: "Sem registro" },
                { bg: "var(--bg)", border: "var(--warn)", label: "Commit s/ horas" },
                { bg: "#6af7a230", border: "var(--border)", label: "1–4h" },
                { bg: "#6af7a260", border: "var(--border)", label: "5–7h" },
                { bg: "#6af7a290", border: "var(--border)", label: "8h+" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>
                  <div style={{ width: "14px", height: "14px", borderRadius: "3px", background: item.bg, border: `1px solid ${item.border}`, flexShrink: 0 }} />
                  {item.label}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── MONTH VIEW ── */}
        {calView === "month" && (() => {
          const daysInMonth = getDaysInMonth(viewYear, viewMonth);
          const firstDow = new Date(viewYear, viewMonth, 1).getDay();
          const startPad = firstDow === 0 ? 6 : firstDow - 1; // Mon-first
          return (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px" }}>
                {WEEKDAYS.map(d => (
                  <div key={d} style={{ textAlign: "center", fontSize: "15px", fontWeight: 700, color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", padding: "8px 0 12px", letterSpacing: "0.06em" }}>
                    {d}
                  </div>
                ))}
                {Array.from({ length: startPad }, (_, i) => <div key={`p${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, day) => {
                  const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day + 1).padStart(2, "0")}`;
                  const isSelected = dateStr === selectedDate;
                  const hasCommits = (commitsByDate[dateStr]?.length ?? 0) > 0;
                  const hasHours = hours[dateStr] !== undefined && hours[dateStr] > 0;
                  const hoursVal = hours[dateStr] ?? 0;
                  const weekend = isWeekend(dateStr);
                  const isToday = dateStr === new Date().toISOString().slice(0, 10);
                  return (
                    <div
                      key={dateStr}
                      onClick={() => setSelectedDate(dateStr)}
                      style={{
                        minHeight: "80px", borderRadius: "var(--radius-sm)", padding: "10px",
                        background: hasHours ? getCellBg(dateStr) : weekend ? "#00000008" : "var(--bg)",
                        border: `1.5px solid ${getCellBorder(dateStr)}`,
                        cursor: "pointer", position: "relative", transition: "opacity 0.1s",
                        boxShadow: isSelected ? "0 0 0 2px var(--accent)50" : "none",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = "0.75")}
                      onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                        <span style={{
                          fontSize: "17px", fontWeight: isToday ? 800 : 600,
                          color: isToday ? "var(--accent)" : weekend ? "var(--text-dim)" : "var(--text)",
                          fontFamily: "'DM Mono', monospace",
                        }}>
                          {day + 1}
                        </span>
                        {hasHours && (
                          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--accent-3)", fontFamily: "'DM Mono', monospace" }}>
                            {hoursVal}h
                          </span>
                        )}
                      </div>
                      {hasCommits && (
                        <div style={{ marginTop: "6px", display: "flex", gap: "3px", flexWrap: "wrap" }}>
                          {Array.from({ length: Math.min(commitsByDate[dateStr].length, 5) }, (_, i) => (
                            <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: hasHours ? "var(--accent)" : "var(--warn)" }} />
                          ))}
                          {commitsByDate[dateStr].length > 5 && (
                            <span style={{ fontSize: "12px", color: "var(--text-dim)", fontFamily: "'DM Mono', monospace" }}>+{commitsByDate[dateStr].length - 5}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}
      </div>

      {/* Detail panel — full width below calendar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
        {/* Hours input */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px" }}>
          <p style={{ fontSize: "24px", fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em", textTransform: "capitalize", lineHeight: 1.2 }}>
            {weekdayLong}
          </p>
          <p style={{ fontSize: "15px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", marginBottom: "16px", marginTop: "4px" }}>
            {dateFull}
          </p>
          {jiraLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "15px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", marginBottom: "10px" }}>
              <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Buscando worklogs Jira...
            </div>
          )}
          {!jiraLoading && jiraTotalSeconds > 0 && (
            <div style={{
              background: hasManualHours ? "var(--bg)" : "var(--accent)12",
              border: `1px solid ${hasManualHours ? "var(--border)" : "var(--accent)44"}`,
              borderRadius: "var(--radius-sm)", padding: "8px 12px", marginBottom: "12px",
              fontSize: "15px", color: hasManualHours ? "var(--text-dim)" : "var(--accent)", fontFamily: "'DM Mono', monospace",
            }}>
              {hasManualHours ? "Jira:" : "Sugerido do Jira:"} <strong>{jiraTotalHours}h</strong> logadas nos cards vinculados
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <input
              type="number" min={0} max={24} step={0.5} value={inputHours}
              onChange={e => setInputHours(e.target.value)} placeholder="0"
              style={{ width: "72px", padding: "10px", fontFamily: "'DM Mono', monospace", fontSize: "30px", fontWeight: 800, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)", textAlign: "center" }}
            />
            <span style={{ fontSize: "18px", color: "var(--text-muted)" }}>horas</span>
            <button
              onClick={() => { const val = parseFloat(inputHours); if (!isNaN(val) && val >= 0) saveHours(selectedDate, val); }}
              style={{ marginLeft: "auto", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", padding: "10px 18px", cursor: "pointer", fontSize: "17px", fontFamily: "'Syne', sans-serif", fontWeight: 700 }}
            >
              Salvar
            </button>
          </div>
        </div>

        {/* Jira worklogs */}
        {!jiraLoading && jiraWorklogs.length > 0 && (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <span style={{ color: "var(--accent)", display: "flex" }}><CheckCircle2 size={14} /></span>
              <span style={{ fontWeight: 700, fontSize: "15px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>Horas no Jira</span>
            </div>
            {jiraWorklogs.map(w => (
              <a key={w.issueKey} href={w.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid var(--border)", padding: "8px 0", transition: "opacity 0.15s" }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "0.75")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                >
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "14px", color: "var(--accent)", flexShrink: 0 }}>{w.issueKey}</span>
                  <p style={{ fontSize: "15px", color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.issueSummary}</p>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "15px", color: "var(--accent-3)", fontWeight: 700, flexShrink: 0 }}>{w.timeSpent}</span>
                </div>
              </a>
            ))}
          </div>
        )}

        {/* Commits */}
        {selectedCommits.length > 0 && (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <span style={{ color: "var(--accent)", display: "flex" }}><GitCommit size={14} /></span>
              <span style={{ fontWeight: 700, fontSize: "15px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>Commits</span>
              <span style={{ marginLeft: "auto", background: "var(--bg)", border: "1px solid var(--border-light)", borderRadius: "20px", padding: "1px 10px", fontSize: "15px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>{selectedCommits.length}</span>
            </div>
            <div style={{ maxHeight: "300px", overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
              {selectedCommits.map(c => (
                <a key={c.hash} href={c.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                  <div style={{ borderBottom: "1px solid var(--border)", padding: "10px 0", transition: "opacity 0.15s" }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "0.75")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                  >
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "14px", color: "var(--text-dim)" }}>{c.hash.slice(0, 7)}</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "14px", color: "var(--accent-2)" }}>{c.repo}</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "14px", color: "var(--text-dim)", marginLeft: "auto" }}>
                        {new Date(c.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {c.jiraKeys.length > 0 && (
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "4px" }}>
                        {c.jiraKeys.map(k => <Badge key={k} text={k} color="var(--accent)" />)}
                      </div>
                    )}
                    <p style={{ fontSize: "16px", color: "var(--text)", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as React.CSSProperties}>
                      {c.message.split("\n")[0]}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* PRs */}
        {selectedPRs.length > 0 && (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <span style={{ color: "var(--accent)", display: "flex" }}><GitPullRequest size={14} /></span>
              <span style={{ fontWeight: 700, fontSize: "15px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>PRs</span>
              <span style={{ marginLeft: "auto", background: "var(--bg)", border: "1px solid var(--border-light)", borderRadius: "20px", padding: "1px 10px", fontSize: "15px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>{selectedPRs.length}</span>
            </div>
            {selectedPRs.map(pr => (
              <a key={`${pr.id}-${pr.repo}`} href={pr.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                <div style={{ borderBottom: "1px solid var(--border)", padding: "10px 0", transition: "opacity 0.15s" }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "0.75")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                >
                  <div style={{ display: "flex", gap: "6px", marginBottom: "4px", alignItems: "center" }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "14px", color: "var(--accent)" }}>#{pr.id}</span>
                    <Badge text={pr.state} color={pr.state === "OPEN" ? "var(--accent-3)" : "var(--text-muted)"} />
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "14px", color: "var(--text-dim)", marginLeft: "auto" }}>{pr.repo}</span>
                  </div>
                  <p style={{ fontSize: "17px", color: "var(--text)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pr.title}</p>
                </div>
              </a>
            ))}
          </div>
        )}

        {/* Jira card movements */}
        {(movementsLoading || jiraMovements.length > 0) && (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <span style={{ color: "var(--accent-2)", display: "flex" }}><ChevronRight size={14} /></span>
              <span style={{ fontWeight: 700, fontSize: "15px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>Movimentações</span>
              {movementsLoading
                ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite", marginLeft: "auto" }} />
                : <span style={{ marginLeft: "auto", background: "var(--bg)", border: "1px solid var(--border-light)", borderRadius: "20px", padding: "1px 10px", fontSize: "15px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>{jiraMovements.length}</span>
              }
            </div>
            {jiraMovements.map(m => (
              <a key={m.issueKey} href={m.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                <div style={{ borderBottom: "1px solid var(--border)", padding: "10px 0", transition: "opacity 0.15s" }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "0.75")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "14px", color: "var(--accent)", flexShrink: 0 }}>{m.issueKey}</span>
                    <ExternalLink size={11} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
                  </div>
                  <p style={{ fontSize: "17px", color: "var(--text)", lineHeight: 1.4, marginBottom: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.issueSummary}</p>
                  {m.movements.map((mv, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", fontFamily: "'DM Mono', monospace", marginTop: "4px" }}>
                      <span style={{ color: "var(--text-dim)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "3px", padding: "2px 6px" }}>{mv.from}</span>
                      <span style={{ color: "var(--text-dim)" }}>→</span>
                      <span style={{ color: "var(--accent-3)", background: "var(--accent-3)15", border: "1px solid var(--accent-3)40", borderRadius: "3px", padding: "2px 6px" }}>{mv.to}</span>
                      <span style={{ color: "var(--text-dim)", marginLeft: "auto" }}>
                        {new Date(mv.time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>
              </a>
            ))}
          </div>
        )}

        {selectedCommits.length === 0 && selectedPRs.length === 0 && jiraMovements.length === 0 && !commitsLoading && !movementsLoading && (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "24px", textAlign: "center" }}>
            <p style={{ fontSize: "17px", color: "var(--text-dim)" }}>Nenhuma atividade encontrada neste dia</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TodoView({ todos, onSave, issueMap }: {
  todos: TodoItem[];
  onSave: (todos: TodoItem[]) => void;
  issueMap: Record<string, string>;
}) {
  const [newText, setNewText] = useState("");

  const addTodo = () => {
    if (!newText.trim()) return;
    const newTodo: TodoItem = {
      id: Math.random().toString(36).slice(2),
      text: newText.trim(),
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
      source: "user",
    };
    onSave([...todos, newTodo]);
    setNewText("");
  };

  const deleteTodo = (id: string) => onSave(todos.filter(t => t.id !== id));

  const toggleTodo = (id: string) => {
    onSave(todos.map(t =>
      t.id === id
        ? { ...t, completed: !t.completed, completedAt: !t.completed ? new Date().toISOString() : null }
        : t
    ));
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...todos];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onSave(next);
  };

  const moveDown = (index: number) => {
    if (index === todos.length - 1) return;
    const next = [...todos];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onSave(next);
  };

  const pending = todos.filter(t => !t.completed).length;

  return (
    <div style={{ padding: "20px 32px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
        <span style={{ color: "var(--accent)", display: "flex" }}><ListChecks size={15} /></span>
        <span style={{ fontWeight: 700, fontSize: "17px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>TODO</span>
        <span style={{ background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: "20px", padding: "1px 10px", fontSize: "16px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>
          {pending} pendente{pending !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Add input */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        <input
          type="text"
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addTodo()}
          placeholder="Adicionar novo TODO..."
          style={{
            flex: 1, padding: "10px 12px", background: "var(--bg-card)",
            border: "1px solid var(--border-light)", borderRadius: "var(--radius-sm)",
            color: "var(--text)", fontSize: "17px", fontFamily: "'DM Mono', monospace",
            outline: "none", transition: "border-color 0.15s",
          }}
          onFocus={e => (e.target.style.borderColor = "var(--accent)")}
          onBlur={e => (e.target.style.borderColor = "var(--border-light)")}
        />
        <button
          onClick={addTodo}
          disabled={!newText.trim()}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            background: "var(--accent)", border: "none", borderRadius: "var(--radius-sm)",
            padding: "10px 16px", color: "#fff", cursor: "pointer", fontSize: "16px",
            fontFamily: "'Syne', sans-serif", fontWeight: 700,
            opacity: !newText.trim() ? 0.5 : 1, transition: "opacity 0.15s",
          }}
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {/* List */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "4px 0" }}>
        {todos.length === 0 && (
          <p style={{ padding: "24px", textAlign: "center", color: "var(--text-dim)", fontSize: "17px" }}>
            Nenhum TODO ainda. O AI briefing irá sugerir itens ao carregar.
          </p>
        )}
        {todos.map((todo, index) => (
          <div key={todo.id} style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "10px 14px",
            borderBottom: index < todos.length - 1 ? "1px solid var(--border)" : "none",
            opacity: todo.completed ? 0.5 : 1,
            transition: "opacity 0.2s",
          }}>
            {/* Move buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1px", flexShrink: 0 }}>
              <button
                onClick={() => moveUp(index)}
                disabled={index === 0}
                style={{ background: "none", border: "none", cursor: index === 0 ? "default" : "pointer", color: index === 0 ? "var(--text-dim)" : "var(--text-muted)", padding: "1px 2px", display: "flex" }}
              >
                <ChevronUp size={12} />
              </button>
              <button
                onClick={() => moveDown(index)}
                disabled={index === todos.length - 1}
                style={{ background: "none", border: "none", cursor: index === todos.length - 1 ? "default" : "pointer", color: index === todos.length - 1 ? "var(--text-dim)" : "var(--text-muted)", padding: "1px 2px", display: "flex" }}
              >
                <ChevronDown size={12} />
              </button>
            </div>

            {/* AI badge */}
            {todo.source === "ai" && (
              <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", color: "var(--accent)", background: "var(--accent)18", padding: "1px 5px", borderRadius: "3px", fontFamily: "'DM Mono', monospace", flexShrink: 0, textTransform: "uppercase" }}>
                AI
              </span>
            )}

            {/* Text */}
            <p style={{ flex: 1, fontSize: "17px", color: "var(--text)", lineHeight: 1.5, textDecoration: todo.completed ? "line-through" : "none", textDecorationColor: "var(--text-dim)" }}>
              <LinkedText text={todo.text} issueMap={issueMap} />
            </p>

            {/* Toggle complete */}
            <button
              onClick={() => toggleTodo(todo.id)}
              title={todo.completed ? "Marcar como pendente" : "Marcar como concluído"}
              style={{ background: "none", border: "none", cursor: "pointer", color: todo.completed ? "var(--accent-3)" : "var(--text-dim)", padding: "4px", display: "flex", alignItems: "center", flexShrink: 0 }}
            >
              <CheckCircle2 size={15} />
            </button>

            {/* Delete */}
            <button
              onClick={() => deleteTodo(todo.id)}
              title="Remover"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: "4px", display: "flex", alignItems: "center", flexShrink: 0, transition: "color 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--danger)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-dim)")}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
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
  const [totalCards, setTotalCards] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "working-hours" | "todo">("dashboard");
  const [todos, setTodos] = useState<TodoItem[]>([]);

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

  // Load todos from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("todo_list");
      if (stored) {
        const parsed = JSON.parse(stored);
        setTodos(parsed.items ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  // Sync topPriorities + overdue from AI briefing into todo list when data refreshes
  useEffect(() => {
    if (!data?.summary || !data.generatedAt) return;
    try {
      const stored = localStorage.getItem("todo_list");
      const parsed = stored ? JSON.parse(stored) : { items: [], aiSyncedAt: null };
      if (parsed.aiSyncedAt === data.generatedAt) return;
      const aiTexts = [
        ...(data.summary.topPriorities ?? []),
        ...(data.summary.overdue ?? []),
      ];
      const existingTexts = new Set((parsed.items as TodoItem[]).map((t: TodoItem) => t.text));
      const newItems: TodoItem[] = aiTexts
        .filter(text => !existingTexts.has(text))
        .map(text => ({
          id: Math.random().toString(36).slice(2),
          text,
          completed: false,
          completedAt: null,
          createdAt: new Date().toISOString(),
          source: "ai" as const,
        }));
      const updatedItems = [...(parsed.items as TodoItem[]), ...newItems];
      const newStored = { items: updatedItems, aiSyncedAt: data.generatedAt };
      localStorage.setItem("todo_list", JSON.stringify(newStored));
      setTodos(updatedItems);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.generatedAt]);

  const saveTodos = useCallback((newTodos: TodoItem[]) => {
    setTodos(newTodos);
    try {
      const stored = localStorage.getItem("todo_list");
      const parsed = stored ? JSON.parse(stored) : {};
      localStorage.setItem("todo_list", JSON.stringify({ ...parsed, items: newTodos }));
    } catch { /* ignore */ }
  }, []);

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

  useEffect(() => {
    fetch("/api/total-cards")
      .then(r => r.json())
      .then(j => setTotalCards(j.total ?? null))
      .catch(() => {});
  }, []);

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

  const today = new Date().toISOString().slice(0, 10);
  const todosCompletedToday = todos.filter(t => t.completedAt?.slice(0, 10) === today).length;

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
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "14px", color: "var(--text-muted)", letterSpacing: "0.1em" }}>
              DEV DASHBOARD
            </span>
          </div>
          <h1 style={{ fontSize: "34px", fontWeight: 800, letterSpacing: "-0.02em" }}>
            {data?.summary?.greeting ?? "Good day!"}
          </h1>
          {lastRefresh && (
            <p style={{ fontSize: "14px", color: "var(--text-dim)", marginTop: "4px", fontFamily: "'DM Mono', monospace" }}>
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
            color: "var(--text-muted)", cursor: "pointer", fontSize: "17px", fontFamily: "'Syne', sans-serif",
            transition: "all 0.2s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-light)"; e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          Refresh
        </button>
      </header>

      {/* Tab navigation */}
      <div style={{ display: "flex", padding: "0 32px", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
        {([
          { id: "dashboard" as const, label: "Dashboard", icon: <Code2 size={13} /> },
          { id: "working-hours" as const, label: "Working Hours", icon: <Clock size={13} /> },
          { id: "todo" as const, label: "TODO", icon: <ListChecks size={13} /> },
        ]).map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "10px 16px", background: "none", border: "none",
              borderBottom: `2px solid ${activeTab === id ? "var(--accent)" : "transparent"}`,
              color: activeTab === id ? "var(--accent)" : "var(--text-muted)",
              cursor: "pointer", fontSize: "16px", fontFamily: "'Syne', sans-serif", fontWeight: 700,
              letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "-1px",
              transition: "color 0.15s",
            }}
          >
            {icon} {label}
          </button>
        ))}
        {todosCompletedToday > 0 && (
          <div style={{
            marginLeft: "auto", display: "flex", alignItems: "center", gap: "5px",
            fontSize: "14px", color: "var(--accent-3)", fontFamily: "'DM Mono', monospace",
            background: "var(--accent-3)15", border: "1px solid var(--accent-3)40",
            borderRadius: "20px", padding: "3px 10px",
          }}>
            <CheckCircle2 size={11} />
            {todosCompletedToday} feito{todosCompletedToday !== 1 ? "s" : ""} hoje
          </div>
        )}
      </div>

      {activeTab === "working-hours" && (
        <WorkingHoursView prs={data?.prs ?? []} />
      )}

      {activeTab === "todo" && (
        <TodoView todos={todos} onSave={saveTodos} issueMap={issueMap} />
      )}

      {activeTab === "dashboard" && <>
      {error && (
        <div style={{ margin: "16px 32px", padding: "12px 16px", background: "#f76a6a18", border: "1px solid #f76a6a44", borderRadius: "var(--radius-sm)", color: "#f76a6a", fontSize: "17px", fontFamily: "'DM Mono', monospace" }}>
          ⚠ {error}
        </div>
      )}

      {/* Stats bar */}
      {data && (
        <div style={{ display: "flex", gap: "1px", padding: "0 32px", marginTop: "20px" }}>
          {[
            { label: "Total Cards", value: totalCards, color: "var(--accent-3)", icon: <CheckCircle2 size={14} /> },
            { label: "Em aberto", value: data.issues.length, color: "var(--accent)", icon: <CheckCircle2 size={14} /> },
            { label: "Overdue", value: overdueCount, color: "#f76a6a", icon: <AlertCircle size={14} /> },
            { label: "PRs abertos", value: data.prs.filter(p => p.state === "OPEN").length, color: "var(--accent-3)", icon: <GitPullRequest size={14} /> },
            { label: "Reviewing", value: data.prs.filter(p => p.isReviewer && p.state === "OPEN").length, color: "var(--accent-2)", icon: <Eye size={14} /> },
          ].map((stat, i, arr) => (
            <div key={i} style={{
              flex: 1, background: "var(--bg-card)", border: "1px solid var(--border)", padding: "16px",
              borderRadius: i === 0 ? "var(--radius) 0 0 var(--radius)" : i === arr.length - 1 ? "0 var(--radius) var(--radius) 0" : "0",
              display: "flex", flexDirection: "column", gap: "6px",
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px", color: stat.color, fontSize: "14px", fontFamily: "'DM Mono', monospace", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {stat.icon} {stat.label}
              </span>
              <span style={{ fontSize: "36px", fontWeight: 800, color: (stat.value ?? 0) > 0 ? stat.color : "var(--text-dim)" }}>
                {stat.value ?? "—"}
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
                  <p style={{ fontSize: "17px", color: "var(--text-muted)", lineHeight: 1.4 }}>
                    Connect Gmail so the AI can prioritize your emails alongside Jira and PRs.
                  </p>
                </div>
                <a href="/api/auth/google" style={{
                  flexShrink: 0, background: "var(--accent)", color: "#fff", textDecoration: "none",
                  padding: "8px 16px", borderRadius: "var(--radius-sm)", fontSize: "16px",
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
                    <p style={{ fontSize: "14px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", marginBottom: "6px", letterSpacing: "0.06em" }}>TODAY'S FOCUS</p>
                    {data.summary.topPriorities.map((p, i) => (
                      <SummaryItem key={i} icon={<ChevronRight size={14} />} text={p} color="var(--accent)" issueMap={issueMap}
                        onDismiss={() => dismissItem(p)} isDismissed={dismissedItems.has(p)} />
                    ))}
                  </div>
                )}
                {data.summary.overdue.length > 0 && (
                  <div style={{ marginBottom: "8px" }}>
                    <p style={{ fontSize: "14px", color: "var(--danger)", fontFamily: "'DM Mono', monospace", marginBottom: "6px", letterSpacing: "0.06em" }}>OVERDUE / DUE TODAY</p>
                    {data.summary.overdue.map((p, i) => (
                      <SummaryItem key={i} icon={<AlertTriangle size={14} />} text={p} color="var(--danger)" issueMap={issueMap}
                        onDismiss={() => dismissItem(p)} isDismissed={dismissedItems.has(p)} />
                    ))}
                  </div>
                )}
                {data.summary.blockers.length > 0 && (
                  <div style={{ marginBottom: "8px" }}>
                    <p style={{ fontSize: "14px", color: "var(--warn)", fontFamily: "'DM Mono', monospace", marginBottom: "6px", letterSpacing: "0.06em" }}>BLOCKERS</p>
                    {data.summary.blockers.map((p, i) => (
                      <SummaryItem key={i} icon={<AlertCircle size={14} />} text={p} color="var(--warn)" issueMap={issueMap}
                        onDismiss={() => dismissItem(p)} isDismissed={dismissedItems.has(p)} />
                    ))}
                  </div>
                )}
                {data.summary.prActions.length > 0 && (
                  <div style={{ marginBottom: "8px" }}>
                    <p style={{ fontSize: "14px", color: "var(--accent-3)", fontFamily: "'DM Mono', monospace", marginBottom: "6px", letterSpacing: "0.06em" }}>PR ACTIONS NEEDED</p>
                    {data.summary.prActions.map((p, i) => (
                      <SummaryItem key={i} icon={<GitPullRequest size={14} />} text={p} color="var(--accent-3)" issueMap={issueMap}
                        onDismiss={() => dismissItem(p)} isDismissed={dismissedItems.has(p)} />
                    ))}
                  </div>
                )}
                {data.summary.waitingOnOthers && data.summary.waitingOnOthers.length > 0 && (
                  <div style={{ marginBottom: "8px" }}>
                    <p style={{ fontSize: "14px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", marginBottom: "6px", letterSpacing: "0.06em" }}>WAITING ON OTHERS</p>
                    {data.summary.waitingOnOthers.map((p, i) => (
                      <SummaryItem key={i} icon={<Clock size={14} />} text={p} color="var(--text-muted)" issueMap={issueMap}
                        onDismiss={() => dismissItem(p)} isDismissed={dismissedItems.has(p)} />
                    ))}
                  </div>
                )}
                {data.summary.insight && (
                  <div style={{ marginTop: "8px", padding: "12px", background: "var(--accent-glow)", border: "1px solid var(--accent)33", borderRadius: "var(--radius-sm)" }}>
                    <p style={{ fontSize: "16px", color: "var(--accent)", fontStyle: "italic", lineHeight: 1.5 }}>💡 {data.summary.insight}</p>
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
                <p style={{ color: "var(--text-dim)", fontSize: "18px", padding: "12px 0", textAlign: "center" }}>No unread emails in the last 24h</p>
              ) : (
                <div>
                  {data.summary?.urgentEmails && data.summary.urgentEmails.length > 0 && (
                    <div style={{ marginBottom: "12px", padding: "10px 12px", background: "rgba(232, 53, 106, 0.06)", border: "1px solid var(--accent-2)33", borderRadius: "var(--radius-sm)" }}>
                      <p style={{ fontSize: "14px", color: "var(--accent-2)", fontFamily: "'DM Mono', monospace", marginBottom: "6px", letterSpacing: "0.06em" }}>AI: READ ASAP</p>
                      {data.summary.urgentEmails.map((item, i) => (
                        <p key={i} style={{ fontSize: "17px", color: "var(--text)", lineHeight: 1.5, padding: "4px 0", borderBottom: i < data.summary!.urgentEmails.length - 1 ? "1px solid var(--border)" : "none" }}>
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
                          <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--text)", fontFamily: "'DM Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "220px" }}>
                            {email.from.replace(/<.*>/, "").trim() || email.from}
                          </span>
                          <span style={{ fontSize: "13px", color: "var(--text-dim)", fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap", marginLeft: "auto" }}>
                            {new Date(email.date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p style={{ fontSize: "17px", fontWeight: 600, color: "var(--text)", lineHeight: 1.4, marginBottom: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {email.subject}
                        </p>
                        <p style={{ fontSize: "16px", color: "var(--text-muted)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                  padding: "5px 12px", borderRadius: "20px", fontSize: "16px", fontFamily: "'Syne', sans-serif",
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
              <p style={{ color: "var(--text-dim)", fontSize: "18px", padding: "20px 0", textAlign: "center" }}>No open issues 🎉</p>
            ) : (
              sortedIssues.map((issue) => <IssueRow key={issue.id} issue={issue} />)
            )}
          </Card>

          {/* Google Chat Parser */}
          <Card>
            <SectionTitle icon={<MessageSquare size={15} />} title="Google Chat Parser" />
            <p style={{ fontSize: "16px", color: "var(--text-muted)", marginBottom: "12px", lineHeight: 1.5 }}>
              Paste your morning messages below. AI will extract all action items for you.
            </p>
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Paste Google Chat messages here..."
              style={{
                width: "100%", minHeight: "140px", background: "var(--bg)", border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-sm)", padding: "12px", color: "var(--text)", fontSize: "17px",
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
                padding: "10px 18px", color: "#fff", cursor: "pointer", fontSize: "17px",
                fontFamily: "'Syne', sans-serif", fontWeight: 600, opacity: chatLoading || !chatInput.trim() ? 0.5 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {chatLoading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={14} />}
              Extract Action Items
            </button>

            {chatActions.length > 0 && (
              <div style={{ marginTop: "16px" }}>
                <p style={{ fontSize: "14px", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", marginBottom: "8px", letterSpacing: "0.06em" }}>EXTRACTED ACTIONS</p>
                {chatActions.map((action, i) => (
                  <div key={i} style={{ display: "flex", gap: "10px", padding: "8px 0", borderBottom: "1px solid var(--border)", alignItems: "flex-start" }}>
                    <span style={{ color: "var(--accent-3)", fontFamily: "'DM Mono', monospace", fontSize: "14px", flexShrink: 0, marginTop: "2px" }}>{String(i + 1).padStart(2, "0")}</span>
                    <p style={{ fontSize: "17px", color: "var(--text)", lineHeight: 1.5 }}>{action}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right column — PRs */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <Card>
            <SectionTitle icon={<GitPullRequest size={15} />} title="PRs Abertos" count={data?.prs.filter(p => p.state === "OPEN").length} />
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--text-muted)", padding: "20px 0" }}>
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Loading PRs...
              </div>
            ) : !data?.prs.filter(p => p.state === "OPEN").length ? (
              <p style={{ color: "var(--text-dim)", fontSize: "18px", padding: "20px 0", textAlign: "center" }}>Nenhum PR aberto</p>
            ) : (
              <div style={{ maxHeight: "252px", overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
                {data.prs.filter(p => p.state === "OPEN").map((pr) => <PRRow key={`${pr.id}-${pr.repo}`} pr={pr} />)}
              </div>
            )}
          </Card>

          {/* Errors panel */}
          {data?.errors && (data.errors.jira || data.errors.bitbucket || data.errors.gmail) && (
            <Card style={{ border: "1px solid #f7a26a44" }}>
              <SectionTitle icon={<AlertTriangle size={15} />} title="Config Issues" />
              {data.errors.jira && (
                <div style={{ marginBottom: "8px" }}>
                  <p style={{ fontSize: "14px", color: "var(--warn)", fontFamily: "'DM Mono', monospace", marginBottom: "4px" }}>JIRA</p>
                  <p style={{ fontSize: "16px", color: "var(--text-muted)", lineHeight: 1.5 }}>{data.errors.jira}</p>
                </div>
              )}
              {data.errors.bitbucket && (
                <div style={{ marginBottom: "8px" }}>
                  <p style={{ fontSize: "14px", color: "var(--warn)", fontFamily: "'DM Mono', monospace", marginBottom: "4px" }}>BITBUCKET</p>
                  <p style={{ fontSize: "16px", color: "var(--text-muted)", lineHeight: 1.5 }}>{data.errors.bitbucket}</p>
                </div>
              )}
              {data.errors.gmail && (
                <div>
                  <p style={{ fontSize: "14px", color: "var(--warn)", fontFamily: "'DM Mono', monospace", marginBottom: "4px" }}>GMAIL</p>
                  <p style={{ fontSize: "16px", color: "var(--text-muted)", lineHeight: 1.5 }}>{data.errors.gmail}</p>
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
                color: "var(--text-muted)", fontSize: "17px", transition: "color 0.15s",
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

      </>}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
