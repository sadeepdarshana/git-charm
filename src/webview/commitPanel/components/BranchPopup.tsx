import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getVsCodeApi } from '../../shared/vscodeApi';
import type { HostToCommitMsg, CommitToHostMsg } from '../../shared/msgTypes';
import { FastTooltip } from '../../shared/FastTooltip';
import { Codicon } from '../../shared/Codicon';

type Menu = Extract<HostToCommitMsg, { type: 'COMMIT_BRANCH_POPUP' }>;
const send = (message: CommitToHostMsg) => getVsCodeApi().postMessage(message);

export function BranchPopup({ repoId, x, y, onClose, repositoryItems = [], onRepoAction }: {
  repoId: string; x: number; y: number; onClose: () => void;
  repositoryItems?: Menu['items']; onRepoAction?: (id: string) => void;
}) {
  const [requestId] = useState(() => `${Date.now()}-${Math.random()}`);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [query, setQuery] = useState('');
  const [filterFocused, setFilterFocused] = useState(false);
  const [visible, setVisible] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useEffect(() => {
    const receive = (event: MessageEvent<HostToCommitMsg>) => {
      if (event.data.type !== 'COMMIT_BRANCH_POPUP' || event.data.requestId !== requestId) return;
      setMenu(event.data);
      setQuery('');
      setVisible(true);
    };
    window.addEventListener('message', receive);
    send({ type: 'COMMIT_OPEN_BRANCH_POPUP', repoId, requestId });
    return () => {
      window.removeEventListener('message', receive);
      send({ type: 'COMMIT_BRANCH_POPUP_CLOSE', requestId });
    };
  }, [repoId, requestId]);

  useLayoutEffect(() => {
    if (!visible || !ref.current) return;
    const bounds = ref.current.getBoundingClientRect();
    setPosition({
      left: Math.max(4, Math.min(x, window.innerWidth - bounds.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - bounds.height - 4)),
    });
    input.current?.focus();
  }, [x, y, menu, visible]);

  useEffect(() => {
    if (!visible) return;
    const outside = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    };
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', key);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('keydown', key);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [visible, onClose]);

  if (!visible) return null;
  const rootMenu = menu?.items.some(item => item.toolbar);
  const extras = rootMenu ? repositoryItems.map(item => ({ ...item, id: `repo:${item.id}` })) : [];
  const items = [...extras, ...(menu?.items ?? [])].filter(item => !query || (!item.toolbar && !item.separator && `${item.label} ${item.description ?? ''}`.toLowerCase().includes(query.toLowerCase()))) ?? [];
  const toolbarItems = query ? [] : items.filter(item => item.toolbar && !item.separator && !item.id.startsWith('repo:'));
  toolbarItems.push(...(query ? [] : extras.filter(item => item.toolbar)));
  const listItems = items.filter(item => !item.toolbar);
  while (listItems[0]?.separator && !listItems[0].label) listItems.shift();
  const select = (id: string) => {
    setVisible(false);
    if (id.startsWith('repo:')) { onRepoAction?.(id.slice(5)); onClose(); }
    else send({ type: 'COMMIT_BRANCH_POPUP_SELECT', requestId, menuId: menu!.menuId, id });
  };
  return createPortal(
    <div ref={ref} role="dialog" aria-label={menu?.title ?? 'Branch menu'} style={{
      position: 'fixed', ...position, zIndex: 10000, width: '320px', maxWidth: 'calc(100vw - 8px)',
      maxHeight: 'calc(100vh - 8px)', display: 'flex', flexDirection: 'column',
      background: 'var(--vscode-menu-background, var(--vscode-editor-background))',
      color: 'var(--vscode-menu-foreground, var(--vscode-foreground))',
      border: '1px solid var(--vscode-panel-border)', borderRadius: 5, boxShadow: '0 3px 12px #0004', padding: 4,
    }} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
      onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !(event.target as HTMLElement).closest('[role=toolbar]')) return;
        event.preventDefault();
        const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = (event.key === 'ArrowDown' || event.key === 'ArrowRight') ? (current + 1) % buttons.length : (current <= 0 ? buttons.length - 1 : current - 1);
        buttons[next]?.focus();
      }}>
      <strong style={{ padding: '6px 8px', fontSize: 12 }}>{menu?.title ?? 'Loading branches…'}</strong>
      <div style={{ position: 'relative', margin: '2px 4px 6px', display: 'flex', minWidth: 0 }}>
      <input ref={input} aria-label="Filter branch actions" placeholder="Filter branches and actions…" value={query}
        onChange={event => setQuery(event.target.value)}
        onFocus={() => setFilterFocused(true)} onBlur={() => setFilterFocused(false)}
        style={{
          width: '100%', boxSizing: 'border-box', minWidth: 0, padding: query ? '4px 32px 4px 6px' : '4px 6px', borderRadius: 3,
          outline: 'none', boxShadow: 'none',
          border: `1px solid color-mix(in srgb, var(--vscode-foreground) ${filterFocused ? '35%' : '18%'}, transparent)`,
          background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)',
        }} />
      {query.length > 0 && <button type="button" aria-label={`Create branch ${query.trim()}`} title={`Create branch “${query.trim()}”`}
        disabled={!query.trim()} onClick={() => {
          setVisible(false);
          send({ type: 'COMMIT_BRANCH_POPUP_CREATE', requestId, name: query.trim() });
        }} style={{ position: 'absolute', right: 3, top: 2, bottom: 2, width: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 3, background: 'transparent', color: 'var(--vscode-input-foreground)', cursor: query.trim() ? 'pointer' : 'default', opacity: query.trim() ? 1 : 0.4 }}
        onMouseEnter={event => { event.currentTarget.style.background = 'var(--vscode-menu-selectionBackground)'; }}
        onMouseLeave={event => { event.currentTarget.style.background = 'transparent'; }}>
        <Codicon name="add" style={{ fontSize: 16 }} />
      </button>}
      </div>
      {toolbarItems.length > 0 && <div role="toolbar" aria-label="Repository actions" style={{ display: 'flex', gap: 4, padding: '2px 4px 6px', flexShrink: 0 }}>
        {toolbarItems.map((item, index) => {
          const icon = item.label.match(/^\$\(([^)]+)\)\s*/);
          const label = item.label.replace(/^\$\([^)]+\)\s*/, '');
          return <React.Fragment key={item.id}>
            {index > 0 && item.toolbarGroup !== toolbarItems[index - 1].toolbarGroup &&
              <span role="separator" aria-orientation="vertical" style={{ width: 1, flexShrink: 0, margin: '4px 2px', background: 'var(--vscode-panel-border)' }} />}
            <FastTooltip label={label}><button type="button" aria-label={label} onClick={() => select(item.id)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '1 1 0', minWidth: 0, height: 28, padding: 0, border: 0, borderRadius: 3, background: 'transparent', color: 'inherit', cursor: 'pointer' }}
            onMouseEnter={event => { event.currentTarget.style.background = 'var(--vscode-menu-selectionBackground)'; }}
            onMouseLeave={event => { event.currentTarget.style.background = 'transparent'; }}>
            <Codicon name={icon?.[1] ?? 'circle-outline'} style={{ fontSize: 16 }} />
          </button></FastTooltip>
          </React.Fragment>;
        })}
      </div>}
      <div style={{ overflowY: 'auto', minHeight: 0 }}>
        {listItems.map(item => {
          if (item.separator) return <div key={item.id} style={{ borderTop: '1px solid var(--vscode-panel-border)', margin: '5px 4px', paddingTop: item.label ? 5 : 0, fontSize: 10, opacity: 0.7 }}>{item.label}</div>;
          const icon = item.label.match(/^\$\(([^)]+)\)\s*/);
          return <button key={item.id} type="button" title={item.description} onClick={() => select(item.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '6px 8px', border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit', fontSize: 12 }}
            onMouseEnter={event => { event.currentTarget.style.background = 'var(--vscode-menu-selectionBackground)'; }}
            onMouseLeave={event => { event.currentTarget.style.background = 'transparent'; }}>
            {icon && <Codicon name={icon[1]} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label.replace(/^\$\([^)]+\)\s*/, '')}</span>
            {item.description && <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</span>}
          </button>;
        })}
        {menu && items.length === 0 && <div style={{ padding: 8 }}>No matching actions or branches</div>}
      </div>
    </div>, document.body,
  );
}
