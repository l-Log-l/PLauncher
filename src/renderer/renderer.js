let CONFIG; // Глобальная переменная для конфигов

document.getElementById("banner-img").addEventListener("click", function() {
    // Отправляем запрос на главный процесс для открытия внешнего браузера
    window.electronAPI.openExternalBrowser(CONFIG.EXTERNAL.OCTANT_SITE);
});

document.addEventListener("DOMContentLoaded", async () => {
    // Загружаем конфиги в начале
    CONFIG = await window.electronAPI.getConfig();
    
    // Обновляем версию в футере
    document.querySelector('#version-display').textContent = CONFIG.VERSION.LAUNCHER;

    // Обновляем debug-launcher-version
    document.getElementById('debug-launcher-version').textContent = CONFIG.VERSION.LAUNCHER;
    console.log('Launcher version:', CONFIG.VERSION.LAUNCHER);
    const usernameInput = document.getElementById("username-input");
    const passwordInput = document.getElementById("password-input");
    const ramInput = document.getElementById("ram-input");
    const directoryInput = document.getElementById("directory-input");
    const selectDirectoryBtn = document.getElementById("select-directory");
    const saveSettingsBtn = document.getElementById("save-settings");
    const launchGameBtn = document.getElementById("launch-game");
    const progressContainer = document.createElement("div");
    const ramDisplay = document.getElementById("ram-display");
    const debugButton = document.getElementById("debug-input");

    progressContainer.id = "progress-container";
    progressContainer.innerHTML = `
        <div id="progress-area" class="progress-area"></div>
        <div id="progress-status" class="progress-status"></div>
    `;
    document.querySelector(".settings-section").appendChild(progressContainer);

    const progressArea = document.getElementById("progress-area");

    function clearOldMessages() {
        while (progressArea.children.length > 0) {
            progressArea.removeChild(progressArea.firstChild);
        }
    }

    function logProgress(message, type = "info") {
        clearOldMessages();

        const progressElement = document.createElement("div");
        progressElement.classList.add("progress-message", `progress-${type}`);
        
        // Форматируем сообщение об ошибке для лучшего отображения
        let displayMessage = message;
        if (type === "error" && message.includes("[")) {
            displayMessage = message.replace(/\[(.+):(\d+)\]/, (match, file, line) => {
                return ` [${file}\n:${line}]`;
            });
        }

        progressElement.innerHTML = `
            <span class="progress-time">${new Date().toLocaleTimeString()}</span>
            <span class="progress-text">${displayMessage}</span>
        `;

        progressArea.appendChild(progressElement);
        progressArea.scrollTop = progressArea.scrollHeight;

        // Add to debug live log if debug mode is enabled
        if (debugButton.checked) {
            const debugLogEntry = document.createElement('div');
            debugLogEntry.textContent = `[${new Date().toLocaleTimeString()}] ${type.toUpperCase()}: ${message}`;
            debugLiveLog.appendChild(debugLogEntry);
            debugLiveLog.scrollTop = debugLiveLog.scrollHeight;
        }
    }

    logProgress("Информация", "info");

    function setupProgressListener() {
        if (!window.electronAPI?.onDownloadProgress) {
            console.error('Download progress API not available');
            return null;
        }

        const removeProgressListener = window.electronAPI.onDownloadProgress((progressData) => {
            if (!progressData) return;
            
            if (progressData.status) {
                logProgress(
                    progressData.status,
                    progressData.error ? "error" : "info"
                );
            }

            if (progressData.totalDownloaded !== undefined) {
                logProgress(
                    `Загружено модов: ${progressData.totalDownloaded} из ${progressData.totalMods}`,
                    "progress"
                );
            }

            if (progressData.error) {
                logProgress(progressData.error, "error");
            }
        });

        return removeProgressListener;
    }

    // Пытаемся установить слушатель с небольшой задержкой
    setTimeout(() => {
        const removeProgressListener = setupProgressListener();
        if (removeProgressListener) {
            window.addEventListener('unload', () => {
                removeProgressListener();
            });
        }
    }, 1000);

    window.electronAPI.onMinecraftLaunchStatus((event, status) => {
        console.log('Launch status received:', status); // Для отладки
        
        if (typeof status === 'object' && status.error) {
            const stack = status.stack || '';
            const matches = stack.match(/at\s+(.+?)\s+\((.+?):(\d+):\d+\)/);
            let errorMessage = status.error;
            
            if (matches) {
                const [_, func, file, line] = matches;
                const fileName = file.split(/[\/\\]/).pop(); // Получаем только имя файла
                errorMessage += ` [${fileName}:${line}]`;
            }
            
            logProgress(errorMessage, "error");
        } else {
            logProgress(status, status.includes("Ошибка") ? "error" : "success");
        }
    });

    launchGameBtn.addEventListener("click", async () => {
        launchGameBtn.disabled = true;
        progressArea.innerHTML = "";

        const settings = {
            username: usernameInput.value || CONFIG.LAUNCH.DEFAULT_USERNAME,
            password: passwordInput.value || "",
            ram: parseInt(ramInput.value) || maxRam / 2,
            gameDirectory: directoryInput.value,
            debug: debugButton.checked,
        };

        try {
            const saved = await window.electronAPI.saveSettings(settings);
            logProgress(
                saved ? "Настройки сохранены!" : "Не удалось сохранить настройки",
                saved ? "success" : "error"
            );
            logProgress("Начало подготовки к запуску", "info");
        } catch (error) {
            console.error("Error saving settings:", error);
            logProgress("Ошибка сохранения настроек", "error");
        }

        

        logProgress("Начало подготовки к запуску", "info");

        try {
            const modsDownloaded = await window.electronAPI.downloadMods();

            if (modsDownloaded) {
                logProgress("Моды успешно загружены", "success");
                // Убираем проверку launched, т.к. ошибки уже обрабатываются 
                // через onMinecraftLaunchStatus
                await window.electronAPI.launchMinecraft(settings);
                launchGameBtn.disabled = false;
            } else {
                logProgress("Не удалось скачать моды", "error");
            }
        } catch (error) {
            logProgress(`Критическая ошибка: ${error.message}`, "error");
        } finally {
            launchGameBtn.disabled = false;
        }
    });

    document.querySelectorAll(".control").forEach((control) => {
        control.addEventListener("click", (event) => {
            event.stopPropagation();
            const action = control.getAttribute("data-action");
            window.electronAPI.windowAction(action);
        });
    });

    async function loadSettings() {
        try {
            const settings = await window.electronAPI.loadSettings();
            usernameInput.value = settings.username || "";
            passwordInput.value = settings.password || "";
            ramInput.value = settings.ram || 2048;
            ramDisplay.textContent = `${ramInput.value} МБ`;
            directoryInput.value = settings.gameDirectory || "";
            debugButton.checked = settings.debug || false;
        } catch (error) {
            console.error("Failed to load settings:", error);
        }
    }


    selectDirectoryBtn.addEventListener("click", async () => {
        try {
            const selectedPath = await window.electronAPI.selectDirectory();
            if (selectedPath) {
                directoryInput.value = selectedPath;
            }
        } catch (error) {
            console.error("Directory selection error:", error);
        }
    });

    const maxRam = await window.electronAPI.getSystemMemory();
    ramInput.max = Math.min(maxRam, 32768);

    ramInput.addEventListener("input", () => {
        const value = Math.floor(ramInput.value / 1024) * 1024;
        ramDisplay.textContent = `${value} МБ`;
    });

    // Обработка модального окна
    const modalOverlay = document.querySelector('.modal-overlay');
    const modalGroup = document.querySelector('.modal-group');
    const modalSettings = document.getElementById("modal-settings");

    // Создаем кнопку закрытия модального окна
    const closeButton = document.createElement('button');
    closeButton.className = 'modal-close';
    closeButton.innerHTML = '✕';
    modalGroup.prepend(closeButton);

    // Открытие модального окна
    const creditsSection = document.querySelector('.credits-section');

    // Hide credits initially
    creditsSection.style.display = 'none';

    // Show credits when modal opens
    modalSettings.addEventListener("click", () => {
        modalOverlay.classList.add('active');
        modalGroup.classList.add('active');
        creditsSection.style.display = 'block'; // Show credits
        loadSettings();
    });

    // Закрытие модального окна при клике на кнопку закрытия
    // Hide credits when modal closes (via close button)
    closeButton.addEventListener('click', () => {
        modalOverlay.classList.remove('active');
        modalGroup.classList.remove('active');
        creditsSection.style.display = 'none'; // Hide credits
        const settings = {
            username: usernameInput.value || "Furry",
            password: passwordInput.value || "",
            ram: parseInt(ramInput.value) || maxRam / 2,
            gameDirectory: directoryInput.value,
            debug: debugButton.checked,
        };
        const saved = window.electronAPI.saveSettings(settings);
        logProgress(
            saved ? "Настройки сохранены!" : "Не удалось сохранить настройки",
            saved ? "success" : "error"
        );
    });

    // Закрытие модального окна при клике на оверлей
    // Hide credits when modal closes (via overlay click)
    modalOverlay.addEventListener('click', () => {
        modalOverlay.classList.remove('active');
        modalGroup.classList.remove('active');
        creditsSection.style.display = 'none'; // Hide credits
    });

    // Предотвращаем закрытие модального окна при клике на само окно
    modalGroup.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    loadSettings();

    const javaStatus = document.getElementById("java-status");
    const minecraftStatus = document.getElementById("minecraft-status");

    // Update Java version on load
    async function updateJavaStatus() {
        try {
            const version = await window.electronAPI.getJavaVersion();
            javaStatus.textContent = version || "Java не установлена";
        } catch (error) {
            javaStatus.textContent = "Ошибка проверки Java";
            console.error("Java check error:", error);
        }
    }
    
    // Update initially and every 30 seconds
    updateJavaStatus();
    setInterval(updateJavaStatus, 30000);

    // Add listener for Java installation completion
    window.electronAPI.onJavaInstallComplete(() => {
        updateJavaStatus(); // Refresh Java status immediately after installation
    });

    // Listen for Minecraft status updates
    window.electronAPI.onMinecraftStatusUpdate((status) => {
        minecraftStatus.textContent = status;
    });

    // Add handlers for directory opening buttons
    document.getElementById('open-minecraft-dir').addEventListener('click', () => {
        window.electronAPI.openDirectory('minecraft');
    });

    document.getElementById('open-launcher-dir').addEventListener('click', () => {
        window.electronAPI.openDirectory('launcher');
    });

    // Add debug sidebar functionality
    const debugSidebar = document.getElementById('debug-sidebar');
    const contentWrapper = document.querySelector('.content-wrapper');
    const debugLiveLog = document.getElementById('debug-live-log');
    const toggleDebugSidebarBtn = document.getElementById('toggle-debug-sidebar');

    function updateDebugInfo() {
        window.electronAPI.getBasicInfo().then(info => {
            document.getElementById('debug-os').textContent = info.osDetails.windows;
            document.getElementById('debug-os-version').textContent = info.osDetails.windows_version;
            document.getElementById('debug-os-arch').textContent = info.osDetails.architecture;
            document.getElementById('debug-hostname').textContent = info.osDetails.hostname;
            document.getElementById('debug-cpu').textContent = `${info.osDetails.cpu} (${info.osDetails.cores} cores)`;
            document.getElementById('debug-total-ram').textContent = `${info.totalRam} GB`;
            document.getElementById('debug-free-ram').textContent = `${info.freeRam} GB`;
            document.getElementById('debug-game-dir').textContent = info.gameDirectory;
            document.getElementById('debug-logs-dir').textContent = info.logsDirectory;
            document.getElementById('debug-java-path').textContent = info.javaPath;
        }).catch(err => console.error('Failed to update debug info:', err));
    }

    // Handle debug mode toggle
    debugButton.addEventListener('change', async () => {
        // Save debug state immediately when changed
        const settings = await window.electronAPI.loadSettings();
        settings.debug = debugButton.checked;
        await window.electronAPI.saveSettings(settings);

        if (debugButton.checked) {
            debugSidebar.classList.add('active');
            contentWrapper.classList.add('debug-active');
            updateDebugInfo();
            debugSidebar.style.display = 'block';
        } else {
            debugSidebar.classList.remove('active');
            debugSidebar.classList.remove('collapsed');
            contentWrapper.classList.remove('debug-active');
            toggleDebugSidebarBtn.textContent = '›';
            debugSidebar.style.display = 'none';
        }
    });

    // Initialize debug sidebar visibility on load
    debugSidebar.style.display = debugButton.checked ? 'block' : 'none';

    // Add toggle functionality for debug sidebar
    toggleDebugSidebarBtn.addEventListener('click', () => {
        debugSidebar.classList.toggle('collapsed');
        contentWrapper.classList.toggle('debug-active');
        toggleDebugSidebarBtn.textContent = debugSidebar.classList.contains('collapsed') ? '‹' : '›';
    });

    // Add server status checking
    async function checkServerStatus() {
        const smpIndicator = document.getElementById('smp-status');
        const smpText = document.getElementById('smp-status-text');
        
        try {
            const smpResponse = await window.electronAPI.checkServerStatus(CONFIG.SERVERS.GAME.HOST);
            console.log('Url:', CONFIG.SERVERS.GAME.HOST);
            console.log('SMP server status:', smpResponse);
            if (smpResponse === true) {
                smpIndicator.className = 'status-indicator online';
                smpText.textContent = 'Онлайн';
            } else {
                smpIndicator.className = 'status-indicator offline';
                smpText.textContent = 'Оффлайн';
            }
        } catch (error) {
            console.error('[Client] Error:', error);
            smpIndicator.className = 'status-indicator offline';
            smpText.textContent = 'Оффлайн';
        }

        const octantIndicator = document.getElementById('octant-status');
        const octantText = document.getElementById('octant-status-text');

        try {
            const octantResponse = await window.electronAPI.checkServerStatus(CONFIG.SERVERS.HOSTING.HOST, true);
            if (octantResponse === true) {
                octantIndicator.className = 'status-indicator online';
                octantText.textContent = 'Онлайн';
            } else {
                octantIndicator.className = 'status-indicator offline';
                octantText.textContent = 'Оффлайн';
            }
        } catch (error) {
            octantIndicator.className = 'status-indicator offline';
            octantText.textContent = 'Оффлайн';
        }
    }

    // Check status initially and every 30 seconds
    checkServerStatus();
    setInterval(checkServerStatus, CONFIG.SERVERS.GAME.STATUS_CHECK_INTERVAL);

    const updateModal = document.getElementById('update-modal');
    const updateStatusText = document.getElementById('update-status-text');
    const updateProgressFill = document.getElementById('update-progress-fill');

    window.electronAPI.onUpdateStatus((status) => {
        switch (status.type) {
            case 'checking':
                updateModal.classList.add('active');
                updateStatusText.textContent = 'Проверка обновлений...';
                updateProgressFill.style.width = '0%';
                break;

            case 'update-available':
                updateStatusText.textContent = `Найдено обновление ${status.version}`;
                break;

            case 'downloading':
                updateStatusText.textContent = `Загрузка обновления: ${status.progress}%`;
                updateProgressFill.style.width = `${status.progress}%`;
                break;

            case 'installing':
                updateStatusText.textContent = 'Установка обновления...';
                updateProgressFill.style.width = '100%';
                break;

            case 'no-update':
                updateModal.classList.remove('active');
                break;

            case 'error':
                updateStatusText.textContent = `Ошибка обновления: ${status.message}`;
                setTimeout(() => {
                    updateModal.classList.remove('active');
                }, 3000);
                break;
        }
    });

    // Add wiki button handler
    document.getElementById('open-wiki').addEventListener('click', () => {
        window.electronAPI.openWiki();
    });
});
