import { NextResponse } from "next/server";
import { humanDecision } from "@/lib/pipeline";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: "release" | "uphold_hold"; by?: string; note?: string };
  if (body.action !== "release" && body.action !== "uphold_hold") {
    return NextResponse.json({ error: "action must be 'release' or 'uphold_hold'" }, { status: 400 });
  }
  try {
    return NextResponse.json({ decision: await humanDecision(id, body.action, body.by ?? "reviewer", body.note ?? "") });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
