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
      <div style={styles.header}>
        <span style={styles.headerLabel}>Repositories</span>
        <span style={styles.headerCount}>{repos.length}</span>
      </div>
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
      <span style={styles.repoDotWrap}>
        <span style={{ ...styles.repoDotHalo, background: color }} />
        <span style={{ ...styles.repoDot, background: color }} />
      </span>

      <div style={styles.content}>
        <div style={styles.nameLine}>
          <span style={styles.repoName}>{name}</span>
          {meta?.isWorktree && <span style={styles.kindTag}>worktree</span>}
          {meta?.isSubmodule && <span style={styles.kindTag}>submodule</span>}
          <button
            type="button"
            style={styles.logButton(hovered)}
            title={`Open ${name} in Git Log`}
            onClick={() => onOpenLog(repo.repoId)}
          >
            <Codicon name="git-commit" />
          </button>
        </div>

        <div style={styles.detailLine}>
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
        </div>
      </div>
    </div>
  );
}

const styles = {
  sidebar: {
    width: 'clamp(205px, 22vw, 280px)', minWidth: '205px', flexShrink: 0,
    display: 'flex', flexDirection: 'column' as const, minHeight: 0,
    borderLeft: '1px solid var(--vscode-panel-border)',
    background: 'var(--vscode-sideBar-background)',
  } as React.CSSProperties,
  header: {
    display: 'flex', alignItems: 'center', gap: '6px', minHeight: '28px',
    padding: '0 9px 0 11px', flexShrink: 0,
    borderBottom: '1px solid var(--vscode-panel-border)',
    background: 'var(--vscode-sideBarSectionHeader-background)',
  } as React.CSSProperties,
  headerLabel: {
    flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
    fontSize: '10px', fontWeight: 700, letterSpacing: '0.075em', textTransform: 'uppercase' as const,
    opacity: 0.72,
  },
  headerCount: {
    minWidth: '17px', height: '16px', padding: '0 5px', boxSizing: 'border-box' as const,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '8px', background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)',
    fontSize: '9px', fontWeight: 700,
  },
  list: { flex: 1, minHeight: 0 },
  row: (hovered: boolean): React.CSSProperties => ({
    display: 'flex', gap: '9px', alignItems: 'flex-start', minWidth: 0,
    padding: '8px 7px 8px 10px', borderBottom: '1px solid color-mix(in srgb, var(--vscode-panel-border) 55%, transparent)',
    background: hovered ? 'var(--vscode-list-hoverBackground)' : 'transparent',
    color: 'var(--vscode-foreground)', cursor: 'default', userSelect: 'none',
  }),
  repoDotWrap: {
    position: 'relative' as const, width: '10px', height: '10px', marginTop: '4px', flexShrink: 0,
  },
  repoDotHalo: {
    position: 'absolute' as const, inset: '-3px', borderRadius: '50%', opacity: 0.16,
  },
  repoDot: {
    position: 'absolute' as const, inset: '1px', borderRadius: '50%',
    boxShadow: '0 0 0 1px color-mix(in srgb, currentColor 16%, transparent)',
  },
  content: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' as const, gap: '5px' },
  nameLine: { display: 'flex', alignItems: 'center', minWidth: 0, gap: '5px', height: '18px' },
  repoName: {
    flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
    fontSize: '12px', fontWeight: 650,
  },
  kindTag: {
    flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
    padding: '0 4px', borderRadius: '6px', fontSize: '8px', lineHeight: '14px',
    border: '1px solid var(--vscode-panel-border)', opacity: 0.58, textTransform: 'uppercase' as const,
  },
  logButton: (visible: boolean): React.CSSProperties => ({
    width: '20px', height: '20px', marginLeft: 'auto', padding: 0, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', borderRadius: '3px', background: 'transparent', color: 'var(--vscode-foreground)',
    fontSize: '12px', cursor: 'pointer', opacity: visible ? 0.65 : 0,
  }),
  detailLine: { display: 'flex', alignItems: 'center', minWidth: 0, gap: '5px' },
  branchTag: {
    display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, maxWidth: '100%', height: '20px',
    padding: '0 6px', border: '1px solid', borderRadius: '9px', cursor: 'pointer',
    fontFamily: 'var(--vscode-font-family)', fontSize: '10px', fontWeight: 600,
  } as React.CSSProperties,
  branchIcon: { fontSize: '10px', flexShrink: 0 } as React.CSSProperties,
  branchName: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  statuses: { display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto', flexShrink: 0 },
  changeBadge: {
    display: 'inline-flex', alignItems: 'center', gap: '3px', height: '17px', padding: '0 5px',
    borderRadius: '8px', background: 'var(--vscode-badge-background)', color: 'var(--vscode-badge-foreground)',
    fontSize: '9px', fontWeight: 700,
  },
  changeDot: { width: '4px', height: '4px', borderRadius: '50%', background: 'currentColor', opacity: 0.8 },
  cleanIcon: { fontSize: '11px', color: 'var(--vscode-testing-iconPassed, #73c991)', opacity: 0.75 } as React.CSSProperties,
  syncCount: { fontSize: '9px', fontWeight: 650, opacity: 0.62 },
};
