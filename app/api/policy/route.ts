import { policyText } from "@/lib/store";


export async function GET() {
  return new Response(policyText(), { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
