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
