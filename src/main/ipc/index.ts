import { BrowserWindow, ipcMain, app, shell, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import zlib from 'zlib';
import https from 'https';
import http from 'http';
import { ServerManager } from '../services/ServerManager';
import { JavaManager, javaVersionForMC } from '../services/JavaManager';
import { DownloadManager } from '../services/DownloadManager';
import { NetworkManager } from '../services/NetworkManager';
import { BackupManager } from '../services/BackupManager';
import { Store } from '../config/Store';
function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function isWorldDir(dirPath: string): boolean {
  try {
    const entries = fs.readdirSync(dirPath);
    return entries.includes('level.dat') || entries.includes('DIM-1') || entries.includes('DIM1') || entries.includes('region');
  } catch { return false; }
}

function httpsGetStr(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = (u: string, hops = 0): void => {
      if (hops > 5) return reject(new Error('Too many redirects'));
      const mod = u.startsWith('https') ? https : http;
      mod.get(u, { headers: { 'User-Agent': 'MinecraftManager/1.0' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) return req(res.headers.location!, hops + 1);
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        let d = '';
        res.on('data', (c: Buffer) => (d += c.toString()));
        res.on('end', () => resolve(d));
      }).on('error', reject);
    };
    req(url);
  });
}

function getWorldBorderSize(worldPath: string): number | null {
  try {
    const buf = zlib.gunzipSync(fs.readFileSync(path.join(worldPath, 'level.dat')));
    const name = Buffer.from('BorderSize');
    for (let i = 0; i < buf.length - 21; i++) {
      if (buf[i] === 6 && buf.readUInt16BE(i + 1) === 10 && buf.slice(i + 3, i + 13).equals(name)) {
        return buf.readDoubleBE(i + 13);
      }
    }
  } catch {}
  return null;
}

function getDirSize(dirPath: string): number {
  let size = 0;
  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) size += getDirSize(full);
      else { try { size += fs.statSync(full).size; } catch {} }
    }
  } catch {}
  return size;
}

export function setupIPC(
  win: BrowserWindow | null,
  serverManager: ServerManager,
  javaManager: JavaManager,
) {
  const downloadManager = DownloadManager.getInstance();
  const networkManager = NetworkManager.getInstance();
  const backupManager = BackupManager.getInstance();

  // Forward window to services that need to push events
  const setWin = (w: BrowserWindow | null) => {
    serverManager.setWindow(w);
    downloadManager.setWindow(w);
    networkManager.setWindow(w);
    backupManager.setWindow(w);
  };
  setWin(win);

  // ─── Server ───────────────────────────────────────────────────────────────
  ipcMain.handle('server:list', () => {
    const servers = Store.getServers();
    return Object.values(servers).map((s) => ({
      ...s,
      status: serverManager.getStatus(s.id),
      stats: serverManager.getStats(s.id),
      players: serverManager.getPlayers(s.id),
    }));
  });

  ipcMain.handle('server:create', async (_e, config: any) => {
    const id = generateId();
    const serverConfig = { ...config, id, createdAt: new Date().toISOString() };
    await serverManager.createServer(serverConfig);
    return serverConfig;
  });

  ipcMain.handle('server:start', async (_e, id: string) => {
    await serverManager.start(id, (msg) => {
      win?.webContents.send('server:log', { id, line: `[Manager] ${msg}` });
    });
  });

  ipcMain.handle('server:stop', async (_e, id: string) => {
    await serverManager.stop(id);
  });

  ipcMain.handle('server:restart', async (_e, id: string) => {
    await serverManager.restart(id);
  });

  ipcMain.handle('server:delete', async (_e, id: string, deleteFiles: boolean) => {
    await serverManager.deleteServer(id, deleteFiles);
  });

  ipcMain.handle('server:getStatus', (_e, id: string) => serverManager.getStatus(id));

  ipcMain.handle('server:sendCommand', (_e, id: string, cmd: string) => {
    serverManager.sendCommand(id, cmd);
  });

  ipcMain.handle('server:getStats', (_e, id: string) => serverManager.getStats(id));

  ipcMain.handle('server:updateConfig', (_e, id: string, config: any) => {
    const current = Store.getServer(id);
    if (!current) throw new Error(`Server ${id} not found`);
    Store.setServer(id, { ...current, ...config });
    serverManager.setupScheduledRestart(id);
  });

  ipcMain.handle('server:getProperties', (_e, id: string) => serverManager.getProperties(id));

  ipcMain.handle('server:setProperties', (_e, id: string, props: Record<string, string>) => {
    serverManager.setProperties(id, props);
  });

  ipcMain.handle('server:getLogs', (_e, id: string) => serverManager.getLogs(id));

  ipcMain.handle('server:getIcon', (_e, id: string) => {
    const config = Store.getServer(id);
    if (!config) return null;
    const iconPath = path.join(config.installDir, 'server-icon.png');
    if (!fs.existsSync(iconPath)) return null;
    const data = fs.readFileSync(iconPath);
    return `data:image/png;base64,${data.toString('base64')}`;
  });

  ipcMain.handle('server:setIcon', (_e, id: string, sourcePath: string) => {
    const config = Store.getServer(id);
    if (!config) return;
    fs.copyFileSync(sourcePath, path.join(config.installDir, 'server-icon.png'));
  });

  ipcMain.handle('server:removeIcon', (_e, id: string) => {
    const config = Store.getServer(id);
    if (!config) return;
    const iconPath = path.join(config.installDir, 'server-icon.png');
    if (fs.existsSync(iconPath)) fs.unlinkSync(iconPath);
  });
  ipcMain.handle('server:getPlayers', (_e, id: string) => serverManager.getPlayers(id));
  ipcMain.handle('server:getOps', (_e, id: string) => serverManager.getOps(id));
  ipcMain.handle('server:getWhitelist', (_e, id: string) => serverManager.getWhitelist(id));
  ipcMain.handle('server:getBannedPlayers', (_e, id: string) => serverManager.getBannedPlayers(id));

  ipcMain.handle('server:getCrashReport', (_e, id: string) => {
    const config = Store.getServer(id);
    if (!config) return null;
    const dir = path.join(config.installDir, 'crash-reports');
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.txt') || f.endsWith('.log'))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (!files.length) return null;
    return { name: files[0].name, content: fs.readFileSync(path.join(dir, files[0].name), 'utf8') };
  });

  ipcMain.handle('server:importDir', (_e, dirPath: string) => {
    if (!fs.existsSync(dirPath)) throw new Error('Folder not found');
    const entries = fs.readdirSync(dirPath);
    let type = 'vanilla';
    let mcVersion = 'unknown';
    for (const file of entries) {
      if (!file.endsWith('.jar')) continue;
      const lower = file.toLowerCase();
      if (lower.includes('neoforge')) type = 'neoforge';
      else if (lower.includes('paper')) type = 'paper';
      else if (lower.includes('purpur')) type = 'purpur';
      else if (lower.includes('fabric')) type = 'fabric';
      else if (lower.includes('forge')) type = 'forge';
      const vMatch = file.match(/(\d+\.\d+(?:\.\d+)?)/);
      if (vMatch) mcVersion = vMatch[1];
      break;
    }
    const propsPath = path.join(dirPath, 'server.properties');
    let port = 25565;
    let name = path.basename(dirPath);
    if (fs.existsSync(propsPath)) {
      const content = fs.readFileSync(propsPath, 'utf8');
      const portMatch = content.match(/^server-port=(\d+)/m);
      const motdMatch = content.match(/^motd=(.+)/m);
      if (portMatch) port = parseInt(portMatch[1]);
      if (motdMatch) {
        const motd = motdMatch[1].trim().replace(/§./g, '').trim();
        if (motd) name = motd;
      }
    }
    return { type, mcVersion, port, name, installDir: dirPath };
  });

  ipcMain.handle('server:exportConfig', (_e, id: string) => {
    const config = Store.getServer(id);
    if (!config) return null;
    const backupSchedule = Store.getBackupSchedule(id);
    const { id: _id, createdAt: _ct, installDir: _dir, ...rest } = config as any;
    return JSON.stringify({ mcmVersion: 1, server: { ...rest, backupSchedule } }, null, 2);
  });

  ipcMain.handle('server:saveExportFile', async (_e, content: string, suggestedName: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: `${suggestedName.replace(/[^a-z0-9]/gi, '_')}.mcm`,
      filters: [{ name: 'MC Manager Config', extensions: ['mcm'] }],
    });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, content, 'utf8');
    return true;
  });

  ipcMain.handle('server:getWorlds', (_e, id: string) => {
    const config = Store.getServer(id);
    if (!config) return [];
    const results: { name: string; path: string; size: number; borderSize: number | null }[] = [];
    try {
      for (const entry of fs.readdirSync(config.installDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const worldPath = path.join(config.installDir, entry.name);
        if (!isWorldDir(worldPath)) continue;
        results.push({ name: entry.name, path: worldPath, size: getDirSize(worldPath), borderSize: getWorldBorderSize(worldPath) });
      }
    } catch {}
    return results;
  });

  ipcMain.handle('server:resetWorld', (_e, id: string, worldName: string) => {
    const config = Store.getServer(id);
    if (!config) throw new Error('Server not found');
    const status = serverManager.getStatus(id);
    if (status === 'online' || status === 'starting') throw new Error('Stop the server before resetting a world');
    const worldPath = path.join(config.installDir, worldName);
    if (!fs.existsSync(worldPath)) throw new Error('World folder not found');
    if (!path.resolve(worldPath).startsWith(path.resolve(config.installDir))) throw new Error('Invalid path');
    fs.rmSync(worldPath, { recursive: true, force: true });
  });

  ipcMain.handle('server:saveLog', async (_e, id: string) => {
    const config = Store.getServer(id);
    if (!config) return false;
    const logPath = path.join(config.installDir, 'logs', 'latest.log');
    if (!fs.existsSync(logPath)) throw new Error('Log file not found — run the server first');
    const result = await dialog.showSaveDialog({
      defaultPath: 'latest.log',
      filters: [{ name: 'Log Files', extensions: ['log', 'txt'] }],
    });
    if (result.canceled || !result.filePath) return false;
    fs.copyFileSync(logPath, result.filePath);
    return true;
  });

  // Banned IPs
  ipcMain.handle('server:getBannedIps', (_e, id: string) => {
    const config = Store.getServer(id);
    if (!config) return [];
    try {
      const f = path.join(config.installDir, 'banned-ips.json');
      if (!fs.existsSync(f)) return [];
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch { return []; }
  });

  ipcMain.handle('server:addBannedIp', async (_e, id: string, ip: string, reason: string) => {
    const config = Store.getServer(id);
    if (!config) return;
    const status = serverManager.getStatus(id);
    if (status === 'online' || status === 'starting') {
      serverManager.sendCommand(id, `ban-ip ${ip}${reason ? ' ' + reason : ''}`);
      await new Promise((r) => setTimeout(r, 600));
      return;
    }
    const f = path.join(config.installDir, 'banned-ips.json');
    let list: any[] = [];
    try { list = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
    if (!list.find((e: any) => e.ip === ip)) {
      list.push({ ip, source: 'Server', created: new Date().toISOString(), expires: 'forever', reason: reason || 'Banned by operator.' });
      fs.writeFileSync(f, JSON.stringify(list, null, 2), 'utf8');
    }
  });

  ipcMain.handle('server:removeBannedIp', async (_e, id: string, ip: string) => {
    const config = Store.getServer(id);
    if (!config) return;
    const status = serverManager.getStatus(id);
    if (status === 'online' || status === 'starting') {
      serverManager.sendCommand(id, `pardon-ip ${ip}`);
      await new Promise((r) => setTimeout(r, 600));
      return;
    }
    const f = path.join(config.installDir, 'banned-ips.json');
    try {
      let list = JSON.parse(fs.readFileSync(f, 'utf8'));
      list = list.filter((e: any) => e.ip !== ip);
      fs.writeFileSync(f, JSON.stringify(list, null, 2), 'utf8');
    } catch {}
  });

  // Version updater (Paper + Purpur only)
  ipcMain.handle('server:checkForUpdate', async (_e, id: string) => {
    const config = Store.getServer(id);
    if (!config) return null;
    if (config.type !== 'paper' && config.type !== 'purpur') return null;
    try {
      let latestBuild: number;
      if (config.type === 'paper') {
        const data = JSON.parse(await httpsGetStr(`https://api.papermc.io/v2/projects/paper/versions/${config.mcVersion}/builds`));
        const builds = data.builds as Array<{ build: number }>;
        latestBuild = builds[builds.length - 1].build;
      } else {
        const data = JSON.parse(await httpsGetStr(`https://api.purpurmc.org/v2/purpur/${config.mcVersion}`));
        latestBuild = parseInt(data.builds.latest, 10);
      }
      const buildFile = path.join(config.installDir, '.mcm-build.json');
      let currentBuild: number | null = null;
      if (fs.existsSync(buildFile)) {
        try { currentBuild = JSON.parse(fs.readFileSync(buildFile, 'utf8')).build ?? null; } catch {}
      }
      return { latestBuild, currentBuild, hasUpdate: currentBuild === null || latestBuild > currentBuild };
    } catch { return null; }
  });

  ipcMain.handle('server:updateServer', async (_e, id: string) => {
    const config = Store.getServer(id);
    if (!config) throw new Error('Server not found');
    const status = serverManager.getStatus(id);
    if (status === 'online' || status === 'starting') throw new Error('Stop the server before updating');
    let latestBuild: number | null = null;
    try {
      if (config.type === 'paper') {
        const data = JSON.parse(await httpsGetStr(`https://api.papermc.io/v2/projects/paper/versions/${config.mcVersion}/builds`));
        const builds = data.builds as Array<{ build: number }>;
        latestBuild = builds[builds.length - 1].build;
      } else if (config.type === 'purpur') {
        const data = JSON.parse(await httpsGetStr(`https://api.purpurmc.org/v2/purpur/${config.mcVersion}`));
        latestBuild = parseInt(data.builds.latest, 10);
      }
    } catch {}
    await downloadManager.downloadJar(config.type, config.mcVersion, config.installDir, generateId());
    if (latestBuild !== null) {
      const buildFile = path.join(config.installDir, '.mcm-build.json');
      fs.writeFileSync(buildFile, JSON.stringify({ build: latestBuild, type: config.type, mcVersion: config.mcVersion, updatedAt: new Date().toISOString() }), 'utf8');
    }
    return { build: latestBuild };
  });

  ipcMain.handle('server:readImportFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'MC Manager Config', extensions: ['mcm'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
  });

  // ─── Downloads ────────────────────────────────────────────────────────────
  ipcMain.handle('download:getVersions', async (_e, type: string) => {
    return downloadManager.getVersions(type);
  });

  ipcMain.handle(
    'download:downloadJar',
    async (_e, type: string, version: string, destDir: string) => {
      const id = generateId();
      return downloadManager.downloadJar(type, version, destDir, id);
    },
  );

  // ─── Java ─────────────────────────────────────────────────────────────────
  ipcMain.handle('java:detectSystem', async () => {
    return javaManager.detectSystemJava();
  });

  ipcMain.handle('java:ensureRuntime', async (_e, mcVersion: string) => {
    const major = javaVersionForMC(mcVersion);
    return javaManager.ensureRuntime(major, (pct, msg) => {
      win?.webContents.send('download:progress', { id: 'java', pct, msg });
    });
  });

  ipcMain.handle('java:listManaged', () => javaManager.listManaged());

  ipcMain.handle('java:deleteManaged', (_e, major: number) => {
    javaManager.deleteManaged(major);
  });

  // ─── Network ──────────────────────────────────────────────────────────────
  ipcMain.handle('network:getPublicIP', () => networkManager.getPublicIP());
  ipcMain.handle('network:getLocalIP', () => networkManager.getLocalIP());
  ipcMain.handle('network:detectCGNAT', () => networkManager.detectCGNAT());
  ipcMain.handle('network:checkPort', (_e, port: number) => networkManager.checkPort(port));
  ipcMain.handle('network:upnpMap', (_e, port: number) => networkManager.upnpMap(port));
  ipcMain.handle('network:upnpUnmap', (_e, port: number) => networkManager.upnpUnmap(port));

  ipcMain.handle('network:duckdnsUpdate', async (_e, subdomain: string, token: string) => {
    return networkManager.duckdnsUpdate(subdomain, token);
  });

  ipcMain.handle('network:playitStart', async (_e, serverId: string) => {
    return networkManager.playitStart(serverId);
  });

  ipcMain.handle('network:playitStop', (_e, serverId: string) => {
    networkManager.playitStop(serverId);
  });

  ipcMain.handle('network:playitStatus', (_e, serverId: string) => {
    return networkManager.playitStatus(serverId);
  });

  // ─── Files ────────────────────────────────────────────────────────────────
  ipcMain.handle('files:listDir', (_e, serverPath: string, subPath: string) => {
    const full = path.join(serverPath, subPath);
    if (!fs.existsSync(full)) return [];
    const entries = fs.readdirSync(full, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      isDir: e.isDirectory(),
      size: e.isFile() ? fs.statSync(path.join(full, e.name)).size : 0,
      modified: fs.statSync(path.join(full, e.name)).mtime.toISOString(),
    }));
  });

  ipcMain.handle('files:readFile', (_e, filePath: string) => {
    if (!fs.existsSync(filePath)) throw new Error('File not found');
    return fs.readFileSync(filePath, 'utf8');
  });

  ipcMain.handle('files:writeFile', (_e, filePath: string, content: string) => {
    fs.writeFileSync(filePath, content, 'utf8');
  });

  ipcMain.handle('files:deleteFile', (_e, filePath: string) => {
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) fs.rmSync(filePath, { recursive: true });
      else fs.unlinkSync(filePath);
    }
  });

  ipcMain.handle('files:openFolder', (_e, folderPath: string) => {
    shell.openPath(folderPath);
  });

  ipcMain.handle('files:pickFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('files:pickFile', async (_e, filters: any[]) => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('files:copyFile', (_e, src: string, dest: string) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  });

  ipcMain.handle('files:downloadMod', async (_e, url: string, installDir: string, subDir: string, filename: string) => {
    const https = require('https');
    const http = require('http');
    const destDir = path.join(installDir, subDir);
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, filename);
    await new Promise<void>((resolve, reject) => {
      const request = (reqUrl: string, hops = 0) => {
        if (hops > 10) { reject(new Error('Too many redirects')); return; }
        const mod = reqUrl.startsWith('https') ? https : http;
        mod.get(reqUrl, { headers: { 'User-Agent': 'MinecraftManager/1.0' } }, (res: any) => {
          if ([301, 302, 307, 308].includes(res.statusCode)) { request(res.headers.location, hops + 1); return; }
          if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
          const out = fs.createWriteStream(dest);
          res.pipe(out);
          out.on('finish', resolve);
          out.on('error', reject);
        }).on('error', reject);
      };
      request(url);
    });
    return dest;
  });

  // ─── Backups ──────────────────────────────────────────────────────────────
  ipcMain.handle('backup:create', async (_e, serverId: string) => {
    return backupManager.createBackup(serverId);
  });

  ipcMain.handle('backup:list', (_e, serverId: string) => backupManager.listBackups(serverId));

  ipcMain.handle('backup:restore', async (_e, serverId: string, backupPath: string) => {
    await backupManager.restoreBackup(serverId, backupPath);
  });

  ipcMain.handle('backup:delete', (_e, backupPath: string) => {
    backupManager.deleteBackup(backupPath);
  });

  ipcMain.handle('backup:getSchedule', (_e, serverId: string) => Store.getBackupSchedule(serverId));

  ipcMain.handle('backup:setSchedule', (_e, serverId: string, schedule: any) => {
    Store.setBackupSchedule(serverId, schedule);
    backupManager.setupSchedule(serverId);
  });

  // ─── System ───────────────────────────────────────────────────────────────
  ipcMain.handle('system:getTotalRAM', () => Math.round(os.totalmem() / 1024 / 1024));

  ipcMain.handle('system:getAppVersion', () => app.getVersion());

  ipcMain.handle('system:openExternal', (_e, url: string) => shell.openExternal(url));

  ipcMain.handle('system:getOnboardingDone', () => Store.getSettings().onboardingDone);

  ipcMain.handle('system:setOnboardingDone', () => {
    Store.setSettings({ onboardingDone: true });
  });

  ipcMain.handle('system:getSettings', () => Store.getSettings());

  ipcMain.handle('system:setSettings', (_e, settings: any) => {
    Store.setSettings(settings);
  });

  ipcMain.handle('system:minimize', () => win?.minimize());
  ipcMain.handle('system:maximize', () => {
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });
  ipcMain.handle('system:close', () => win?.close());
}
