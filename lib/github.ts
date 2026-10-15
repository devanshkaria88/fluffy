// Thin wrappers over the gh CLI and git. Never shell-interpolates user strings (execFile + argv).
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { PullRequestRef, TestCase, TestRun } from "./types";

const exec = promisify(execFile);
const FLUFFY = path.join(process.cwd(), ".fluffy");
const PR_FIELDS =
  "number,url,title,body,author,headRefOid,headRefName,baseRefName,state,changedFiles,additions,deletions,mergedAt";

type ExecErr = Error & { stdout?: string; stderr?: string; killed?: boolean };

async function run(cmd: string, args: string[], opts: { cwd?: string; timeout?: number } = {}) {
  const { stdout, stderr } = await exec(cmd, args, {
    cwd: opts.cwd,
    timeout: opts.timeout ?? 60_000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", CI: "1" },
  });
  return { stdout: String(stdout), stderr: String(stderr) };
}

// gh returns state OPEN|CLOSED|MERGED and author as { login }.
function toRef(p: Record<string, unknown>): PullRequestRef {
  const author = p.author as { login?: string } | null;
  const state = String(p.state ?? "").toUpperCase();
  return {
    number: Number(p.number),
    url: String(p.url ?? ""),
    title: String(p.title ?? ""),
    body: String(p.body ?? ""),
    authorLogin: author?.login ?? "",
    headSha: String(p.headRefOid ?? ""),
    headRef: String(p.headRefName ?? ""),
    baseRef: String(p.baseRefName ?? ""),
    state: p.mergedAt || state === "MERGED" ? "merged" : state === "OPEN" ? "open" : "closed",
    changedFiles: Number(p.changedFiles ?? 0),
    additions: Number(p.additions ?? 0),
    deletions: Number(p.deletions ?? 0),
  };
}

export async function getPR(repo: string, number: number): Promise<PullRequestRef> {
  const { stdout } = await run("gh", ["pr", "view", String(number), "--repo", repo, "--json", PR_FIELDS]);
  return toRef(JSON.parse(stdout));
}

export async function listPRs(repo: string): Promise<PullRequestRef[]> {
  const { stdout } = await run("gh", ["pr", "list", "--repo", repo, "--state", "all", "--limit", "20", "--json", PR_FIELDS]);
  return (JSON.parse(stdout) as Record<string, unknown>[]).map(toRef);
}

const slug = (repo: string) => repo.replace(/[^A-Za-z0-9_.-]/g, "__");

/** Clone once into .fluffy/repos/<owner>__<name>, fetch head + base, and return a detached worktree for the head sha. */
export async function prepareWorkdir(repo: string, headSha: string, baseBranch: string): Promise<string> {
  const clone = path.join(FLUFFY, "repos", slug(repo));
  fs.mkdirSync(path.dirname(clone), { recursive: true });
  if (!fs.existsSync(path.join(clone, ".git"))) {
    await run("gh", ["repo", "clone", repo, clone], { timeout: 180_000 });
  }
  await run("git", ["-C", clone, "fetch", "origin", baseBranch], { timeout: 120_000 });
  try {
    await run("git", ["-C", clone, "fetch", "origin", headSha], { timeout: 120_000 });
  } catch {
    // Some servers refuse fetch-by-sha; PR heads are always reachable via refs/pull/*.
    await run("git", ["-C", clone, "fetch", "origin", "+refs/pull/*/head:refs/remotes/origin/pr/*"], { timeout: 120_000 });
  }
  const work = path.join(FLUFFY, "work", slug(repo), headSha);
  if (!fs.existsSync(path.join(work, ".git"))) {
    fs.mkdirSync(path.dirname(work), { recursive: true });
    await run("git", ["-C", clone, "worktree", "prune"]);
    await run("git", ["-C", clone, "worktree", "add", "--detach", work, headSha]);
  }
  return work;
}

export async function getDiff(dir: string, baseBranch: string, headSha: string): Promise<string> {
  try {
    return (await run("git", ["-C", dir, "diff", `origin/${baseBranch}...${headSha}`])).stdout;
  } catch {
    return (await run("git", ["-C", dir, "diff", `origin/${baseBranch}`])).stdout;
  }
}

interface VitestJson {
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  numTodoTests?: number;
  testResults?: {
    name?: string;
    assertionResults?: { fullName?: string; title?: string; status?: string; failureMessages?: string[] }[];
  }[];
}

/** pnpm install, then vitest with the JSON reporter. baseTotal is left null for the caller (countBaseTests). */
export async function runTests(dir: string): Promise<TestRun> {
  const started = Date.now();
  const vitestArgs = ["vitest", "run", "--reporter=json", "--reporter=default", "--outputFile=.fluffy-results.json"];
  const command = `pnpm install && npx ${vitestArgs.join(" ")}`;
  let out = "";
  // --ignore-workspace: the worktree lives under this project, which has its own pnpm-workspace.yaml.
  try {
    await run("pnpm", ["install", "--frozen-lockfile", "--ignore-workspace"], { cwd: dir, timeout: 180_000 });
  } catch {
    try {
      await run("pnpm", ["install", "--ignore-workspace"], { cwd: dir, timeout: 180_000 });
    } catch (e) {
      out += `[pnpm install failed] ${(e as ExecErr).stderr ?? (e as Error).message}\n`;
    }
  }
  const resultsFile = path.join(dir, ".fluffy-results.json");
  fs.rmSync(resultsFile, { force: true });
  try {
    const r = await run("npx", vitestArgs, { cwd: dir, timeout: 120_000 });
    out += r.stdout + r.stderr;
  } catch (e) {
    const err = e as ExecErr; // vitest exits 1 when tests fail; the JSON file is still written
    out += (err.stdout ?? "") + (err.stderr ?? "") + (err.killed ? "\n[vitest timed out after 120s]" : "");
  }

  const tests: TestCase[] = [];
  let total = 0, passed = 0, failed = 0, skipped = 0;
  try {
    const json = JSON.parse(fs.readFileSync(resultsFile, "utf8")) as VitestJson;
    total = json.numTotalTests ?? 0;
    passed = json.numPassedTests ?? 0;
    failed = json.numFailedTests ?? 0;
    skipped = (json.numPendingTests ?? 0) + (json.numTodoTests ?? 0);
    for (const f of json.testResults ?? []) {
      const file = f.name ? path.relative(dir, f.name) : "";
      for (const a of f.assertionResults ?? []) {
        const status: TestCase["status"] = a.status === "passed" ? "passed" : a.status === "failed" ? "failed" : "skipped";
        const t: TestCase = { name: a.fullName ?? a.title ?? "", file, status };
        if (a.failureMessages?.length) t.message = a.failureMessages.join("\n").slice(0, 1000);
        tests.push(t);
      }
    }
  } catch {
    out += "\n[no vitest JSON results found]";
  }
  return {
    command,
    ok: failed === 0 && total > 0,
    passed,
    failed,
    skipped,
    total,
    baseTotal: null,
    durationMs: Date.now() - started,
    tests,
    stdoutTail: out.slice(-2000),
  };
}

/** Deterministic count of test()/it() calls in test files on the base branch; null on error. */
export async function countBaseTests(dir: string, baseBranch: string): Promise<number | null> {
  try {
    const { stdout } = await run("git", ["-C", dir, "ls-tree", "-r", "--name-only", `origin/${baseBranch}`]);
    const files = stdout.split("\n").filter((f) => /^(test|tests|src)\/.*\.(test|spec)\.[cm]?[jt]sx?$/.test(f));
    let n = 0;
    for (const f of files) {
      const { stdout: src } = await run("git", ["-C", dir, "show", `origin/${baseBranch}:${f}`]);
      n += (src.match(/^\s*(test|it)\(/gm) ?? []).length;
    }
    return n;
  } catch {
    return null;
  }
}

/** Posts a PR comment from a temp file and returns the comment URL gh prints. */
export async function postComment(repo: string, number: number, markdown: string): Promise<string> {
  const file = path.join(os.tmpdir(), `settle-comment-${number}-${Date.now()}.md`);
  fs.writeFileSync(file, markdown);
  try {
    const { stdout } = await run("gh", ["pr", "comment", String(number), "--repo", repo, "--body-file", file]);
    return stdout.trim().split("\n").pop() ?? "";
  } finally {
    fs.rmSync(file, { force: true });
  }
}
