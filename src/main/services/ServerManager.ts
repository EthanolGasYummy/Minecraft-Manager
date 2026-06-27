import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { BrowserWindow } from 'electron';
import { ServerConfig, Store } from '../config/Store';
import { JavaManager, javaVersionForMC } from './JavaManager';

export type ServerStatus = 'offline' | 'starting' | 'online' | 'crashed' | 'stopping';

export interface ServerStats {
  cpuPercent: number;
  ramMB: number;
  pid: number | null;
}

export interface OnlinePlayer {
  name: string;
  joinedAt: string;
}

interface RunningServer {
  process: ChildProcess;
  status: ServerStatus;
  stats: ServerStats;
  players: Set<string>;
  logBuffer: string[];
  restartCount: number;
  restartTimer?: ReturnType<typeof setTimeout>;
}

const AIKARS_FLAGS = (ramMB: number): string[] => {
  const gb = Math.floor(ramMB / 1024);
  const heapSize = `${ramMB}M`;
  return [
    `-Xms${heapSize}`,
    `-Xmx${heapSize}`,
    '-XX:+UseG1GC',
    '-XX:+ParallelRefProcEnabled',
    '-XX:MaxGCPauseMillis=200',
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:+DisableExplicitGC',
    '-XX:+AlwaysPreTouch',
    `-XX:G1NewSizePercent=${gb >= 12 ? 40 : 30}`,
    `-XX:G1MaxNewSizePercent=${gb >= 12 ? 50 : 40}`,
    '-XX:G1HeapRegionSize=8M',
    '-XX:G1ReservePercent=20',
    '-XX:G1HeapWastePercent=5',
    '-XX:G1MixedGCCountTarget=4',
    '-XX:InitiatingHeapOccupancyPercent=15',
    '-XX:G1MixedGCLiveThresholdPercent=90',
    '-XX:G1RSetUpdatingPauseTimePercent=5',
    '-XX:SurvivorRatio=32',
    '-XX:+PerfDisableSharedMem',
    '-XX:MaxTenuringThreshold=1',
    '-Dusing.aikars.flags=https://mcflags.emc.gs',
    '-Daikars.new.flags=true',
  ];
};

export class ServerManager extends EventEmitter {
  private static instance: ServerManager;
  private running: Map<string, RunningServer> = new Map();
  private win: BrowserWindow | null = null;
  private scheduledRestartTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private scheduledRestartFired: Map<string, string> = new Map();

  private constructor() { super(); }

  static getInstance(): ServerManager {
    if (!ServerManager.instance) ServerManager.instance = new ServerManager();
    return ServerManager.instance;
  }

  setWindow(win: BrowserWindow | null) {
    this.win = win;
  }

  private push(channel: string, ...args: unknown[]) {
    this.win?.webContents.send(channel, ...args);
  }

  hasRunning(): boolean {
    for (const [, r] of this.running) {
      if (r.status !== 'offline' && r.status !== 'crashed') return true;
    }
    return false;
  }

  async stopAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [id] of this.running) {
      promises.push(this.stop(id));
    }
    await Promise.all(promises);
  }

  getStatus(id: string): ServerStatus {
    return this.running.get(id)?.status ?? 'offline';
  }

  getStats(id: string): ServerStats {
    return this.running.get(id)?.stats ?? { cpuPercent: 0, ramMB: 0, pid: null };
  }

  getPlayers(id: string): string[] {
    return [...(this.running.get(id)?.players ?? [])];
  }

  getLogs(id: string): string[] {
    return this.running.get(id)?.logBuffer ?? [];
  }

  async start(id: string, progressCallback?: (msg: string) => void): Promise<void> {
    const config = Store.getServer(id);
    if (!config) throw new Error(`Server ${id} not found`);

    if (this.running.has(id) && this.running.get(id)!.status !== 'offline' && this.running.get(id)!.status !== 'crashed') {
      throw new Error(`Server ${id} is already running`);
    }

    progressCallback?.('Resolving Java runtime…');
    const javaManager = JavaManager.getInstance();
    const majorVersion = config.javaVersion ?? javaVersionForMC(config.mcVersion);
    const javaBin = await javaManager.ensureRuntime(majorVersion, (pct, msg) => {
      progressCallback?.(msg);
    });

    const jarPath = path.join(config.installDir, 'server.jar');
    if (!fs.existsSync(jarPath)) throw new Error('server.jar not found. Please reinstall the server.');

    const jvmArgs = [...AIKARS_FLAGS(config.ram)];
    const serverArgs = ['-jar', 'server.jar', '--nogui'];

    progressCallback?.('Starting server process…');

    const proc = spawn(javaBin, [...jvmArgs, ...serverArgs], {
      cwd: config.installDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const runningServer: RunningServer = {
      process: proc,
      status: 'starting',
      stats: { cpuPercent: 0, ramMB: config.ram, pid: proc.pid ?? null },
      players: new Set(),
      logBuffer: [],
      restartCount: 0,
    };

    this.running.set(id, runningServer);
    this.push('server:status', { id, status: 'starting' });

    const processLine = (line: string) => {
      runningServer.logBuffer.push(line);
      if (runningServer.logBuffer.length > 2000) runningServer.logBuffer.shift();
      this.push('server:log', { id, line });

      // Status detection
      if (line.includes('Done (') && line.includes('! For help')) {
        runningServer.status = 'online';
        runningServer.restartCount = 0;
        this.push('server:status', { id, status: 'online' });
      }

      // Player join/leave
      const joinMatch = line.match(/(\w+) joined the game/);
      if (joinMatch) {
        runningServer.players.add(joinMatch[1]);
        this.push('server:players', { id, players: [...runningServer.players] });
      }
      const leaveMatch = line.match(/(\w+) left the game/);
      if (leaveMatch) {
        runningServer.players.delete(leaveMatch[1]);
        this.push('server:players', { id, players: [...runningServer.players] });
      }
    };

    let stdoutBuffer = '';
    proc.stdout?.on('data', (data: Buffer) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() ?? '';
      lines.forEach(processLine);
    });

    let stderrBuffer = '';
    proc.stderr?.on('data', (data: Buffer) => {
      stderrBuffer += data.toString();
      const lines = stderrBuffer.split('\n');
      stderrBuffer = lines.pop() ?? '';
      lines.forEach(processLine);
    });

    proc.on('close', (code) => {
      const r = this.running.get(id);
      if (!r) return;

      if (r.status === 'stopping') {
        r.status = 'offline';
        this.push('server:status', { id, status: 'offline' });
        return;
      }

      r.status = 'crashed';
      this.push('server:status', { id, status: 'crashed' });
      this.push('server:log', { id, line: `[Manager] Server process exited with code ${code}` });
      this.emit('crash', id);

      // Auto-restart
      if (config.autoRestart && r.restartCount < config.maxRestarts) {
        r.restartCount++;
        const delay = Math.min(5000 * r.restartCount, 30000);
        this.push('server:log', {
          id,
          line: `[Manager] Auto-restarting in ${delay / 1000}s (attempt ${r.restartCount}/${config.maxRestarts})…`,
        });
        r.restartTimer = setTimeout(() => {
          this.start(id).catch((err) => {
            this.push('server:log', { id, line: `[Manager] Restart failed: ${err.message}` });
          });
        }, delay);
      }
    });

    proc.on('error', (err) => {
      const r = this.running.get(id);
      if (r) {
        r.status = 'crashed';
        this.push('server:status', { id, status: 'crashed' });
        this.push('server:log', { id, line: `[Manager] Process error: ${err.message}` });
      }
    });

    // CPU/RAM stats polling
    this.startStatsPolling(id);

    // Persist lastStarted
    Store.setServer(id, { ...config, lastStarted: new Date().toISOString() });
  }

  private startStatsPolling(id: string) {
    const interval = setInterval(async () => {
      const r = this.running.get(id);
      if (!r || r.status === 'offline' || r.status === 'crashed') {
        clearInterval(interval);
        return;
      }
      const pid = r.process.pid;
      if (!pid) return;

      try {
        const si = await import('systeminformation');
        const data = await si.processes();
        const proc = data.list.find((p) => p.pid === pid);
        if (proc) {
          r.stats = {
            cpuPercent: Math.round(proc.cpu * 10) / 10,
            ramMB: Math.round((proc.memRss ?? 0) / 1024 / 1024),
            pid,
          };
          this.push('server:stats', { id, stats: r.stats });
        }
      } catch {
        // stats polling failure is non-critical
      }
    }, 2000);
  }

  async stop(id: string): Promise<void> {
    const r = this.running.get(id);
    if (!r || r.status === 'offline' || r.status === 'crashed') return;

    if (r.restartTimer) {
      clearTimeout(r.restartTimer);
      r.restartTimer = undefined;
    }

    r.status = 'stopping';
    this.push('server:status', { id, status: 'stopping' });
    this.push('server:log', { id, line: '[Manager] Sending stop command…' });

    r.process.stdin?.write('stop\n');

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.push('server:log', { id, line: '[Manager] Force killing server process…' });
        r.process.kill('SIGTERM');
        resolve();
      }, 15000);

      r.process.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    r.status = 'offline';
    r.players.clear();
    this.push('server:status', { id, status: 'offline' });
    this.push('server:players', { id, players: [] });
  }

  sendCommand(id: string, cmd: string): void {
    const r = this.running.get(id);
    if (!r || r.status !== 'online') throw new Error('Server is not online');
    r.process.stdin?.write(cmd + '\n');
  }

  async restart(id: string): Promise<void> {
    await this.stop(id);
    await this.start(id);
  }

  // Server config management
  async createServer(config: ServerConfig): Promise<void> {
    fs.mkdirSync(config.installDir, { recursive: true });

    // Write eula.txt
    fs.writeFileSync(path.join(config.installDir, 'eula.txt'), 'eula=true\n', 'utf8');

    // Write initial server.properties
    const props = defaultServerProperties(config);
    const propsStr = Object.entries(props)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    fs.writeFileSync(path.join(config.installDir, 'server.properties'), propsStr + '\n', 'utf8');

    // Create plugins/mods dir
    if (['paper', 'purpur'].includes(config.type)) {
      fs.mkdirSync(path.join(config.installDir, 'plugins'), { recursive: true });
    } else if (['fabric', 'forge', 'neoforge'].includes(config.type)) {
      fs.mkdirSync(path.join(config.installDir, 'mods'), { recursive: true });
    }

    Store.setServer(config.id, config);
  }

  async deleteServer(id: string, deleteFiles: boolean): Promise<void> {
    await this.stop(id);
    const config = Store.getServer(id);
    if (config && deleteFiles && fs.existsSync(config.installDir)) {
      fs.rmSync(config.installDir, { recursive: true, force: true });
    }
    Store.deleteServer(id);
    this.running.delete(id);
  }

  setupScheduledRestart(id: string) {
    const existing = this.scheduledRestartTimers.get(id);
    if (existing) { clearInterval(existing); this.scheduledRestartTimers.delete(id); }

    const config = Store.getServer(id);
    const sched = config?.scheduledRestart;
    if (!sched?.enabled) return;

    const { hour, minute } = sched;

    const timer = setInterval(() => {
      const now = new Date();
      if (now.getHours() !== hour || now.getMinutes() !== minute) return;
      const fireKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
      if (this.scheduledRestartFired.get(id) === fireKey) return;
      this.scheduledRestartFired.set(id, fireKey);
      if (this.getStatus(id) !== 'online') return;
      this.sendCommand(id, 'say [Scheduler] Restarting in 60 seconds...');
      setTimeout(() => { this.restart(id).catch(() => {}); }, 60000);
    }, 30000);

    this.scheduledRestartTimers.set(id, timer);
  }

  getProperties(id: string): Record<string, string> {
    const config = Store.getServer(id);
    if (!config) throw new Error(`Server ${id} not found`);
    const propsPath = path.join(config.installDir, 'server.properties');
    if (!fs.existsSync(propsPath)) return {};
    const content = fs.readFileSync(propsPath, 'utf8');
    const result: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const eq = trimmed.indexOf('=');
      result[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
    return result;
  }

  setProperties(id: string, props: Record<string, string>): void {
    const config = Store.getServer(id);
    if (!config) throw new Error(`Server ${id} not found`);
    const propsPath = path.join(config.installDir, 'server.properties');
    const current = this.getProperties(id);
    const merged = { ...current, ...props };
    const content = Object.entries(merged)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    fs.writeFileSync(propsPath, content + '\n', 'utf8');
  }

  readJsonFile(filePath: string): unknown {
    if (!fs.existsSync(filePath)) return [];
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return []; }
  }

  getOps(id: string): unknown { return this.readJsonFile(path.join(Store.getServer(id)!.installDir, 'ops.json')); }
  getWhitelist(id: string): unknown { return this.readJsonFile(path.join(Store.getServer(id)!.installDir, 'whitelist.json')); }
  getBannedPlayers(id: string): unknown { return this.readJsonFile(path.join(Store.getServer(id)!.installDir, 'banned-players.json')); }
}

function defaultServerProperties(config: ServerConfig): Record<string, string> {
  return {
    'server-port': String(config.port),
    'max-players': '20',
    'online-mode': 'true',
    'difficulty': 'normal',
    'gamemode': 'survival',
    'pvp': 'true',
    'enable-whitelist': 'false',
    'view-distance': '10',
    'simulation-distance': '10',
    'motd': `${config.name} - Powered by Minecraft Manager`,
    'level-name': 'world',
    'spawn-protection': '16',
    'allow-nether': 'true',
    'generate-structures': 'true',
    'spawn-animals': 'true',
    'spawn-monsters': 'true',
    'spawn-npcs': 'true',
    'level-type': 'minecraft\\:normal',
  };
}
