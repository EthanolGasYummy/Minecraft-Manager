import React, { useState, useEffect, useCallback } from 'react';
import Button from '../../components/Button';

interface Props {
  serverId: string;
  installDir: string;
}

interface FileEntry {
  name: string;
  isDir: boolean;
  size: number;
  modified: string;
}

function fmtSize(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

const EDITABLE_EXTS = ['.txt', '.properties', '.json', '.yaml', '.yml', '.toml', '.cfg', '.log', '.conf'];

function isEditable(name: string) {
  return EDITABLE_EXTS.some((ext) => name.toLowerCase().endsWith(ext));
}

export default function FilesTab({ installDir }: Props) {
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [editFile, setEditFile] = useState<{ path: string; content: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const loadDir = useCallback(async (subPath: string) => {
    setLoading(true);
    try {
      const items = await window.api.files.listDir(installDir, subPath);
      setEntries(items.sort((a: FileEntry, b: FileEntry) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      }));
      setPath(subPath);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [installDir]);

  useEffect(() => { loadDir(''); }, [loadDir]);

  const navigate = (entry: FileEntry) => {
    if (entry.isDir) {
      loadDir(path ? `${path}\\${entry.name}` : entry.name);
    } else if (isEditable(entry.name)) {
      openFile(entry.name);
    }
  };

  const openFile = async (name: string) => {
    const full = `${installDir}\\${path ? path + '\\' : ''}${name}`;
    const content = await window.api.files.readFile(full);
    setEditFile({ path: full, content });
  };

  const saveFile = async () => {
    if (!editFile) return;
    setSaving(true);
    await window.api.files.writeFile(editFile.path, editFile.content);
    setSaving(false);
    setEditFile(null);
  };

  const goUp = () => {
    const parts = path.split('\\').filter(Boolean);
    parts.pop();
    loadDir(parts.join('\\'));
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const targetDir = `${installDir}\\${path}`;
    for (const file of files) {
      const dest = `${targetDir}\\${file.name}`;
      await window.api.files.copyFile((file as any).path, dest);
    }
    loadDir(path);
  };

  if (editFile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #1E2A3A', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button size="sm" variant="ghost" onClick={() => setEditFile(null)}>← Back</Button>
          <span style={{ fontSize: 13, color: '#94A3B8', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {editFile.path}
          </span>
          <Button size="sm" variant="primary" loading={saving} onClick={saveFile}>Save</Button>
        </div>
        <textarea
          value={editFile.content}
          onChange={(e) => setEditFile({ ...editFile, content: e.target.value })}
          style={{
            flex: 1,
            padding: 16,
            background: '#08090F',
            border: 'none',
            outline: 'none',
            color: '#CBD5E1',
            fontFamily: 'Consolas, Monaco, monospace',
            fontSize: 13,
            lineHeight: 1.6,
            resize: 'none',
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{ height: '100%', overflow: 'auto', padding: 20 }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div style={{ position: 'absolute', inset: 0, background: '#2563EB20', border: '2px dashed #3B82F6', borderRadius: 8, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#3B82F6', fontWeight: 600 }}>
          Drop files here
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        {path && <Button size="sm" variant="ghost" onClick={goUp}>↑ Up</Button>}
        <span style={{ fontSize: 12, color: '#4B5563', fontFamily: 'monospace', flex: 1 }}>
          {installDir}{path ? `\\${path}` : ''}
        </span>
        <Button size="sm" variant="ghost" onClick={() => window.api.files.openFolder(`${installDir}\\${path}`)}>
          Open in Explorer
        </Button>
        <Button size="sm" variant="ghost" onClick={() => loadDir(path)}>↻</Button>
      </div>

      {loading ? (
        <div style={{ color: '#4B5563', textAlign: 'center', padding: 40 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {entries.map((entry) => (
            <div
              key={entry.name}
              onClick={() => navigate(entry)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 7,
                cursor: entry.isDir || isEditable(entry.name) ? 'pointer' : 'default',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#141A2B'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>
                {entry.isDir ? '📁' : fileIcon(entry.name)}
              </span>
              <span style={{ flex: 1, fontSize: 13, color: entry.isDir ? '#93C5FD' : '#CBD5E1' }}>
                {entry.name}
              </span>
              {!entry.isDir && (
                <span style={{ fontSize: 11, color: '#4B5563' }}>{fmtSize(entry.size)}</span>
              )}
              <span style={{ fontSize: 11, color: '#374151' }}>
                {new Date(entry.modified).toLocaleDateString()}
              </span>
              {!entry.isDir && (
                <button
                  onClick={(e) => { e.stopPropagation(); window.api.files.deleteFile(`${installDir}\\${path ? path + '\\' : ''}${entry.name}`).then(() => loadDir(path)); }}
                  style={{ background: 'none', border: 'none', color: '#4B5563', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}
                >
                  🗑
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 12, color: '#374151', textAlign: 'center' }}>
        Drag & drop files here to copy them into this folder
      </div>
    </div>
  );
}

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const MAP: Record<string, string> = {
    jar: '☕', json: '{}', properties: '⚙', yml: '📋', yaml: '📋',
    log: '📄', zip: '📦', txt: '📝', toml: '📋', png: '🖼', jpg: '🖼',
  };
  return MAP[ext] ?? '📄';
}
