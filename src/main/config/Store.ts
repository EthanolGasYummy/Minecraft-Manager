import ElectronStore from 'electron-store';
import { app } from 'electron';
import path from 'path';

export interface ServerConfig {
  id: string;
  name: string;
  type: 'paper' | 'purpur' | 'fabric' | 'forge' | 'neoforge' | 'vanilla';
  mcVersion: string;
  loaderVersion?: string;
  installDir: string;
  port: number;
  ram: number; // MB
  javaArgs?: string[];
  autoRestart: boolean;
  maxRestarts: number;
  connectionMode: 'duckdns' | 'playit' | 'direct';
  duckdnsSubdomain?: string;
  duckdnsToken?: string;
  createdAt: string;
  lastStarted?: string;
  javaPath?: string;
  javaVersion?: number;
  autoStartOnLaunch?: boolean;
  playitTunnelAddress?: string;
  scheduledRestart?: { enabled: boolean; hour: number; minute: number };
}

export interface AppSettings {
  defaultInstallDir: string;
  defaultRam: number;
  onboardingDone: boolean;
  duckdnsSubdomain: string;
  duckdnsToken: string;
  accentColor: string;
  checkForUpdates: boolean;
  backupSchedules: Record<string, BackupSchedule>;
}

export interface BackupSchedule {
  enabled: boolean;
  intervalHours: number;
  keepCount: number;
  lastBackup?: string;
}

interface StoreSchema {
  servers: Record<string, ServerConfig>;
  settings: AppSettings;
}

let store: ElectronStore<StoreSchema>;

export const Store = {
  init() {
    store = new ElectronStore<StoreSchema>({
      name: 'app-config',
      defaults: {
        servers: {},
        settings: {
          defaultInstallDir: path.join(app.getPath('userData'), 'servers'),
          defaultRam: 4096,
          onboardingDone: false,
          duckdnsSubdomain: '',
          duckdnsToken: '',
          accentColor: '#3B82F6',
          checkForUpdates: true,
          backupSchedules: {},
        },
      },
    });
  },

  getServers(): Record<string, ServerConfig> {
    return store.get('servers', {});
  },

  getServer(id: string): ServerConfig | undefined {
    return store.get(`servers.${id}` as any);
  },

  setServer(id: string, config: ServerConfig) {
    store.set(`servers.${id}` as any, config);
  },

  deleteServer(id: string) {
    const servers = store.get('servers', {});
    delete servers[id];
    store.set('servers', servers);
  },

  getSettings(): AppSettings {
    return store.get('settings');
  },

  setSettings(settings: Partial<AppSettings>) {
    const current = store.get('settings');
    store.set('settings', { ...current, ...settings });
  },

  getBackupSchedule(serverId: string): BackupSchedule | undefined {
    const settings = store.get('settings');
    return settings.backupSchedules?.[serverId];
  },

  setBackupSchedule(serverId: string, schedule: BackupSchedule) {
    const settings = store.get('settings');
    store.set('settings', {
      ...settings,
      backupSchedules: {
        ...settings.backupSchedules,
        [serverId]: schedule,
      },
    });
  },
};
