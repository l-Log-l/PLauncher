import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { format } from 'util';
import ElectronStore from 'electron-store';
import { CONFIG } from '../config/config.js';

const logsPath = path.join(app.getPath('appData'), CONFIG.DIRECTORIES.LAUNCHER_LOGS);

class Logger {
    constructor() {
        this.logDir = logsPath;
        this.logFile = path.join(this.logDir, `launcher-${new Date().toISOString().split('T')[0]}.log`);
        
        // Create logs directory if it doesn't exist
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    _formatObject(obj) {
        try {
            return JSON.stringify(obj, null, 2);
        } catch (error) {
            return `[Невозможно сериализовать объект: ${error.message}]`;
        }
    }

    _getCallerInfo() {
        const error = new Error();
        const stack = error.stack.split('\n');
        // Пропускаем первые 3 строки (Error, getCallerInfo, _writeToFile)
        const callerLine = stack[4] || '';
        const match = callerLine.match(/at\s+(.+)\s+\((.+):(\d+):\d+\)/);
        
        if (match) {
            return {
                function: match[1],
                file: match[2],
                line: match[3]
            };
        }
        return null;
    }

    _writeToFile(level, message, ...args) {
        const timestamp = new Date().toISOString();
        let formattedMessage = message;
        const callerInfo = this._getCallerInfo();
        
        // Обработка специальных форматов
        args = args.map(arg => {
            if (typeof arg === 'object') {
                return this._formatObject(arg);
            }
            return arg;
        });

        // Обработка %o специального формата для объектов
        formattedMessage = formattedMessage.replace(/%o/g, () => {
            const arg = args.shift();
            return typeof arg === 'string' ? arg : this._formatObject(arg);
        });

        // Форматирование остальных аргументов
        formattedMessage = format(formattedMessage, ...args);
        
        // Добавляем информацию о файле и строке для уровней ERROR и WARN
        let logEntry;
        if (level === 'ERROR' || level === 'WARN') {
            const locationInfo = callerInfo ? 
                ` [${callerInfo.file}:${callerInfo.line}]` : 
                '';
            logEntry = `[${timestamp}] [${level}]${locationInfo} ${formattedMessage}\n`;
        } else {
            logEntry = `[${timestamp}] [${level}] ${formattedMessage}\n`;
        }

        fs.appendFileSync(this.logFile, logEntry);
        console.log(logEntry.trim());
    }

    info(message, ...args) {
        this._writeToFile('INFO', format(message, ...args));
    }

    error(message, ...args) {
        this._writeToFile('ERROR', format(message, ...args));
    }

    warn(message, ...args) {
        this._writeToFile('WARN', format(message, ...args));
    }

    debug(message, ...args) {
        // Check if debug mode is enabled in settings
        const store = new ElectronStore();
        const debugEnabled = store.get('debug', false);
        
        if (debugEnabled) {
            this._writeToFile('DEBUG', format(message, ...args));
        }
    }
}

const logger = new Logger();

// Catch uncaught exceptions
process.on('uncaughtException', (error) => {
    const stack = error.stack || '';
    logger.error('Uncaught Exception: %s\nStack: %s', error.message, stack);
});

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    const stack = reason.stack || '';
    logger.error('Unhandled Promise Rejection: %s\nStack: %s', reason.message || reason, stack);
});

export default logger;
