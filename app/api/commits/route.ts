import { NextRequest, NextResponse } from "next/server";
import { fetchMyCommitsForYear } from "@/lib/commits";

export async function GET(req: NextRequest) {
  const year = parseInt(
    req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear())
  );

  try {
    const commits = await fetchMyCommitsForYear(year);
    return NextResponse.json({ commits });
  } catch (err) {
    return NextResponse.json({ commits: [], error: String(err) });
  }
}
