import axios from 'axios';
import { app, ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
// Исправляем импорт electron-updater
import pkg from 'electron-updater';
const { autoUpdater } = pkg;

import { CONFIG } from '../config/config.js';

const UPDATE_SERVER_URL = CONFIG.SERVERS.UPDATE.URL;
const UPDATE_FILE_PATH = path.join(app.getPath('temp'), 'update.exe');

export function initializeAutoUpdater(mainWindow) {
    autoUpdater.setFeedURL({
        provider: 'generic',
        url: CONFIG.SERVERS.UPDATE.URL
    });

    autoUpdater.checkForUpdatesAndNotify();
    setInterval(() => {
        autoUpdater.checkForUpdatesAndNotify();
    }, CONFIG.SERVERS.UPDATE.CHECK_INTERVAL);

    let updateInProgress = false;

    async function checkForUpdates() {
        if (updateInProgress) return;

        try {
            mainWindow.webContents.send('update-status', {
                type: 'checking'
            });

            const { data } = await axios.get(`${UPDATE_SERVER_URL}/version-info`);
            const latestVersion = data.version;
            const currentVersion = app.getVersion();

            if (latestVersion > currentVersion) {
                updateInProgress = true;
                mainWindow.webContents.send('update-status', {
                    type: 'update-available',
                    version: latestVersion
                });

                await downloadUpdate(data.url);
            } else {
                mainWindow.webContents.send('update-status', {
                    type: 'no-update'
                });
            }
        } catch (error) {
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
            const response = await axios({
                url: downloadURL,
                method: 'GET',
                responseType: 'stream'
            });

            const totalLength = response.headers['content-length'];

            response.data.on('data', (chunk) => {
                const downloaded = writer.bytesWritten;
                const progress = (downloaded / totalLength) * 100;
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

            mainWindow.webContents.send('update-status', {
                type: 'installing'
            });

            await installUpdate();
        } catch (error) {
            updateInProgress = false;
            mainWindow.webContents.send('update-status', {
                type: 'error',
                message: error.message
            });
        }
    }

    function installUpdate() {
        return new Promise((resolve, reject) => {
            exec(`"${UPDATE_FILE_PATH}"`, (error) => {
                if (error) {
                    updateInProgress = false;
                    reject(error);
                    return;
                }
                app.quit();
                resolve();
            });
        });
    }

    ipcMain.handle('check-for-updates', checkForUpdates);

    app.whenReady().then(() => {
        // Проверяем обновления при запуске
        setTimeout(checkForUpdates, 2000);
    });
}
