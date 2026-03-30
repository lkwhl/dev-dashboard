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
  const res = await fetch(
    `${baseUrl}/rest/agile/1.0/board?maxResults=50`,
    {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      next: { revalidate: 3600 },
    }
  );

  if (!res.ok) return [];

  const data = await res.json();
  const keys = (data.values ?? [])
    .map((b: any) => b.location?.projectKey)
    .filter(Boolean) as string[];

  return Array.from(new Set(keys));
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
