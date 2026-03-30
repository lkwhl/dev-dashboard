import { NextResponse } from "next/server";
import { fetchTotalJiraIssueCount } from "@/lib/jira";

export async function GET() {
  try {
    const total = await fetchTotalJiraIssueCount();
    return NextResponse.json({ total });
  } catch (err) {
    return NextResponse.json({ total: null, error: String(err) });
  }
}
