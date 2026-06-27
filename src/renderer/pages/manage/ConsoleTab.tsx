import React, { useState, useEffect, useRef } from 'react';
import type { ServerStatus } from '../../types';

interface Props {
  serverId: string;
  status: ServerStatus;
}

type LevelFilter = 'all' | 'warn' | 'error';

const LINE_COLORS: Record<string, string> = {
  WARN: '#F59E0B',
  ERROR: '#EF4444',
  INFO: '#94A3B8',
  Manager: '#60A5FA',
};

function colorLine(line: string): string {
  if (line.includes('[WARN]') || line.includes('[WARNING]')) return LINE_COLORS.WARN;
  if (line.includes('[ERROR]') || line.includes('Exception') || line.includes('Error')) return LINE_COLORS.ERROR;
  if (line.includes('[Manager]')) return LINE_COLORS.Manager;
  return LINE_COLORS.INFO;
}

function matchesLevel(line: string, level: LevelFilter): boolean {
  if (level === 'all') return true;
  const isWarn = line.includes('[WARN]') || line.includes('[WARNING]');
  const isError = line.includes('[ERROR]') || line.includes('Exception') || line.includes('Error');
  if (level === 'warn') return isWarn || isError;
  return isError;
}

function toolbarBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    background: 'none',
    border: '1px solid #1E2A3A',
    borderRadius: 5,
    color: disabled ? '#374151' : '#94A3B8',
    fontSize: 11,
    fontWeight: 500,
    cursor: disabled ? 'default' : 'pointer',
    whiteSpace: 'nowrap',
  };
}

export default function ConsoleTab({ serverId, status }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [cmd, setCmd] = useState('');
  const [autoscroll, setAutoscroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [filterText, setFilterText] = useState('');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [crashReport, setCrashReport] = useState<{ name: string; content: string } | null>(null);
  const [showCrash, setShowCrash] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevStatusRef = useRef(status);

  useEffect(() => {
    window.api.server.getLogs(serverId).then((h: string[]) => {
      if (h.length > 0) setLines(h.slice(-2000));
    }).catch(() => {});

    const unsub = window.api.on('server:log', ({ id, line }: any) => {
      if (id !== serverId) return;
      setLines((prev) => {
        const next = [...prev, line];
        return next.length > 2000 ? next.slice(next.length - 2000) : next;
      });
    });
    return () => unsub();
  }, [serverId]);

  useEffect(() => {
    if (status === 'starting' && prevStatusRef.current !== 'starting') setLines([]);
    if (status === 'crashed' && prevStatusRef.current !== 'crashed') {
      window.api.server.getCrashReport(serverId).then((r) => { if (r) setCrashReport(r); }).catch(() => {});
    }
    prevStatusRef.current = status;
  }, [status, serverId]);

  useEffect(() => {
    if (autoscroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, autoscroll]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    setAutoscroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  const sendCommand = () => {
    const trimmed = cmd.trim();
    if (!trimmed || status !== 'online') return;
    window.api.server.sendCommand(serverId, trimmed);
    setLines((prev) => [...prev, `> ${trimmed}`]);
    setHistory((prev) => [trimmed, ...prev.filter((c) => c !== trimmed)].slice(0, 50));
    setHistoryIdx(-1);
    setCmd('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { sendCommand(); return; }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(idx);
      if (history[idx] !== undefined) setCmd(history[idx]);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = historyIdx - 1;
      if (idx < 0) { setHistoryIdx(-1); setCmd(''); }
      else { setHistoryIdx(idx); setCmd(history[idx]); }
    }
  };

  const copyLogs = () => {
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Apply filters
  const filteredLines = lines.filter(
    (l) => matchesLevel(l, levelFilter) && (filterText === '' || l.toLowerCase().includes(filterText.toLowerCase()))
  );
  const isFiltering = filterText !== '' || levelFilter !== 'all';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        padding: '6px 12px', borderBottom: '1px solid #1A2235', background: '#0A0D17', flexShrink: 0,
      }}>
        {/* Filter input */}
        <input
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter output…"
          style={{
            flex: 1, minWidth: 120, padding: '3px 8px',
            background: '#0D1322', border: '1px solid #2D3A4A', borderRadius: 5,
            color: '#E2E8F0', fontSize: 11, outline: 'none',
          }}
        />
        {/* Level buttons */}
        {(['all', 'warn', 'error'] as LevelFilter[]).map((lvl) => (
          <button
            key={lvl}
            onClick={() => setLevelFilter(lvl)}
            style={{
              padding: '3px 8px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 11,
              background: levelFilter === lvl ? (lvl === 'error' ? '#7F1D1D' : lvl === 'warn' ? '#78350F' : '#1E3A5F') : '#1E2A3A',
              color: levelFilter === lvl ? (lvl === 'error' ? '#FCA5A5' : lvl === 'warn' ? '#FCD34D' : '#93C5FD') : '#4B5563',
              fontWeight: levelFilter === lvl ? 600 : 400,
            }}
          >
            {lvl === 'all' ? 'All' : lvl === 'warn' ? '⚠ Warn+' : '✕ Error'}
          </button>
        ))}

        {isFiltering && (
          <span style={{ fontSize: 11, color: '#4B5563', whiteSpace: 'nowrap' }}>
            {filteredLines.length}/{lines.length}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Crash report button */}
        {(status === 'crashed' || crashReport) && (
          <button
            onClick={async () => {
              if (!crashReport) {
                const r = await window.api.server.getCrashReport(serverId).catch(() => null);
                setCrashReport(r);
                if (r) setShowCrash(true);
              } else {
                setShowCrash(true);
              }
            }}
            style={{ ...toolbarBtn(false), color: '#FCA5A5', borderColor: '#7F1D1D' }}
          >
            📋 Crash Report
          </button>
        )}

        <button onClick={() => window.api.server.saveLog(serverId).catch(() => {})} style={toolbarBtn(false)}>
          💾 Save Log
        </button>
        <button onClick={copyLogs} disabled={lines.length === 0} style={toolbarBtn(lines.length === 0)}>
          {copied ? '✓ Copied' : '⧉ Copy'}
        </button>
        <button onClick={() => setLines([])} disabled={lines.length === 0} style={toolbarBtn(lines.length === 0)}>
          ✕ Clear
        </button>
      </div>

      {/* Log output */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          flex: 1, overflowY: 'auto', padding: '12px 16px',
          fontFamily: "'Consolas', 'Monaco', monospace",
          fontSize: 12, lineHeight: 1.6, background: '#08090F',
        }}
      >
        {filteredLines.length === 0 ? (
          <div style={{ color: '#374151', paddingTop: 20 }}>
            {isFiltering
              ? 'No lines match the current filter.'
              : status === 'offline' || status === 'crashed'
                ? 'Server is not running. Start it to see logs.'
                : 'Waiting for server output…'}
          </div>
        ) : (
          filteredLines.map((line, i) => (
            <div key={i} style={{ color: colorLine(line), whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {line}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {!autoscroll && (
        <div style={{ textAlign: 'center', padding: '4px 0', background: '#0D1322', borderTop: '1px solid #1A2235' }}>
          <button
            onClick={() => { setAutoscroll(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
            style={{ background: 'none', border: 'none', color: '#3B82F6', cursor: 'pointer', fontSize: 12 }}
          >
            ↓ Scroll to bottom
          </button>
        </div>
      )}

      {/* Command input */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid #1E2A3A', display: 'flex', gap: 8 }}>
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={status === 'online' ? 'Type a command…' : 'Server offline'}
          disabled={status !== 'online'}
          style={{
            flex: 1, padding: '8px 12px', background: '#0D1322',
            border: '1px solid #2D3A4A', borderRadius: 7,
            color: '#E2E8F0', fontSize: 13, fontFamily: 'monospace', outline: 'none',
            opacity: status !== 'online' ? 0.5 : 1,
          }}
        />
        <button
          onClick={sendCommand}
          disabled={status !== 'online' || !cmd.trim()}
          style={{
            padding: '8px 16px', background: '#2563EB', color: '#fff',
            border: 'none', borderRadius: 7, cursor: status !== 'online' ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 600,
            opacity: (status !== 'online' || !cmd.trim()) ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>

      {/* Crash report modal */}
      {showCrash && crashReport && (
        <div
          style={{ position: 'fixed', inset: 0, background: '#00000090', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => setShowCrash(false)}
        >
          <div
            style={{ background: '#141A2B', border: '1px solid #2D3A4A', borderRadius: 12, width: '80vw', maxWidth: 900, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1E2A3A' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#FCA5A5' }}>📋 Crash Report</div>
                <div style={{ fontSize: 11, color: '#4B5563', marginTop: 2 }}>{crashReport.name}</div>
              </div>
              <button
                onClick={() => setShowCrash(false)}
                style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
            <div style={{ overflow: 'auto', padding: '16px 20px', flex: 1 }}>
              <pre style={{ margin: 0, fontFamily: 'Consolas, Monaco, monospace', fontSize: 11, color: '#94A3B8', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {crashReport.content}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
