// Mirror of the preload API surface for TypeScript typing in the renderer

export interface API {
  server: {
    list: () => Promise<any[]>;
    create: (config: any) => Promise<any>;
    start: (id: string) => Promise<void>;
    stop: (id: string) => Promise<void>;
    restart: (id: string) => Promise<void>;
    delete: (id: string, deleteFiles: boolean) => Promise<void>;
    getStatus: (id: string) => Promise<string>;
    sendCommand: (id: string, cmd: string) => Promise<void>;
    getStats: (id: string) => Promise<any>;
    updateConfig: (id: string, config: any) => Promise<void>;
    getProperties: (id: string) => Promise<Record<string, string>>;
    setProperties: (id: string, props: Record<string, string>) => Promise<void>;
    getLogs: (id: string) => Promise<string[]>;
    getIcon: (id: string) => Promise<string | null>;
    setIcon: (id: string, sourcePath: string) => Promise<void>;
    removeIcon: (id: string) => Promise<void>;
    getPlayers: (id: string) => Promise<string[]>;
    getOps: (id: string) => Promise<any[]>;
    getWhitelist: (id: string) => Promise<any[]>;
    getBannedPlayers: (id: string) => Promise<any[]>;
    getCrashReport: (id: string) => Promise<{ name: string; content: string } | null>;
    importDir: (dirPath: string) => Promise<{ type: string; mcVersion: string; port: number; name: string; installDir: string }>;
    exportConfig: (id: string) => Promise<string | null>;
    saveExportFile: (content: string, suggestedName: string) => Promise<boolean>;
    readImportFile: () => Promise<any | null>;
    getWorlds: (id: string) => Promise<{ name: string; path: string; size: number; borderSize: number | null }[]>;
    resetWorld: (id: string, worldName: string) => Promise<void>;
    saveLog: (id: string) => Promise<boolean>;
    getBannedIps: (id: string) => Promise<{ ip: string; source: string; expires: string; reason: string }[]>;
    addBannedIp: (id: string, ip: string, reason: string) => Promise<void>;
    removeBannedIp: (id: string, ip: string) => Promise<void>;
    checkForUpdate: (id: string) => Promise<{ latestBuild: number; currentBuild: number | null; hasUpdate: boolean } | null>;
    updateServer: (id: string) => Promise<{ build: number | null }>;
  };
  download: {
    getVersions: (type: string) => Promise<any[]>;
    downloadJar: (type: string, version: string, destDir: string) => Promise<string>;
    getProgress: (id: string) => Promise<any>;
  };
  java: {
    detectSystem: () => Promise<any[]>;
    ensureRuntime: (mcVersion: string) => Promise<string>;
    listManaged: () => Promise<any[]>;
    deleteManaged: (major: number) => Promise<void>;
  };
  network: {
    getPublicIP: () => Promise<string>;
    getLocalIP: () => Promise<string>;
    detectCGNAT: () => Promise<any>;
    checkPort: (port: number) => Promise<any>;
    upnpMap: (port: number) => Promise<any>;
    upnpUnmap: (port: number) => Promise<void>;
    upnpStatus: (port: number) => Promise<any>;
    duckdnsUpdate: (subdomain: string, token: string) => Promise<any>;
    playitStart: (serverId: string) => Promise<any>;
    playitStop: (serverId: string) => Promise<void>;
    playitStatus: (serverId: string) => Promise<any>;
  };
  files: {
    listDir: (serverPath: string, subPath: string) => Promise<any[]>;
    readFile: (filePath: string) => Promise<string>;
    writeFile: (filePath: string, content: string) => Promise<void>;
    deleteFile: (filePath: string) => Promise<void>;
    openFolder: (folderPath: string) => Promise<void>;
    pickFolder: () => Promise<string | null>;
    pickFile: (filters: any[]) => Promise<string | null>;
    copyFile: (src: string, dest: string) => Promise<void>;
    downloadMod: (url: string, installDir: string, subDir: string, filename: string) => Promise<string>;
  };
  backup: {
    create: (serverId: string) => Promise<any>;
    list: (serverId: string) => Promise<any[]>;
    restore: (serverId: string, backupPath: string) => Promise<void>;
    delete: (backupPath: string) => Promise<void>;
    getSchedule: (serverId: string) => Promise<any>;
    setSchedule: (serverId: string, schedule: any) => Promise<void>;
  };
  system: {
    getTotalRAM: () => Promise<number>;
    getAppVersion: () => Promise<string>;
    openExternal: (url: string) => Promise<void>;
    getOnboardingDone: () => Promise<boolean>;
    setOnboardingDone: () => Promise<void>;
    getSettings: () => Promise<any>;
    setSettings: (settings: any) => Promise<void>;
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
  };
  update: {
    check: () => Promise<void>;
    download: () => Promise<void>;
    install: () => Promise<void>;
  };
  on: (channel: string, callback: (...args: any[]) => void) => () => void;
}
