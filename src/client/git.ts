import { execa } from "execa";
import { HarnessError } from "../shared/errors.js";

export class GitOps {
  private repoDir: string;

  constructor(repoDir: string) {
    this.repoDir = repoDir;
  }

  private async run(args: string[]): Promise<string> {
    try {
      const result = await execa("git", args, { cwd: this.repoDir });
      return result.stdout;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      throw new HarnessError("GIT_FAILED", `git ${args.join(" ")} failed: ${message}`);
    }
  }

  async init(): Promise<void> {
    await this.run(["init"]);
  }

  async commit(message: string): Promise<string> {
    await this.run(["add", "-A"]);

    // Check if there are staged changes
    try {
      await execa("git", ["diff", "--cached", "--quiet"], {
        cwd: this.repoDir,
      });
      // No diff — nothing to commit
      return this.getCurrentCommit();
    } catch {
      // There are changes to commit
    }

    await this.run(["commit", "-m", message]);
    return this.getCurrentCommit();
  }

  async getCurrentCommit(): Promise<string> {
    return this.run(["rev-parse", "HEAD"]);
  }

  async checkout(commit: string): Promise<void> {
    await this.run(["checkout", commit]);
  }

  async log(
    n: number = 10,
  ): Promise<Array<{ hash: string; message: string; timestamp: number }>> {
    const output = await this.run([
      "log",
      `-${n}`,
      "--format=%H|%s|%at",
    ]);
    if (!output.trim()) return [];
    return output
      .trim()
      .split("\n")
      .map((line) => {
        const [hash, message, ts] = line.split("|");
        return { hash, message, timestamp: parseInt(ts, 10) * 1000 };
      });
  }

  async diff(from: string, to: string): Promise<string> {
    return this.run(["diff", from, to]);
  }
}
