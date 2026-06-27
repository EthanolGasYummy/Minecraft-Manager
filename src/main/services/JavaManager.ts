import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';
import https from 'https';
import http from 'http';
import { pipeline } from 'stream/promises';
import { createWriteStream, createReadStream } from 'fs';
import os from 'os';
import extractZip from 'extract-zip';

const execFileAsync = promisify(execFile);

export interface JavaInstall {
  major: number;
  path: string;     // path to java executable
  managed: boolean; // true = we installed it
  version: string;
}

// Minecraft version → required Java major
export function javaVersionForMC(mcVersion: string): number {
  const parts = mcVersion.split('.').map(Number);
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;

  if (minor >= 21) return 21;
  if (minor === 20 && patch >= 5) return 21;
  if (minor >= 18) return 17;
  if (minor === 17) return 17;
  return 8;
}

function adoptiumAsset(major: number): { url: string; ext: string } {
  const platform = os.platform() === 'win32' ? 'windows' : os.platform() === 'darwin' ? 'mac' : 'linux';
  const arch = os.arch() === 'arm64' ? 'aarch64' : 'x64';
  const imageType = 'jre';
  const ext = platform === 'windows' ? 'zip' : 'tar.gz';
  // Use Adoptium API to find the right binary
  const url = `https://api.adoptium.net/v3/binary/latest/${major}/ga/${platform}/${arch}/${imageType}/hotspot/normal/eclipse?project=jdk`;
  return { url, ext };
}

async function downloadFile(url: string, dest: string, onProgress?: (pct: number) => void): Promise<void> {
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
        const out = createWriteStream(dest);
        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          if (total && onProgress) onProgress(Math.round((downloaded / total) * 100));
        });
        res.pipe(out);
        out.on('finish', () => resolve());
        out.on('error', reject);
      }).on('error', reject);
    };
    request(url);
  });
}

async function extractArchive(archivePath: string, destDir: string): Promise<string> {
  fs.mkdirSync(destDir, { recursive: true });
  const ext = archivePath.endsWith('.zip') ? 'zip' : 'tar.gz';

  if (ext === 'zip') {
    await extractZip(archivePath, { dir: destDir });
  } else {
    // tar.gz — use node's built-in zlib + tar
    const tar = await import('tar');
    await tar.x({ file: archivePath, cwd: destDir });
  }

  // Find the extracted JRE root dir (typically jdk-21.x+y-jre or similar)
  const entries = fs.readdirSync(destDir);
  return path.join(destDir, entries[0]);
}

export class JavaManager {
  private static instance: JavaManager;
  private runtimesDir: string;
  private cache: Map<number, JavaInstall> = new Map();

  private constructor() {
    this.runtimesDir = path.join(app.getPath('userData'), 'runtimes');
    fs.mkdirSync(this.runtimesDir, { recursive: true });
  }

  static getInstance(): JavaManager {
    if (!JavaManager.instance) JavaManager.instance = new JavaManager();
    return JavaManager.instance;
  }

  // Try to find a java executable and return its major version
  private async probeJava(javaBin: string): Promise<number | null> {
    try {
      const { stdout } = await execFileAsync(javaBin, ['-version'], { timeout: 5000 });
      // java -version prints to stderr on most JREs
      const combined = stdout;
      const match = combined.match(/version "(\d+)/);
      if (match) return parseInt(match[1], 10);
      return null;
    } catch {
      return null;
    }
  }

  private async probeJavaStderr(javaBin: string): Promise<number | null> {
    return new Promise((resolve) => {
      const child = require('child_process').spawn(javaBin, ['-version'], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
      child.on('close', () => {
        const match = stderr.match(/version "(\d+)/);
        resolve(match ? parseInt(match[1], 10) : null);
      });
      child.on('error', () => resolve(null));
    });
  }

  async detectSystemJava(): Promise<JavaInstall[]> {
    const candidates: string[] = [];
    if (process.platform === 'win32') {
      candidates.push(
        'java',
        'C:\\Program Files\\Java\\jre*\\bin\\java.exe',
        'C:\\Program Files\\Eclipse Adoptium\\*\\bin\\java.exe',
      );
    } else {
      candidates.push('/usr/bin/java', '/usr/local/bin/java');
    }

    const found: JavaInstall[] = [];
    for (const c of candidates) {
      const major = await this.probeJavaStderr(c);
      if (major) {
        found.push({ major, path: c, managed: false, version: `${major}` });
      }
    }
    return found;
  }

  listManaged(): JavaInstall[] {
    if (!fs.existsSync(this.runtimesDir)) return [];
    const entries = fs.readdirSync(this.runtimesDir, { withFileTypes: true });
    const result: JavaInstall[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const match = e.name.match(/^java-(\d+)$/);
      if (!match) continue;
      const major = parseInt(match[1], 10);
      const bin = this.getBinPath(major);
      if (fs.existsSync(bin)) {
        result.push({ major, path: bin, managed: true, version: `${major}` });
      }
    }
    return result;
  }

  private getBinPath(major: number): string {
    const ext = process.platform === 'win32' ? '.exe' : '';
    return path.join(this.runtimesDir, `java-${major}`, 'bin', `java${ext}`);
  }

  async ensureRuntime(
    major: number,
    onProgress?: (pct: number, msg: string) => void,
  ): Promise<string> {
    // Check cached
    if (this.cache.has(major)) return this.cache.get(major)!.path;

    // Check managed
    const bin = this.getBinPath(major);
    if (fs.existsSync(bin)) {
      this.cache.set(major, { major, path: bin, managed: true, version: `${major}` });
      return bin;
    }

    // Download
    onProgress?.(0, `Downloading Java ${major}…`);
    const { url, ext } = adoptiumAsset(major);
    const archivePath = path.join(os.tmpdir(), `java-${major}.${ext}`);

    await downloadFile(url, archivePath, (pct) => {
      onProgress?.(pct * 0.8, `Downloading Java ${major}… ${pct}%`);
    });

    onProgress?.(80, `Extracting Java ${major}…`);
    const destDir = path.join(this.runtimesDir, `java-${major}`);
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true });

    const extractedRoot = await extractArchive(archivePath, destDir);

    // Flatten: move contents of extractedRoot into destDir
    const contents = fs.readdirSync(extractedRoot);
    for (const item of contents) {
      fs.renameSync(path.join(extractedRoot, item), path.join(destDir, item));
    }
    try { fs.rmdirSync(extractedRoot); } catch {}

    fs.unlinkSync(archivePath);

    if (process.platform !== 'win32') {
      fs.chmodSync(bin, 0o755);
    }

    onProgress?.(100, `Java ${major} ready`);
    this.cache.set(major, { major, path: bin, managed: true, version: `${major}` });
    return bin;
  }

  deleteManaged(major: number) {
    const dir = path.join(this.runtimesDir, `java-${major}`);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
    this.cache.delete(major);
  }
}
