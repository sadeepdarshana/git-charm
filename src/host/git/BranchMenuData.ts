import simpleGit from 'simple-git';
import type { BranchInfo } from '../types/git';

export interface BranchMenuData {
  branches: BranchInfo[];
  currentBranch: BranchInfo;
  tags: Array<{ name: string; hash: string; date: string }>;
}

/** Read refs on a separate command queue: never scan the worktree or wait behind status. */
export async function readBranchMenuData(repoId: string, rootPath: string, pendingTag?: string): Promise<BranchMenuData> {
  const git = simpleGit(rootPath);
  const [headName, output] = await Promise.all([
    git.raw(['symbolic-ref', '--quiet', '--short', 'HEAD']).then(value => value.trim() || 'HEAD').catch(() => 'HEAD'),
    git.raw(['for-each-ref', '--sort=-committerdate', '--format=%(refname)%09%(objectname)%09%(*objectname)%09%(upstream:short)%09%(upstream:track)%09%(creatordate:iso-strict)', 'refs/heads/', 'refs/remotes/', 'refs/tags/']),
  ]);
  const branches: BranchInfo[] = [];
  const tags: BranchMenuData['tags'] = [];
  const tagCommits = new Map<string, string>();
  for (const line of output.trim().split('\n').filter(Boolean)) {
    const [fullName, hash, peeledHash, upstream, tracking = '', date = ''] = line.split('\t');
    if (fullName.startsWith('refs/tags/')) {
      const name = fullName.slice('refs/tags/'.length);
      tags.push({ name, hash: hash.slice(0, 8), date });
      tagCommits.set(name, peeledHash || hash);
      continue;
    }
    const isRemote = fullName.startsWith('refs/remotes/');
    const name = fullName.slice(isRemote ? 'refs/remotes/'.length : 'refs/heads/'.length);
    // Symbolic origin/HEAD aliases are not branch choices.
    if (isRemote && name.endsWith('/HEAD')) continue;
    const ahead = Number(tracking.match(/ahead (\d+)/)?.[1] ?? 0);
    const behind = Number(tracking.match(/behind (\d+)/)?.[1] ?? 0);
    branches.push({ repoId, name, fullName, isHead: !isRemote && headName === name, isRemote,
      remoteName: isRemote ? name.split('/')[0] : undefined, lastCommitHash: hash,
      upstream: upstream || undefined, aheadBehind: upstream && !tracking.includes('gone') ? { ahead, behind } : undefined });
  }
  let currentBranch = branches.find(branch => branch.isHead);
  if (!currentBranch) {
    const detached = headName === 'HEAD';
    const hash = detached ? (await git.raw(['rev-parse', 'HEAD'])).trim() : undefined;
    const detachedTag = detached ? (pendingTag && tagCommits.get(pendingTag) === hash ? pendingTag : [...tagCommits].find(([, commit]) => commit === hash)?.[0]) : undefined;
    currentBranch = { repoId, name: headName, fullName: detached ? 'HEAD' : `refs/heads/${headName}`, isHead: true, isRemote: false,
      detachedTag, detachedHash: detached && !detachedTag ? hash?.slice(0, 8) : undefined,
      detachedFullHash: detached && !detachedTag ? hash : undefined };
  }
  tags.sort((a, b) => b.date.localeCompare(a.date));
  return { branches, currentBranch, tags };
}
