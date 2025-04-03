import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import ElectronStore from "electron-store";
import https from 'https';

import { initializeAutoUpdater } from '../utils/updater.js';
import { Worker } from "worker_threads";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";
import extract from "extract-zip";
import fsExtra from "fs-extra";
import crypto, { randomUUID } from "crypto";
import axios from "axios";
import fs_sync from "fs";
import path from "path";
import os, { platform } from "os";
import { exec } from 'child_process';
import { promisify } from 'util';
import { dirname } from 'path';
import { createRequire } from 'module';
import net from 'net';

// Изменяем импорт с использования default на деструктуризацию объекта
import * as mlc from "../minecraft/index.js";
import logger from '../utils/logger.js';
import { CONFIG } from '../config/config.js';
import { getLauncherVersion } from '../utils/version.js';
// Импортируем функцию из нового модуля
import { checkFullServerStatus } from '../utils/server-status.js';

const execPromise = promisify(exec);

const { Client, Authenticator } = mlc;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new ElectronStore({
    name: CONFIG.STORE.NAME,
    defaults: CONFIG.STORE.DEFAULTS
});

const JAVA_URLS = CONFIG.JAVA.DOWNLOAD_URLS;
const MINECRAFT_VERSION = CONFIG.VERSION.MINECRAFT;
const FABRIC_VERSION = CONFIG.VERSION.FABRIC;
const SERVER_URL = CONFIG.SERVERS.GAME.API;
const MAX_DOWNLOAD_THREADS = CONFIG.MODS.MAX_THREADS;
const USER_MODS_DIR = CONFIG.DIRECTORIES.USER_MODS_DIR;

function getBaseGameDirectory() {
    return store.get("gameDirectory") || path.join(app.getPath("documents"), CONFIG.DIRECTORIES.DEFAULT_GAME_DIR);
}

function getFullGameDirectory(baseDirectory) {
    const base = baseDirectory || getBaseGameDirectory();
    return path.join(base, CONFIG.DIRECTORIES.PROFILES_DIR, CONFIG.DIRECTORIES.DEFAULT_PROFILE);
}

async function calculateFileHash(filePath) {
    logger.debug('Calculating hash for file: %s', filePath);
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha256");
        const stream = fs_sync.createReadStream(filePath);

        stream.on("data", (data) => hash.update(data));
        stream.on("end", () => {
            const fileHash = hash.digest("hex");
            logger.debug('Hash calculated for %s: %s', filePath, fileHash);
            resolve(fileHash);
        });
        stream.on("error", (error) => {
            logger.error('Error calculating file hash for %s: %s', filePath, error);
            reject(error);
        });
    });
}

async function getModsList() {
    logger.info('Fetching mods list from server: %s /get_list_mods', SERVER_URL);
    const maxRetries = 3;
    let attempt = 0;
    
    while (attempt < maxRetries) {
        attempt++;
        try {
            logger.debug('Attempt %d of %d to fetch mods list', attempt, maxRetries);
            const modsListResponse = await axios.get(`${SERVER_URL}/get_list_mods`, {
                timeout: CONFIG.MODS.DOWNLOAD_TIMEOUT || 15000, // Используем таймаут из конфига или 15 секунд по умолчанию
                headers: { 'Cache-Control': 'no-cache' }
            });
            
            if (modsListResponse.data && Array.isArray(modsListResponse.data) && modsListResponse.data.length > 0) {
                logger.info('Successfully received mods list. Total mods: %d', modsListResponse.data.length);
                logger.debug('Mods list: %o', modsListResponse.data);
                return modsListResponse.data;
            } else {
                logger.warn('Received empty or invalid mods list on attempt %d', attempt);
                if (attempt >= maxRetries) break;
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Увеличиваем время ожидания с каждой попыткой
            }
        } catch (error) {
            logger.error('Failed to fetch mods list on attempt %d. Error: %s', attempt, error.message);
            logger.debug('Full error details: %o', error);
            if (attempt >= maxRetries) break;
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Увеличиваем время ожидания с каждой попыткой
        }
    }
    
    logger.error('All attempts to fetch mods list failed');
    return [];
}

async function downloadModsMultiThread(gameDirectory, mainWindow) {
    const serverOnline = await isServerOnline();
    if (!serverOnline) {
        logger.info('Server is offline, skipping mod download');
        mainWindow.webContents.send("download-mods-progress", {
            status: "Сервер недоступен, пропускаем загрузку модов",
        });
        return true;
    }

    const modsDir = path.join(gameDirectory, "mods");
    logger.info('Starting multi-threaded mod download to: %s', modsDir);
    
    await fs.mkdir(modsDir, { recursive: true });
    const mods = await getModsList();
    
    if (mods.length === 0) {
        logger.error('No mods received from server');
        mainWindow.webContents.send("download-mods-progress", {
            status: "Не удалось получить список модов с сервера. Сервер может быть перегружен или недоступен.",
            error: true,
        });
        return false;
    }

    logger.info('Preparing to download %d mods using %d threads', mods.length, MAX_DOWNLOAD_THREADS);
    let totalDownloadedMods = 0;

    const threads = Math.min(MAX_DOWNLOAD_THREADS, mods.length);
    const chunkSize = Math.ceil(mods.length / threads);
    const modGroups = Array.from({ length: threads }, (_, i) =>
        mods.slice(i * chunkSize, (i + 1) * chunkSize)
    );

    mainWindow.webContents.send("download-mods-progress", {
        total: mods.length,
        downloaded: 0,
        status: "Начало загрузки модов",
    });

    const workerPromises = modGroups.map((groupMods, threadId) => {
        return new Promise((resolve, reject) => {
            const worker = new Worker(path.join(__dirname, "downloader.js"), {
                workerData: {
                    mods: groupMods,
                    threadId: threadId + 1,
                    modsDir,
                    serverUrl: SERVER_URL,
                },
            });

            worker.on("message", (result) => {
                if (result.status === "Мод загружен") {
                    totalDownloadedMods++;
                }

                mainWindow.webContents.send("download-mods-progress", {
                    ...result,
                    totalDownloaded: totalDownloadedMods,
                    totalMods: mods.length,
                });
            });

            worker.on("error", (error) => {
                logger.error('Worker error: %s', error);
                reject(error);
            });
            worker.on("exit", (code) => {
                if (code !== 0) {
                    const error = new Error(`Worker stopped with exit code ${code}`);
                    logger.error('Worker exit error: %s', error);
                    reject(error);
                }
                resolve();
            });
        });
    });

    try {
        await Promise.all(workerPromises);

        mainWindow.webContents.send("download-mods-progress", {
            total: mods.length,
            downloaded: mods.length,
            totalDownloaded: totalDownloadedMods,
            status: "Моды успешно загружены",
        });

        return true;
    } catch (error) {
        mainWindow.webContents.send("download-mods-progress", {
            status: {
                error: error.message,
                stack: error.stack
            },
            error: true,
        });
        return false;
    }
}

async function getBestJavaPath() {
    logger.info('Looking for Java in game directory...');
    
    const baseGameDirectory = getBaseGameDirectory();
    const javaExecutablePath = path.join(baseGameDirectory, CONFIG.DIRECTORIES.JAVA_DIR, 'bin', 'javaw.exe');
    
    if (fs_sync.existsSync(javaExecutablePath)) {
        return javaExecutablePath;
    }
    
    logger.warn('No Java found in game directory');
    return null;
}

async function ensureJava(gameDirectory, mainWindow) {
    logger.info('Checking Java installation...');
    try {
        const javaDir = path.join(gameDirectory, 'java');
        const javaExecutablePath = path.join(javaDir, 'bin', 'javaw.exe');
        
        if (fs_sync.existsSync(javaExecutablePath)) {
            logger.info('Found Java in game directory at %s', javaExecutablePath);
            return javaExecutablePath;
        }
        
        logger.info('No Java found, proceeding with installation to %s', javaDir);
        await fs.mkdir(javaDir, { recursive: true });
        
        const installerUrl = JAVA_URLS.win32;
        if (!installerUrl) {
            logger.error('Failed to get Java installer URL');
            throw new Error("Failed to get Java installer URL");
        }

        const zipPath = path.join(os.tmpdir(), 'java.zip');
        logger.info('Downloading Java from: %s', installerUrl);
        logger.info('Java archive will be saved to: %s', zipPath);
        
        const response = await axios.get(installerUrl, {
            responseType: "arraybuffer",
        });
        await fs.writeFile(zipPath, response.data);

        logger.info("Extracting Java to: %s", javaDir);
        await extract(zipPath, { dir: javaDir });
        
        if (fs_sync.existsSync(javaExecutablePath)) {
            logger.info("Java installation completed at: %s", javaExecutablePath);
            try {
                await fs.unlink(zipPath);
            } catch (e) {
                logger.error("Error removing installer: %s", e);
            }
            if (mainWindow) {
                mainWindow.webContents.send('java-install-complete');
            }
            return javaExecutablePath;
        }
        throw new Error("Java installation completed but executable not found");

    } catch (error) {
        logger.error('Java installation failed. Error: %s', error.message);
        logger.debug('Full error details: %o', error);
        throw error;
    }
}

async function launchBackgroundMinecraft(gameDirectory, version) {
    const launcher = new Client();
    const opts = {
        
        root: gameDirectory,
        version: {
            number: version,
            type: "release",
        },
        memory: {
            max: "1G",
            min: "512M",
        },
        overrides: {
            detached: false,
            windowsHide: true,
        },
    };

    return new Promise((resolve, reject) => {
        let isResolved = false;

        launcher.on("debug", (e) => {
            if (e.includes("Downloaded assets")) {
                if (!isResolved) {
                    isResolved = true;
                    resolve(true);
                }
            }
        });

        launcher.on("close", () => {
            if (!isResolved) {
                isResolved = true;
                resolve(false);
            }
        });

        launcher.launch(opts).catch(reject);

        setTimeout(() => {
            if (!isResolved) {
                isResolved = true;
                resolve(true);
            }
        }, 30000);
    });
}

async function ensureVanillaMinecraft(gameDirectory) {
    const versionsDir = path.join(
        gameDirectory,
        "versions",
        MINECRAFT_VERSION
    );
    const clientJar = path.join(versionsDir, `${MINECRAFT_VERSION}.jar`);
    const clientJson = path.join(
        versionsDir,
        `${MINECRAFT_VERSION}.json`
    );

    if (fs_sync.existsSync(clientJar) && fs_sync.existsSync(clientJson)) {
        console.log("Vanilla Minecraft files already exist");

        console.log("Verifying vanilla assets...");
        await launchBackgroundMinecraft(
            gameDirectory,
            MINECRAFT_VERSION
        );
        return;
    }

    try {
        console.log("Downloading vanilla Minecraft files...");
        await launchBackgroundMinecraft(
            gameDirectory,
            MINECRAFT_VERSION
        );
        console.log("Vanilla Minecraft files downloaded successfully");
    } catch (error) {
        console.error("Error downloading vanilla Minecraft:", error);
        throw error;
    }
}

async function ensureFabric(gameDirectory) {
    try {
        const fabricVersionDir = path.join(
            gameDirectory,
            "versions",
            `fabric-loader-${FABRIC_VERSION}-${MINECRAFT_VERSION}`
        );
        const fabricJsonPath = path.join(
            fabricVersionDir,
            `fabric-loader-${FABRIC_VERSION}-${MINECRAFT_VERSION}.json`
        );
        const fabricLibDir = path.join(
            gameDirectory,
            "libraries",
            "net",
            "fabricmc"
        );

        await fs.mkdir(fabricVersionDir, { recursive: true });
        await fs.mkdir(fabricLibDir, { recursive: true });

        if (fs_sync.existsSync(fabricJsonPath)) {
            console.log("Fabric already installed.");
            return;
        }

        await ensureVanillaMinecraft(gameDirectory);

        const fabricMetaUrl = `https://meta.fabricmc.net/v2/versions/loader/${MINECRAFT_VERSION}/${FABRIC_VERSION}/profile/json`;
        console.log("Downloading Fabric metadata...");
        const fabricMetaResponse = await axios.get(fabricMetaUrl);

        if (!fabricMetaResponse.data) {
            throw new Error("Failed to download Fabric metadata");
        }

        await fs.writeFile(
            fabricJsonPath,
            JSON.stringify(fabricMetaResponse.data, null, 2)
        );

        const libraries = fabricMetaResponse.data.libraries;
        console.log("Downloading Fabric libraries...");

        for (const lib of libraries) {
            const libPath = lib.name.split(":");
            const fileName = `${libPath[1]}-${libPath[2]}.jar`;
            const libUrl =
                lib.url +
                libPath[0].replace(/\./g, "/") +
                "/" +
                libPath[1] +
                "/" +
                libPath[2] +
                "/" +
                fileName;

            const targetDir = path.join(
                gameDirectory,
                "libraries",
                libPath[0].replace(/\./g, "/"),
                libPath[1],
                libPath[2]
            );
            const targetFile = path.join(targetDir, fileName);

            await fs.mkdir(targetDir, { recursive: true });

            if (!fs_sync.existsSync(targetFile)) {
                const response = await axios.get(libUrl, {
                    responseType: "arraybuffer",
                });
                await fs.writeFile(targetFile, response.data);
                console.log(`Downloaded: ${fileName}`);
            }
        }

        console.log("Fabric installed successfully!");
    } catch (error) {
        console.error("Error installing Fabric:", error);
        throw error;
    }
}

async function ensureAuthlibInjector(baseGameDirectory) {
    const authlibInjectorPath = path.join(baseGameDirectory, "authlib-injector.jar");
    const authlibInjectorUrl = "https://github.com/yushijinhun/authlib-injector/releases/download/v1.2.5/authlib-injector-1.2.5.jar";

    if (fs_sync.existsSync(authlibInjectorPath)) {
        console.log("Authlib Injector already exists.");
        return;
    }

    try {
        console.log("Downloading Authlib Injector...");
        const response = await axios.get(authlibInjectorUrl, {
            responseType: "arraybuffer",
        });
        await fs.writeFile(authlibInjectorPath, response.data);
        console.log("Authlib Injector downloaded successfully!");
    } catch (error) {
        console.error("Error downloading Authlib Injector:", error);
        throw error;
    }
}

async function ensureUserModsDirectory(gameDirectory) {
    const userModsDir = path.join(gameDirectory, USER_MODS_DIR);
    await fs.mkdir(userModsDir, { recursive: true });
    return userModsDir;
}

async function getUserModsHashes(userModsDir) {
    const userMods = {};
    try {
        const files = await fs.readdir(userModsDir);
        for (const file of files) {
            if (file.endsWith('.jar')) {
                const filePath = path.join(userModsDir, file);
                const hash = await calculateFileHash(filePath);
                userMods[file] = hash;
            }
        }
    } catch (error) {
        console.error("Error reading user mods:", error);
    }
    return userMods;
}
async function cleanModsDirectory(gameDirectory) {
    logger.info('Starting mods directory cleanup for: %s', gameDirectory);
    try {
        const modsDir = path.join(gameDirectory, "mods");
        const userModsDir = await ensureUserModsDirectory(gameDirectory);
        
        logger.info('Fetching official mods list for verification');
        const officialMods = await getModsList();
        const officialModsHashes = officialMods.reduce((acc, mod) => {
            acc[`${mod.name}.jar`] = mod.hash;
            return acc;
        }, {});
        
        logger.info('Calculating hashes for user mods');
        const userModsHashes = await getUserModsHashes(userModsDir);
        
        logger.debug('Official mods hashes: %o', officialModsHashes);
        logger.debug('User mods hashes: %o', userModsHashes);

        const files = await fs.readdir(modsDir);
        logger.info('Found %d files in mods directory', files.length);

        for (const file of files) {
            if (!file.endsWith('.jar')) continue;
            const filePath = path.join(modsDir, file);
            logger.debug('Verifying mod file: %s', file);
            
            const fileHash = await calculateFileHash(filePath);
            const isOfficialMod = officialModsHashes[file] === fileHash;
            const isUserMod = userModsHashes[file] === fileHash;
            
            if (!isOfficialMod && !isUserMod) {
                logger.warn('Unauthorized mod detected: %s (Hash: %s)', file, fileHash);
                logger.info('Removing unauthorized mod: %s', file);
                await fs.unlink(filePath);
            }
        }
        
        logger.info('Copying user mods to mods directory');
        const userModFiles = await fs.readdir(userModsDir);
        for (const file of userModFiles) {
            if (!file.endsWith('.jar')) continue;
            const sourcePath = path.join(userModsDir, file);
            const targetPath = path.join(modsDir, file);
            if (!fs_sync.existsSync(targetPath)) {
                await fs.copyFile(sourcePath, targetPath);
                console.log(`Copied user mod: ${file} to mods directory`);
            }
        }
    } catch (error) {
        logger.error('Error during mods directory cleanup: %s', error.message);
        logger.debug('Full error details: %o', error);
        throw error;
    }
 }


async function isModsDirectoryEmpty(gameDirectory) {
    const modsDir = path.join(gameDirectory, "mods");
    try {
        const files = await fs.readdir(modsDir);
        return files.filter(file => file.endsWith('.jar')).length === 0;
    } catch (error) {
        return true;
    }
}

async function isServerOnline() {
    try {
        const maxRetries = 2;
        let attempt = 0;
        
        while (attempt < maxRetries) {
            attempt++;
            try {
                logger.debug('Checking server status, attempt %d of %d', attempt, maxRetries);
                const response = await axios.get(
                    `${CONFIG.SERVERS.GAME.API}/get_list_mods`,
                    { 
                        timeout: CONFIG.MODS.DOWNLOAD_TIMEOUT || 15000,
                        headers: { 'Cache-Control': 'no-cache' }
                    }
                );
                logger.debug('Server status response: %d', response.status);
                return response.status === 200;
            } catch (error) {
                logger.warn('Server status check failed on attempt %d: %s', attempt, error.message);
                if (attempt >= maxRetries) return false;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        return false;
    } catch (error) {
        logger.error('Server status check failed: %s', error.message);
        return false;
    }
}

async function isSafeModeAvailable(gameDirectory) {
    try {
        const modsDir = path.join(gameDirectory, "mods");
        const files = await fs.readdir(modsDir);
        const modFiles = files.filter(file => file.endsWith('.jar'));
        return modFiles.length > 0;
    } catch (error) {
        return false;
    }
}

function initializeCacheDirectories() {
    const baseGameDirectory = getBaseGameDirectory();
    const cacheDir = path.join(baseGameDirectory, 'cache', 'launcher-cache');
    const gpuCacheDir = path.join(baseGameDirectory, 'cache', 'gpu-cache');

    [cacheDir, gpuCacheDir].forEach(dir => {
        if (!fs_sync.existsSync(dir)) {
            try {
                fs_sync.mkdirSync(dir, { recursive: true });
                logger.info('Created cache directory: %s', dir);
            } catch (error) {
                logger.error('Failed to create cache directory %s: %s', dir, error);
            }
        }
    });

    app.setPath('sessionData', cacheDir);
    app.setPath('userCache', cacheDir);
}

async function checkApplicationStatus(elyByUuid) {
    try {
        logger.info('Checking application status for user with ID: %s', elyByUuid);
        const response = await axios.get(`${CONFIG.SERVERS.GAME.API}/application/get?ely_by_id=${elyByUuid}`, {
            timeout: 5000,
            headers: { 'Cache-Control': 'no-cache' }
        });
        
        logger.debug('Application status response: %o', response.data);
        
        if (response.data && response.data.status === "approved") {
            logger.info('Application is approved for user ID: %s', elyByUuid);
            return {
                approved: true,
                userData: response.data
            };
        } else {
            logger.warn('Application is not approved for user ID: %s, status: %s', 
                elyByUuid, response.data?.status || 'unknown');
            return {
                approved: false,
                status: response.data?.status || 'unknown',
                userData: response.data
            };
        }
    } catch (error) {
        logger.error('Error checking application status: %s', error.message);
        logger.debug('Full error details: %o', error);
        return {
            approved: false,
            error: error.message,
            status: 'error'
        };
    }
}

async function getDiscordAvatar(discordId) {
    try {
        if (!discordId) {
            logger.warn('No Discord ID provided for avatar fetch');
            return null;
        }
        
        logger.info('Fetching Discord avatar for ID: %s', discordId);
        const avatarUrl = `${CONFIG.AUTH.AVATAR.API_URL}${discordId}`;
        
        const response = await axios.get(avatarUrl, {
            timeout: 5000,
            responseType: 'arraybuffer'
        });
        
        if (response.status === 200 && response.data) {
            // Преобразуем данные изображения в base64
            const base64Image = Buffer.from(response.data, 'binary').toString('base64');
            const contentType = response.headers['content-type'] || 'image/png';
            
            logger.info('Successfully fetched avatar for Discord ID: %s', discordId);
            return `data:${contentType};base64,${base64Image}`;
        } else {
            logger.warn('Failed to fetch avatar, status code: %d', response.status);
            return null;
        }
    } catch (error) {
        logger.error('Error fetching Discord avatar: %s', error.message);
        logger.debug('Full error details: %o', error);
        return null;
    }
}

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: CONFIG.WINDOW.MAIN.WIDTH,
        height: CONFIG.WINDOW.MAIN.HEIGHT,
        minHeight: CONFIG.WINDOW.MAIN.MIN_HEIGHT,
        minWidth: CONFIG.WINDOW.MAIN.MIN_WIDTH,
        backgroundColor: CONFIG.WINDOW.MAIN.BACKGROUND,
        frame: CONFIG.WINDOW.MAIN.FRAME,
        webPreferences: {
            preload: path.join(__dirname, "../preload.js"),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            partition: 'persist:main'
        },
        title: `SMP Launcher v${getLauncherVersion()}`,
    });

    let launcher = null;
    let minecraftProcess = null;

    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
    
    // Добавим логирование инициализации обновления
    logger.info('Starting auto-updater initialization');
    initializeAutoUpdater(mainWindow);
    logger.info('Auto-updater initialization complete');
    
    // Принудительно проверяем обновления после загрузки окна
    mainWindow.webContents.on('did-finish-load', () => {
        logger.info('Main window loaded, checking for updates');
        ipcMain.emit('check-for-updates');
    });
    
    ipcMain.handle("window-action", (event, action) => {
        switch (action) {
            case "minimize":
                mainWindow.minimize();
                break;
            case "maximize":
                mainWindow.isMaximized()
                    ? mainWindow.unmaximize()
                    : mainWindow.maximize();
                break;
            case "close":
                mainWindow.close();
                break;
        }
    });

    ipcMain.handle("save-settings", (event, settings) => {
        try {
            store.set(settings);
            return true;
        } catch (error) {
            logger.error('Error saving settings: %s\nStack: %s', error.message, error.stack);
            return false;
        }
    });

    ipcMain.handle("load-settings", () => {
        return store.store;
    });

    ipcMain.handle("select-directory", async () => {
        try {
            const result = await dialog.showOpenDialog(mainWindow, {
                properties: ["openDirectory"],
            });
            return result.filePaths[0] || null;
        } catch (error) {
            logger.error("Directory selection error: %s", error);
            return null;
        }
    });

    ipcMain.handle("download-mods", async () => {
        try {
            const gameDirectory = getFullGameDirectory();
            return await downloadModsMultiThread(gameDirectory, mainWindow);
        } catch (error) {
            logger.error("Error downloading mods: %s", error);
            mainWindow.webContents.send("download-mods-progress", {
                status: "Ошибка загрузки модов",
                error: error.message,
            });
            return false;
        }
    });

    ipcMain.handle("launch-minecraft", async (event, settings) => {
        try {
            const baseGameDirectory = settings.gameDirectory || getBaseGameDirectory();
            const gameDirectory = getFullGameDirectory(baseGameDirectory);
            
            await fs.mkdir(gameDirectory, { recursive: true });
            
            const serverOnline = await isServerOnline();
            const safeModeAvailable = await isSafeModeAvailable(gameDirectory);

            if (!serverOnline && !safeModeAvailable) {
                mainWindow.webContents.send("minecraft-launch-status", {
                    error: "Сервер недоступен, а папка с модами пуста. Невозможно запустить игру."
                });
                return false;
            }

            if (serverOnline) {
                try {
                    await downloadModsMultiThread(gameDirectory, mainWindow);
                    await cleanModsDirectory(gameDirectory);
                } catch (error) {
                    if (!safeModeAvailable) {
                        mainWindow.webContents.send("minecraft-launch-status", {
                            error: "Не удалось загрузить моды, а папка с модами пуста"
                        });
                        return false;
                    }
                    logger.warn('Failed to update mods but safe mode is available');
                }
            } else {
                logger.info('Starting in offline mode with existing mods');
                mainWindow.webContents.send("minecraft-launch-status", 
                    "Запуск в автономном режиме с существующими модами"
                );
            }

            launcher = new Client();

            launcher.on("error", (error) => {
                logger.error('Minecraft launch error: %s', error);
                mainWindow.webContents.send("minecraft-launch-status", {
                    error: `Ошибка запуска: ${error.message}`,
                    stack: error.stack
                });
            });

            launcher.on("data", (data) => {
                logger.debug('Minecraft output: %s', data);
                if (data.includes("Setting user:")) {
                    minecraftProcess = "running";
                    mainWindow.webContents.send("minecraft-status-update", "Запущен");
                }
            });

            launcher.on("close", () => {
                minecraftProcess = null;
                mainWindow.webContents.send("minecraft-status-update", "Не запущен");
            });

            mainWindow.webContents.send(
                "minecraft-launch-status",
                "Подготовка к запуску: инициализация лаунчера"
            );

            await fs.mkdir(gameDirectory, { recursive: true });

            const javaExecutable = await ensureJava(baseGameDirectory, mainWindow);
            await ensureFabric(gameDirectory);
            await ensureAuthlibInjector(baseGameDirectory);
            
            if (serverOnline) {
                await cleanModsDirectory(gameDirectory);
            }

            mainWindow.webContents.send(
                "minecraft-launch-status",
                "Запуск игры: авторизация"
            );
            
            let auth;
            try {
                auth = await Authenticator.getAuth(
                    settings.username || "Player",
                    settings.password || ""
                );
            } catch (error) {
                logger.error('Authentication failed: %s\nStack: %s', error.message, error.stack);
                mainWindow.webContents.send("minecraft-launch-status", {
                    error: `Ошибка авторизации: ${error.message}`,
                    stack: error.stack
                });
                return false;
            }

            const opts = {
                authorization: {
                    access_token: auth.access_token,
                    client_token: auth.client_token,
                    uuid: auth.uuid,
                    name: auth.name,
                    user_properties: '{}',
                    meta: {
                        type: 'ely.by',
                        xuid: null
                    }
                },
                version: {
                    number: MINECRAFT_VERSION,
                    type: "release",
                    custom: `fabric-loader-${FABRIC_VERSION}-${MINECRAFT_VERSION}`
                },
                memory: {
                    max: `${settings.ram}M`,
                    min: "1024M"
                },
                authlib: {
                    injector: `-javaagent:${baseGameDirectory}/authlib-injector.jar=ely.by`,
                },
                root: gameDirectory,
                overrides: {
                    url: {
                        auth: "https://authserver.ely.by",
                        sessionserver: "https://sessionserver.ely.by",
                        textures: "https://textures.ely.by",
                    },
                    gameDirectory,
                    javaPath: javaExecutable,
                    windowsHide: settings.debug === undefined ? true : !settings.debug,
                    showConsole: settings.debug || false,
                    javaArgs: [
                        "-Dfile.encoding=UTF-8",
                        "-XX:+UseG1GC",
                        "-XX:+ParallelRefProcEnabled",
                        "-XX:MaxGCPauseMillis=200",
                        "-XX:+UnlockExperimentalVMOptions",
                        "-XX:+DisableExplicitGC",
                        "-XX:+AlwaysPreTouch",
                        "-XX:G1NewSizePercent=30",
                        "-XX:G1MaxNewSizePercent=40",
                        "-XX:G1HeapRegionSize=8M",
                        "-XX:G1ReservePercent=20",
                        "-XX:G1HeapWastePercent=5",
                        "-XX:G1MixedGCCountTarget=4",
                        "-XX:InitiatingHeapOccupancyPercent=15",
                        "-XX:G1MixedGCLiveThresholdPercent=90",
                        "-XX:G1RSetUpdatingPauseTimePercent=5",
                        "-XX:SurvivorRatio=32",
                        "-XX:+PerfDisableSharedMem",
                        "-XX:MaxTenuringThreshold=1",
                        "-Dusing.aikars.flags=https://mcflags.emc.gs",
                        "-Daikars.new.flags=true",
                    ],
                },
            };
            logger.info("Java Args: %o", opts);

            launcher.on("debug", (e) => {
                logger.debug(e);
                mainWindow.webContents.send("minecraft-launch-status", `Отладка: ${e}`);
            });

            launcher.on("progress", (e) => {
                logger.info('Progress: %s - %s (%d%%)', 
                    e.type, 
                    e.task, 
                    Math.round((e.task / e.total) * 100)
                );
                mainWindow.webContents.send("minecraft-launch-status",
                    `Прогресс: ${e.type} - ${e.task} (${Math.round((e.task / e.total) * 100)}%)`
                );
            });

            launcher.on("status", (e) => {
                logger.info('Status: %s', e);
                mainWindow.webContents.send("minecraft-launch-status", `Статус: ${e}`);
            });

            mainWindow.webContents.send(
                "minecraft-launch-status",
                "Запуск игры: скачивание и подготовка компонентов"
            );
            
            const result = await launcher.launch(opts);
            
            if (!result) {
                throw new Error("Failed to start Minecraft");
            }

            logger.info('Launch arguments: %j', opts);
            mainWindow.webContents.send(
                "minecraft-launch-status",
                "Игра успешно запущена! Можете закрыть лаунчер."
            );

            return true;
        } catch (error) {
            logger.error('Game launch error: %s\nStack: %s', error.message, error.stack);
            mainWindow.webContents.send("minecraft-launch-status", {
                error: `Ошибка запуска: ${error.message}`,
                stack: error.stack
            });
            return false;
        }
    });

    ipcMain.handle("get-system-memory", () => {
        const totalMemory = Math.floor(os.totalmem() / (1024 * 1024));
        return totalMemory;
    });

    ipcMain.handle("get-java-version", async () => {
        try {
            const baseGameDirectory = getBaseGameDirectory();
            const javaExecutablePath = path.join(baseGameDirectory, CONFIG.DIRECTORIES.JAVA_DIR, 'bin', 'javaw.exe');
            
            if (fs_sync.existsSync(javaExecutablePath)) {
                const { stdout } = await execPromise(`"${javaExecutablePath}" -version 2>&1`);
                const match = stdout.match(/version "([^"]+)"/);
                return match ? match[1] : "Не определено";
            }
            return "Не установлена";
        } catch (error) {
            return "Ошибка определения";
        }
    });

    ipcMain.handle('open-directory', async (event, type) => {
        try {
            if (type === 'minecraft') {
                const gameDirectory = getBaseGameDirectory();
                await shell.openPath(gameDirectory);
            } else if (type === 'launcher') {
                const launcherLogsPath = path.join(app.getPath('appData'), 'smp-launcher', 'logs');
                await fs.mkdir(launcherLogsPath, { recursive: true });
                await shell.openPath(launcherLogsPath);
            }
            return true;
        } catch (error) {
            logger.error('Error opening directory: %s', error);
            return false;
        }
    });

    ipcMain.handle('get-debug-info', async () => {
        const gameDirectory = getBaseGameDirectory();
        const javaPath = await getBestJavaPath();
        return {
            javaPath,
            gameDirectory,
            os: `${os.platform()} ${os.release()} ${os.arch()}`,
            totalRam: Math.floor(os.totalmem() / (1024 * 1024)),
            logsDirectory: path.join(app.getPath('appData'), 'smp-launcher', 'logs')
        };
    });

    ipcMain.handle('get-system-info', () => {
        return {
            os: `${process.platform} ${os.release()} ${process.arch}`,
            totalRam: Math.floor(os.totalmem() / (1024 * 1024)),
            logsDirectory: path.join(app.getPath('appData'), 'smp-launcher', 'logs')
        };
    });

    ipcMain.handle('get-basic-info', async () => {
        const gameDirectory = getBaseGameDirectory();
        const javaPath = await getBestJavaPath();

        const totalRam = Math.ceil(os.totalmem() / (1024 * 1024 * 1024));
        const osInfo = {
            platform: os.platform(),
            release: os.release(),
            arch: os.arch(),
            type: os.type(),
            hostname: os.hostname(),
            cpus: os.cpus()[0].model,
            cores: os.cpus().length,
            is64bit: process.arch === 'x64',
            windows_version: os.version(),
            userInfo: os.userInfo.toString(),
        };

        return {
            os: `${osInfo.type} ${osInfo.release}`,
            osDetails: {
                windows: `${osInfo.windows_version} (${osInfo.platform})`,
                
                windows_version: `${osInfo.type} ${osInfo.release}`,
                architecture: `${osInfo.arch} (${osInfo.is64bit ? '64-bit' : '32-bit'})`,
                hostname: osInfo.hostname,
                cpu: osInfo.cpus,
                cores: osInfo.cores
            },
            totalRam: totalRam,
            freeRam: Math.ceil(os.freemem() / (1024 * 1024 * 1024)),
            logsDirectory: path.join(app.getPath('appData'), 'smp-launcher', 'logs'),
            gameDirectory: gameDirectory,
            javaPath: javaPath || 'Не определено'
        };
    });

    ipcMain.handle('check-server-status', async (event, host) => {
        try {
            // Используем только хост, без порта
            return await checkFullServerStatus(host);
        } catch (error) {
            logger.error('Server status check failed: %s', error.message);
            return false;
        }
    });

    ipcMain.handle('open-external-browser', (event, url) => {
       
        shell.openExternal(url);
    });

    ipcMain.handle('get-config', () => {
        return CONFIG;
    });
    ipcMain.handle('open-wiki', () => {
        const wikiWindow = new BrowserWindow({
            width: 900,
            height: 700,
            minHeight: 700,
            minWidth: 700,
            backgroundColor: "#1a1a2e",
            frame: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, "../preload.js"),
                webSecurity: true
            },
        });

        wikiWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': ["default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"]
                }
            });
        });
    
        wikiWindow.loadFile(path.join(__dirname, "../renderer/wiki.html"));
        
        ipcMain.handle("wiki-window-action", (event, action) => {
            switch (action) {
                case "minimize":
                    wikiWindow.minimize();
                    break;
                case "maximize":
                    wikiWindow.isMaximized()
                        ? wikiWindow.unmaximize()
                        : wikiWindow.maximize();
                    break;
                case "close":
                    wikiWindow.close();
                    break;
            }
        });
    
        wikiWindow.on('closed', () => {            ipcMain.removeHandler('wiki-window-action');        });    });    

    ipcMain.handle('validate-account', async (event, username, password) => {
        try {
            const Authenticator = mlc.Authenticator;
            
            // Логируем попытку авторизации (без пароля)
            logger.info('Attempting to validate account: %s', username);
            
            try {
                // Пытаемся авторизоваться
                const authResult = await Authenticator.getAuth(username, password);
                logger.info('Authentication successful for user: %s', username);
                logger.debug('Auth result: %o', authResult);
                
                // Проверяем статус заявки пользователя
                const applicationStatus = await checkApplicationStatus(authResult.uuid);
                
                // Получаем аватарку независимо от статуса заявки
                let avatarData = null;
                if (applicationStatus.userData && 
                    applicationStatus.userData.user && 
                    applicationStatus.userData.user.discord_id) {
                    try {
                        avatarData = await getDiscordAvatar(applicationStatus.userData.user.discord_id);
                        logger.info('Successfully loaded avatar for user: %s', username);
                    } catch (avatarError) {
                        logger.warn('Failed to load avatar for user: %s. Error: %s', username, avatarError.message);
                    }
                } else {
                    logger.debug('No Discord ID found in application data for user: %s', username);
                }
                
                // Если заявка одобрена или произошла ошибка при проверке, разрешаем вход
                if (applicationStatus.approved) {
                    // Если заявка одобрена, возвращаем положительный результат
                    logger.info('Account validation and application check successful for: %s', username);
                    return {
                        valid: true,
                        uuid: authResult.uuid,
                        applicationData: applicationStatus.userData,
                        avatar: avatarData
                    };
                } else {
                    // Если заявка не одобрена, возвращаем отказ
                    // Но всё равно включаем аватарку, чтобы она была доступна при повторной валидации
                    logger.warn('Application not approved for %s, status: %s', username, applicationStatus.status);
                    return {
                        valid: false,
                        error: 'Ваша заявка на сервер не одобрена или находится на рассмотрении.',
                        applicationStatus: applicationStatus.status,
                        avatar: avatarData  // Включаем аватарку даже если заявка не одобрена
                    };
                }
            } catch (error) {
                logger.warn('Account validation failed for %s: %s', username, error.message);
                return {
                    valid: false,
                    error: error.message
                };
            }
        } catch (error) {
            logger.error('Account validation error: %s', error);
            return {
                valid: false,
                error: 'Ошибка проверки учетных данных'
            };
        }
    });

    ipcMain.handle('load-avatar-for-account', async (event, discordId) => {
        if (!discordId) {
            logger.warn('No Discord ID provided for avatar load request');
            return null;
        }
        
        try {
            const avatarData = await getDiscordAvatar(discordId);
            logger.info('Successfully loaded avatar on demand for Discord ID: %s', discordId);
            return avatarData;
        } catch (error) {
            logger.error('Failed to load avatar on demand: %s', error.message);
            return null;
        }
    });
    
    ipcMain.handle('check-application-status', async (event, elyByUuid) => {
        return await checkApplicationStatus(elyByUuid);
    });

    ipcMain.handle('get-discord-avatar', async (event, discordId) => {
        return await getDiscordAvatar(discordId);
    });
}

async function checkHostingStatus(host) {
    try {
        const agent = new https.Agent({
            rejectUnauthorized: false,
            keepAlive: true
        });

        const response = await axios.get(CONFIG.SERVERS.HOSTING.URL, {
            httpsAgent: agent,
            timeout: 2000,
            validateStatus: () => true,
            headers: {
                'Connection': 'keep-alive'
            }
        });

        return response.status === 403 || (response.status < 500 && response.status >= 200);
        
    } catch (error) {
        logger.error('Hosting status check error: %s', error.message);
        return false;
    }
}

app.whenReady().then(() => {
    initializeCacheDirectories();
    createWindow();
});

app.on("window-all-closed", () => {
    app.quit();
});
