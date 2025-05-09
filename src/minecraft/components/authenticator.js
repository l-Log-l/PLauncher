import { createRequire } from 'module';
import https from 'https';
import { constants } from 'crypto';

// Создаем require для пакетов, которые не поддерживают ES модули
const require = createRequire(import.meta.url);
const request = require('request');

const API_URL = 'https://authserver.ely.by';

// Configure request defaults with simplified SSL options
const requestOptions = {
    strictSSL: false,
    rejectUnauthorized: false,
    agentOptions: {
        rejectUnauthorized: false
    },
    httpsAgent: new https.Agent({
        rejectUnauthorized: false,
        secureOptions: constants.SSL_OP_NO_TLSv1_2
    })
};

function debugLog(message, data) {
    console.log(`[Auth Debug] ${message}`, data || '');
}

function handleResponse(resolve, reject) {
    return (error, response, body) => {
        try {
            debugLog('Auth Response:', body);

            if (error) {
                debugLog('Auth Error:', error);
                const errorWithStack = new Error(error.message);
                Error.captureStackTrace(errorWithStack);
                return reject(errorWithStack);
            }

            // Check for specific error responses
            if (response.statusCode === 401 || (body && body.error === 'ForbiddenOperationException')) {
                debugLog('Auth Failed - Invalid Credentials');
                const authError = new Error('Неверный логин или пароль');
                Error.captureStackTrace(authError);
                return reject(authError);
            }

            if (!body || !body.accessToken) {
                debugLog('Auth Failed - No Token:', body?.errorMessage);
                const tokenError = new Error(body?.errorMessage || 'Ошибка аутентификации');
                Error.captureStackTrace(tokenError);
                return reject(tokenError);
            }

            const authResult = {
                access_token: body.accessToken,
                client_token: body.clientToken,
                uuid: body.selectedProfile.id,
                name: body.selectedProfile.name,
                user_properties: '{}'
            };

            debugLog('Auth Success:', authResult);
            resolve(authResult);
        } catch (processError) {
            debugLog('Response processing error:', processError);
            reject(new Error('Ошибка обработки ответа аутентификации'));
        }
    };
}

class ElyAuthenticator {
    static getAuth(username, password) {
        debugLog('Authenticating:', username);
        
        return new Promise((resolve, reject) => {
            request.post({
                ...requestOptions,
                url: `${API_URL}/auth/authenticate`,
                json: {
                    username: username,
                    password: password,
                    clientToken: 'launcher-node',
                    requestUser: true,
                    agent: {
                        name: "Minecraft",
                        version: 1
                    }
                },
                headers: {
                    'Content-Type': 'application/json'
                }
            }, handleResponse(resolve, reject));
        });
    }

    static validate(accessToken) {
        return new Promise((resolve, reject) => {
            request.post({
                ...requestOptions,
                url: `${API_URL}/auth/validate`,
                json: { accessToken }
            }, (error, response, body) => {
                if (error) return reject(error);
                resolve(response.statusCode === 204);
            });
        });
    }
}

export default ElyAuthenticator;
