import { describe, expect, test } from "bun:test";
import { readFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { expectPacketPathInvalid, expectReviewRequired, hmacHex, removeTempRepo, runBoulder, runCommand, sha256Hex, tempRepo, validHandoffPacket, write } from "./helpers/cli";

describe("boulder handoff safety e2e", () => {
  test("rejects stale review receipts after packet regeneration", async () => {
    const root = await tempRepo();
    try {
      await runBoulder(["handoff", "packet", "--cwd", root, "--adapter", "gajae-code"]);
      await runBoulder(["handoff", "review", "--cwd", root, "--adapter", "gajae-code"]);
      await write(root, "README.md", "# changed\n");
      await runBoulder(["handoff", "packet", "--cwd", root, "--adapter", "gajae-code"]);
      expectReviewRequired(await runBoulder(["handoff", "send", "--cwd", root, "--adapter", "gajae-code", "--approve-external"]));
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects forged and digest-only review receipts", async () => {
    const root = await tempRepo();
    try {
      const packet = await runBoulder(["handoff", "packet", "--cwd", root, "--adapter", "gajae-code", "--json"]);
      await write(root, ".boulder/handoffs/gajae-code.json.reviewed", "reviewed: forged\n");
      expectReviewRequired(await runBoulder(["handoff", "send", "--cwd", root, "--adapter", "gajae-code", "--approve-external"]));
      await write(root, ".boulder/handoffs/gajae-code.json.reviewed", [
        "schema: boulder.handoff.review.v1",
        "packet: gajae-code.json",
        `digest: ${await sha256Hex(packet.stdout)}`,
        ""
      ].join("\n"));
      expectReviewRequired(await runBoulder(["handoff", "send", "--cwd", root, "--adapter", "gajae-code", "--approve-external"]));
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects signed forged receipts with missing or signature approval codes", async () => {
    const root = await tempRepo();
    try {
      const packet = await runBoulder(["handoff", "packet", "--cwd", root, "--adapter", "gajae-code", "--json"]);
      const secret = "0123456789abcdef0123456789abcdef";
      const nonce = "abcdef0123456789abcdef0123456789";
      const signature = await hmacHex(secret, `receipt:${nonce}:${packet.stdout}`);
      await write(root, ".boulder/review-secret", `${secret}\n`);
      await write(root, ".boulder/handoffs/gajae-code.json.reviewed", [
        "schema: boulder.handoff.review.v1",
        "packet: gajae-code.json",
        `digest: ${await sha256Hex(packet.stdout)}`,
        `nonce: ${nonce}`,
        `signature: ${signature}`,
        `approval-digest: ${await sha256Hex(signature)}`,
        ""
      ].join("\n"));
      expectReviewRequired(await runBoulder(["handoff", "send", "--cwd", root, "--adapter", "gajae-code", "--approve-external"]));
      expectReviewRequired(await runBoulder(["handoff", "send", "--cwd", root, "--adapter", "gajae-code", "--approve-external", "--approval-code", signature]));
    } finally {
      await removeTempRepo(root);
    }
  });

  test("rejects symlink packet targets, handoff directories, review secrets, and nested packet dirs", async () => {
    const root = await tempRepo();
    try {
      await write(root, ".boulder/handoffs/.keep", "");
      await write(root, "outside.json", "{}");
      await symlink(join(root, "outside.json"), join(root, ".boulder/handoffs/gajae-code.json"));
      expectPacketPathInvalid(await runBoulder(["handoff", "packet", "--cwd", root, "--adapter", "gajae-code"]));
    } finally {
      await removeTempRepo(root);
    }

    const dirRoot = await tempRepo();
    try {
      await write(dirRoot, ".boulder/.keep", "");
      await write(dirRoot, "../outside-handoffs/.keep", "");
      await symlink(join(dirRoot, "../outside-handoffs"), join(dirRoot, ".boulder/handoffs"));
      expectPacketPathInvalid(await runBoulder(["handoff", "packet", "--cwd", dirRoot, "--adapter", "gajae-code"]));
    } finally {
      await removeTempRepo(dirRoot);
    }

    const secretRoot = await tempRepo();
    try {
      await runBoulder(["handoff", "packet", "--cwd", secretRoot, "--adapter", "gajae-code"]);
      await symlink(join(secretRoot, "../outside-review-secret.txt"), join(secretRoot, ".boulder/review-secret"));
      expectPacketPathInvalid(await runBoulder(["handoff", "review", "--cwd", secretRoot, "--adapter", "gajae-code"]));
    } finally {
      await removeTempRepo(secretRoot);
    }

    const nestedRoot = await tempRepo();
    try {
      await write(nestedRoot, ".boulder/handoffs/.keep", "");
      await write(nestedRoot, "../outside-packets/packet.json", JSON.stringify(validHandoffPacket("gajae-code")));
      await symlink(join(nestedRoot, "../outside-packets"), join(nestedRoot, ".boulder/handoffs/link"));
      expectPacketPathInvalid(await runBoulder(["handoff", "review", "--cwd", nestedRoot, "--packet", ".boulder/handoffs/link/packet.json"]));
    } finally {
      await removeTempRepo(nestedRoot);
    }
  });

  test("rejects hard-linked packet targets, review receipts, and review secrets", async () => {
    const root = await tempRepo();
    try {
      await write(root, ".boulder/handoffs/.keep", "");
      await write(root, "outside.json", "original\n");
      await hardLink(join(root, "outside.json"), join(root, ".boulder/handoffs/gajae-code.json"));
      expectPacketPathInvalid(await runBoulder(["handoff", "packet", "--cwd", root, "--adapter", "gajae-code"]));
      expect(await readFile(join(root, "outside.json"), "utf8")).toBe("original\n");
    } finally {
      await removeTempRepo(root);
    }

    const receiptRoot = await tempRepo();
    try {
      await runBoulder(["handoff", "packet", "--cwd", receiptRoot, "--adapter", "gajae-code"]);
      await write(receiptRoot, "outside.reviewed", "original\n");
      await hardLink(join(receiptRoot, "outside.reviewed"), join(receiptRoot, ".boulder/handoffs/gajae-code.json.reviewed"));
      expectPacketPathInvalid(await runBoulder(["handoff", "review", "--cwd", receiptRoot, "--adapter", "gajae-code"]));
      expect(await readFile(join(receiptRoot, "outside.reviewed"), "utf8")).toBe("original\n");
    } finally {
      await removeTempRepo(receiptRoot);
    }

    const secretRoot = await tempRepo();
    try {
      await runBoulder(["handoff", "packet", "--cwd", secretRoot, "--adapter", "gajae-code"]);
      await write(secretRoot, "outside-secret.txt", "original\n");
      await hardLink(join(secretRoot, "outside-secret.txt"), join(secretRoot, ".boulder/review-secret"));
      expectPacketPathInvalid(await runBoulder(["handoff", "review", "--cwd", secretRoot, "--adapter", "gajae-code"]));
      expect(await readFile(join(secretRoot, "outside-secret.txt"), "utf8")).toBe("original\n");
    } finally {
      await removeTempRepo(secretRoot);
    }
  });
});

async function hardLink(source: string, target: string): Promise<void> {
  const result = await runCommand(`ln ${shellQuote(source)} ${shellQuote(target)}`, process.cwd());
  if (result.exitCode !== 0) throw new Error(result.stderr);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
