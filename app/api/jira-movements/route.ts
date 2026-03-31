export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { fetchJiraCardMovements } from "@/lib/jira";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? "";

  if (!date) return NextResponse.json({ movements: [] });

  const movements = await fetchJiraCardMovements(date);
  return NextResponse.json({ movements });
}
