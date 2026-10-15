import { NextResponse } from "next/server";
import { resetRuntime } from "@/lib/store";

export async function POST() {
  resetRuntime();
  return NextResponse.json({ ok: true });
}
