import { NextResponse } from "next/server";
import { runEvals } from "@/lib/evals";


export async function GET() {
  return NextResponse.json(runEvals());
}
