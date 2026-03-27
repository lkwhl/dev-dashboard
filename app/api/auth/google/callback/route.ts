import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient, saveTokens } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);

  const response = NextResponse.redirect(new URL("/", req.url));
  saveTokens(tokens, response);

  return response;
}
