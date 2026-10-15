// Two independent LLM verifiers (claude-haiku-5-5) plus a code-level cross-check of cited tests against real results.
import Anthropic from "@anthropic-ai/sdk";
import type { Evidence, MemoryFact, Milestone, PullRequestRef, RequirementVerdict, TestRun, VerifierReport } from "./types";
import { VERIFIER_MODEL } from "./types";

const DIFF_CAP = 60_000;
const TOOL_NAME = "report_verification";

interface ReportInput {
  verdicts: { id: string; met: boolean; evidence: Evidence[]; note: string }[];
  summary: string;
}

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Report a verdict for every requirement, with cited evidence. Call exactly once.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      verdicts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Requirement id exactly as listed, e.g. R1" },
            met: { type: "boolean" },
            evidence: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  kind: { type: "string", enum: ["test", "code", "doc"] },
                  ref: {
                    type: "string",
                    description: "For kind=test: the exact full test name from the test results list. For code: path:line. For doc: section.",
                  },
                  detail: { type: "string", description: "One line explaining what this proves" },
                },
                required: ["kind", "ref", "detail"],
                additionalProperties: false,
              },
            },
            note: { type: "string", description: "One or two sentences of reasoning" },
          },
          required: ["id", "met", "evidence", "note"],
          additionalProperties: false,
        },
      },
      summary: { type: "string", description: "Two or three sentences for the client" },
    },
    required: ["verdicts", "summary"],
    additionalProperties: false,
  },
};

const COMMON = `
Rules:
- Give a verdict for EVERY requirement id listed, in order.
- Evidence of kind "test" must quote the exact full test name from the test results list; only tests whose status is "passed" count as proof. A test that is absent, skipped or failed proves nothing.
- Evidence of kind "code" must cite file:line from the diff. Do not invent files, lines or tests.
- Mark a requirement met only when the evidence actually proves the whole requirement, not part of it.
- Use the project-memory context for client expectations (e.g. rounding rules, naming conventions).
- Respond only by calling the ${TOOL_NAME} tool.`;

const FRAMINGS = {
  A: {
    label: "acceptance QA engineer",
    system: `You are the acceptance QA engineer for the client; you only mark a requirement met when a named passing test proves it.${COMMON}`,
  },
  B: {
    label: "skeptical CTO",
    system: `You are the client's skeptical CTO reviewing a contractor's PR before releasing escrow; assume nothing, cite file:line and test names.${COMMON}`,
  },
} as const;

const isTestFile = (hunk: string) =>
  /(\.test\.|\.spec\.|^tests?\/|\/tests?\/|__tests__)/.test(/^diff --git a\/(\S+)/.exec(hunk)?.[1] ?? "");

/** Keep every hunk from test files, then the first part of the rest, within DIFF_CAP chars. */
function capDiff(diff: string): string {
  if (diff.length <= DIFF_CAP) return diff;
  const hunks = diff.split(/^(?=diff --git )/m);
  const tests = hunks.filter(isTestFile).join("");
  const rest = hunks.filter((h) => !isTestFile(h)).join("");
  const room = Math.max(0, DIFF_CAP - tests.length);
  return `${tests}${rest.slice(0, room)}\n\n[diff truncated: ${rest.length - room} chars of non-test hunks omitted]`;
}

function buildPrompt(args: { milestone: Milestone; pr: PullRequestRef; testRun: TestRun; diff: string; memory: MemoryFact[] }) {
  const { milestone: m, pr, testRun, diff, memory } = args;
  const reqs = m.requirements.map((r) => `- ${r.id} (${r.testable ? "testable: needs a passing test" : "may be met by code/doc evidence"}): ${r.text}`);
  const tests = testRun.tests.length
    ? testRun.tests.map((t) => `${t.status} ${t.name}`)
    : ["(no tests were collected)"];
  const mem = memory.length ? memory.map((f) => `- ${f.text}`) : ["- (none)"];
  return [
    `# Milestone document\n${m.docMarkdown}`,
    `# Requirements to verify\n${reqs.join("\n")}`,
    `# Pull request\n#${pr.number} "${pr.title}" by @${pr.authorLogin} — head ${pr.headSha}, base ${pr.baseRef}, ${pr.changedFiles} files (+${pr.additions}/-${pr.deletions})\n\n${pr.body || "(no description)"}`,
    `# Test results (${testRun.passed} passed, ${testRun.failed} failed, ${testRun.skipped} skipped, ${testRun.total} total; suite ${testRun.ok ? "GREEN" : "NOT green"})\n${tests.join("\n")}`,
    `# Context from project memory:\n${mem.join("\n")}`,
    `# Unified diff (origin/${pr.baseRef}...${pr.headSha.slice(0, 7)})\n\`\`\`diff\n${capDiff(diff)}\n\`\`\``,
    `Now call ${TOOL_NAME} once with a verdict for every requirement (${m.requirements.map((r) => r.id).join(", ")}).`,
  ].join("\n\n");
}

async function runVerifier(client: Anthropic, which: "A" | "B", prompt: string): Promise<VerifierReport> {
  const framing = FRAMINGS[which];
  // Haiku 5.5 rejects non-default sampling params (temperature) and uses adaptive thinking by default,
  // so max_tokens leaves room for thinking before the tool call.
  const req: Anthropic.MessageCreateParamsNonStreaming = {
    model: VERIFIER_MODEL,
    max_tokens: 8000,
    system: framing.system,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: prompt }],
  };
  let res: Anthropic.Message;
  try {
    res = await client.messages.create(req);
  } catch (e) {
    // Fallback if this model generation rejects forced tool_choice.
    if (e instanceof Anthropic.BadRequestError && /tool_choice/i.test(e.message)) {
      res = await client.messages.create({ ...req, tool_choice: { type: "auto" } });
    } else throw e;
  }
  const use = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL_NAME);
  if (!use) throw new Error(`Verifier ${which} did not call ${TOOL_NAME} (stop_reason=${res.stop_reason})`);
  const input = use.input as ReportInput;
  return {
    verifier: which,
    framing: framing.label,
    model: res.model || VERIFIER_MODEL,
    verdicts: (input.verdicts ?? []).map((v) => ({
      id: String(v.id).trim().toUpperCase(),
      met: Boolean(v.met),
      evidence: (v.evidence ?? []).map((e) => ({ kind: e.kind, ref: String(e.ref ?? ""), detail: String(e.detail ?? "") })),
      note: String(v.note ?? ""),
    })),
    summary: String(input.summary ?? ""),
  };
}

export async function verifyPR(args: {
  milestone: Milestone;
  pr: PullRequestRef;
  testRun: TestRun;
  diff: string;
  memory: MemoryFact[];
}): Promise<{ reports: VerifierReport[]; crossChecked: RequirementVerdict[]; agreed: boolean; disagreements: string[] }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set: Settle will not fabricate verifier verdicts. Add it to .env and restart.");
  }
  const client = new Anthropic();
  const prompt = buildPrompt(args);
  const [A, B] = await Promise.all([runVerifier(client, "A", prompt), runVerifier(client, "B", prompt)]);

  const passed = args.testRun.tests.filter((t) => t.status === "passed").map((t) => t.name.toLowerCase());
  const ranAndPassed = (ref: string) => {
    const r = ref.trim().toLowerCase();
    return r.length > 0 && passed.some((n) => n.includes(r) || r.includes(n));
  };
  const byId = (rep: VerifierReport, id: string) => rep.verdicts.find((v) => v.id === id.toUpperCase());

  const crossChecked: RequirementVerdict[] = [];
  const disagreements: string[] = [];
  for (const req of args.milestone.requirements) {
    const a = byId(A, req.id);
    const b = byId(B, req.id);
    const aMet = a?.met ?? false;
    const bMet = b?.met ?? false;
    if (aMet !== bMet) disagreements.push(req.id);

    const notes: string[] = [];
    if (!a) notes.push("verifier A gave no verdict");
    if (!b) notes.push("verifier B gave no verdict");
    if (a && b && aMet !== bMet) notes.push(`verifiers disagree (A: ${aMet ? "met" : "not met"}, B: ${bMet ? "met" : "not met"})`);

    let met = aMet && bMet;
    if (met && req.testable) {
      for (const [label, rep] of [["A", a], ["B", b]] as const) {
        const cited = rep!.evidence.filter((e) => e.kind === "test");
        if (cited.some((e) => ranAndPassed(e.ref))) continue;
        met = false;
        notes.push(
          cited.length
            ? `verifier ${label} cited test "${cited[0].ref}" which did not run or did not pass`
            : `verifier ${label} cited no passing test for a testable requirement`,
        );
      }
    }

    const seen = new Set<string>();
    const evidence = [...(a?.evidence ?? []), ...(b?.evidence ?? [])].filter((e) => {
      const k = `${e.kind}:${e.ref.trim().toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const note = notes.length
      ? notes.join("; ")
      : met
        ? `both verifiers independently confirmed with passing tests: ${a?.note ?? ""}`.trim()
        : `A: ${a?.note ?? ""} | B: ${b?.note ?? ""}`;
    crossChecked.push({ id: req.id, met, evidence, note });
  }

  return { reports: [A, B], crossChecked, agreed: disagreements.length === 0, disagreements };
}
