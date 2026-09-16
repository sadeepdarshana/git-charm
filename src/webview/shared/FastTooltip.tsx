import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Short-delay tooltip without adding a wrapper to flex layouts. */
export function FastTooltip({ label, children }: { label: string; children: React.ReactElement }) {
  const id = useId();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const anchor = useRef<HTMLElement | null>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const hide = () => { clearTimeout(timer.current); setVisible(false); };
  const show = (element: HTMLElement) => {
    clearTimeout(timer.current);
    anchor.current = element;
    timer.current = setTimeout(() => setVisible(true), 100);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!visible) return;
    window.addEventListener('blur', hide);
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      window.removeEventListener('blur', hide);
      window.removeEventListener('resize', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, [visible]);
  useLayoutEffect(() => {
    if (!visible || !anchor.current || !tooltip.current) return;
    const a = anchor.current.getBoundingClientRect();
    const t = tooltip.current.getBoundingClientRect();
    setPosition({
      left: Math.max(4, Math.min(a.left + (a.width - t.width) / 2, window.innerWidth - t.width - 4)),
      top: a.bottom + 6 + t.height <= window.innerHeight - 4 ? a.bottom + 6 : Math.max(4, a.top - t.height - 6),
    });
  }, [visible, label]);
  return <>
    {React.cloneElement(children, {
      title: undefined,
      'aria-describedby': visible ? id : undefined,
      onMouseEnter: (event: React.MouseEvent<HTMLElement>) => { children.props.onMouseEnter?.(event); show(event.currentTarget); },
      onMouseLeave: (event: React.MouseEvent<HTMLElement>) => { children.props.onMouseLeave?.(event); hide(); },
      onFocus: (event: React.FocusEvent<HTMLElement>) => { children.props.onFocus?.(event); show(event.currentTarget); },
      onBlur: (event: React.FocusEvent<HTMLElement>) => { children.props.onBlur?.(event); hide(); },
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => { hide(); children.props.onPointerDown?.(event); },
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => { if (event.key === 'Escape') hide(); children.props.onKeyDown?.(event); },
    })}
    {visible && createPortal(<div ref={tooltip} id={id} role="tooltip" style={{
      position: 'fixed', ...position, zIndex: 20000, pointerEvents: 'none',
      maxWidth: 'calc(100vw - 16px)', padding: '4px 7px', borderRadius: 3,
      background: 'var(--vscode-editorHoverWidget-background, var(--vscode-editor-background))',
      color: 'var(--vscode-editorHoverWidget-foreground, var(--vscode-foreground))',
      border: '1px solid var(--vscode-editorHoverWidget-border, var(--vscode-panel-border))',
      boxShadow: '0 2px 6px #0002', fontSize: 12,
    }}>{label}</div>, document.body)}
  </>;
}
