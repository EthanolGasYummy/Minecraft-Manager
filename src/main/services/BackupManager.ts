import path from 'path';
import fs from 'fs';
import { app, BrowserWindow } from 'electron';
import archiver from 'archiver';
import extractZip from 'extract-zip';
import { Store } from '../config/Store';

export interface BackupEntry {
  name: string;
  path: string;
  size: number;
  createdAt: string;
}

export class BackupManager {
  private static instance: BackupManager;
  private win: BrowserWindow | null = null;
  private scheduleTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

  private constructor() {}

  static getInstance(): BackupManager {
    if (!BackupManager.instance) BackupManager.instance = new BackupManager();
    return BackupManager.instance;
  }

  setWindow(win: BrowserWindow | null) { this.win = win; }

  private backupsDir(serverId: string): string {
    const dir = path.join(app.getPath('userData'), 'backups', serverId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  async createBackup(serverId: string, label?: string): Promise<BackupEntry> {
    const config = Store.getServer(serverId);
    if (!config) throw new Error(`Server ${serverId} not found`);

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `${label ?? 'backup'}-${ts}.zip`;
    const dest = path.join(this.backupsDir(serverId), name);

    this.win?.webContents.send('backup:progress', { serverId, pct: 0, status: 'Creating backup…' });

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(dest);
      const archive = archiver('zip', { zlib: { level: 6 } });

      output.on('close', resolve);
      archive.on('error', reject);
      archive.on('progress', (p) => {
        this.win?.webContents.send('backup:progress', {
          serverId,
          pct: Math.round((p.entries.processed / Math.max(p.entries.total, 1)) * 100),
          status: 'Compressing…',
        });
      });

      archive.pipe(output);
      archive.directory(config.installDir, false);
      archive.finalize();
    });

    const stat = fs.statSync(dest);
    this.win?.webContents.send('backup:progress', { serverId, pct: 100, status: 'Done' });

    return {
      name,
      path: dest,
      size: stat.size,
      createdAt: new Date().toISOString(),
    };
  }

  listBackups(serverId: string): BackupEntry[] {
    const dir = this.backupsDir(serverId);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.zip'))
      .map((f) => {
        const full = path.join(dir, f);
        const stat = fs.statSync(full);
        return {
          name: f,
          path: full,
          size: stat.size,
          createdAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async restoreBackup(serverId: string, backupPath: string): Promise<void> {
    const config = Store.getServer(serverId);
    if (!config) throw new Error(`Server ${serverId} not found`);

    this.win?.webContents.send('backup:progress', { serverId, pct: 0, status: 'Preparing restore…' });

    // Create a safety backup first
    await this.createBackup(serverId, 'pre-restore');

    // Clear install dir (keep server.jar)
    const jarPath = path.join(config.installDir, 'server.jar');
    const jarBackup = jarPath + '.bak';
    if (fs.existsSync(jarPath)) fs.copyFileSync(jarPath, jarBackup);

    // Wipe and restore
    fs.rmSync(config.installDir, { recursive: true, force: true });
    fs.mkdirSync(config.installDir, { recursive: true });

    this.win?.webContents.send('backup:progress', { serverId, pct: 30, status: 'Extracting backup…' });

    await extractZip(backupPath, { dir: config.installDir });

    // Restore jar if missing
    if (!fs.existsSync(jarPath) && fs.existsSync(jarBackup)) {
      fs.copyFileSync(jarBackup, jarPath);
    }
    if (fs.existsSync(jarBackup)) fs.unlinkSync(jarBackup);

    this.win?.webContents.send('backup:progress', { serverId, pct: 100, status: 'Restore complete' });
  }

  deleteBackup(backupPath: string): void {
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
  }

  setupSchedule(serverId: string) {
    this.clearSchedule(serverId);
    const schedule = Store.getBackupSchedule(serverId);
    if (!schedule?.enabled) return;

    const ms = schedule.intervalHours * 60 * 60 * 1000;
    const timer = setInterval(async () => {
      try {
        const backup = await this.createBackup(serverId, 'scheduled');
        // Prune old backups
        const all = this.listBackups(serverId).filter((b) => b.name.startsWith('scheduled-'));
        if (all.length > schedule.keepCount) {
          const toDelete = all.slice(schedule.keepCount);
          toDelete.forEach((b) => this.deleteBackup(b.path));
        }
        Store.setBackupSchedule(serverId, { ...schedule, lastBackup: new Date().toISOString() });
      } catch (err) {
        console.error('Scheduled backup failed:', err);
      }
    }, ms);

    this.scheduleTimers.set(serverId, timer);
  }

  clearSchedule(serverId: string) {
    const t = this.scheduleTimers.get(serverId);
    if (t) { clearInterval(t); this.scheduleTimers.delete(serverId); }
  }
}
