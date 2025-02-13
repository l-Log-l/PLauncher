import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import ElectronStore from "electron-store";
import https from 'https';

import { initializeAutoUpdater } from './updater.js';


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

import mlc from "./launch/index.js";
import logger from './logger.js';
import { CONFIG } from '../config/config.js';
import { getLauncherVersion } from '../utils/version.js';

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
const SERVER_URL = CONFIG.SERVERS.GAME.API; // Исправлено
const MAX_DOWNLOAD_THREADS = CONFIG.MODS.MAX_THREADS; // Исправлено

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
    logger.info('Fetching mods list from server: %s', SERVER_URL);
    try {
        const serverUrl = SERVER_URL;
        const modsListResponse = await axios.get(`${serverUrl}/get_list_mods`);
        logger.info('Successfully received mods list. Total mods: %d', modsListResponse.data.length);
        logger.debug('Mods list: %o', modsListResponse.data);
        return modsListResponse.data;
    } catch (error) {
        logger.error('Failed to fetch mods list. Error: %s', error.message);
        logger.debug('Full error details: %o', error);
        return [];
    }
}

async function downloadModsMultiThread(gameDirectory, mainWindow) {
    // First check if server is online
    const serverOnline = await isServerOnline();
    if (!serverOnline) {
        logger.info('Server is offline, skipping mod download');
        mainWindow.webContents.send("download-mods-progress", {
            status: "Сервер недоступен, пропускаем загрузку модов",
        });
        return true; // Return true to allow launch if mods exist
    }

    // Continue with existing download logic
    const modsDir = path.join(gameDirectory, "mods");
    logger.info('Starting multi-threaded mod download to: %s', modsDir);
    
    await fs.mkdir(modsDir, { recursive: true });
    const mods = await getModsList();
    
    if (mods.length === 0) {
        logger.error('No mods received from server');
        mainWindow.webContents.send("download-mods-progress", {
            status: "Не удалось получить список модов",
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

async function getJavaVersionFromCommand(command) {
    try {
        const { stdout } = await execPromise(`"${command}" -version 2>&1`);
        console.log('Java version check output:', stdout);
        const versionMatch = stdout.match(/version "([^"]+)"/);
        if (versionMatch) {
            const version = parseInt(versionMatch[1].split('.')[0]);
            console.log(`Parsed Java version: ${version}`);
            return version;
        }
    } catch (e) {
        console.error(`Error checking Java version for ${command}:`, e);
    }
    return null;
}

async function findJavaInPath() {
    try {
        // Check if java is available in PATH
        const version = await getJavaVersionFromCommand('java');
        if (version && version >= 21) {
            // Get the actual path of java executable
            const { stdout } = await execPromise(
                os.platform() === 'win32' 
                    ? 'where java' 
                    : 'which java'
            );
            const javaPath = stdout.split('\n')[0].trim();
            // For Windows, always use javaw.exe
            if (os.platform() === 'win32') {
                const javawPath = javaPath.replace('java.exe', 'javaw.exe');
                if (fs_sync.existsSync(javawPath)) {
                    return javawPath;
                }
            }
            return javaPath;
        }
    } catch (e) {
        console.error('Error finding Java in PATH:', e);
    }
    return null;
}

async function waitForJavaInstallation(timeout = 60000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        // First check PATH
        const pathJava = await findJavaInPath();
        if (pathJava) {
            console.log('Found Java in PATH:', pathJava);
            return pathJava;
        }

        // Then check common installation directories
        const checkPaths = [
            "C:\\Program Files\\Java\\jdk-21\\bin\\javaw.exe",
            "C:\\Program Files\\Java\\jdk-23\\bin\\javaw.exe",
            "C:\\Program Files\\Common Files\\Oracle\\Java\\javapath\\javaw.exe"
        ];

        for (const javaPath of checkPaths) {
            if (fs_sync.existsSync(javaPath)) {
                const version = await getJavaVersionFromCommand(javaPath);
                if (version && version >= 21) {
                    console.log('Found Java at:', javaPath);
                    return javaPath;
                }
            }
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    return null;
}

async function getBestJavaPath() {
    logger.info('Looking for best Java installation...');
    let bestJava = {
        path: null,
        version: 0
    };

    const checkPaths = [
        "C:\\Program Files\\Java",
        "C:\\Program Files (x86)\\Java",
        "C:\\Program Files\\Common Files\\Oracle\\Java\\javapath"
    ];

    // Проверяем директории установки
    for (const basePath of checkPaths) {
        if (fs_sync.existsSync(basePath)) {
            const dirs = await fs.readdir(basePath);
            for (const dir of dirs) {
                const binPath = path.join(basePath, dir, 'bin', 'javaw.exe');
                
                if (fs_sync.existsSync(binPath)) {
                    const version = await getJavaVersionFromCommand(binPath);
                    if (version && version > bestJava.version) {
                        bestJava = { path: binPath, version };
                        logger.info('Found better Java %d at %s', version, binPath);
                    }
                }
            }
        }
    }

    // Then check PATH as fallback
    const pathJava = await findJavaInPath();
    if (pathJava) {
        const version = await getJavaVersionFromCommand(pathJava);
        if (version && version > bestJava.version) {
            bestJava = { path: pathJava, version };
            logger.info('Found better Java %d in PATH: %s', version, pathJava);
        }
    }

    if (bestJava.path && bestJava.version >= 21) {
        logger.info('Selected Java %d at %s', bestJava.version, bestJava.path);
        return bestJava.path;
    }

    logger.warn('No suitable Java found, will need to install');
    return null;
}

async function ensureJava(gameDirectory) {
    logger.info('Checking Java installation...');
    try {
        const javaPath = await getBestJavaPath();
        if (javaPath) {
            return javaPath;
        }

        // Continue with Java installation if no suitable version found
        logger.info('No suitable Java found, proceeding with installation');
        const installerUrl = JAVA_URLS.win32;
        if (!installerUrl) {
            logger.error('Failed to get Java installer URL');
            throw new Error("Failed to get Java installer URL");
        }

        const installerPath = path.join(
            os.tmpdir(),
            `java21_installer.exe`
        );

        logger.info('Downloading Java installer from: %s', installerUrl);
        logger.info('Installer will be saved to: %s', installerPath);
        const response = await axios.get(installerUrl, {
            responseType: "arraybuffer",
        });
        await fs.writeFile(installerPath, response.data);

        logger.info("Installing Java...");
        await execPromise(`"${installerPath}" /s INSTALL_SILENT=1 STATIC=0 AUTO_UPDATE=0`);
        
        // Wait longer for installation to complete
        logger.info("Waiting for Java installation to complete...");
        const newJavaPath = await waitForJavaInstallation(120000); // 2 minutes timeout
        if (newJavaPath) {
            logger.info("Java installation completed, found at: %s", newJavaPath);
            try {
                await fs.unlink(installerPath);
            } catch (e) {
                logger.error("Error removing installer: %s", e);
            }
            mainWindow.webContents.send('java-install-complete');
            return newJavaPath;
        }
        throw new Error("Java installation completed but executable not found");

    } catch (error) {
        logger.error('Java installation failed. Error: %s', error.message);
        logger.debug('Full error details: %o', error);
        throw error;
    }
}

async function removeDirectorySafe(directory) {
    try {
        console.log(`Removing directory: ${directory}`);
        await fsExtra.remove(directory);
        console.log(`Successfully removed directory: ${directory}`);
    } catch (error) {
        console.error(`Error removing directory ${directory}:`, error);
    }
}

async function renameWithRetry(source, destination, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            await fs.rename(source, destination);
            console.log(`Successfully moved: ${source} -> ${destination}`);
            return;
        } catch (error) {
            if (attempt === retries - 1) {
                console.error(
                    `Failed to move: ${source} -> ${destination}`,
                    error
                );
                throw error;
            }
            console.log(`Retrying move... (${attempt + 1}/${retries})`);
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
    }
}

async function extractJava(jdkArchive, targetDir) {
    try {
        console.log("Extracting Java archive...");
        await extract(jdkArchive, { dir: targetDir });

        const extractedFiles = await fs.readdir(targetDir);
        console.log("Extracted files:", extractedFiles);

        const jdkDir = extractedFiles.find(async (file) => {
            const filePath = path.join(targetDir, file);
            const stats = await fs.stat(filePath);
            return stats.isDirectory() && file.startsWith("jdk-");
        });

        if (jdkDir) {
            console.log("Found Java directory:", jdkDir);

            const files = await fs.readdir(path.join(targetDir, jdkDir));
            console.log("Files in JDK directory:", files);
            for (const file of files) {
                const oldPath = path.join(targetDir, jdkDir, file);
                const newPath = path.join(targetDir, file);

                console.log(`Moving: ${oldPath} -> ${newPath}`);
                await renameWithRetry(oldPath, newPath);
            }

            await removeDirectorySafe(path.join(targetDir, jdkDir));
            console.log("Java files extracted and moved successfully!");
        } else {
            console.error("Expected JDK folder not found in the archive.");
        }
    } catch (error) {
        console.error("Error extracting Java:", error);
    }
}

async function launchBackgroundMinecraft(gameDirectory, version) {
    const launcher = new Client();
    const opts = {
        authorization: Authenticator.getAuth("Player"),
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

async function ensureAuthlibInjector(gameDirectory) {
    const authlibInjectorPath = path.join(gameDirectory, "authlib-injector.jar");
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
    const userModsDir = path.join(gameDirectory, "user_mods");
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
        // If directory doesn't exist, consider it empty
        return true;
    }
}

async function isServerOnline() {
    try {
        const response = await axios.get(
            `${CONFIG.SERVERS.GAME.API}/get_list_mods`,
            { timeout: CONFIG.MODS.DOWNLOAD_TIMEOUT }
        );
        console.log('URL:', `${CONFIG.SERVERS.GAME.API}/get_list_mods`);
        console.log('Server status:', response.status);
        console.log('Server response:', response.data);
        console.log('Server online:', response.status === 200);
        
        return response.status === 200;
    } catch (error) {
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
        return false; // If directory doesn't exist or can't be read
    }
}

function initializeCacheDirectories() {
    const userDataPath = app.getPath('userData');
    const cacheDir = path.join(userDataPath, 'Cache');
    const gpuCacheDir = path.join(userDataPath, 'GPUCache');

    // Create directories with proper permissions
    [cacheDir, gpuCacheDir].forEach(dir => {
        if (!fs_sync.existsSync(dir)) {
            try {
                fs_sync.mkdirSync(dir, { recursive: true, mode: 0o755 });
            } catch (error) {
                logger.error('Failed to create cache directory %s: %s', dir, error);
            }
        }
    });

    // Set proper cache path in app
    app.setPath('sessionData', userDataPath);
    app.setPath('userCache', cacheDir);
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
            partition: 'persist:main' // Add this line
        },
        title: `SMP Launcher v${getLauncherVersion()}`,
    });

    let launcher = null; // Initialize launcher variable
    let minecraftProcess = null;

    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
    initializeAutoUpdater(mainWindow);
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
            const gameDirectory = store.get("gameDirectory");
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
            const gameDirectory = settings.gameDirectory || path.join(app.getPath("documents"), "Minecraft");
            const serverOnline = await isServerOnline();
            const safeModeAvailable = await isSafeModeAvailable(gameDirectory);

            // Check if we can proceed
            if (!serverOnline && !safeModeAvailable) {
                mainWindow.webContents.send("minecraft-launch-status", {
                    error: "Сервер недоступен, а папка с модами пуста. Невозможно запустить игру."
                });
                return false;
            }

            // If server is online, attempt to update mods
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

            // Continue with normal launch process
            launcher = new Client(); // Create a new launcher instance

            // Add event handlers after creating the launcher
            launcher.on("data", (data) => {
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

            const javaExecutable = await ensureJava(gameDirectory);
            await ensureFabric(gameDirectory);
            await ensureAuthlibInjector(gameDirectory);
            
            // Only clean mods directory if server is online
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
                    injector: `-javaagent:${gameDirectory}/authlib-injector.jar=ely.by`,
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
                    showConsole: settings.debug || false, // Добавить эту строку
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
            
            await launcher.launch(opts);

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

    // Add new IPC handlers
    ipcMain.handle("get-java-version", async () => {
        try {
            const javaPath = await findJavaInPath();
            if (javaPath) {
                const { stdout } = await execPromise(`"${javaPath}" -version 2>&1`);
                const match = stdout.match(/version "([^"]+)"/);
                return match ? match[1] : "Не определено";
            }
            return "Не установлена";
        } catch (error) {
            return "Ошибка определения";
        }
    });

    // Add this inside createWindow function
    ipcMain.handle('open-directory', async (event, type) => {
        try {
            if (type === 'minecraft') {
                const gameDirectory = store.get('gameDirectory') || path.join(app.getPath('documents'), 'Minecraft');
                await shell.openPath(gameDirectory);
            } else if (type === 'launcher') {
                const launcherLogsPath = path.join(app.getPath('appData'), 'smp-launcher', 'logs');
                // Ensure the directory exists
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
        const gameDirectory = store.get('gameDirectory') || path.join(app.getPath('documents'), 'Minecraft');
        const javaPath = await getBestJavaPath();
        return {
            javaPath,
            gameDirectory,
            os: `${os.platform()} ${os.release()} ${os.arch()}`,
            totalRam: Math.floor(os.totalmem() / (1024 * 1024)),
            logsDirectory: path.join(app.getPath('appData'), 'smp-launcher', 'logs')
        };
    });

    // Add new IPC handler for system info
    ipcMain.handle('get-system-info', () => {
        return {
            os: `${process.platform} ${os.release()} ${process.arch}`,
            totalRam: Math.floor(os.totalmem() / (1024 * 1024)),
            logsDirectory: path.join(app.getPath('appData'), 'smp-launcher', 'logs')
        };
    });

    // Упростили обработчик для базовой информации
    ipcMain.handle('get-basic-info', async () => {
        const gameDirectory = store.get('gameDirectory') || path.join(app.getPath('documents'), 'Minecraft');
        const javaPath = await getBestJavaPath();

        // Получаем информацию о системе
        const totalRam = Math.ceil(os.totalmem() / (1024 * 1024 * 1024)); // Округляем вверх до ГБ
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

    // Update server status check handler
    ipcMain.handle('check-server-status', async (event, host, isHosting = false) => {
        try {
            if (isHosting) {
                const startTime = performance.now();
                const result = await checkHostingStatus(host);
                const endTime = performance.now();
                const pingTime = Math.round(endTime - startTime);
                
                // Отправляем пинг через IPC
                mainWindow.webContents.send('hosting-ping-update', pingTime);
                
                return result;
            } else {
                const response = await axios.get(
                    `https://api.mcstatus.io/v2/status/java/${CONFIG.SERVERS.GAME.HOST}`,
                    { timeout: CONFIG.SERVERS.GAME.STATUS_CHECK_TIMEOUT }
                );
                return response.data?.online === true;
            }
        } catch (error) {
            logger.error('Server status check failed: %s', error.message);
            return false;
        }
    });

    ipcMain.handle('open-external-browser', (event, url) => {
       
        shell.openExternal(url);  // Открывает ссылку в системном браузере
    });

    // Добавляем новый обработчик для конфигов
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
                preload: path.join(__dirname, "../preload.js"), // Fix preload path
                webSecurity: true
            },
        });

        // Add CSP headers
        wikiWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': ["default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"]
                }
            });
        });
    
        wikiWindow.loadFile(path.join(__dirname, "../renderer/wiki.html"));
        
        // Use a unique handler name for wiki window controls
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
    
        // Clean up the handler when window is closed
        wikiWindow.on('closed', () => {            ipcMain.removeHandler('wiki-window-action');        });    });    }

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

        // Сервер работает если возвращает 403 (нет авторизации) 
        // или любой другой ответ кроме 5xx
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
