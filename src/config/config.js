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
            HOST: '178.236.253.2',
            PORT: 25210,
            URL: 'http://node1.sunder.su:25895',
            CHECK_INTERVAL: 3600000 // 1 час
        },
        GAME: {
            HOST: 'smp-planet.fun',
            API: 'http://node1.sunder.su:25895',  // Вернули как было
            STATUS_CHECK_INTERVAL: 30000 // 30 секунд
        },
        HOSTING: {
            HOST: '89.34.219.87',
            PORT: 8443,
            URL: 'https://89.34.219.87:8443',
            WEB: 'sunder.su',
            CHECK_TIMEOUT: 5000
        }
    },

    DIRECTORIES: {
        DEFAULT_GAME_DIR: 'Minecraft',
        USER_MODS_DIR: 'user_mods',
        LAUNCHER_LOGS: 'smp-launcher/logs'
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
        }
    },

    JAVA: {
        MIN_VERSION: 21,
        DOWNLOAD_URLS: {
            win32: 'https://download.oracle.com/java/23/latest/jdk-23_windows-x64_bin.exe',
            darwin: 'https://download.oracle.com/java/23/latest/jdk-23_macos-x64_bin.dmg',
            linux: 'https://download.oracle.com/java/23/latest/jdk-23_linux-x64_bin.deb'
        },
        INSTALL_ARGS: {
            win32: '/s INSTALL_SILENT=1 STATIC=0 AUTO_UPDATE=0'
        },
        PATHS: {
            WIN32: [
                'C:\\Program Files\\Java\\jdk-21\\bin\\javaw.exe',
                'C:\\Program Files\\Java\\jdk-23\\bin\\javaw.exe',
                'C:\\Program Files\\Common Files\\Oracle\\Java\\javapath\\javaw.exe'
            ]
        }
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
