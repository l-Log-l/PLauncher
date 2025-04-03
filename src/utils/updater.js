import axios from 'axios';
import { app, ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

import { CONFIG } from '../config/config.js';
import logger from '../utils/logger.js';

// Исправляем URL для обновлений
const UPDATE_SERVER_URL = CONFIG.SERVERS.UPDATE.URL;
const UPDATE_FILE_PATH = path.join(app.getPath('temp'), 'update.exe');

// Функция для корректного сравнения версий (семантическое сравнение)
function compareVersions(v1, v2) {
    const v1Parts = v1.split('.').map(Number);
    const v2Parts = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
        const v1Part = v1Parts[i] || 0;
        const v2Part = v2Parts[i] || 0;
        
        if (v1Part > v2Part) return 1;
        if (v1Part < v2Part) return -1;
    }
    
    return 0;
}

export function initializeAutoUpdater(mainWindow) {
    // Принудительно устанавливаем, что приложение упаковано, если нужно тестировать обновления
    // const isPackaged = true; // Раскомментировать для тестирования обновлений
    const isPackaged = app.isPackaged;
    
    logger.info('Initializing auto-updater with URL: %s', UPDATE_SERVER_URL);
    logger.info('Application is packaged: %s', isPackaged);
    logger.info('Current version: %s', app.getVersion());
    
    // В режиме разработки пропускаем автоматическую проверку
    if (!isPackaged) {
        logger.info('Skipping automatic update checks in development mode');
        return;
    }

    // Правильно настраиваем URL для автообновлений
    autoUpdater.setFeedURL({
        provider: 'generic',
        url: UPDATE_SERVER_URL
    });
    
    // Проверка на старте
    setTimeout(() => {
        logger.info('Running initial update check');
        checkForUpdates();
    }, 2000);
    
    // Регулярная проверка обновлений
    setInterval(() => {
        logger.info('Running scheduled update check');
        checkForUpdates();
    }, CONFIG.SERVERS.UPDATE.CHECK_INTERVAL);

    let updateInProgress = false;

    async function checkForUpdates() {
        if (updateInProgress) {
            logger.info('Update check skipped - update already in progress');
            return;
        }

        try {
            mainWindow.webContents.send('update-status', {
                type: 'checking'
            });

            // Используем правильный полный URL к API версии
            const versionUrl = `${UPDATE_SERVER_URL}/api/version-info`;
            logger.info('Checking for updates at: %s', versionUrl);
            
            const { data } = await axios.get(versionUrl);
            logger.info('Update check response: %o', data);
            
            const latestVersion = data.version;
            const currentVersion = app.getVersion();
            
            logger.info('Current version: %s, Latest version: %s', currentVersion, latestVersion);

            // Используем правильное сравнение версий
            const versionComparison = compareVersions(latestVersion, currentVersion);
            logger.info('Version comparison result: %d', versionComparison);

            if (versionComparison > 0) {
                logger.info('Update available! Starting download process');
                updateInProgress = true;
                mainWindow.webContents.send('update-status', {
                    type: 'update-available',
                    version: latestVersion
                });

                await downloadUpdate(data.url);
            } else {
                logger.info('No update available - current version is up to date');
                mainWindow.webContents.send('update-status', {
                    type: 'no-update'
                });
            }
        } catch (error) {
            logger.error('Update check error: %s', error.message);
            logger.error('Attempted URL: %s', `${UPDATE_SERVER_URL}/api/version-info`);
            
            if (error.response) {
                logger.error('Response status: %d', error.response.status);
                logger.error('Response data: %o', error.response.data);
            }
            
            mainWindow.webContents.send('update-status', {
                type: 'error',
                message: error.message
            });
        }
    }

    async function downloadUpdate(downloadURL) {
        mainWindow.webContents.send('update-status', {
            type: 'downloading',
            progress: 0
        });

        const writer = fs.createWriteStream(UPDATE_FILE_PATH);

        try {
            logger.info('Downloading update from: %s', downloadURL);
            const response = await axios({
                url: downloadURL,
                method: 'GET',
                responseType: 'stream'
            });

            const totalLength = response.headers['content-length'];
            logger.info('Update size: %d bytes', totalLength);

            response.data.on('data', (chunk) => {
                const downloaded = writer.bytesWritten;
                const progress = (downloaded / totalLength) * 100;
                logger.debug('Download progress: %d%%', Math.round(progress));
                mainWindow.webContents.send('update-status', {
                    type: 'downloading',
                    progress: Math.round(progress)
                });
            });

            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            logger.info('Download complete, starting installation');
            mainWindow.webContents.send('update-status', {
                type: 'installing'
            });

            await installUpdate();
        } catch (error) {
            logger.error('Update download failed: %s', error.message);
            updateInProgress = false;
            mainWindow.webContents.send('update-status', {
                type: 'error',
                message: error.message
            });
        }
    }

    function installUpdate() {
        return new Promise((resolve, reject) => {
            logger.info('Executing update installer: %s', UPDATE_FILE_PATH);
            exec(`"${UPDATE_FILE_PATH}"`, (error) => {
                if (error) {
                    logger.error('Installation failed: %s', error.message);
                    updateInProgress = false;
                    reject(error);
                    return;
                }
                logger.info('Installation initiated successfully, quitting application');
                app.quit();
                resolve();
            });
        });
    }

    // Обработчики событий для автоматического обновления
    autoUpdater.on('checking-for-update', () => {
        logger.info('Checking for update via electron-updater');
    });
    
    autoUpdater.on('update-available', (info) => {
        logger.info('Update available via electron-updater: %o', info);
    });
    
    autoUpdater.on('update-not-available', (info) => {
        logger.info('No update available via electron-updater: %o', info);
    });
    
    autoUpdater.on('error', (err) => {
        logger.error('Auto-updater error: %s', err.message);
    });
    
    autoUpdater.on('download-progress', (progressObj) => {
        logger.debug('Download progress: %d%%', progressObj.percent);
    });
    
    autoUpdater.on('update-downloaded', (info) => {
        logger.info('Update downloaded, will install on quit: %o', info);
        mainWindow.webContents.send('update-status', {
            type: 'update-downloaded',
            info
        });
    });

    ipcMain.handle('check-for-updates', checkForUpdates);
    
    // Принудительный вызов обновления через автообновление Electron
    if (isPackaged) {
        // Проверяем обновления и через стандартный механизм тоже
        autoUpdater.checkForUpdates().catch(err => {
            logger.error('Error checking for updates via electron-updater: %s', err.message);
        });
    }
}
