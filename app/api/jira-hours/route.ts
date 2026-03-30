import { NextRequest, NextResponse } from "next/server";
import { fetchJiraWorklogs } from "@/lib/jira";

export async function GET(req: NextRequest) {
  const keys = (req.nextUrl.searchParams.get("keys") ?? "")
    .split(",")
    .map(k => k.trim())
    .filter(Boolean);
  const date = req.nextUrl.searchParams.get("date") ?? "";

  try {
    const worklogs = await fetchJiraWorklogs(keys, date);
    return NextResponse.json({ worklogs });
  } catch (err) {
    return NextResponse.json({ worklogs: [], error: String(err) });
  }
}
