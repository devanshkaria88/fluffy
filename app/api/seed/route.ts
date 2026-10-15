import { NextResponse } from "next/server";
import { seed } from "@/lib/pipeline";

export async function POST() {
  try {
    return NextResponse.json({ milestones: await seed() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
