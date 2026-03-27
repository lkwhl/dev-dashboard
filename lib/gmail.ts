import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "google_tokens";

export interface GmailMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  isUnread: boolean;
}

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL ?? "http://localhost:3002"}/api/auth/google/callback`
  );
}

export function loadTokens(req: NextRequest): object | null {
  const cookie = req.cookies.get(COOKIE_NAME);
  if (!cookie) return null;
  try {
    return JSON.parse(cookie.value);
  } catch {
    return null;
  }
}

export function saveTokens(tokens: object, res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, JSON.stringify(tokens), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
}

export function isAuthorized(req: NextRequest): boolean {
  return req.cookies.has(COOKIE_NAME);
}

export async function fetchRecentEmails(req: NextRequest): Promise<GmailMessage[]> {
  const tokens = loadTokens(req);
  if (!tokens) throw new Error("Gmail not authorized. Visit /api/auth/google to connect.");

  const client = getOAuthClient();
  client.setCredentials(tokens);

  const gmail = google.gmail({ version: "v1", auth: client });

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread in:inbox",
    maxResults: 30,
  });

  const messages = listRes.data.messages ?? [];
  if (messages.length === 0) return [];

  const full = await Promise.all(
    messages.map((m) =>
      gmail.users.messages.get({
        userId: "me",
        id: m.id!,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date"],
      })
    )
  );

  const mapped = full.map((res) => {
    const headers = res.data.payload?.headers ?? [];
    const get = (name: string) => headers.find((h) => h.name === name)?.value ?? "";
    const labelIds = res.data.labelIds ?? [];
    return {
      id: res.data.id ?? "",
      subject: get("Subject") || "(no subject)",
      from: get("From"),
      date: get("Date"),
      snippet: res.data.snippet ?? "",
      isUnread: labelIds.includes("UNREAD"),
    };
  });

  const filtered = mapped.filter((email) => {
    const fromLower = email.from.toLowerCase();
    const isJiraNotification =
      fromLower.includes("atlassian.net") ||
      fromLower.includes("jira@") ||
      (fromLower.includes("jira") && /\[[A-Z]+-\d+\]/.test(email.subject));
    return !isJiraNotification;
  });

  filtered.sort((a, b) => {
    const aIsSoftdesk = a.from.toLowerCase().includes("softdesk") || a.subject.toLowerCase().includes("softdesk");
    const bIsSoftdesk = b.from.toLowerCase().includes("softdesk") || b.subject.toLowerCase().includes("softdesk");
    if (aIsSoftdesk && !bIsSoftdesk) return -1;
    if (!aIsSoftdesk && bIsSoftdesk) return 1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return filtered;
}
