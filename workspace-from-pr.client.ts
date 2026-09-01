import { usePaseo } from "@getpaseo/plugin";

type Paseo = ReturnType<typeof usePaseo>;

export async function createPullRequestWorkspace(input: {
  paseo: Paseo;
  rootPath: string;
  number: number;
  title: string;
}): Promise<{ workspaceId: string }> {
  const workspace = await input.paseo.workspaces.create({
    title: `#${input.number} ${input.title}`,
    source: {
      kind: "worktree",
      cwd: input.rootPath,
      action: "checkout",
      checkoutSource: {
        kind: "change_request",
        forge: "github",
        number: input.number,
      },
    },
  });
  return { workspaceId: workspace.id };
}

export async function createRepoWorkspace(input: {
  paseo: Paseo;
  rootPath: string;
  title: string;
}): Promise<{ workspaceId: string }> {
  const workspace = await input.paseo.workspaces.create({
    title: input.title,
    source: {
      kind: "worktree",
      cwd: input.rootPath,
      action: "branch-off",
      baseBranch: "origin/HEAD",
    },
  });
  return { workspaceId: workspace.id };
}
