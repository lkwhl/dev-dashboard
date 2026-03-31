export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { fetchMyJiraIssues } from "@/lib/jira";
import { fetchMyBitbucketPRs } from "@/lib/bitbucket";
import { generateDaySummary } from "@/lib/ai";
import { fetchRecentEmails, isAuthorized } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const chatMessages = req.nextUrl.searchParams.get("chatMessages") ?? undefined;

  try {
    const [issues, prs, emails] = await Promise.allSettled([
      fetchMyJiraIssues(),
      fetchMyBitbucketPRs(),
      isAuthorized(req) ? fetchRecentEmails(req) : Promise.resolve([]),
    ]);

    const jiraIssues = issues.status === "fulfilled" ? issues.value : [];
    const bitbucketPRs = prs.status === "fulfilled" ? prs.value : [];
    const gmailMessages = emails.status === "fulfilled" ? emails.value : [];

    const jiraError = issues.status === "rejected" ? String(issues.reason) : null;
    const bitbucketError = prs.status === "rejected" ? String(prs.reason) : null;
    const gmailError = emails.status === "rejected" ? String(emails.reason) : null;

    let summary = null;
    let aiError = null;
    try {
      summary = await generateDaySummary(jiraIssues, bitbucketPRs, chatMessages, gmailMessages);
    } catch (err) {
      aiError = String(err);
    }

    return NextResponse.json({
      issues: jiraIssues,
      prs: bitbucketPRs,
      emails: gmailMessages,
      gmailAuthorized: isAuthorized(req),
      summary,
      errors: { jira: jiraError, bitbucket: bitbucketError, gmail: gmailError, ai: aiError },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
