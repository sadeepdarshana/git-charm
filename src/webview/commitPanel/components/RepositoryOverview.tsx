import React, { useEffect, useRef, useState } from 'react';
import type { RepoMeta, RepoStatus } from '../../shared/types';
import { branchColor, tagColor } from '../../shared/branchColors';
import { Codicon } from '../../shared/Codicon';
import { BranchPopup } from './BranchPopup';
import { getVsCodeApi } from '../../shared/vscodeApi';
import { ScrollArea } from '../../shared/ScrollArea';

interface Props {
  repos: RepoStatus[];
  repoMetas: RepoMeta[];
  onOpenLog: (repoId: string) => void;
  onRepoAction: (id: string, repoId: string) => void;
}

export function RepositoryOverview({ repos, repoMetas, onOpenLog, onRepoAction }: Props) {
  const [branchMenu, setBranchMenu] = useState<{ repoId: string; x: number; y: number; key: number } | null>(null);
  const pane = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hoveringDivider, setHoveringDivider] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [preferredWidth, setPreferredWidth] = useState<number | null>(() => {
    const saved = getVsCodeApi().getState<{ repositoryPaneWidth?: number }>()?.repositoryPaneWidth;
    return typeof saved === 'number' && Number.isFinite(saved) && saved > 0 ? saved : null;
  });
  useEffect(() => {
    const parent = pane.current?.parentElement;
    if (!parent) return;
    const update = () => setContainerWidth(parent.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  const maxWidth = Math.max(0, containerWidth - Math.min(180, containerWidth / 2));
  const minWidth = Math.min(180, maxWidth);
  const clampWidth = (value: number) => Math.max(minWidth, Math.min(value, maxWidth));
  const defaultWidth = Math.min(500, Math.max(380, containerWidth * 0.4));
  const width = containerWidth > 0 ? clampWidth(preferredWidth ?? defaultWidth) : preferredWidth ?? 380;
  const resize = (value: number | null) => {
    const next = value === null ? null : clampWidth(value);
    setPreferredWidth(next);
    const api = getVsCodeApi();
    api.setState({ ...api.getState<Record<string, unknown>>(), repositoryPaneWidth: next });
  };
  const metaMap = new Map(repoMetas.map(meta => [meta.id, meta]));

  return (
    <aside ref={pane} style={{ ...styles.sidebar, width }} aria-label="Workspace repositories">
      <div role="separator" aria-label="Resize repository list" aria-orientation="vertical"
        aria-valuemin={Math.round(minWidth)} aria-valuemax={Math.round(maxWidth)} aria-valuenow={Math.round(width)} tabIndex={0}
        title="Drag to resize · Double-click to reset"
        style={{ position: 'absolute', top: 0, bottom: 0, left: -3, width: 7, zIndex: 10, cursor: 'col-resize', touchAction: 'none', userSelect: 'none', outlineOffset: -2 }}
        onMouseEnter={() => setHoveringDivider(true)} onMouseLeave={() => setHoveringDivider(false)}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, width };
          setDragging(true);
        }}
        onPointerMove={event => {
          if (drag.current) resize(drag.current.width + drag.current.x - event.clientX);
        }}
        onPointerUp={event => {
          drag.current = null;
          setDragging(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={() => { drag.current = null; setDragging(false); }}
        onPointerCancel={() => { drag.current = null; setDragging(false); }}
        onDoubleClick={() => resize(null)}
        onKeyDown={event => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            resize(width + (event.key === 'ArrowLeft' ? 1 : -1) * (event.shiftKey ? 50 : 10));
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            resize(event.key === 'Home' ? minWidth : maxWidth);
          }
        }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 3, width: dragging || hoveringDivider ? 2 : 1, background: dragging || hoveringDivider ? 'var(--vscode-sash-hoverBorder, var(--vscode-focusBorder))' : 'var(--vscode-panel-border)' }} />
      </div>
      <ScrollArea style={styles.list}>
        {repos.map(repo => (
          <RepositoryRow
            key={repo.repoId}
            repo={repo}
            meta={metaMap.get(repo.repoId)}
            onBranchMenu={(event, repoId) => setBranchMenu({ repoId, x: event.clientX, y: event.clientY, key: Date.now() })}
            onOpenLog={onOpenLog}
            onContextMenu={(event, repoId) => { event.preventDefault(); event.stopPropagation(); setBranchMenu({ repoId, x: event.clientX, y: event.clientY, key: Date.now() }); }}
          />
        ))}
      </ScrollArea>
      {branchMenu && <BranchPopup key={branchMenu.key} repoId={branchMenu.repoId} x={branchMenu.x} y={branchMenu.y} onClose={() => setBranchMenu(null)}
        onRepoAction={id => onRepoAction(id, branchMenu.repoId)}
        repositoryItems={(() => {
          const repo = repos.find(repo => repo.repoId === branchMenu.repoId);
          const count = new Set([...(repo?.stagedFiles ?? []), ...(repo?.unstagedFiles ?? [])].map(file => file.path)).size;
          return [
            ...(count ? [
              { id: 'rollback', label: `$(discard) Rollback ${count} file${count === 1 ? '' : 's'}`, separator: false },
              { id: 'shelve', label: '$(archive) Shelve Changes', separator: false },
              { id: 'stash', label: '$(git-stash) Stash Changes', separator: false },
            ] : []),
            ...[
              ['view-git-log', 'git-commit', 'View Git Log'],
              ['refresh', 'refresh', 'Refresh'],
            ].map(([id, icon, label]) => ({ id, label: `$(${icon}) ${label}`, separator: false, toolbar: true })),
          ];
        })()} /> }
    </aside>
  );
}

function RepositoryRow({ repo, meta, onBranchMenu, onOpenLog, onContextMenu }: {
  repo: RepoStatus;
  meta?: RepoMeta;
  onBranchMenu: (event: React.MouseEvent, repoId: string) => void;
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
      <button
        type="button"
        style={{ ...styles.branchTag, color: branchTint, borderColor: `${branchTint}66`, background: `${branchTint}14` }}
        title={`Right-click for branches and actions in ${name}`}
        aria-haspopup="dialog"
        onClick={event => event.stopPropagation()}
        onDoubleClick={event => event.stopPropagation()}
        onContextMenu={event => {
          event.preventDefault();
          event.stopPropagation();
          onBranchMenu(event, repo.repoId);
        }}
      >
        <Codicon name={repo.isDetachedHead ? 'git-commit' : 'git-branch'} style={styles.branchIcon} />
        <span style={styles.branchName}>{branchName}</span>
      </button>
      </span>

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
    position: 'relative', minWidth: 0, flexShrink: 0,
    display: 'flex', flexDirection: 'column' as const, minHeight: 0,
    borderLeft: '1px solid var(--vscode-panel-border)',
    background: 'var(--vscode-sideBar-background)',
  } as React.CSSProperties,
  list: { flex: 1, minHeight: 0 },
  row: (hovered: boolean): React.CSSProperties => ({
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto 18px',
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
    flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
    fontSize: '11px', fontWeight: 650,
  },
  logButton: (visible: boolean): React.CSSProperties => ({
    width: '17px', height: '18px', padding: 0, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', borderRadius: '3px', background: 'transparent', color: 'var(--vscode-foreground)',
    fontSize: '11px', cursor: 'pointer', opacity: visible ? 0.65 : 0,
  }),
  branchTag: {
    display: 'flex', alignItems: 'center', gap: '3px', minWidth: 0, maxWidth: '50%', flexShrink: 0, height: '18px',
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
