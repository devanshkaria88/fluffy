import { NextResponse } from "next/server";
import { replay } from "@/lib/pipeline";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await replay(id));
  } catch (e) {
    // A HOLD decision makes the executor refuse — that refusal is the demo, so surface it as 409.
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
