import https from 'https';
import http from 'http';
import os from 'os';
import net from 'net';
import { BrowserWindow, shell, net as electronNet } from 'electron';
import { ChildProcess, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 10000, headers: { 'User-Agent': 'MinecraftManager/1.0' } }, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => (data += c.toString()));
      res.on('end', () => resolve(data.trim()));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

function isCGNATRange(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  // 100.64.0.0/10
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  return false;
}

export class NetworkManager {
  private static instance: NetworkManager;
  private win: BrowserWindow | null = null;
  private playitProcesses: Map<string, ChildProcess> = new Map();
  private playitAddresses: Map<string, string> = new Map();
  private duckdnsIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  private constructor() {}

  static getInstance(): NetworkManager {
    if (!NetworkManager.instance) NetworkManager.instance = new NetworkManager();
    return NetworkManager.instance;
  }

  setWindow(win: BrowserWindow | null) { this.win = win; }

  private emit(channel: string, ...args: unknown[]) {
    this.win?.webContents.send(channel, ...args);
  }

  async getPublicIP(): Promise<string> {
    const services = [
      'https://api.ipify.org',
      'https://icanhazip.com',
      'https://ipecho.net/plain',
    ];
    for (const s of services) {
      try {
        const ip = await httpsGet(s);
        if (net.isIPv4(ip)) return ip;
      } catch {}
    }
    throw new Error('Could not determine public IP');
  }

  getLocalIP(): string {
    const interfaces = os.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
      for (const addr of iface ?? []) {
        if (!addr.internal && addr.family === 'IPv4') return addr.address;
      }
    }
    return '127.0.0.1';
  }

  async detectCGNAT(): Promise<{ isCGNAT: boolean; publicIP: string; localIP: string; reason: string }> {
    const localIP = this.getLocalIP();
    let publicIP = '';
    let isCGNAT = false;
    let reason = '';

    try {
      publicIP = await this.getPublicIP();
    } catch {
      return { isCGNAT: false, publicIP: 'Unknown', localIP, reason: 'Could not fetch public IP' };
    }

    if (isCGNATRange(publicIP)) {
      isCGNAT = true;
      reason = `Your public IP (${publicIP}) is in the CGNAT range (100.64.0.0/10). Port forwarding won't work.`;
    }

    return { isCGNAT, publicIP, localIP, reason };
  }

  async checkPort(port: number): Promise<{ external: boolean; local: boolean; upnp: boolean }> {
    const [external, local] = await Promise.all([
      this.checkExternalPort(port),
      this.checkLocalPort(port),
    ]);
    return { external, local, upnp: false }; // UPnP status checked separately
  }

  private async checkExternalPort(port: number): Promise<boolean> {
    try {
      const publicIP = await this.getPublicIP();
      // Use portchecker.co public API — checks from outside our network
      return new Promise((resolve) => {
        const body = JSON.stringify({ host: publicIP, ports: [port] });
        const req = https.request(
          {
            hostname: 'portchecker.co',
            path: '/api/v1/query',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
              'User-Agent': 'MinecraftManager/1.0',
            },
            timeout: 15000,
          },
          (res) => {
            let data = '';
            res.on('data', (c: Buffer) => (data += c.toString()));
            res.on('end', () => {
              try {
                const json = JSON.parse(data);
                resolve(json.ports?.[0]?.isOpen === true);
              } catch {
                resolve(false);
              }
            });
          },
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.write(body);
        req.end();
      });
    } catch {
      return false;
    }
  }

  private checkLocalPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const sock = net.createConnection({ host: '127.0.0.1', port, timeout: 2000 });
      sock.once('connect', () => { sock.destroy(); resolve(true); });
      sock.once('error', () => resolve(false));
      sock.once('timeout', () => { sock.destroy(); resolve(false); });
    });
  }

  async upnpMap(port: number): Promise<{ success: boolean; error?: string }> {
    try {
      const NatUpnp = require('nat-upnp');
      const client = NatUpnp.createClient();
      await new Promise<void>((resolve, reject) => {
        client.portMapping(
          {
            public: port,
            private: port,
            ttl: 86400,
            description: 'Minecraft Manager Server',
            protocol: 'tcp',
          },
          (err: Error | null) => {
            client.close();
            if (err) reject(err);
            else resolve();
          },
        );
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'UPnP failed — check if UPnP is enabled on your router' };
    }
  }

  async upnpUnmap(port: number): Promise<void> {
    try {
      const NatUpnp = require('nat-upnp');
      const client = NatUpnp.createClient();
      await new Promise<void>((resolve) => {
        client.portUnmapping({ public: port, protocol: 'tcp' }, () => { client.close(); resolve(); });
      });
    } catch {}
  }

  async duckdnsUpdate(subdomain: string, token: string): Promise<{ ok: boolean; ip: string }> {
    try {
      const domain = subdomain.trim().replace(/\.duckdns\.org$/i, '').trim();
      const tok = token.trim();
      const url = `https://www.duckdns.org/update?domains=${encodeURIComponent(domain)}&token=${encodeURIComponent(tok)}&ip=`;
      const res = await electronNet.fetch(url);
      const text = (await res.text()).trim();
      const ok = text === 'OK' || text.startsWith('OK');
      let ip = '';
      try { ip = await this.getPublicIP(); } catch {}
      return { ok, ip };
    } catch {
      return { ok: false, ip: '' };
    }
  }

  startDuckDNSRefresh(subdomain: string, token: string, serverId: string) {
    this.stopDuckDNSRefresh(serverId);
    const interval = setInterval(async () => {
      try {
        await this.duckdnsUpdate(subdomain, token);
      } catch {}
    }, 5 * 60 * 1000); // every 5 minutes
    this.duckdnsIntervals.set(serverId, interval);
  }

  stopDuckDNSRefresh(serverId: string) {
    const i = this.duckdnsIntervals.get(serverId);
    if (i) { clearInterval(i); this.duckdnsIntervals.delete(serverId); }
  }

  // playit.gg integration
  async playitStart(serverId: string): Promise<{ claimUrl?: string; tunnelAddress?: string }> {
    const existing = this.playitProcesses.get(serverId);
    if (existing) return { tunnelAddress: this.playitAddresses.get(serverId) };

    const playitDir = path.join(app.getPath('userData'), 'playit');
    fs.mkdirSync(playitDir, { recursive: true });
    const playitBin = path.join(playitDir, process.platform === 'win32' ? 'playit.exe' : 'playit');

    // Download playit if not present
    if (!fs.existsSync(playitBin)) {
      await this.downloadPlayit(playitBin);
    }

    let claimUrl: string | undefined;
    let tunnelAddress: string | undefined;

    const proc = spawn(playitBin, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.playitProcesses.set(serverId, proc);

    // Notify renderer that the process is now running (tunnel address comes later via stdout)
    proc.on('spawn', () => {
      this.emit('playit:status', { serverId, running: true });
    });

    // Strip ANSI escape codes (playit uses colored terminal output)
    const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*[mGKHFABCDJK]/g, '').replace(/\r/g, '');

    // playit v1.0+ stores config at the secret_path printed on startup
    let secretPath: string | undefined;

    const readAddressFromConfig = () => {
      if (!secretPath || tunnelAddress) return;
      try {
        const toml = fs.readFileSync(secretPath, 'utf8');
        // Try multiple field name variations across playit versions
        const ipMatch = toml.match(/tunnel_ip\s*=\s*"([^"]+)"/);
        const portMatch = toml.match(/(?:tunnel_from_port|port_start|from_port)\s*=\s*(\d+)/);
        if (ipMatch && portMatch) {
          tunnelAddress = `${ipMatch[1]}:${portMatch[1]}`;
          this.playitAddresses.set(serverId, tunnelAddress);
          this.emit('playit:status', { serverId, tunnelAddress });
        }
      } catch {}
    };

    const processOutput = (raw: string) => {
      const line = stripAnsi(raw).trim();
      if (!line) return;
      this.emit('playit:status', { serverId, line });

      // Extract config file path from the startup line
      if (!secretPath) {
        const m = line.match(/secret_path=Some\("([^"]+)"\)/);
        if (m) secretPath = m[1].replace(/\\\\/g, '\\');
      }

      // Parse claim URL
      const claimMatch = line.match(/https:\/\/playit\.gg\/claim\/[a-zA-Z0-9]+/);
      if (claimMatch && !claimUrl) {
        claimUrl = claimMatch[0];
        this.emit('playit:status', { serverId, claimUrl });
        shell.openExternal(claimUrl);
      }

      // v1.0+: tunnels are stored in config — read file once tunnels report as loaded
      if (!tunnelAddress && line.includes('tunnels loaded')) {
        readAddressFromConfig();
        // Signal that tunnels are active even if we can't get the address yet
        const countMatch = line.match(/tunnel_count=(\d+)/);
        if (countMatch && parseInt(countMatch[1]) > 0) {
          this.emit('playit:status', { serverId, tunnelsActive: parseInt(countMatch[1]) });
        }
      }

      // Catch structured log fields: ip=X.X.X.X port=N or host=X.X.X.X port=N
      const structMatch = line.match(/(?:ip|host|addr)\s*=\s*["]?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})["]?.*?port\s*=\s*["]?(\d{4,5})/i);
      if (structMatch && !tunnelAddress) {
        tunnelAddress = `${structMatch[1]}:${structMatch[2]}`;
        this.playitAddresses.set(serverId, tunnelAddress);
        this.emit('playit:status', { serverId, tunnelAddress });
      }

      // Older versions / hostname-based addresses printed directly to stdout
      const domainMatch = line.match(/([a-zA-Z0-9][a-zA-Z0-9.-]+\.(?:joinmc\.link|playit\.gg|try\.direct):\d+)/);
      const ipPortMatch = line.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{4,5})\b/);
      const found = domainMatch?.[1] ?? ipPortMatch?.[1];
      if (found && !tunnelAddress) {
        tunnelAddress = found;
        this.playitAddresses.set(serverId, tunnelAddress);
        this.emit('playit:status', { serverId, tunnelAddress });
      }
    };

    const makeReader = () => {
      let buf = '';
      return (d: Buffer) => {
        buf += d.toString();
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        lines.forEach(processOutput);
      };
    };
    proc.stdout?.on('data', makeReader());
    proc.stderr?.on('data', makeReader());

    proc.on('close', () => {
      this.playitProcesses.delete(serverId);
      this.emit('playit:status', { serverId, stopped: true });
    });

    return { claimUrl, tunnelAddress };
  }

  playitStop(serverId: string) {
    const proc = this.playitProcesses.get(serverId);
    if (proc) {
      proc.kill();
      this.playitProcesses.delete(serverId);
      this.playitAddresses.delete(serverId);
    }
  }

  playitStatus(serverId: string): { running: boolean; tunnelAddress?: string } {
    return {
      running: this.playitProcesses.has(serverId),
      tunnelAddress: this.playitAddresses.get(serverId),
    };
  }

  private async getPlayitDownloadUrl(): Promise<string> {
    return new Promise((resolve, reject) => {
      https.get(
        'https://api.github.com/repos/playit-cloud/playit-agent/releases/latest',
        { headers: { 'User-Agent': 'MinecraftManager/1.0', Accept: 'application/vnd.github.v3+json' } },
        (res) => {
          let data = '';
          res.on('data', (c: Buffer) => (data += c.toString()));
          res.on('end', () => {
            try {
              const release = JSON.parse(data);
              const platform = process.platform;
              const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';

              const terms: string[] =
                platform === 'win32' ? ['windows', arch, '.exe'] :
                platform === 'darwin' ? ['darwin', arch] :
                ['linux', arch];

              const asset = (release.assets as any[])?.find((a: any) =>
                terms.every((t) => a.name.toLowerCase().includes(t)),
              );

              if (asset?.browser_download_url) {
                resolve(asset.browser_download_url);
              } else {
                reject(new Error(`No playit binary found for ${platform}/${arch} in release ${release.tag_name}`));
              }
            } catch (e: any) {
              reject(new Error(`Failed to parse GitHub release: ${e.message}`));
            }
          });
        },
      ).on('error', reject);
    });
  }

  private async downloadPlayit(dest: string): Promise<void> {
    const url = await this.getPlayitDownloadUrl();

    await new Promise<void>((resolve, reject) => {
      const request = (reqUrl: string, redirects = 0) => {
        if (redirects > 10) { reject(new Error('Too many redirects')); return; }
        const mod = reqUrl.startsWith('https') ? https : http;
        mod.get(reqUrl, { headers: { 'User-Agent': 'MinecraftManager/1.0' } }, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
            request(res.headers.location!, redirects + 1);
            return;
          }
          if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
          const out = fs.createWriteStream(dest);
          res.pipe(out);
          out.on('finish', resolve);
          out.on('error', reject);
        }).on('error', reject);
      };
      request(url);
    });

    if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
  }
}
