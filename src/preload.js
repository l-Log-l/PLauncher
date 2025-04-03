const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    windowAction: (action) => ipcRenderer.invoke("window-action", action),
    saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
    loadSettings: () => ipcRenderer.invoke("load-settings"),
    selectDirectory: () => ipcRenderer.invoke("select-directory"),
    downloadMods: () => ipcRenderer.invoke("download-mods"),
    launchMinecraft: (settings) => ipcRenderer.invoke("launch-minecraft", settings),
    getSystemMemory: () => ipcRenderer.invoke("get-system-memory"),
    getJavaVersion: () => ipcRenderer.invoke("get-java-version"),
    openDirectory: (type) => ipcRenderer.invoke('open-directory', type),
    getBasicInfo: () => ipcRenderer.invoke('get-basic-info'),
    checkServerStatus: (host, port) => ipcRenderer.invoke('check-server-status', host, port),
    openExternalBrowser: (url) => ipcRenderer.invoke('open-external-browser', url),
    getConfig: () => ipcRenderer.invoke('get-config'),
    openWiki: () => ipcRenderer.invoke('open-wiki'),
    wikiWindowAction: (action) => ipcRenderer.invoke('wiki-window-action', action),
    validateAccount: (username, password) => ipcRenderer.invoke('validate-account', username, password),
    checkApplicationStatus: (elyByUuid) => ipcRenderer.invoke('check-application-status', elyByUuid),
    getDiscordAvatar: (discordId) => ipcRenderer.invoke('get-discord-avatar', discordId),
    loadAvatarForAccount: (discordId) => ipcRenderer.invoke('load-avatar-for-account', discordId),
    // Events
    onDownloadProgress: (callback) => ipcRenderer.on("download-mods-progress", (_, data) => callback(data)),
    onMinecraftLaunchStatus: (callback) => ipcRenderer.on("minecraft-launch-status", (event, data) => callback(event, data)),
    onMinecraftStatusUpdate: (callback) => ipcRenderer.on("minecraft-status-update", (_, data) => callback(data)),
    onJavaInstallComplete: (callback) => ipcRenderer.on("java-install-complete", callback),

    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_, status) => callback(status))
});

module.exports = {};
