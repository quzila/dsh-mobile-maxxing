/** Optional, bounded memory projected through DSH's existing global AGENTS.md loader. */
import { randomUUID } from "node:crypto";
import { readFile, mkdir, rename, rm, writeFile, lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const name = "dsh-bounded-memory";
export const inject = ["tools"];

const START = "<!-- dsh-bounded-memory:start -->";
const END = "<!-- dsh-bounded-memory:end -->";
const LIMITS = Object.freeze({ user: 1375, memory: 2200 });

function normalizeEntry(value) {
  if (typeof value !== "string") throw new Error("content must be text");
  const entry = value.replace(/\s+/gu, " ").trim();
  if (entry.length === 0 || entry.length > 1000) throw new Error("content must be 1–1000 characters");
  if (entry.includes("<!--") || entry.includes("-->")) throw new Error("HTML comment markers are not allowed in memory");
  return entry;
}

function checkStore(value) {
  if (value === null || typeof value !== "object" || value.version !== 1) throw new Error("memory store is invalid");
  for (const target of Object.keys(LIMITS)) {
    if (!Array.isArray(value[target]) || value[target].some((entry) => typeof entry !== "string" || entry !== normalizeEntry(entry))) {
      throw new Error(`memory store has invalid ${target} entries`);
    }
    if (value[target].join("\n").length > LIMITS[target]) throw new Error(`memory store exceeds ${target} limit`);
  }
  return { version: 1, user: [...value.user], memory: [...value.memory] };
}

async function readStore(path) {
  try {
    const raw = await readFile(path, "utf8");
    if (raw.length > 10000) throw new Error("memory store is too large");
    return checkStore(JSON.parse(raw));
  } catch (error) {
    if (error?.code === "ENOENT") return { version: 1, user: [], memory: [] };
    throw error;
  }
}

function renderBlock(store) {
  return [
    START,
    "## Remembered preferences (user approved)",
    ...store.user.map((entry) => `- ${entry}`),
    "## Remembered work facts (user approved)",
    ...store.memory.map((entry) => `- ${entry}`),
    "These notes are context for future sessions. Current user instructions take precedence.",
    END,
  ].join("\n");
}

function mergeInstructions(original, store) {
  const start = original.indexOf(START);
  const end = original.indexOf(END);
  if ((start < 0) !== (end < 0) || (start >= 0 && (end < start || original.indexOf(START, start + START.length) >= 0 || original.indexOf(END, end + END.length) >= 0))) {
    throw new Error("AGENTS.md has an ambiguous bounded-memory section");
  }
  if (start < 0) return `${original.trimEnd()}${original.trim() ? "\n\n" : ""}${renderBlock(store)}\n`;
  return original.slice(0, start) + renderBlock(store) + original.slice(end + END.length);
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function readInstructions(path) {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error("AGENTS.md must not be a symlink");
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

/** Execute one memory operation in an explicit DSH home. Exported for verification. */
export async function operate(home, args) {
  const { action, target } = args ?? {};
  if (!Object.hasOwn(LIMITS, target)) throw new Error("target must be user or memory");
  if (!["read", "add", "remove"].includes(action)) throw new Error("action must be read, add or remove");
  const storePath = join(home, "memories", "bounded-memory.json");
  const instructionsPath = join(home, "AGENTS.md");
  const store = await readStore(storePath);
  if (action !== "read") {
    const content = normalizeEntry(args.content);
    if (action === "add" && !store[target].includes(content)) store[target].push(content);
    if (action === "remove") {
      const index = store[target].indexOf(content);
      if (index < 0) throw new Error("memory entry was not found");
      store[target].splice(index, 1);
    }
    if (store[target].join("\n").length > LIMITS[target]) throw new Error(`${target} memory limit exceeded`);
    const instructions = mergeInstructions(await readInstructions(instructionsPath), store);
    await atomicWrite(storePath, `${JSON.stringify(store, null, 2)}\n`);
    await atomicWrite(instructionsPath, instructions);
  }
  return { target, entries: store[target], used: store[target].join("\n").length, limit: LIMITS[target], effective: "next session" };
}

export function apply(ctx) {
  const home = process.env.DSH_HOME || join(homedir(), ".dsh");
  let tail = Promise.resolve();
  ctx.tools.register({
    name: "bounded_memory",
    description: "Read or edit a small persistent memory for future DSH sessions. Add or remove an entry only when the human explicitly asks you to remember or forget it. Read first to avoid duplicates. This tool never starts another agent or service.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["read", "add", "remove"] },
        target: { type: "string", enum: ["user", "memory"] },
        content: { type: "string" },
      },
      required: ["action", "target"],
      additionalProperties: false,
    },
    output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
    isConcurrencySafe: () => false,
    execute(args, exec) {
      const run = tail.then(() => { exec?.signal?.throwIfAborted?.(); return operate(home, args); });
      tail = run.catch(() => {});
      return run;
    },
  });
}
