import { execSync } from "node:child_process";

// Always read git fresh per request so the badge reflects the running tree.
export const dynamic = "force-dynamic";

function git(args: string): string {
  try {
    return execSync(`git ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

export async function GET() {
  const sha = git("rev-parse --short HEAD");
  const branch = git("rev-parse --abbrev-ref HEAD");
  const date = git("log -1 --format=%cd --date=short");
  const subject = git("log -1 --format=%s");
  const dirty = git("status --porcelain").length > 0; // working tree has uncommitted changes
  return Response.json({ sha, branch, date, subject, dirty });
}
