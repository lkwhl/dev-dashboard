import { NextRequest, NextResponse } from "next/server";
import { parseChatMessages } from "@/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    if (!messages || typeof messages !== "string") {
      return NextResponse.json({ error: "messages field required" }, { status: 400 });
    }
    const actions = await parseChatMessages(messages);
    return NextResponse.json({ actions });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
