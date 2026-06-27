import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // Server lifecycle
  server: {
    list: () => ipcRenderer.invoke('server:list'),
    create: (config: unknown) => ipcRenderer.invoke('server:create', config),
    start: (id: string) => ipcRenderer.invoke('server:start', id),
    stop: (id: string) => ipcRenderer.invoke('server:stop', id),
    restart: (id: string) => ipcRenderer.invoke('server:restart', id),
    delete: (id: string, deleteFiles: boolean) => ipcRenderer.invoke('server:delete', id, deleteFiles),
    getStatus: (id: string) => ipcRenderer.invoke('server:getStatus', id),
    sendCommand: (id: string, cmd: string) => ipcRenderer.invoke('server:sendCommand', id, cmd),
    getStats: (id: string) => ipcRenderer.invoke('server:getStats', id),
    updateConfig: (id: string, config: unknown) => ipcRenderer.invoke('server:updateConfig', id, config),
    getProperties: (id: string) => ipcRenderer.invoke('server:getProperties', id),
    setProperties: (id: string, props: Record<string, string>) => ipcRenderer.invoke('server:setProperties', id, props),
    getLogs: (id: string) => ipcRenderer.invoke('server:getLogs', id),
    getIcon: (id: string) => ipcRenderer.invoke('server:getIcon', id),
    setIcon: (id: string, sourcePath: string) => ipcRenderer.invoke('server:setIcon', id, sourcePath),
    removeIcon: (id: string) => ipcRenderer.invoke('server:removeIcon', id),
    getPlayers: (id: string) => ipcRenderer.invoke('server:getPlayers', id),
    getOps: (id: string) => ipcRenderer.invoke('server:getOps', id),
    getWhitelist: (id: string) => ipcRenderer.invoke('server:getWhitelist', id),
    getBannedPlayers: (id: string) => ipcRenderer.invoke('server:getBannedPlayers', id),
    getCrashReport: (id: string) => ipcRenderer.invoke('server:getCrashReport', id),
    importDir: (dirPath: string) => ipcRenderer.invoke('server:importDir', dirPath),
    exportConfig: (id: string) => ipcRenderer.invoke('server:exportConfig', id),
    saveExportFile: (content: string, suggestedName: string) => ipcRenderer.invoke('server:saveExportFile', content, suggestedName),
    readImportFile: () => ipcRenderer.invoke('server:readImportFile'),
    getWorlds: (id: string) => ipcRenderer.invoke('server:getWorlds', id),
    resetWorld: (id: string, worldName: string) => ipcRenderer.invoke('server:resetWorld', id, worldName),
    saveLog: (id: string) => ipcRenderer.invoke('server:saveLog', id),
    getBannedIps: (id: string) => ipcRenderer.invoke('server:getBannedIps', id),
    addBannedIp: (id: string, ip: string, reason: string) => ipcRenderer.invoke('server:addBannedIp', id, ip, reason),
    removeBannedIp: (id: string, ip: string) => ipcRenderer.invoke('server:removeBannedIp', id, ip),
    checkForUpdate: (id: string) => ipcRenderer.invoke('server:checkForUpdate', id),
    updateServer: (id: string) => ipcRenderer.invoke('server:updateServer', id),
  },

  // Downloads & versions
  download: {
    getVersions: (type: string) => ipcRenderer.invoke('download:getVersions', type),
    downloadJar: (type: string, version: string, destDir: string) =>
      ipcRenderer.invoke('download:downloadJar', type, version, destDir),
    getProgress: (id: string) => ipcRenderer.invoke('download:getProgress', id),
  },

  // Java management
  java: {
    detectSystem: () => ipcRenderer.invoke('java:detectSystem'),
    ensureRuntime: (mcVersion: string) => ipcRenderer.invoke('java:ensureRuntime', mcVersion),
    listManaged: () => ipcRenderer.invoke('java:listManaged'),
    deleteManaged: (major: number) => ipcRenderer.invoke('java:deleteManaged', major),
  },

  // Network / sharing
  network: {
    getPublicIP: () => ipcRenderer.invoke('network:getPublicIP'),
    getLocalIP: () => ipcRenderer.invoke('network:getLocalIP'),
    detectCGNAT: () => ipcRenderer.invoke('network:detectCGNAT'),
    checkPort: (port: number) => ipcRenderer.invoke('network:checkPort', port),
    upnpMap: (port: number) => ipcRenderer.invoke('network:upnpMap', port),
    upnpUnmap: (port: number) => ipcRenderer.invoke('network:upnpUnmap', port),
    upnpStatus: (port: number) => ipcRenderer.invoke('network:upnpStatus', port),
    duckdnsUpdate: (subdomain: string, token: string) =>
      ipcRenderer.invoke('network:duckdnsUpdate', subdomain, token),
    playitStart: (serverId: string) => ipcRenderer.invoke('network:playitStart', serverId),
    playitStop: (serverId: string) => ipcRenderer.invoke('network:playitStop', serverId),
    playitStatus: (serverId: string) => ipcRenderer.invoke('network:playitStatus', serverId),
  },

  // File system
  files: {
    listDir: (serverPath: string, subPath: string) =>
      ipcRenderer.invoke('files:listDir', serverPath, subPath),
    readFile: (filePath: string) => ipcRenderer.invoke('files:readFile', filePath),
    writeFile: (filePath: string, content: string) =>
      ipcRenderer.invoke('files:writeFile', filePath, content),
    deleteFile: (filePath: string) => ipcRenderer.invoke('files:deleteFile', filePath),
    openFolder: (folderPath: string) => ipcRenderer.invoke('files:openFolder', folderPath),
    pickFolder: () => ipcRenderer.invoke('files:pickFolder'),
    pickFile: (filters: unknown[]) => ipcRenderer.invoke('files:pickFile', filters),
    copyFile: (src: string, dest: string) => ipcRenderer.invoke('files:copyFile', src, dest),
    downloadMod: (url: string, installDir: string, subDir: string, filename: string) =>
      ipcRenderer.invoke('files:downloadMod', url, installDir, subDir, filename),
  },

  // Backups
  backup: {
    create: (serverId: string) => ipcRenderer.invoke('backup:create', serverId),
    list: (serverId: string) => ipcRenderer.invoke('backup:list', serverId),
    restore: (serverId: string, backupPath: string) =>
      ipcRenderer.invoke('backup:restore', serverId, backupPath),
    delete: (backupPath: string) => ipcRenderer.invoke('backup:delete', backupPath),
    getSchedule: (serverId: string) => ipcRenderer.invoke('backup:getSchedule', serverId),
    setSchedule: (serverId: string, schedule: unknown) =>
      ipcRenderer.invoke('backup:setSchedule', serverId, schedule),
  },

  // System
  system: {
    getTotalRAM: () => ipcRenderer.invoke('system:getTotalRAM'),
    getAppVersion: () => ipcRenderer.invoke('system:getAppVersion'),
    openExternal: (url: string) => ipcRenderer.invoke('system:openExternal', url),
    getOnboardingDone: () => ipcRenderer.invoke('system:getOnboardingDone'),
    setOnboardingDone: () => ipcRenderer.invoke('system:setOnboardingDone'),
    getSettings: () => ipcRenderer.invoke('system:getSettings'),
    setSettings: (settings: unknown) => ipcRenderer.invoke('system:setSettings', settings),
    minimize: () => ipcRenderer.invoke('system:minimize'),
    maximize: () => ipcRenderer.invoke('system:maximize'),
    close: () => ipcRenderer.invoke('system:close'),
  },

  // Auto-updater
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
  },

  // Event listeners (renderer subscribes to main-process push events)
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const allowedChannels = [
      'server:log',
      'server:status',
      'server:stats',
      'server:players',
      'download:progress',
      'playit:status',
      'backup:progress',
      'update:status',
    ];
    if (allowedChannels.includes(channel)) {
      const sub = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
      ipcRenderer.on(channel, sub);
      return () => ipcRenderer.removeListener(channel, sub);
    }
    return () => {};
  },
};

contextBridge.exposeInMainWorld('api', api);

export type API = typeof api;
