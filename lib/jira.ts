export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  status: string;
  priority: string;
  assignee: string | null;
  dueDate: string | null;
  project: string;
  projectKey: string;
  issueType: string;
  description: string | null;
  updated: string;
  url: string;
}

async function fetchMyBoardProjectKeys(baseUrl: string, auth: string): Promise<string[]> {
  try {
    const res = await fetch(
      `${baseUrl}/rest/agile/1.0/board?maxResults=50`,
      {
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const keys = (data.values ?? [])
      .map((b: any) => b.location?.projectKey)
      .filter(Boolean) as string[];

    return Array.from(new Set(keys));
  } catch {
    return [];
  }
}

export async function fetchTotalJiraIssueCount(): Promise<number> {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !token) {
    throw new Error("Missing Jira environment variables.");
  }

  const auth = Buffer.from(`${email}:${token}`).toString("base64");

  // Step 1: get all boards the user has access to
  const projectKeys = await fetchMyBoardProjectKeys(baseUrl, auth);

  // Step 2: build JQL — all cards assigned (now or ever) across those boards
  const projectFilter = projectKeys.length > 0
    ? `project in (${projectKeys.map(k => `"${k}"`).join(", ")}) AND `
    : "";
  const jql = `${projectFilter}(assignee = currentUser() OR assignee was currentUser())`;

  // Step 3: paginate and collect unique IDs
  const allIds = new Set<string>();
  const pageSize = 100;
  let startAt = 0;

  while (true) {
    const res = await fetch(
      `${baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=${pageSize}&startAt=${startAt}&fields=summary`,
      {
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
        next: { revalidate: 3600 },
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const issues: any[] = data.issues ?? [];

    for (const issue of issues) {
      allIds.add(issue.id);
    }

    if (startAt + issues.length >= data.total || issues.length === 0) break;
    startAt += pageSize;
  }

  return allIds.size;
}

export interface JiraWorklogDay {
  issueKey: string;
  issueSummary: string;
  timeSpentSeconds: number;
  timeSpent: string; // "2h 30m"
  url: string;
}

export async function fetchJiraWorklogs(
  issueKeys: string[],
  date: string // YYYY-MM-DD
): Promise<JiraWorklogDay[]> {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !token || issueKeys.length === 0) return [];

  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };

  const results: JiraWorklogDay[] = [];

  await Promise.all(
    issueKeys.map(async (key) => {
      try {
      const [issueRes, worklogRes] = await Promise.all([
        fetch(`${baseUrl}/rest/api/3/issue/${key}?fields=summary`, { headers, signal: AbortSignal.timeout(15000) }),
        fetch(`${baseUrl}/rest/api/3/issue/${key}/worklog`, { headers, signal: AbortSignal.timeout(15000) }),
      ]);

      if (!issueRes.ok || !worklogRes.ok) return;

      const [issueData, worklogData] = await Promise.all([
        issueRes.json(),
        worklogRes.json(),
      ]);

      const summary: string = issueData.fields?.summary ?? key;
      let totalSeconds = 0;

      for (const entry of worklogData.worklogs ?? []) {
        const entryDate = (entry.started ?? "").slice(0, 10);
        const isMe = entry.author?.emailAddress === email;
        if (entryDate === date && isMe) {
          totalSeconds += entry.timeSpentSeconds ?? 0;
        }
      }

      if (totalSeconds > 0) {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const timeSpent = h > 0 && m > 0 ? `${h}h ${m}m` : h > 0 ? `${h}h` : `${m}m`;
        results.push({ issueKey: key, issueSummary: summary, timeSpentSeconds: totalSeconds, timeSpent, url: `${baseUrl}/browse/${key}` });
      }
      } catch { /* skip issues that timeout or fail */ }
    })
  );

  return results.sort((a, b) => b.timeSpentSeconds - a.timeSpentSeconds);
}

export interface JiraCardMovement {
  issueKey: string;
  issueSummary: string;
  url: string;
  movements: { from: string; to: string; time: string }[];
}

export async function fetchJiraCardMovements(date: string): Promise<JiraCardMovement[]> {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !token) return [];

  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };

  const nextDate = new Date(date + "T12:00:00");
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().slice(0, 10);

  const jql = `status changed by currentUser() AFTER "${date}" BEFORE "${nextDateStr}"`;

  try {
    // Use api/2 with expand=changelog — response has changelog.histories[]
    const res = await fetch(
      `${baseUrl}/rest/api/2/search?jql=${encodeURIComponent(jql)}&expand=changelog&fields=summary,project&maxResults=50`,
      { headers, signal: AbortSignal.timeout(15000) }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const results: JiraCardMovement[] = [];

    for (const issue of data.issues ?? []) {
      const isScout = (issue.fields?.project?.name ?? "").toLowerCase().includes("scout");
      const movements: JiraCardMovement["movements"] = [];

      for (const history of issue.changelog?.histories ?? []) {
        if ((history.created ?? "").slice(0, 10) !== date) continue;

        for (const item of history.items ?? []) {
          if (item.field !== "status") continue;

          const toStatus = (item.toString ?? "").toLowerCase();

          // Scout board: only count moves TO "dev ok"
          if (isScout && toStatus !== "dev ok") continue;

          movements.push({
            from: item.fromString ?? "?",
            to: item.toString ?? "?",
            time: history.created,
          });
        }
      }

      if (movements.length > 0) {
        results.push({
          issueKey: issue.key,
          issueSummary: issue.fields?.summary ?? issue.key,
          url: `${baseUrl}/browse/${issue.key}`,
          movements,
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

export async function fetchMyJiraIssues(): Promise<JiraIssue[]> {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !token) {
    throw new Error("Missing Jira environment variables. Check JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN.");
  }

  const auth = Buffer.from(`${email}:${token}`).toString("base64");

  // Fetch issues assigned to the current user, not done, ordered by priority then due date
  const jql = encodeURIComponent(
    `assignee = currentUser() AND statusCategory != Done ORDER BY priority ASC, duedate ASC`
  );

  const res = await fetch(
    `${baseUrl}/rest/api/3/search/jql?jql=${jql}&maxResults=50&fields=summary,status,priority,assignee,duedate,project,issuetype,description,updated`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
      next: { revalidate: 300 }, // cache 5 min
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira API error ${res.status}: ${text}`);
  }

  const data = await res.json();

  return data.issues.map((issue: any): JiraIssue => ({
    id: issue.id,
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status?.name ?? "Unknown",
    priority: issue.fields.priority?.name ?? "Medium",
    assignee: issue.fields.assignee?.displayName ?? null,
    dueDate: issue.fields.duedate ?? null,
    project: issue.fields.project?.name ?? "Unknown",
    projectKey: issue.fields.project?.key ?? "???",
    issueType: issue.fields.issuetype?.name ?? "Task",
    description: issue.fields.description?.content?.[0]?.content?.[0]?.text ?? null,
    updated: issue.fields.updated,
    url: `${baseUrl}/browse/${issue.key}`,
  }));
}
