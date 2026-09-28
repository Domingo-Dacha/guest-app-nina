import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readWorkflow = (name: string) =>
  readFileSync(resolve(process.cwd(), ".github", "workflows", name), "utf8");

describe("competition delivery workflow", () => {
  const autoMerge = readWorkflow("auto-merge.yml");
  const deploy = readWorkflow("deploy-production.yml");

  it("merges only successful Verify runs for trusted competition branches", () => {
    expect(autoMerge).toContain(
      "github.event.workflow_run.conclusion == 'success'",
    );
    expect(autoMerge).toContain('head_ref" != codex/*');
    expect(autoMerge).toContain('expected_author="domingonina-cmd"');
    expect(autoMerge).toContain('expected_author="mcklauss73"');
    expect(autoMerge).toContain('expected_author="Filippovski"');
    expect(autoMerge).toContain('head_sha" != "$RUN_HEAD_SHA');
    expect(autoMerge).toContain('current_base_sha" != "$tested_base_sha');
  });

  it("keeps sensitive infrastructure changes out of automatic merge", () => {
    expect(autoMerge).toContain(
      ".github/*|AGENTS.md|.env|.env.*|db/migrations/*",
    );
    expect(autoMerge).toContain("src/lib/auth/*|src/proxy.ts");
  });

  it("dispatches an exact merge SHA and verifies it before deployment", () => {
    expect(autoMerge).toContain('-f verified_sha="$MERGE_SHA"');
    expect(deploy).toContain(
      "inputs.verified_sha || github.event.workflow_run.head_sha",
    );
    expect(deploy).toContain(
      'git merge-base --is-ancestor "$VERIFIED_SHA" origin/main',
    );
    expect(deploy).toContain("npm run verify");
  });
});
