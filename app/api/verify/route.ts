import { NextResponse } from "next/server";
import { verifyAndDecide } from "@/lib/pipeline";

export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { milestoneId?: string; prNumber?: number };
  if (!body.milestoneId || !body.prNumber) {
    return NextResponse.json({ error: "milestoneId and prNumber are required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await verifyAndDecide(body.milestoneId, Number(body.prNumber)));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
