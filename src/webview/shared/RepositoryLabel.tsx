import React from 'react';

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function repositoryFolderName(rootPath: string): string {
  const normalized = normalizePath(rootPath);
  return normalized.slice(normalized.lastIndexOf('/') + 1) || rootPath;
}

/** Keep the actual folder name prominent and its location secondary. */
export function RepositoryLabel({ rootPath, displayPath }: { rootPath: string; displayPath: string }) {
  const normalized = normalizePath(displayPath);
  const path = normalized.includes('/') ? normalized : normalizePath(rootPath);
  const parent = path.slice(0, path.lastIndexOf('/'));
  return (
    <span title={rootPath} style={{ textTransform: 'none', letterSpacing: 0 }}>
      {repositoryFolderName(rootPath)}
      {parent && <span style={{ fontWeight: 400, color: 'var(--vscode-descriptionForeground)' }}> [{parent}]</span>}
    </span>
  );
}
