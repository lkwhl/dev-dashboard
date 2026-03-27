import { google } from "googleapis";
import fs from "fs";
import path from "path";

const TOKENS_PATH = path.join(process.cwd(), "google-tokens.json");

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

export function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
  });
}

export function loadTokens() {
  if (!fs.existsSync(TOKENS_PATH)) return null;
  return JSON.parse(fs.readFileSync(TOKENS_PATH, "utf-8"));
}

export function saveTokens(tokens: object) {
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

export function isAuthorized(): boolean {
  return fs.existsSync(TOKENS_PATH);
}

export async function fetchRecentEmails(): Promise<GmailMessage[]> {
  const tokens = loadTokens();
  if (!tokens) throw new Error("Gmail not authorized. Visit /api/auth/google to connect.");

  const client = getOAuthClient();
  client.setCredentials(tokens);

  // Auto-save refreshed tokens
  client.on("tokens", (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    saveTokens(merged);
  });

  const gmail = google.gmail({ version: "v1", auth: client });

  // Fetch unread emails from the last 24h
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

  // Filter out automated Jira notification emails (not personally addressed)
  const filtered = mapped.filter((email) => {
    const fromLower = email.from.toLowerCase();
    const subjectLower = email.subject.toLowerCase();
    const isJiraNotification =
      fromLower.includes("atlassian.net") ||
      fromLower.includes("jira@") ||
      (fromLower.includes("jira") && /\[[A-Z]+-\d+\]/.test(email.subject));
    return !isJiraNotification;
  });

  // Sort: Softdesk emails first, then by date descending
  filtered.sort((a, b) => {
    const aIsSoftdesk = a.from.toLowerCase().includes("softdesk") || a.subject.toLowerCase().includes("softdesk");
    const bIsSoftdesk = b.from.toLowerCase().includes("softdesk") || b.subject.toLowerCase().includes("softdesk");
    if (aIsSoftdesk && !bIsSoftdesk) return -1;
    if (!aIsSoftdesk && bIsSoftdesk) return 1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return filtered;
}
