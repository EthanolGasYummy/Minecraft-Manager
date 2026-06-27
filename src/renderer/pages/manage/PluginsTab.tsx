import React, { useState, useEffect, useRef } from 'react';

interface ModrinthHit {
  project_id: string;
  title: string;
  description: string;
  icon_url: string | null;
  downloads: number;
  categories: string[];
}

interface ModrinthFile {
  url: string;
  filename: string;
  primary: boolean;
}

interface ModrinthVersion {
  files: ModrinthFile[];
}

interface Props {
  installDir: string;
  serverType: string;
  mcVersion: string;
}

const LOADER: Record<string, string> = {
  paper: 'paper', purpur: 'paper', fabric: 'fabric', forge: 'forge', neoforge: 'neoforge',
};

const PER_PAGE = 20;

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export default function PluginsTab({ installDir, serverType, mcVersion }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ModrinthHit[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dlState, setDlState] = useState<Record<string, 'loading' | 'done' | 'error'>>({});
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loader = LOADER[serverType] ?? serverType;
  const isPlugin = serverType === 'paper' || serverType === 'purpur';
  const label = isPlugin ? 'Plugin' : 'Mod';
  const subDir = isPlugin ? 'plugins' : 'mods';

  const search = async (q: string, offset: number) => {
    setLoading(true);
    setError('');
    try {
      const facets = JSON.stringify([
        [`project_type:${isPlugin ? 'plugin' : 'mod'}`],
        [`categories:${loader}`],
        [`versions:${mcVersion}`],
      ]);
      const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(q)}&facets=${encodeURIComponent(facets)}&limit=${PER_PAGE}&offset=${offset}&index=downloads`;
      const res = await fetch(url, { headers: { 'User-Agent': 'MinecraftManager/1.0 (contact@mcmanager.app)' } });
      if (!res.ok) throw new Error(`Modrinth returned ${res.status}`);
      const data = await res.json();
      setResults(data.hits ?? []);
      setTotalHits(data.total_hits ?? 0);
    } catch (e: any) {
      setError(e.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { search('', 0); }, [serverType, mcVersion]);

  const handleQuery = (q: string) => {
    setQuery(q);
    setPage(0);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => search(q, 0), 380);
  };

  const goPage = (p: number) => {
    setPage(p);
    search(query, p * PER_PAGE);
  };

  const install = async (hit: ModrinthHit) => {
    setDlState((s) => ({ ...s, [hit.project_id]: 'loading' }));
    try {
      const params = new URLSearchParams({
        loaders: JSON.stringify([loader]),
        game_versions: JSON.stringify([mcVersion]),
      });
      const res = await fetch(`https://api.modrinth.com/v2/project/${hit.project_id}/version?${params}`, {
        headers: { 'User-Agent': 'MinecraftManager/1.0' },
      });
      const versions: ModrinthVersion[] = await res.json();
      if (!versions?.length) throw new Error(`No ${label.toLowerCase()} version for ${mcVersion}`);
      const file = versions[0].files.find((f) => f.primary) ?? versions[0].files[0];
      if (!file) throw new Error('No download file in version');
      await window.api.files.downloadMod(file.url, installDir, subDir, file.filename);
      setDlState((s) => ({ ...s, [hit.project_id]: 'done' }));
    } catch (e: any) {
      setDlState((s) => ({ ...s, [hit.project_id]: 'error' }));
      alert(`Install failed: ${e.message}`);
    }
  };

  const totalPages = Math.ceil(totalHits / PER_PAGE);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search bar */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1E2A3A', background: '#0D1322', flexShrink: 0 }}>
        <input
          value={query}
          onChange={(e) => handleQuery(e.target.value)}
          placeholder={`Search ${label}s on Modrinth for ${serverType} ${mcVersion}…`}
          style={{
            width: '100%', padding: '9px 14px', background: '#141A2B', border: '1px solid #2D3A4A',
            borderRadius: 8, color: '#E2E8F0', fontSize: 13, outline: 'none', boxSizing: 'border-box',
          }}
        />
        <div style={{ fontSize: 11, color: '#4B5563', marginTop: 5 }}>
          {!loading && totalHits > 0 && `${totalHits.toLocaleString()} results · powered by `}
          {!loading && totalHits > 0 && (
            <span
              onClick={() => window.api.system.openExternal('https://modrinth.com')}
              style={{ color: '#3B82F6', cursor: 'pointer' }}
            >
              Modrinth
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
        {loading && (
          <div style={{ color: '#64748B', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
            Searching Modrinth…
          </div>
        )}
        {!loading && error && (
          <div style={{ color: '#EF4444', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>{error}</div>
        )}
        {!loading && !error && results.length === 0 && (
          <div style={{ color: '#64748B', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
            No {label.toLowerCase()}s found for {serverType} {mcVersion}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {results.map((hit) => {
            const state = dlState[hit.project_id];
            return (
              <div
                key={hit.project_id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: '#0D1322', border: '1px solid #1A2235', borderRadius: 9, padding: '10px 13px',
                }}
              >
                {hit.icon_url ? (
                  <img
                    src={hit.icon_url}
                    alt=""
                    onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                    style={{ width: 42, height: 42, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <div style={{ width: 42, height: 42, borderRadius: 8, background: '#141A2B', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#E2E8F0' }}>{hit.title}</span>
                    {hit.categories.slice(0, 2).map((c) => (
                      <span key={c} style={{ fontSize: 10, color: '#64748B', background: '#141A2B', border: '1px solid #1E2A3A', borderRadius: 3, padding: '1px 5px' }}>
                        {c}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {hit.description}
                  </div>
                  <div style={{ fontSize: 11, color: '#374151', marginTop: 3 }}>
                    ↓ {fmt(hit.downloads)}
                  </div>
                </div>
                <button
                  onClick={() => install(hit)}
                  disabled={state === 'loading' || state === 'done'}
                  style={{
                    padding: '7px 14px', borderRadius: 7, border: 'none', flexShrink: 0,
                    background: state === 'done' ? '#064E3B' : state === 'error' ? '#450A0A' : '#2563EB',
                    color: state === 'done' ? '#10B981' : state === 'error' ? '#EF4444' : '#fff',
                    fontSize: 12, fontWeight: 600, cursor: state === 'loading' || state === 'done' ? 'default' : 'pointer',
                    opacity: state === 'loading' ? 0.6 : 1, whiteSpace: 'nowrap',
                  }}
                >
                  {state === 'loading' ? '…' : state === 'done' ? '✓ Installed' : state === 'error' ? 'Retry' : `Install`}
                </button>
              </div>
            );
          })}
        </div>

        {totalPages > 1 && !loading && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 14, paddingBottom: 8 }}>
            <button
              disabled={page === 0}
              onClick={() => goPage(page - 1)}
              style={{ padding: '6px 14px', background: '#141A2B', border: '1px solid #1E2A3A', borderRadius: 7, color: page === 0 ? '#374151' : '#94A3B8', cursor: page === 0 ? 'default' : 'pointer', fontSize: 12 }}
            >← Prev</button>
            <span style={{ fontSize: 12, color: '#64748B' }}>Page {page + 1} / {totalPages}</span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => goPage(page + 1)}
              style={{ padding: '6px 14px', background: '#141A2B', border: '1px solid #1E2A3A', borderRadius: 7, color: page >= totalPages - 1 ? '#374151' : '#94A3B8', cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontSize: 12 }}
            >Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
