import React, { useState, useEffect, useCallback } from 'react';
import Button from '../../components/Button';
import Card from '../../components/Card';

interface Props {
  installDir: string;
}

interface PaperSetting {
  key: string;
  label: string;
  description: string;
}

interface AntiXrayState {
  enabled: boolean;
  engineMode: number;
  lavaObscures: boolean;
  maxBlockHeight: number;
  updateRadius: number;
  usePermission: boolean;
  hiddenBlocks: string;      // newline-separated
  replacementBlocks: string; // newline-separated
}

const GLOBAL_SETTINGS: PaperSetting[] = [
  { key: 'allow-piston-duplication', label: 'Piston/TNT Duplication', description: 'Enable TNT, carpet, and rail item duplication (disabled by Paper by default)' },
  { key: 'allow-headless-pistons', label: 'Headless Pistons', description: 'Allow headless pistons — useful for certain mob farms and builds' },
  { key: 'allow-permanent-block-break-exploits', label: 'Permanent Block Break Exploits', description: 'Allow breaking bedrock, end portal frames, and other indestructible blocks' },
];

const WORLD_SETTINGS: PaperSetting[] = [
  { key: 'disable-ice-and-snow', label: 'Disable Ice & Snow Spreading', description: 'Prevent ice from forming and snow from accumulating' },
  { key: 'sleep-ignore-nearby-mobs', label: 'Sleep Ignores Nearby Mobs', description: 'Players can sleep even with hostile mobs nearby' },
  { key: 'disable-sprint-interruption-on-attack', label: 'Keep Sprint on Attack', description: 'Attacking does not interrupt sprinting' },
  { key: 'use-better-mending', label: 'Better Mending', description: "XP always repairs the mending item in the player's hand first" },
];

const FEATURED_KEYS = new Set([...GLOBAL_SETTINGS, ...WORLD_SETTINGS].map((s) => s.key));

// Keys managed by the anti-xray UI — keep them out of "All Other Settings"
const ANTIXRAY_KEYS = new Set(['engine-mode', 'lava-obscures', 'max-block-height', 'update-radius', 'use-permission', 'enabled']);

const ENGINE_MODES = [
  { mode: 1, desc: 'Replace ores with stone-like blocks on the client side (low overhead, good default)' },
  { mode: 2, desc: 'Send fake ores everywhere, reveal real blocks near the player (most effective, more network traffic)' },
  { mode: 3, desc: 'Combination of modes 1 and 2 — check Paper docs for your version' },
];

// ─── YAML helpers ─────────────────────────────────────────────────────────────

function escapeRe(s: string) {
  return s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

function extractBool(content: string, key: string): boolean | null {
  const m = content.match(new RegExp(`${escapeRe(key)}:\\s*(true|false)`));
  return m ? m[1] === 'true' : null;
}

function setBool(content: string, key: string, value: boolean): string {
  const re = new RegExp(`(${escapeRe(key)}:\\s*)(true|false)`);
  return re.test(content) ? content.replace(re, `$1${value}`) : content;
}

/** Extract the line range for a YAML section (key and all deeper-indented lines). */
function sectionBounds(lines: string[], key: string): [number, number] | null {
  let start = -1;
  let sectionIndent = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trimStart();
    if (t === `${key}:` || t.startsWith(`${key}: `)) {
      start = i;
      sectionIndent = lines[i].length - t.length;
      break;
    }
  }
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end];
    const t = line.trim();
    if (!t || t.startsWith('#')) { end++; continue; }
    if (line.length - line.trimStart().length <= sectionIndent) break;
    end++;
  }
  return [start, end];
}

function extractSectionText(content: string, key: string): string {
  const lines = content.split('\n');
  const bounds = sectionBounds(lines, key);
  return bounds ? lines.slice(bounds[0], bounds[1]).join('\n') : '';
}

function extractNum(section: string, key: string): number | null {
  const m = section.match(new RegExp(`${escapeRe(key)}:\\s*(-?\\d+)`));
  return m ? parseInt(m[1]) : null;
}

function extractList(section: string, key: string): string[] {
  const lines = section.split('\n');
  const keyIdx = lines.findIndex(l => {
    const t = l.trim();
    return t === `${key}:` || t.startsWith(`${key}: `);
  });
  if (keyIdx === -1) return [];
  const items: string[] = [];
  for (let i = keyIdx + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('- ')) items.push(t.slice(2).trim());
    else if (t && !t.startsWith('#')) break;
  }
  return items;
}

function updateListInLines(lines: string[], key: string, values: string[]): string[] {
  const keyIdx = lines.findIndex(l => {
    const t = l.trim();
    return t === `${key}:` || t.startsWith(`${key}: `);
  });
  if (keyIdx === -1) return lines;
  const keyLine = lines[keyIdx];
  const sp = ' '.repeat(keyLine.length - keyLine.trimStart().length);
  let listEnd = keyIdx + 1;
  while (listEnd < lines.length) {
    const t = lines[listEnd].trim();
    if (!t || t.startsWith('-')) { listEnd++; continue; }
    break;
  }
  return [...lines.slice(0, keyIdx + 1), ...values.map(v => `${sp}- ${v}`), ...lines.slice(listEnd)];
}

function updateAntiXrayInContent(content: string, ax: AntiXrayState): string {
  const lines = content.split('\n');
  const bounds = sectionBounds(lines, 'anti-xray');
  if (!bounds) return content;
  const [start, end] = bounds;

  let section = lines.slice(start, end).map(line => {
    const t = line.trimStart();
    const sp = ' '.repeat(line.length - t.length);
    if (t.startsWith('enabled:')) return `${sp}enabled: ${ax.enabled}`;
    if (t.startsWith('engine-mode:')) return `${sp}engine-mode: ${ax.engineMode}`;
    if (t.startsWith('lava-obscures:')) return `${sp}lava-obscures: ${ax.lavaObscures}`;
    if (t.startsWith('max-block-height:')) return `${sp}max-block-height: ${ax.maxBlockHeight}`;
    if (t.startsWith('update-radius:')) return `${sp}update-radius: ${ax.updateRadius}`;
    if (t.startsWith('use-permission:')) return `${sp}use-permission: ${ax.usePermission}`;
    return line;
  });

  const hiddenList = ax.hiddenBlocks.split('\n').map(s => s.trim()).filter(Boolean);
  const replList = ax.replacementBlocks.split('\n').map(s => s.trim()).filter(Boolean);
  section = updateListInLines(section, 'hidden-blocks', hiddenList);
  section = updateListInLines(section, 'replacement-blocks', replList);

  return [...lines.slice(0, start), ...section, ...lines.slice(end)].join('\n');
}

function formatKey(key: string) {
  return key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function scanExtra(content: string, extraExclude: Set<string>): Array<{ key: string; value: boolean }> {
  const result: Array<{ key: string; value: boolean }> = [];
  const seen = new Set([...FEATURED_KEYS, ...extraExclude]);
  for (const line of content.split('\n')) {
    const m = line.match(/^\s+([\w-]+):\s*(true|false)\s*(?:#.*)?$/);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      result.push({ key: m[1], value: m[2] === 'true' });
    }
  }
  return result;
}

function joinPath(base: string, ...parts: string[]) {
  return [base.replace(/[/\\]+$/, ''), ...parts].join('/');
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PaperSettingsTab({ installDir }: Props) {
  const [globalContent, setGlobalContent] = useState('');
  const [worldContent, setWorldContent] = useState('');
  const [values, setValues] = useState<Record<string, boolean>>({});
  const [extraGlobal, setExtraGlobal] = useState<Array<{ key: string; value: boolean }>>([]);
  const [extraWorld, setExtraWorld] = useState<Array<{ key: string; value: boolean }>>([]);
  const [antiXray, setAntiXray] = useState<AntiXrayState | null>(null);
  const [search, setSearch] = useState('');
  const [showExtra, setShowExtra] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const globalPath = joinPath(installDir, 'config', 'paper-global.yml');
  const worldPath = joinPath(installDir, 'config', 'paper-world-defaults.yml');

  const load = useCallback(async () => {
    setError(null);
    setLoaded(false);
    try {
      let gc = '';
      let wc = '';
      try { gc = await window.api.files.readFile(globalPath); } catch {}
      try { wc = await window.api.files.readFile(worldPath); } catch {}

      setGlobalContent(gc);
      setWorldContent(wc);

      const initial: Record<string, boolean> = {};
      for (const s of GLOBAL_SETTINGS) {
        const v = extractBool(gc, s.key);
        if (v !== null) initial[s.key] = v;
      }
      for (const s of WORLD_SETTINGS) {
        const v = extractBool(wc, s.key);
        if (v !== null) initial[s.key] = v;
      }
      setValues(initial);

      // Anti-xray — parse from its own section so "enabled" is unambiguous
      const axSection = extractSectionText(wc, 'anti-xray');
      if (axSection) {
        setAntiXray({
          enabled: extractBool(axSection, 'enabled') ?? false,
          engineMode: extractNum(axSection, 'engine-mode') ?? 1,
          lavaObscures: extractBool(axSection, 'lava-obscures') ?? false,
          maxBlockHeight: extractNum(axSection, 'max-block-height') ?? 64,
          updateRadius: extractNum(axSection, 'update-radius') ?? 2,
          usePermission: extractBool(axSection, 'use-permission') ?? false,
          hiddenBlocks: extractList(axSection, 'hidden-blocks').join('\n'),
          replacementBlocks: extractList(axSection, 'replacement-blocks').join('\n'),
        });
      }

      // Exclude anti-xray keys from the "All Other Settings" scan to avoid conflicts
      const worldExclude = axSection ? ANTIXRAY_KEYS : new Set<string>();
      setExtraGlobal(scanExtra(gc, new Set()));
      setExtraWorld(scanExtra(wc, worldExclude));
      setLoaded(true);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to read Paper config');
      setLoaded(true);
    }
  }, [globalPath, worldPath]);

  useEffect(() => { load(); }, [load]);

  const toggle = (key: string) => setValues((prev) => ({ ...prev, [key]: !prev[key] }));

  const toggleExtra = (key: string, isGlobal: boolean) => {
    if (isGlobal) setExtraGlobal((prev) => prev.map((e) => e.key === key ? { ...e, value: !e.value } : e));
    else setExtraWorld((prev) => prev.map((e) => e.key === key ? { ...e, value: !e.value } : e));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      let gc = globalContent;
      let wc = worldContent;

      for (const s of GLOBAL_SETTINGS) {
        if (values[s.key] !== undefined) gc = setBool(gc, s.key, values[s.key]);
      }
      for (const s of WORLD_SETTINGS) {
        if (values[s.key] !== undefined) wc = setBool(wc, s.key, values[s.key]);
      }
      for (const e of extraGlobal) gc = setBool(gc, e.key, e.value);
      for (const e of extraWorld) wc = setBool(wc, e.key, e.value);

      // Anti-xray runs last so it wins over any accidental extraWorld overlap
      if (antiXray) wc = updateAntiXrayInContent(wc, antiXray);

      if (gc !== globalContent && globalContent) await window.api.files.writeFile(globalPath, gc);
      if (wc !== worldContent && worldContent) await window.api.files.writeFile(worldPath, wc);

      setGlobalContent(gc);
      setWorldContent(wc);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return <div style={{ padding: 40, color: '#4B5563', textAlign: 'center' }}>Loading Paper config…</div>;
  }

  if (!globalContent && !worldContent) {
    return (
      <div style={{ padding: 40, color: '#4B5563', textAlign: 'center' }}>
        Paper config files not found in <code style={{ color: '#64748B' }}>config/</code>.<br />
        Start the server once to generate them, then come back here.
      </div>
    );
  }

  const featuredGlobal = GLOBAL_SETTINGS.filter((s) => values[s.key] !== undefined);
  const featuredWorld = WORLD_SETTINGS.filter((s) => values[s.key] !== undefined);

  const q = search.toLowerCase();
  const filteredExtraGlobal = q ? extraGlobal.filter(e => e.key.toLowerCase().includes(q) || formatKey(e.key).toLowerCase().includes(q)) : extraGlobal;
  const filteredExtraWorld = q ? extraWorld.filter(e => e.key.toLowerCase().includes(q) || formatKey(e.key).toLowerCase().includes(q)) : extraWorld;
  const totalExtra = extraGlobal.length + extraWorld.length;
  const totalFiltered = filteredExtraGlobal.length + filteredExtraWorld.length;

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24, maxWidth: 700 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#E2E8F0', margin: 0 }}>Paper Settings</h2>
        <Button variant="primary" loading={saving} onClick={save}>
          {saved ? '✓ Saved' : 'Save Changes'}
        </Button>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#2D1515', border: '1px solid #7F1D1D', borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#FCA5A5' }}>
          {error}
        </div>
      )}

      {/* Exploit Fixes */}
      {globalContent && featuredGlobal.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <h3 style={sectionHead}>Exploit Fixes</h3>
          <p style={sectionNote}>paper-global.yml · disabled by default, enable to restore vanilla behavior</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {featuredGlobal.map((s) => (
              <SettingRow key={s.key} label={s.label} description={s.description} value={values[s.key]} onChange={() => toggle(s.key)} />
            ))}
          </div>
        </Card>
      )}

      {/* Gameplay */}
      {worldContent && featuredWorld.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <h3 style={sectionHead}>Gameplay</h3>
          <p style={sectionNote}>paper-world-defaults.yml</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {featuredWorld.map((s) => (
              <SettingRow key={s.key} label={s.label} description={s.description} value={values[s.key]} onChange={() => toggle(s.key)} />
            ))}
          </div>
        </Card>
      )}

      {/* Anti-Xray */}
      {antiXray && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <h3 style={{ ...sectionHead, marginBottom: 0 }}>Anti-Xray</h3>
            <Toggle value={antiXray.enabled} onChange={() => setAntiXray(prev => prev && { ...prev, enabled: !prev.enabled })} />
          </div>
          <p style={sectionNote}>paper-world-defaults.yml · hides ores from X-ray clients</p>

          {antiXray.enabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Engine Mode */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#CBD5E1', marginBottom: 8 }}>Engine Mode</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {ENGINE_MODES.map(({ mode }) => (
                    <button
                      key={mode}
                      onClick={() => setAntiXray(prev => prev && { ...prev, engineMode: mode })}
                      style={{
                        padding: '6px 16px', borderRadius: 6, border: 'none',
                        background: antiXray.engineMode === mode ? '#2563EB' : '#1E2A3A',
                        color: antiXray.engineMode === mode ? '#fff' : '#64748B',
                        cursor: 'pointer', fontSize: 12,
                        fontWeight: antiXray.engineMode === mode ? 600 : 400,
                      }}
                    >
                      Mode {mode}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: '#4B5563' }}>
                  {ENGINE_MODES.find(m => m.mode === antiXray.engineMode)?.desc}
                </div>
              </div>

              {/* Numeric settings */}
              <div style={{ display: 'flex', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#CBD5E1', marginBottom: 4 }}>Max Block Height</div>
                  <div style={{ fontSize: 12, color: '#4B5563', marginBottom: 6 }}>Y-level above which ores are not hidden</div>
                  <input
                    type="number" min={-64} max={320}
                    value={antiXray.maxBlockHeight}
                    onChange={e => setAntiXray(prev => prev && { ...prev, maxBlockHeight: Number(e.target.value) })}
                    style={numInput}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#CBD5E1', marginBottom: 4 }}>Update Radius</div>
                  <div style={{ fontSize: 12, color: '#4B5563', marginBottom: 6 }}>Blocks around player that get revealed (Mode 2)</div>
                  <input
                    type="number" min={0} max={8}
                    value={antiXray.updateRadius}
                    onChange={e => setAntiXray(prev => prev && { ...prev, updateRadius: Number(e.target.value) })}
                    style={numInput}
                  />
                </div>
              </div>

              {/* Toggles */}
              <SettingRow
                label="Lava Obscures"
                description="Treat blocks next to lava as hidden — reduces Nether false positives but may affect performance"
                value={antiXray.lavaObscures}
                onChange={() => setAntiXray(prev => prev && { ...prev, lavaObscures: !prev.lavaObscures })}
              />
              <SettingRow
                label="Use Permission"
                description="Players with paper.antixray.bypass can see ores normally (good for trusted staff)"
                value={antiXray.usePermission}
                onChange={() => setAntiXray(prev => prev && { ...prev, usePermission: !prev.usePermission })}
              />

              {/* Block lists */}
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#CBD5E1', marginBottom: 4 }}>Hidden Blocks</div>
                  <div style={{ fontSize: 12, color: '#4B5563', marginBottom: 6 }}>Blocks to hide from X-ray clients · one per line</div>
                  <textarea
                    value={antiXray.hiddenBlocks}
                    onChange={e => setAntiXray(prev => prev && { ...prev, hiddenBlocks: e.target.value })}
                    rows={10}
                    style={textareaStyle}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#CBD5E1', marginBottom: 4 }}>Replacement Blocks</div>
                  <div style={{ fontSize: 12, color: '#4B5563', marginBottom: 6 }}>Fake blocks sent to clients in Mode 2 · one per line</div>
                  <textarea
                    value={antiXray.replacementBlocks}
                    onChange={e => setAntiXray(prev => prev && { ...prev, replacementBlocks: e.target.value })}
                    rows={10}
                    style={textareaStyle}
                  />
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* All Other Settings */}
      {totalExtra > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => setShowExtra((v) => !v)}
          >
            <h3 style={{ ...sectionHead, marginBottom: 0 }}>All Other Settings ({totalExtra})</h3>
            <span style={{ color: '#64748B', fontSize: 13 }}>{showExtra ? '▲' : '▼'}</span>
          </div>

          {showExtra && (
            <div style={{ marginTop: 16 }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search settings…"
                onClick={e => e.stopPropagation()}
                style={{
                  width: '100%', padding: '7px 12px', background: '#0D1322',
                  border: '1px solid #2D3A4A', borderRadius: 7,
                  color: '#E2E8F0', fontSize: 13, outline: 'none',
                  marginBottom: 16, boxSizing: 'border-box',
                }}
              />

              {totalFiltered === 0 && (
                <div style={{ color: '#374151', textAlign: 'center', padding: '12px 0' }}>
                  No settings match "{search}"
                </div>
              )}

              {filteredExtraGlobal.length > 0 && (
                <>
                  <p style={{ ...sectionNote, marginBottom: 10 }}>paper-global.yml</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                    {filteredExtraGlobal.map((e) => (
                      <SettingRow key={e.key} label={formatKey(e.key)} description={e.key} value={e.value} onChange={() => toggleExtra(e.key, true)} />
                    ))}
                  </div>
                </>
              )}

              {filteredExtraWorld.length > 0 && (
                <>
                  <p style={{ ...sectionNote, marginBottom: 10 }}>paper-world-defaults.yml</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {filteredExtraWorld.map((e) => (
                      <SettingRow key={e.key} label={formatKey(e.key)} description={e.key} value={e.value} onChange={() => toggleExtra(e.key, false)} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      )}

      <div style={{ marginTop: 8, padding: '10px 14px', background: '#0D1322', borderRadius: 8, fontSize: 12, color: '#4B5563' }}>
        Changes take effect after the next server restart. For settings not listed here, edit the files directly in the Files tab.
      </div>
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────────

function SettingRow({ label, description, value, onChange }: {
  label: string; description: string; value: boolean; onChange: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#CBD5E1' }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{description}</div>}
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 40, height: 22, borderRadius: 11,
        background: value ? '#2563EB' : '#1E2A3A',
        position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
        flexShrink: 0, border: `1px solid ${value ? '#3B82F6' : '#2D3A4A'}`,
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 2, left: value ? 20 : 2, transition: 'left 0.2s',
      }} />
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const sectionHead: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, color: '#94A3B8',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8,
};

const sectionNote: React.CSSProperties = {
  fontSize: 12, color: '#4B5563', marginBottom: 16, marginTop: 0,
};

const numInput: React.CSSProperties = {
  padding: '5px 10px', background: '#0D1322',
  border: '1px solid #2D3A4A', borderRadius: 6,
  color: '#E2E8F0', fontSize: 13, outline: 'none', width: 80,
};

const textareaStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', background: '#0D1322',
  border: '1px solid #2D3A4A', borderRadius: 6,
  color: '#E2E8F0', fontSize: 12, outline: 'none',
  fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box',
};
