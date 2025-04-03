import axios from 'axios';
import net from 'net';
import logger from './logger.js';
import dns from 'dns';
import { promisify } from 'util';

const resolveSrv = promisify(dns.resolveSrv);

/**
 * Получает информацию о хосте и порте из DNS SRV-записей
 * @param {string} host - хост сервера
 * @returns {Promise<{host: string, port: number}>} - информация о хосте и порте
 */
async function resolveMinecraftServer(host) {
    try {
        // Пытаемся получить SRV-запись для Minecraft-сервера
        const srvRecords = await resolveSrv(`_minecraft._tcp.${host}`);
        if (srvRecords && srvRecords.length > 0) {
            logger.info('Found SRV record for %s: %s:%d', host, srvRecords[0].name, srvRecords[0].port);
            return {
                host: srvRecords[0].name,
                port: srvRecords[0].port
            };
        }
    } catch (error) {
        // Если SRV-запись не найдена, не выбрасываем ошибку
        logger.debug('No SRV record found for %s: %s', host, error.message);
    }

    // Возвращаем исходный хост и стандартный порт Minecraft
    return {
        host,
        port: 25565
    };
}

/**
 * Проверяет статус Minecraft сервера с помощью соединения через socket
 * @param {string} host - хост сервера
 * @returns {Promise<boolean>} - true если сервер доступен, иначе false
 */
export async function checkBasicServerStatus(host) {
    let resolvedHost;
    let port = 25565;
    
    try {
        // Резолвим SRV-запись
        const serverInfo = await resolveMinecraftServer(host);
        resolvedHost = serverInfo.host;
        port = serverInfo.port;
    } catch (error) {
        logger.warn('Failed to resolve Minecraft server: %s', error.message);
        resolvedHost = host; // Используем исходный хост, если не удалось разрезолвить
    }
    
    logger.info('Checking Minecraft server status: %s:%d', resolvedHost, port);
    
    return new Promise((resolve) => {
        let timeout;
        
        // Устанавливаем таймаут в 3 секунды
        const timeoutPromise = new Promise((_, reject) => {
            timeout = setTimeout(() => {
                reject(new Error('Connection timed out'));
            }, 3000);
        });
        
        // Создаем сокет для проверки
        const socket = new net.Socket();
        
        socket.on('error', (error) => {
            clearTimeout(timeout);
            logger.warn('Server connection error: %s', error.message || 'Unknown error');
            resolve(false);
            socket.destroy();
        });

        socket.on('close', () => {
            clearTimeout(timeout);
            socket.destroy();
        });
        
        // Создаем Promise для подключения к серверу
        const connectPromise = new Promise((resolve) => {
            socket.connect(port, resolvedHost, () => {
                clearTimeout(timeout);
                socket.destroy();
                resolve(true);
            });
        });
        
        // Используем Promise.race чтобы перехватить первый результат
        Promise.race([connectPromise, timeoutPromise])
            .then(result => resolve(result))
            .catch(() => {
                logger.warn('Server connection timed out');
                resolve(false);
            });
    });
}

/**
 * Проверяет статус Minecraft сервера через API
 * @param {string} host - хост сервера
 * @returns {Promise<boolean|object>} - информация о сервере или false, если сервер недоступен
 */
export async function checkServerStatusViaAPI(host) {
    try {
        // Используем только хост без указания порта
        const apiUrl = `https://api.mcsrvstat.us/2/${host}`;
        logger.debug('Using API URL: %s', apiUrl);
        
        const response = await axios.get(apiUrl, {
            timeout: 3000
        });
        
        if (response.data && response.data.online === true) {
            logger.info('Server is online according to API. Players: %d/%d', 
                response.data.players?.online || 0, 
                response.data.players?.max || 0);
                
            return {
                online: true,
                players: {
                    online: response.data.players?.online || 0,
                    max: response.data.players?.max || 0
                },
                version: response.data.version
            };
        }
        
        logger.warn('Server appears to be offline according to API');
        return false;
    } catch (error) {
        logger.warn('Failed to check server via API: %s', error.message);
        return false;
    }
}

/**
 * Комплексная проверка статуса Minecraft сервера с кэшированием
 * @param {string} host - хост сервера
 * @returns {Promise<boolean|object>} - информация о сервере или false, если сервер недоступен
 */
let cachedStatus = null;
let lastCheckTime = 0;
const CACHE_TTL = 10000; // 10 секунд кэширования результата

export async function checkFullServerStatus(host) {
    // Проверяем кэш, если запрос был не так давно
    const now = Date.now();
    if (cachedStatus && (now - lastCheckTime < CACHE_TTL)) {
        logger.debug('Using cached server status (age: %dms)', now - lastCheckTime);
        return cachedStatus;
    }
    
    try {
        // Попробуем сначала получить информацию через API, так как это более надежно
        const apiResult = await checkServerStatusViaAPI(host);
        if (apiResult) {
            cachedStatus = apiResult;
            lastCheckTime = now;
            return apiResult;
        }
        
        // Если API не вернул результат, проверяем через сокет
        const isOnline = await checkBasicServerStatus(host);
        
        if (!isOnline) {
            logger.warn('Server is offline (socket check)');
            cachedStatus = false;
            lastCheckTime = now;
            return false;
        }
        
        // Сервер доступен, но API не вернул детальную информацию
        cachedStatus = { online: true };
        lastCheckTime = now;
        return { online: true };
    } catch (error) {
        logger.error('Server status check failed: %s', error.message);
        cachedStatus = false;
        lastCheckTime = now;
        return false;
    }
}

export default {
    checkBasicServerStatus,
    checkServerStatusViaAPI,
    checkFullServerStatus
};
