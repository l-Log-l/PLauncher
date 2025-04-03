import { getLauncherVersion } from '../utils/version.js';

export const CONFIG = {
    VERSION: {
        LAUNCHER: getLauncherVersion(),
        MINECRAFT: '1.20.1',
        FABRIC: '0.16.10',
        AUTHLIB: '1.2.5'
    },

    SERVERS: {
        UPDATE: {
            // Убедимся, что URL правильный и не содержит лишних сегментов
            URL: 'https://api.smp-planet.fun',
            CHECK_INTERVAL: 3600000 // 1 час
        },
        GAME: {
            HOST: 'smp-planet.fun',
            API: 'https://api.smp-planet.fun/api',  // Вернули как было
            STATUS_CHECK_INTERVAL: 30000 // 30 секунд
        }
        
    },

    DIRECTORIES: {
        DEFAULT_GAME_DIR: 'Minecraft',
        PROFILES_DIR: 'profiles',
        DEFAULT_PROFILE: 'default',
        USER_MODS_DIR: 'user_mods',
        LAUNCHER_LOGS: 'smp-launcher/logs',
        JAVA_DIR: 'java',
    },

    STORE: {
        NAME: 'minecraft-launcher-settings',
        DEFAULTS: {
            username: 'Player',
            ram: 2048,
            theme: 'dark',
            debug: false
        }
    },

    AUTH: {
        SERVICE: 'ely.by',
        URLS: {
            AUTH: 'https://authserver.ely.by',
            SESSION: 'https://sessionserver.ely.by',
            TEXTURES: 'https://textures.ely.by'
        },
        AVATAR: {
            API_URL: 'http://api.smp-planet.fun/api/discord/get_avatar?discord_id='
        }
    },

    JAVA: {
        MIN_VERSION: 23,
        DOWNLOAD_URLS: {
            win32: 'http://vds.smp-planet.fun:25567/api/download/java.zip',
            
        },
        
        
    },

    MODS: {
        MAX_THREADS: 5,
        DOWNLOAD_TIMEOUT: 30000,
        RETRY_ATTEMPTS: 3,
        FILE_EXTENSION: '.jar'
    },

    WINDOW: {
        MAIN: {
            WIDTH: 900,
            HEIGHT: 700,
            MIN_WIDTH: 700,
            MIN_HEIGHT: 700,
            BACKGROUND: '#1a1a2e',
            FRAME: false
        },
        WIKI: {
            WIDTH: 900,
            HEIGHT: 700,
            MIN_WIDTH: 700,
            MIN_HEIGHT: 700,
            BACKGROUND: '#1a1a2e',
            FRAME: false
        }
    },

    LAUNCH: {
        MIN_RAM: '1024M',
        DEFAULT_USERNAME: 'Player',
        JVM_ARGS: [
            '-Dfile.encoding=UTF-8',
            '-XX:+UseG1GC',
            '-XX:+ParallelRefProcEnabled',
            '-XX:MaxGCPauseMillis=200',
            '-XX:+UnlockExperimentalVMOptions',
            '-XX:+DisableExplicitGC',
            '-XX:+AlwaysPreTouch',
            '-XX:G1NewSizePercent=30',
            '-XX:G1MaxNewSizePercent=40',
            '-XX:G1HeapRegionSize=8M',
            '-XX:G1ReservePercent=20',
            '-XX:G1HeapWastePercent=5',
            '-XX:G1MixedGCCountTarget=4',
            '-XX:InitiatingHeapOccupancyPercent=15',
            '-XX:G1MixedGCLiveThresholdPercent=90',
            '-XX:G1RSetUpdatingPauseTimePercent=5',
            '-XX:SurvivorRatio=32',
            '-XX:+PerfDisableSharedMem',
            '-XX:MaxTenuringThreshold=1',
            '-Dusing.aikars.flags=https://mcflags.emc.gs',
            '-Daikars.new.flags=true'
        ]
    },

    EXTERNAL: {
        URLS: {
            SUNDER: 'https://sunder.su/aff/LOG',
            AUTHLIB: 'https://github.com/yushijinhun/authlib-injector/releases/download/v1.2.5/authlib-injector-1.2.5.jar',
            FABRIC_META: 'https://meta.fabricmc.net/v2/versions/loader'
        }
    },

    BUILD: {
        APP_ID: 'ru.art3m4ik3.smplauncher',
        PRODUCT_NAME: 'SMP Launcher',
        COPYRIGHT: 'art3m4ik3 (c) 2025',
        LANGUAGES: ['ru-RU', 'en-US']
    }
};

export default CONFIG;
