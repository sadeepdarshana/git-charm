import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FastTooltip } from '../../shared/FastTooltip';
import { Codicon } from '../../shared/Codicon';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon: string;
  danger?: boolean;
  separator?: false;
}
export interface ContextMenuSeparator {
  separator: true;
}
export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

interface Props {
  iconOnly?: boolean;
  rowItemIds?: string[];
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onSelect, onClose, iconOnly = false, rowItemIds = [] }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; maxHeight?: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    const margin = 4;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const px = Math.max(margin, Math.min(x, vw - w - margin));
    let py = y;
    let maxHeight: number | undefined;
    if (y + h + margin > vh) {
      const topIfUp = y - h;
      if (topIfUp >= margin) {
        py = topIfUp;
      } else {
        py = margin;
        maxHeight = vh - margin * 2;
      }
    }
    setPos({ x: px, y: py, maxHeight });
  }, [x, y, iconOnly, items.length]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler, true);
    document.addEventListener('keydown', keyHandler);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('mousedown', handler, true);
      document.removeEventListener('keydown', keyHandler);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  const style: React.CSSProperties = {
    position: 'fixed',
    top: pos?.y ?? y,
    left: pos?.x ?? x,
    zIndex: 9999,
    visibility: pos ? 'visible' : 'hidden',
    ...(pos?.maxHeight ? { maxHeight: pos.maxHeight, overflowY: 'auto' as const } : {}),
  };

  return (
    <div ref={ref} role={iconOnly && !rowItemIds.length ? 'toolbar' : undefined} aria-label={iconOnly ? 'Repository actions' : undefined}
      style={{ ...styles.menu, ...style, ...(iconOnly ? { display: 'flex', flexWrap: 'wrap', gap: 2, padding: 4, minWidth: 0, width: rowItemIds.length ? 208 : undefined, maxWidth: 'calc(100vw - 8px)', overflowX: 'auto' } : {}) }}
      onKeyDown={event => {
        if (!iconOnly || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'ArrowRight' ? (current + 1) % buttons.length : (current <= 0 ? buttons.length - 1 : current - 1);
        buttons[next]?.focus();
      }}>
      {items.map((item, i) => {
        if ('separator' in item && item.separator) {
          return iconOnly ? null : <div key={i} style={styles.separator} />;
        }
        const it = item as ContextMenuItem;
        const isIcon = iconOnly && !rowItemIds.includes(it.id);
        const Tag = iconOnly ? 'button' : 'div';
        const button = (
          <Tag
            type={iconOnly ? 'button' : undefined}
            title={isIcon ? it.label : undefined}
            aria-label={iconOnly ? it.label : undefined}
            key={it.id}
            style={{ ...styles.item(!!it.danger), ...(isIcon ? { width: 30, height: 28, flexShrink: 0, justifyContent: 'center', padding: 0, border: 0, borderRadius: 3 } : iconOnly ? { flexBasis: '100%', width: '100%', border: 0, borderRadius: 3, font: 'inherit', textAlign: 'left' } : {}) }}
            onClick={() => { onSelect(it.id); onClose(); }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--vscode-menu-selectionBackground)'; e.currentTarget.style.color = it.danger ? 'var(--vscode-errorForeground)' : 'var(--vscode-menu-selectionForeground)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = it.danger ? 'var(--vscode-errorForeground)' : 'var(--vscode-menu-foreground, var(--vscode-foreground))'; }}
          >
            <Codicon name={it.icon} style={styles.icon} />
            {!isIcon && <span>{it.label}</span>}
          </Tag>
        );
        return isIcon ? <FastTooltip key={it.id} label={it.label}>{button}</FastTooltip> : button;
      })}
    </div>
  );
}

const styles = {
  menu: {
    background: 'var(--vscode-menu-background, var(--vscode-editor-background))',
    border: '1px solid var(--vscode-menu-border, var(--vscode-panel-border))',
    borderRadius: '4px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    minWidth: '180px',
    padding: '4px 0',
    fontSize: '12px',
    color: 'var(--vscode-menu-foreground, var(--vscode-foreground))',
    userSelect: 'none' as const,
  },
  item: (danger: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '5px 12px',
    cursor: 'pointer',
    background: 'transparent',
    color: danger
      ? 'var(--vscode-errorForeground)'
      : 'var(--vscode-menu-foreground, var(--vscode-foreground))',
    transition: 'background 0.08s',
  }),
  icon: {
    fontSize: '14px',
    opacity: 0.8,
    flexShrink: 0,
  },
  separator: {
    height: '1px',
    background: 'var(--vscode-menu-separatorBackground, var(--vscode-panel-border))',
    margin: '4px 0',
  } as React.CSSProperties,
};
