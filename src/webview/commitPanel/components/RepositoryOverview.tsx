import React, { useState } from 'react';
import type { RepoMeta, RepoStatus } from '../../shared/types';
import { branchColor, tagColor } from '../../shared/branchColors';
import { Codicon } from '../../shared/Codicon';
import { ScrollArea } from '../../shared/ScrollArea';

interface Props {
  repos: RepoStatus[];
  repoMetas: RepoMeta[];
  onBranchClick: (repoId: string) => void;
  onOpenLog: (repoId: string) => void;
  onContextMenu: (event: React.MouseEvent, repoId: string) => void;
}

export function RepositoryOverview({ repos, repoMetas, onBranchClick, onOpenLog, onContextMenu }: Props) {
  const metaMap = new Map(repoMetas.map(meta => [meta.id, meta]));

  return (
    <aside style={styles.sidebar} aria-label="Workspace repositories">
      <ScrollArea style={styles.list}>
        {repos.map(repo => (
          <RepositoryRow
            key={repo.repoId}
            repo={repo}
            meta={metaMap.get(repo.repoId)}
            onBranchClick={onBranchClick}
            onOpenLog={onOpenLog}
            onContextMenu={onContextMenu}
          />
        ))}
      </ScrollArea>
    </aside>
  );
}

function RepositoryRow({ repo, meta, onBranchClick, onOpenLog, onContextMenu }: {
  repo: RepoStatus;
  meta?: RepoMeta;
  onBranchClick: (repoId: string) => void;
  onOpenLog: (repoId: string) => void;
  onContextMenu: (event: React.MouseEvent, repoId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const name = meta?.name ?? repo.repoId.split('/').pop() ?? repo.repoId;
  const color = meta?.color ?? '#6aaed0';
  const branchName = repo.branch.detachedTag ?? repo.branch.detachedHash ?? (repo.branch.name || 'HEAD');
  const branchTint = repo.branch.detachedTag ? tagColor() : branchColor(repo.branch.name, false);
  const changedPaths = new Set([...repo.stagedFiles.map(file => file.path), ...repo.unstagedFiles.map(file => file.path)]);
  const ahead = repo.branch.aheadBehind?.ahead ?? 0;
  const behind = repo.branch.aheadBehind?.behind ?? 0;

  return (
    <div
      style={styles.row(hovered)}
      title={`${name}\n${repo.isDetachedHead ? 'Detached at' : 'On branch'} ${branchName}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={() => onOpenLog(repo.repoId)}
      onContextMenu={event => onContextMenu(event, repo.repoId)}
    >
      <span style={styles.repoIdentity}>
        <span style={styles.repoDotWrap}>
          <span style={{ ...styles.repoDotHalo, background: color }} />
          <span style={{ ...styles.repoDot, background: color }} />
        </span>
        <span style={styles.repoName}>{name}</span>
      </span>
      <button
        type="button"
        style={{ ...styles.branchTag, color: branchTint, borderColor: `${branchTint}66`, background: `${branchTint}14` }}
        title={`Switch branch for ${name}`}
        onClick={() => onBranchClick(repo.repoId)}
      >
        <Codicon name={repo.isDetachedHead ? 'git-commit' : 'git-branch'} style={styles.branchIcon} />
        <span style={styles.branchName}>{branchName}</span>
      </button>

      <span style={styles.statuses}>
        {changedPaths.size > 0 ? (
          <span style={styles.changeBadge} title={`${changedPaths.size} changed file${changedPaths.size === 1 ? '' : 's'}`}>
            <span style={styles.changeDot} />
            {changedPaths.size}
          </span>
        ) : (
          <Codicon name="check" style={styles.cleanIcon} title="Working tree clean" />
        )}
        {ahead > 0 && <span style={styles.syncCount} title={`${ahead} commit${ahead === 1 ? '' : 's'} ahead`}>↑{ahead}</span>}
        {behind > 0 && <span style={styles.syncCount} title={`${behind} commit${behind === 1 ? '' : 's'} behind`}>↓{behind}</span>}
      </span>
      <button
        type="button"
        style={styles.logButton(hovered)}
        title={`Open ${name} in Git Log`}
        onClick={() => onOpenLog(repo.repoId)}
      >
        <Codicon name="git-commit" />
      </button>
    </div>
  );
}

const styles = {
  sidebar: {
    width: 'clamp(380px, 40vw, 500px)', minWidth: '380px', flexShrink: 0,
    display: 'flex', flexDirection: 'column' as const, minHeight: 0,
    borderLeft: '1px solid var(--vscode-panel-border)',
    background: 'var(--vscode-sideBar-background)',
  } as React.CSSProperties,
  list: { flex: 1, minHeight: 0 },
  row: (hovered: boolean): React.CSSProperties => ({
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(110px, 150px) 46px 18px',
    columnGap: '8px', alignItems: 'center', minWidth: 0, height: '28px', boxSizing: 'border-box',
    padding: '3px 7px 3px 10px', borderBottom: '1px solid color-mix(in srgb, var(--vscode-panel-border) 45%, transparent)',
    background: hovered ? 'var(--vscode-list-hoverBackground)' : 'transparent',
    color: 'var(--vscode-foreground)', cursor: 'default', userSelect: 'none',
  }),
  repoIdentity: {
    display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0,
  },
  repoDotWrap: {
    position: 'relative' as const, width: '9px', height: '9px', flexShrink: 0,
  },
  repoDotHalo: {
    position: 'absolute' as const, inset: '-3px', borderRadius: '50%', opacity: 0.16,
  },
  repoDot: {
    position: 'absolute' as const, inset: '1px', borderRadius: '50%',
    boxShadow: '0 0 0 1px color-mix(in srgb, currentColor 16%, transparent)',
  },
  repoName: {
    flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
    fontSize: '11px', fontWeight: 650,
  },
  logButton: (visible: boolean): React.CSSProperties => ({
    width: '17px', height: '18px', padding: 0, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', borderRadius: '3px', background: 'transparent', color: 'var(--vscode-foreground)',
    fontSize: '11px', cursor: 'pointer', opacity: visible ? 0.65 : 0,
  }),
  branchTag: {
    display: 'flex', alignItems: 'center', gap: '3px', minWidth: 0, maxWidth: '100%', height: '18px', justifySelf: 'start',
    padding: '0 5px', border: '1px solid', borderRadius: '8px', cursor: 'pointer',
    fontFamily: 'var(--vscode-font-family)', fontSize: '9px', fontWeight: 600,
  } as React.CSSProperties,
  branchIcon: { fontSize: '10px', flexShrink: 0 } as React.CSSProperties,
  branchName: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  statuses: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', minWidth: 0 },
  changeBadge: {
    display: 'inline-flex', alignItems: 'center', gap: '2px', height: '16px', padding: '0 4px',
    borderRadius: '8px', background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)',
    fontSize: '9px', fontWeight: 700,
  },
  changeDot: { width: '4px', height: '4px', borderRadius: '50%', background: 'currentColor', opacity: 0.8 },
  cleanIcon: { fontSize: '11px', color: 'var(--vscode-testing-iconPassed, #73c991)', opacity: 0.75 } as React.CSSProperties,
  syncCount: { fontSize: '9px', fontWeight: 650, opacity: 0.62 },
};
