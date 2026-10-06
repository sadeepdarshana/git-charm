import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getVsCodeApi } from '../../shared/vscodeApi';
import type { CommitToHostMsg, HostToCommitMsg } from '../../shared/msgTypes';
import type { RepositoryScanOptions, GitRootReviewItem } from '../../../host/git/RepositoryScanner';

export function GitRootScanDialog({ onClose }: { onClose: () => void }) {
  const [options, setOptions] = useState<RepositoryScanOptions | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(() => `${Date.now()}-${Math.random()}`);
  const [review, setReview] = useState<{ id: string; roots: GitRootReviewItem[] } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showOptions, setShowOptions] = useState(true);
  const [applying, setApplying] = useState(false);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDivElement>(null);
  const send = (message: CommitToHostMsg) => getVsCodeApi().postMessage(message);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const listener = (event: MessageEvent<HostToCommitMsg>) => {
      if (event.data?.type === 'GIT_ROOT_SCAN_OPTIONS') {
        setOptions(event.data.options);
        setFolders(event.data.folders);
      } else if (event.data?.type === 'GIT_ROOT_SCAN_RESULT' && event.data.requestId === requestId) {
        setBusy(false);
        setSummary(event.data.summary ?? '');
        setError(event.data.error ?? '');
        if (event.data.reviewId && event.data.roots) {
          setReview({ id: event.data.reviewId, roots: event.data.roots });
          setShowOptions(false);
          setSelected(new Set(event.data.roots.filter(root => root.existing).map(root => root.rootPath)));
        }
      } else if (event.data?.type === 'GIT_ROOT_SCAN_APPLIED' && event.data.requestId === requestId) {
        setBusy(false); setApplying(false);
        setSummary(event.data.summary ?? '');
        setError(event.data.error ?? '');
        if (!event.data.error) { setReview(null); setShowOptions(true); }
      }
    };
    window.addEventListener('message', listener);
    send({ type: 'GIT_ROOT_SCAN_GET_OPTIONS' });
    dialog.current?.focus();
    return () => { window.removeEventListener('message', listener); previousFocus?.focus(); };
  }, []);
  let validation = '';
  if (options?.ignoreEnabled && options.mode === 'regex') {
    try { new RegExp(options.patterns); } catch { validation = 'Enter a valid regular expression.'; }
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', color: 'var(--vscode-input-foreground)',
    background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-input-border, transparent)', padding: 6,
  };
  const buttonStyle: React.CSSProperties = { padding: '5px 12px', border: 0, cursor: 'pointer', color: 'var(--vscode-button-secondaryForeground)', background: 'var(--vscode-button-secondaryBackground)' };
  return createPortal(<div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="git-root-scan-title" tabIndex={-1}
      onKeyDown={event => {
        if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose(); }
        if (event.key === 'Tab') {
          const elements = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)');
          if (!elements?.length) { event.preventDefault(); return; }
          const first = elements[0], last = elements[elements.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
        }
      }}
      style={{ boxSizing: 'border-box', width: 510, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', padding: 18, border: '1px solid var(--vscode-widget-border)', background: 'var(--vscode-editorWidget-background)', color: 'var(--vscode-foreground)', boxShadow: '0 4px 16px var(--vscode-widget-shadow)', borderRadius: 5 }}>
      <h2 id="git-root-scan-title" style={{ fontSize: 15, margin: '0 0 12px' }}>Analyze for Git Roots</h2>
      <p>Recursively scan all folders in this workspace, including nested repositories. Review the results and check the roots to manage. Existing roots start checked; unchecking removes them from this workspace. Changes are saved only when you apply.</p>
      {folders.map(folder => <div key={folder} style={{ overflowWrap: 'anywhere', marginBottom: 6, opacity: .8 }}>{folder}</div>)}
      {options && <details open={showOptions} onToggle={event => setShowOptions(event.currentTarget.open)}>
        <summary style={{ cursor: 'pointer', marginTop: 10 }}>Scan settings</summary>
        <label style={{ display: 'flex', gap: 6, margin: '14px 0 10px' }}>
          <input type="checkbox" checked={options.ignoreEnabled} disabled={busy} onChange={event => setOptions({ ...options, ignoreEnabled: event.target.checked })} />Ignore matching paths during scan
        </label>
        <label>Pattern format
          <select value={options.mode} disabled={busy || !options.ignoreEnabled} style={{ ...inputStyle, margin: '5px 0 10px' }} onChange={event => setOptions({ ...options, mode: event.target.value as RepositoryScanOptions['mode'], patterns: '' })}>
            <option value="masks">File masks (IntelliJ style)</option><option value="regex">Regular expression</option>
          </select>
        </label>
        <label htmlFor="git-root-scan-patterns">Paths to ignore</label>
        <textarea id="git-root-scan-patterns" rows={4} value={options.patterns} disabled={busy || !options.ignoreEnabled} aria-describedby="git-root-scan-help" style={{ ...inputStyle, marginTop: 5, resize: 'vertical' }} onChange={event => setOptions({ ...options, patterns: event.target.value })} />
        <p id="git-root-scan-help" style={{ opacity: .8, fontSize: 11 }}>
          {options.mode === 'masks' ? 'Separate masks with commas, semicolons, or newlines. Use * and ? for folder names at any depth, or ** for paths: node_modules, cmake-build-*, vendor/**.' : 'JavaScript regex matched against workspace-relative paths using / separators. Example: (^|/)(node_modules|\\.gradle|cmake-build-[^/]+)(/|$)'}
          {' '}Git metadata and symbolic links are always skipped.
        </p>
      </details>}
      {!options && <p role="status">Loading scan options…</p>}
      {busy && <p role="status">{applying ? 'Applying selection…' : 'Analyzing… You can cancel from the VS Code progress notification.'}</p>}
      {review && <section aria-label="Git root selections" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          <strong>{selected.size} of {review.roots.length} selected</strong>
          <button type="button" style={buttonStyle} disabled={busy} onClick={() => setSelected(new Set(review.roots.map(root => root.rootPath)))}>Select all</button>
          <button type="button" style={buttonStyle} disabled={busy} onClick={() => setSelected(new Set())}>Clear</button>
        </div>
        <div style={{ maxHeight: 250, overflowY: 'auto', border: '1px solid var(--vscode-widget-border)' }}>
          {review.roots.map(root => <label key={root.rootPath} style={{ display: 'flex', gap: 8, padding: 8, borderBottom: '1px solid var(--vscode-widget-border)', cursor: 'pointer' }}>
            <input type="checkbox" disabled={busy} checked={selected.has(root.rootPath)} onChange={event => {
              const next = new Set(selected); if (event.target.checked) next.add(root.rootPath); else next.delete(root.rootPath); setSelected(next);
            }} />
            <span style={{ minWidth: 0 }}>
              <span>{root.name} <small style={{ opacity: .7 }}>{root.existing ? 'Already managed' : 'Detected'}{root.existing && !root.detected ? ' · Outside scan or ignored' : ''}</small></span>
              <span style={{ display: 'block', overflowWrap: 'anywhere', fontSize: 11, opacity: .8 }}>{root.rootPath}</span>
            </span>
          </label>)}
          {!review.roots.length && <p style={{ padding: 8 }}>No Git roots found or currently managed.</p>}
        </div>
      </section>}
      {summary && <p role="status">{summary}</p>}
      {(error || validation || (options && !folders.length)) && <p role="alert" style={{ color: 'var(--vscode-errorForeground)' }}>{error || validation || 'Open a workspace folder to analyze.'}</p>}
      <div style={{ position: 'sticky', bottom: -18, display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 16, marginBottom: -18, padding: '12px 0', background: 'var(--vscode-editorWidget-background)' }}>
        <button type="button" style={buttonStyle} disabled={busy} onClick={onClose}>{summary ? 'Close' : 'Cancel'}</button>
        <button type="button" style={{ ...buttonStyle, background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', opacity: busy || !options || !!validation || !folders.length ? .5 : 1 }} disabled={busy || !options || !!validation || !folders.length}
          onClick={() => { if (!options) return; setBusy(true); setApplying(false); setReview(null); setSummary(''); setError(''); send({ type: 'GIT_ROOT_SCAN_ANALYZE', requestId, options }); }}>Analyze</button>
        {review && <button type="button" style={{ ...buttonStyle, background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)' }} disabled={busy}
          onClick={() => { setBusy(true); setApplying(true); setError(''); send({ type: 'GIT_ROOT_SCAN_APPLY', requestId, reviewId: review.id, selectedRoots: [...selected] }); }}>Apply Selection</button>}
      </div>
    </div>
  </div>, document.body);
}
