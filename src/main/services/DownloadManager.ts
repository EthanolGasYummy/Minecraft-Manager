import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';
import { BrowserWindow } from 'electron';

export interface VersionInfo {
  id: string;
  label: string;
  url?: string;
  recommended?: boolean;
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = (reqUrl: string, redirects = 0) => {
      if (redirects > 5) { reject(new Error('Too many redirects')); return; }
      const mod = reqUrl.startsWith('https') ? https : http;
      mod.get(reqUrl, { headers: { 'User-Agent': 'MinecraftManager/1.0' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          request(res.headers.location!, redirects + 1);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${reqUrl}`));
          return;
        }
        let data = '';
        res.on('data', (c: Buffer) => (data += c.toString()));
        res.on('end', () => resolve(data));
      }).on('error', reject);
    };
    request(url);
  });
}

async function downloadFile(
  url: string,
  dest: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = (reqUrl: string, redirects = 0) => {
      if (redirects > 10) { reject(new Error('Too many redirects')); return; }
      const mod = reqUrl.startsWith('https') ? https : http;
      mod.get(reqUrl, { headers: { 'User-Agent': 'MinecraftManager/1.0' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          request(res.headers.location!, redirects + 1);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} downloading ${reqUrl}`));
          return;
        }
        const total = parseInt(res.headers['content-length'] ?? '0', 10);
        let downloaded = 0;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const out = createWriteStream(dest);
        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          if (total) onProgress(Math.round((downloaded / total) * 100));
        });
        res.pipe(out);
        out.on('finish', resolve);
        out.on('error', reject);
        res.on('error', reject);
      }).on('error', reject);
    };
    request(url);
  });
}

// Version fetchers per server type
async function getPaperVersions(): Promise<VersionInfo[]> {
  const data = JSON.parse(await httpsGet('https://api.papermc.io/v2/projects/paper'));
  const versions: string[] = data.versions ?? [];
  return versions.reverse().map((v: string) => ({ id: v, label: v }));
}

async function getPurpurVersions(): Promise<VersionInfo[]> {
  const data = JSON.parse(await httpsGet('https://api.purpurmc.org/v2/purpur'));
  const versions: string[] = data.versions ?? [];
  return versions.reverse().map((v: string) => ({ id: v, label: v }));
}

async function getFabricVersions(): Promise<VersionInfo[]> {
  const data = JSON.parse(await httpsGet('https://meta.fabricmc.net/v2/versions/game'));
  return (data as Array<{ version: string; stable: boolean }>)
    .filter((v) => v.stable)
    .map((v) => ({ id: v.version, label: v.version, recommended: v.stable }));
}

async function getForgeVersions(): Promise<VersionInfo[]> {
  const data = JSON.parse(
    await httpsGet('https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json'),
  );
  const versions: string[] = Object.keys(data).reverse();
  return versions.map((v) => ({ id: v, label: v }));
}

async function getNeoForgeVersions(): Promise<VersionInfo[]> {
  const xml = await httpsGet(
    'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml',
  );
  const matches = [...xml.matchAll(/<version>([^<]+)<\/version>/g)];
  const versions = matches.map((m) => m[1]).reverse();
  // Group by MC version (e.g., 1.21.x → neoforge 21.x.x)
  const seen = new Set<string>();
  const result: VersionInfo[] = [];
  for (const v of versions) {
    const mc = neoforgeToMC(v);
    if (!seen.has(mc)) {
      seen.add(mc);
      result.push({ id: v, label: `${mc} (NeoForge ${v})` });
    }
  }
  return result;
}

function neoforgeToMC(neoVersion: string): string {
  // NeoForge 21.1.x → MC 1.21.1
  const parts = neoVersion.split('.');
  return `1.${parts[0]}.${parts[1] ?? '0'}`;
}

async function getVanillaVersions(): Promise<VersionInfo[]> {
  const data = JSON.parse(
    await httpsGet('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json'),
  );
  const versions = (data.versions as Array<{ id: string; type: string }>)
    .filter((v) => v.type === 'release');
  return versions.map((v) => ({ id: v.id, label: v.id }));
}

// Download the server jar
async function downloadPaper(
  version: string,
  destDir: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  const buildsData = JSON.parse(
    await httpsGet(`https://api.papermc.io/v2/projects/paper/versions/${version}/builds`),
  );
  const builds: Array<{ build: number; downloads: { application: { name: string } } }> =
    buildsData.builds;
  if (!builds.length) throw new Error(`No Paper builds found for ${version}`);
  const latest = builds[builds.length - 1];
  const jarName = latest.downloads.application.name;
  const url = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latest.build}/downloads/${jarName}`;
  const dest = path.join(destDir, 'server.jar');
  await downloadFile(url, dest, onProgress);
  return dest;
}

async function downloadPurpur(
  version: string,
  destDir: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  const url = `https://api.purpurmc.org/v2/purpur/${version}/latest/download`;
  const dest = path.join(destDir, 'server.jar');
  await downloadFile(url, dest, onProgress);
  return dest;
}

async function downloadFabric(
  version: string,
  destDir: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  const loaderData = JSON.parse(
    await httpsGet('https://meta.fabricmc.net/v2/versions/loader'),
  );
  const latestLoader = loaderData[0].version;
  const installerData = JSON.parse(
    await httpsGet('https://meta.fabricmc.net/v2/versions/installer'),
  );
  const latestInstaller = installerData[0].version;
  const url = `https://meta.fabricmc.net/v2/versions/loader/${version}/${latestLoader}/${latestInstaller}/server/jar`;
  const dest = path.join(destDir, 'server.jar');
  await downloadFile(url, dest, onProgress);
  return dest;
}

async function downloadVanilla(
  version: string,
  destDir: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  const manifest = JSON.parse(
    await httpsGet('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json'),
  );
  const versionMeta = (manifest.versions as Array<{ id: string; url: string }>).find(
    (v) => v.id === version,
  );
  if (!versionMeta) throw new Error(`Vanilla version ${version} not found`);
  const vData = JSON.parse(await httpsGet(versionMeta.url));
  const serverUrl = vData.downloads?.server?.url;
  if (!serverUrl) throw new Error(`No server download for vanilla ${version}`);
  const dest = path.join(destDir, 'server.jar');
  await downloadFile(serverUrl, dest, onProgress);
  return dest;
}

async function downloadForge(
  version: string,
  destDir: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  // Forge installer — users need to run it, but we handle the download
  const url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${version}/forge-${version}-installer.jar`;
  const dest = path.join(destDir, 'server.jar');
  await downloadFile(url, dest, onProgress);
  return dest;
}

async function downloadNeoForge(
  version: string,
  destDir: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  const url = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${version}/neoforge-${version}-installer.jar`;
  const dest = path.join(destDir, 'server.jar');
  await downloadFile(url, dest, onProgress);
  return dest;
}

export class DownloadManager {
  private static instance: DownloadManager;
  private win: BrowserWindow | null = null;

  private constructor() {}

  static getInstance(): DownloadManager {
    if (!DownloadManager.instance) DownloadManager.instance = new DownloadManager();
    return DownloadManager.instance;
  }

  setWindow(win: BrowserWindow | null) {
    this.win = win;
  }

  async getVersions(type: string): Promise<VersionInfo[]> {
    try {
      switch (type) {
        case 'paper': return await getPaperVersions();
        case 'purpur': return await getPurpurVersions();
        case 'fabric': return await getFabricVersions();
        case 'forge': return await getForgeVersions();
        case 'neoforge': return await getNeoForgeVersions();
        case 'vanilla': return await getVanillaVersions();
        default: throw new Error(`Unknown server type: ${type}`);
      }
    } catch (err) {
      console.error('getVersions error:', err);
      throw err;
    }
  }

  async downloadJar(
    type: string,
    version: string,
    destDir: string,
    progressId: string,
  ): Promise<string> {
    const onProgress = (pct: number) => {
      this.win?.webContents.send('download:progress', { id: progressId, pct, type, version });
    };

    fs.mkdirSync(destDir, { recursive: true });

    switch (type) {
      case 'paper': return downloadPaper(version, destDir, onProgress);
      case 'purpur': return downloadPurpur(version, destDir, onProgress);
      case 'fabric': return downloadFabric(version, destDir, onProgress);
      case 'forge': return downloadForge(version, destDir, onProgress);
      case 'neoforge': return downloadNeoForge(version, destDir, onProgress);
      case 'vanilla': return downloadVanilla(version, destDir, onProgress);
      default: throw new Error(`Unknown server type: ${type}`);
    }
  }
}
