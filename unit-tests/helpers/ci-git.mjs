import { execFileSync } from "node:child_process";
import path from "node:path";

export function git(args, options = {}) {
    return execFileSync("git", args, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        env: {
            ...process.env,
            GIT_AUTHOR_NAME: "CI fixture",
            GIT_COMMITTER_NAME: "CI fixture",
            GIT_AUTHOR_EMAIL: "fixture@example.invalid",
            GIT_COMMITTER_EMAIL: "fixture@example.invalid",
            GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
            GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
        },
        ...options,
    }).trim();
}

export function createRemote(root) {
    const remote = path.join(root, "remote.git");
    git(["init", "--bare", remote]);
    const tree = git(
        ["-C", remote, "hash-object", "-t", "tree", "--stdin", "-w"],
        { input: "" },
    );
    const commits = [];
    for (const name of ["A", "B", "C"]) {
        commits.push(
            git([
                "-C",
                remote,
                "commit-tree",
                tree,
                "-m",
                name,
                ...(commits.length ? ["-p", commits.at(-1)] : []),
            ]),
        );
    }
    git(["-C", remote, "update-ref", "refs/heads/main", commits[0]]);
    return { remote, commits };
}

export function checkout(root, remote) {
    git(["init", root]);
    git(["-C", root, "remote", "add", "origin", remote]);
}
