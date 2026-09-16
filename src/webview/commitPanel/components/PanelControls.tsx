import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Codicon } from '../../shared/Codicon';
import { FastTooltip } from '../../shared/FastTooltip';
import { ContextMenu } from './ContextMenu';

const views = [
  { id: 'changes', label: 'Changes', icon: 'source-control' },
  { id: 'shelf', label: 'Shelf', icon: 'archive' },
  { id: 'stash', label: 'Stash', icon: 'git-stash' },
  { id: 'worktree', label: 'Worktrees', icon: 'worktree' },
  { id: 'push', label: 'Push', icon: 'cloud-upload' },
] as const;
type Tab = typeof views[number]['id'];

export function PanelControls({ tab, mode, onTab, onRefresh, onExpand, onCollapse, onMode }: {
  tab: Tab; mode: 'flat' | 'tree'; onTab: (tab: Tab) => void; onRefresh: () => void;
  onExpand: () => void; onCollapse: () => void; onMode: (mode: 'flat' | 'tree') => void;
}) {
  const [menu, setMenu] = useState<{ kind: 'tabs' | 'options'; x: number; y: number } | null>(null);
  const active = views.find(view => view.id === tab)!;
  const open = (event: React.MouseEvent, kind: 'tabs' | 'options') => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({ kind, x: rect.left, y: rect.bottom + 3 });
  };
  const button = (label: string, icon: string, action: (event: React.MouseEvent) => void, dropdown = false) =>
    <FastTooltip key={label} label={label}><button type="button" aria-label={label} aria-haspopup={dropdown ? 'menu' : undefined}
      onClick={action} style={{ position: 'relative', width: 28, height: 28, padding: 0, border: 0, borderRadius: 3, background: 'transparent', color: 'var(--vscode-foreground)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      onMouseEnter={event => { event.currentTarget.style.background = 'var(--vscode-toolbar-hoverBackground)'; }}
      onMouseLeave={event => { event.currentTarget.style.background = 'transparent'; }}>
      <Codicon name={icon} style={{ fontSize: 16 }} />
      {dropdown && <span style={{ position: 'absolute', right: 2, bottom: 3, borderLeft: '3px solid transparent', borderRight: '3px solid transparent', borderTop: '3px solid currentColor' }} />}
    </button></FastTooltip>;
  return <div role="toolbar" aria-label="Panel view controls" style={{ display: 'flex', gap: 2, padding: '3px 5px', flexShrink: 0 }}>
    {button(`Select View — ${active.label}`, active.icon, event => open(event, 'tabs'), true)}
    {button('Refresh', 'refresh', onRefresh)}
    {tab === 'changes' && <>
      {button('Expand All', 'expand-all', onExpand)}
      {button('Collapse All', 'collapse-all', onCollapse)}
      {button('View Options', 'eye', event => open(event, 'options'), true)}
    </>}
    {menu && createPortal(<ContextMenu x={menu.x} y={menu.y}
      items={menu.kind === 'tabs' ? views.map(view => ({ ...view, icon: view.id === tab ? 'check' : view.icon })) : [
        { id: 'flat', label: 'Flat list', icon: mode === 'flat' ? 'check' : 'list-unordered' },
        { id: 'tree', label: 'Tree view', icon: mode === 'tree' ? 'check' : 'list-tree' },
      ]}
      onSelect={id => menu.kind === 'tabs' ? onTab(id as Tab) : onMode(id as 'flat' | 'tree')}
      onClose={() => setMenu(null)} />, document.body)}
  </div>;
}
