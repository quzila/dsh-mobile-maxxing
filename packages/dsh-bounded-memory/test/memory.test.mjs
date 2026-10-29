import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { operate } from "../index.js";

async function temporaryHome(run) {
  const home = await mkdtemp(join(tmpdir(), "dsh-bounded-memory-"));
  try { await run(home); } finally { await rm(home, { recursive: true, force: true }); }
}

test("saving and removing memory preserves existing AGENTS.md instructions", async () => temporaryHome(async (home) => {
  const path = join(home, "AGENTS.md");
  await writeFile(path, "# My instructions\nKeep this line.\n");
  const saved = await operate(home, { action: "add", target: "user", content: "  Prefer concise answers.  " });
  assert.deepEqual(saved.entries, ["Prefer concise answers."]);
  assert.equal(saved.effective, "next session");
  await operate(home, { action: "add", target: "memory", content: "Project uses DSH." });
  await operate(home, { action: "add", target: "user", content: "Prefer concise answers." });
  let instructions = await readFile(path, "utf8");
  assert.match(instructions, /^# My instructions\nKeep this line\./);
  assert.equal(instructions.split("Prefer concise answers.").length - 1, 1);
  assert.match(instructions, /Project uses DSH\./);
  await operate(home, { action: "remove", target: "user", content: "Prefer concise answers." });
  instructions = await readFile(path, "utf8");
  assert.doesNotMatch(instructions, /Prefer concise answers/);
  assert.match(instructions, /Project uses DSH/);
}));

test("memory limits fail without changing the saved file", async () => temporaryHome(async (home) => {
  const original = await operate(home, { action: "add", target: "memory", content: "Keep this fact." });
  assert.deepEqual(original.entries, ["Keep this fact."]);
  await assert.rejects(operate(home, { action: "add", target: "memory", content: "x".repeat(1001) }), /1–1000/);
  await operate(home, { action: "add", target: "memory", content: "a".repeat(1000) });
  await operate(home, { action: "add", target: "memory", content: "b".repeat(1000) });
  await assert.rejects(operate(home, { action: "add", target: "memory", content: "c".repeat(200) }), /limit exceeded/);
  const current = await operate(home, { action: "read", target: "memory" });
  assert.equal(current.entries.length, 3);
}));

test("ambiguous managed markers and symlinked AGENTS.md are refused", async () => temporaryHome(async (home) => {
  const path = join(home, "AGENTS.md");
  await writeFile(path, "<!-- dsh-bounded-memory:start -->\n");
  await assert.rejects(operate(home, { action: "add", target: "user", content: "hello" }), /ambiguous/);
  await rm(path);
  const outside = join(home, "outside.md");
  await writeFile(outside, "outside\n");
  await symlink(outside, path);
  await assert.rejects(operate(home, { action: "add", target: "user", content: "hello" }), /symlink/);
  assert.equal(await readFile(outside, "utf8"), "outside\n");
}));

test("missing or changed memory data is not silently overwritten", async () => temporaryHome(async (home) => {
  await operate(home, { action: "add", target: "user", content: "Keep this preference." });
  const path = join(home, "AGENTS.md");
  const original = await readFile(path, "utf8");
  await writeFile(path, original.replace("Keep this preference.", "Changed preference."));
  await assert.rejects(operate(home, { action: "add", target: "user", content: "Another preference." }), /differs/);
  assert.match(await readFile(path, "utf8"), /Changed preference/);
  await writeFile(path, original);
  const storePath = join(home, "memories", "bounded-memory.json");
  await rm(storePath);
  await assert.rejects(operate(home, { action: "add", target: "user", content: "Another preference." }), /store is missing/);
  const outside = join(home, "outside.json");
  await writeFile(outside, '{}');
  await symlink(outside, storePath);
  await assert.rejects(operate(home, { action: "read", target: "user" }), /symlink/);
}));
