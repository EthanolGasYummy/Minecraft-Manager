export type ServerType = 'paper' | 'purpur' | 'fabric' | 'forge' | 'neoforge' | 'vanilla';
export type ServerStatus = 'offline' | 'starting' | 'online' | 'crashed' | 'stopping';
export type ConnectionMode = 'duckdns' | 'playit' | 'direct';

export interface ServerConfig {
  id: string;
  name: string;
  type: ServerType;
  mcVersion: string;
  loaderVersion?: string;
  installDir: string;
  port: number;
  ram: number; // MB
  autoRestart: boolean;
  maxRestarts: number;
  connectionMode: ConnectionMode;
  duckdnsSubdomain?: string;
  duckdnsToken?: string;
  createdAt: string;
  lastStarted?: string;
}

export interface ServerListItem extends ServerConfig {
  status: ServerStatus;
  stats: ServerStats;
  players: string[];
}

export interface ServerStats {
  cpuPercent: number;
  ramMB: number;
  pid: number | null;
}

export interface VersionInfo {
  id: string;
  label: string;
  recommended?: boolean;
}

export interface FileEntry {
  name: string;
  isDir: boolean;
  size: number;
  modified: string;
}

export interface BackupEntry {
  name: string;
  path: string;
  size: number;
  createdAt: string;
}

export interface BackupSchedule {
  enabled: boolean;
  intervalHours: number;
  keepCount: number;
  lastBackup?: string;
}

export interface AppSettings {
  defaultInstallDir: string;
  defaultRam: number;
  onboardingDone: boolean;
  duckdnsSubdomain: string;
  duckdnsToken: string;
  accentColor: string;
  checkForUpdates: boolean;
}

export interface NetworkInfo {
  publicIP: string;
  localIP: string;
  isCGNAT: boolean;
  cgnatReason?: string;
}

export interface PortStatus {
  external: boolean;
  local: boolean;
  upnp: boolean;
}

export interface JavaInstall {
  major: number;
  path: string;
  managed: boolean;
  version: string;
}
