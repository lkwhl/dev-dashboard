import Anthropic from "@anthropic-ai/sdk";
import { JiraIssue } from "./jira";
import { BitbucketPR } from "./bitbucket";
import { GmailMessage } from "./gmail";

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export interface AISummary {
  greeting: string;
  topPriorities: string[];
  overdue: string[];
  blockers: string[];
  prActions: string[];
  waitingOnOthers: string[];
  urgentEmails: string[];
  insight: string;
}

export async function generateDaySummary(
  issues: JiraIssue[],
  prs: BitbucketPR[],
  chatMessages?: string,
  emails?: GmailMessage[]
): Promise<AISummary | null> {
  if (!client) return null;

  const today = new Date().toISOString().split("T")[0];

  const issuesSummary = issues.map((i) => ({
    key: i.key,
    project: i.project,
    summary: i.summary,
    status: i.status,
    priority: i.priority,
    dueDate: i.dueDate,
    type: i.issueType,
  }));

  // Only include open PRs — merged ones need no attention
  const openPRs = prs.filter((p) => p.state !== "MERGED");
  const prsSummary = openPRs.map((p) => ({
    id: p.id,
    title: p.title,
    repo: p.repo,
    role: p.isAuthor ? "Author" : "Reviewer",
    comments: p.commentCount,
    updatedOn: p.updatedOn,
    // Hint for AI: author with 0 comments = waiting for first review
    likelyWaiting: p.isAuthor && p.commentCount === 0,
  }));

  const emailsSummary = (emails ?? []).map((e) => ({
    from: e.from,
    subject: e.subject,
    snippet: e.snippet,
    date: e.date,
  }));

  const prompt = `You are a senior engineering team lead helping a developer organize their workday.

Today is ${today}.

JIRA ISSUES (assigned to this developer, not done):
${JSON.stringify(issuesSummary, null, 2)}

BITBUCKET PULL REQUESTS (open only, merged excluded):
${JSON.stringify(prsSummary, null, 2)}

${emailsSummary.length > 0 ? `UNREAD EMAILS (last 24h):\n${JSON.stringify(emailsSummary, null, 2)}` : ""}

${chatMessages ? `GOOGLE CHAT MESSAGES:\n${chatMessages}` : ""}

Analyze all this data and respond with ONLY a valid JSON object in this exact shape:
{
  "greeting": "A short, energetic one-liner greeting for the day (max 15 words)",
  "topPriorities": ["3-5 specific action items to tackle TODAY, always referencing the exact Jira ticket key (e.g. ABC-123) or PR ID"],
  "overdue": ["Overdue items or due today/tomorrow with exact ticket keys. Empty array if none."],
  "blockers": ["Items that appear blocked or need attention with exact ticket keys. Empty array if none."],
  "prActions": ["PRs that REQUIRE YOUR ACTION right now: PRs where you're the reviewer and haven't reviewed yet, or PRs where you're the author and have comments to address. Reference PR IDs. Empty array if none."],
  "waitingOnOthers": ["Things you're actively waiting on — no action needed from you right now. Examples: PRs where you're the author with no comments yet (waiting for first review), PRs where you've addressed comments and are waiting for re-review, Jira issues with status 'In Review' or 'In QA' where you're waiting for CR/QA feedback. Be specific, reference ticket keys or PR IDs. Empty array if none."],
  "urgentEmails": ["Emails that need a response or action TODAY, format: 'From <sender>: <why it's urgent>'. Empty array if none or no emails provided."],
  "insight": "One sharp observation about the workload or tip to be more effective today (max 25 words)"
}

Rules:
- Always include the exact Jira key (e.g. PROJ-123) when referencing an issue so it can be linked.
- Merged PRs are already excluded — do not mention them.
- Be specific and actionable. No generic advice.
- In topPriorities, list tasks that are NOT due/overdue first (focus on proactive work), then at the end include any overdue tasks. This helps the developer tackle planned work before being overwhelmed by overdue items.
- IMPORTANT: Separate "needs your action" from "waiting on others". A PR where you're the author with likelyWaiting=true means no one has reviewed yet — put it in waitingOnOthers, NOT prActions. A Jira issue with status "In Review" or "In QA" means you're waiting for someone else — put it in waitingOnOthers too.
- Do NOT put the same item in both prActions and waitingOnOthers.`;

  const message = await client!.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content.find((b) => b.type === "text")?.text ?? "{}";
  const clean = text.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(clean) as AISummary;
  } catch {
    return {
      greeting: "Ready to crush it today?",
      topPriorities: ["Review your Jira board", "Check open PRs"],
      overdue: [],
      blockers: [],
      prActions: [],
      waitingOnOthers: [],
      urgentEmails: [],
      insight: "Stay focused on high-priority items first.",
    };
  }
}

export async function parseChatMessages(messages: string): Promise<string[]> {
  if (!client) return [];

  const message = await client!.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Extract all action items, tasks, requests, or mentions that require a response from these Google Chat messages. Return ONLY a JSON array of strings, each being a clear action item. No preamble, no markdown.

Messages:
${messages}`,
      },
    ],
  });

  const text = message.content.find((b) => b.type === "text")?.text ?? "[]";
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    return [];
  }
}
