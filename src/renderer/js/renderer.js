let CONFIG; // Глобальная переменная для конфигов

document.addEventListener("DOMContentLoaded", async () => {
    // Загружаем конфиги в начале
    CONFIG = await window.electronAPI.getConfig();
    
    // Проверяем настройки на наличие данных о последнем аккаунте
    const settings = await window.electronAPI.loadSettings();
    if (settings.lastUsedAccount && settings.lastUsedAccount.uuid) {
        try {
            // Проверяем, есть ли у последнего аккаунта аватарка
            if (!settings.lastUsedAccount.avatar) {
                // Пытаемся проверить статус заявки для получения Discord ID
                const appStatus = await window.electronAPI.checkApplicationStatus(settings.lastUsedAccount.uuid);
                if (appStatus && appStatus.userData && appStatus.userData.user && appStatus.userData.user.discord_id) {
                    // Загружаем аватарку по Discord ID
                    const avatarData = await window.electronAPI.loadAvatarForAccount(appStatus.userData.user.discord_id);
                    if (avatarData) {
                        // Сохраняем аватарку в настройках
                        settings.lastUsedAccount.avatar = avatarData;
                        
                        // Сохраняем обновленные настройки
                        await window.electronAPI.saveSettings(settings);
                        
                        // Обновляем аватарку для текущего пользователя в списке аккаунтов
                        if (settings.accounts && Array.isArray(settings.accounts)) {
                            const account = settings.accounts.find(acc => acc.uuid === settings.lastUsedAccount.uuid);
                            if (account) {
                                account.avatar = avatarData;
                                await window.electronAPI.saveSettings(settings);
                            }
                        }
                        
                        console.log('Successfully loaded avatar for last used account');
                    }
                }
            }
        } catch (error) {
            console.error('Error loading avatar for last used account:', error);
        }
    }
    
    // Проверяем элемент banner-img перед добавлением обработчика
    const bannerImg = document.getElementById("banner-img");
    if (bannerImg) {
        bannerImg.addEventListener("click", function() {
            // Отправляем запрос на главный процесс для открытия внешнего браузера
            window.electronAPI.openExternalBrowser(CONFIG.EXTERNAL.URLS.SUNDER);
        });
    }
    
    // Обновляем версии в разных местах интерфейса
    const versionDisplayElements = [
        document.querySelector('#version-display'),
        document.getElementById('debug-launcher-version')
    ];
    
    // Обновляем версию везде, где она отображается
    versionDisplayElements.forEach(element => {
        if (element) {
            element.textContent = CONFIG.VERSION.LAUNCHER;
        }
    });
    
    console.log('Launcher version:', CONFIG.VERSION.LAUNCHER);
    
    // Получаем ссылки на элементы интерфейса с проверкой на их наличие
    const usernameInput = document.getElementById("username-input");
    const passwordInput = document.getElementById("password-input");
    const ramInput = document.getElementById("ram-input");
    const directoryInput = document.getElementById("directory-input");
    const selectDirectoryBtn = document.getElementById("select-directory");
    const launchGameBtn = document.getElementById("launch-game");
    const ramDisplay = document.getElementById("ram-display");
    const debugButton = document.getElementById("debug-input");
    
    // Создаем прогресс-контейнер для отображения статуса операций
    const progressContainer = document.createElement("div");
    progressContainer.id = "progress-container";
    progressContainer.innerHTML = `
        <div id="progress-area" class="progress-area"></div>
        <div id="progress-status" class="progress-status"></div>
    `;
    
    // Проверяем наличие элемента, куда добавить прогресс-контейнер
    // На главной странице это основной контейнер
    const mainSection = document.querySelector(".main-section");
    if (mainSection) {
        const existingContainer = mainSection.querySelector("#progress-container");
        if (!existingContainer) {
            mainSection.appendChild(progressContainer);
        }
    }
    
    // Получаем progressArea из DOM или из созданного контейнера
    const progressArea = document.getElementById("progress-area");
    
    // Если progressArea не найден, логируем ошибку
    if (!progressArea) {
        console.error("Progress area element not found");
    }

    // Функция очистки старых сообщений
    function clearOldMessages() {
        if (!progressArea) return;
        
        while (progressArea.children.length > 0) {
            progressArea.removeChild(progressArea.firstChild);
        }
    }

    // Функция для логирования прогресса в UI
    function logProgress(message, type = "info") {
        if (!progressArea) return;
        
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
        const debugLiveLog = document.getElementById('debug-live-log');
        if (debugButton && debugButton.checked && debugLiveLog) {
            const debugLogEntry = document.createElement('div');
            debugLogEntry.textContent = `[${new Date().toLocaleTimeString()}] ${type.toUpperCase()}: ${message}`;
            debugLiveLog.appendChild(debugLogEntry);
            debugLiveLog.scrollTop = debugLiveLog.scrollHeight;
        }
    }

    if (progressArea) {
        logProgress("Информация", "info");
    }

    // Настройка слушателя прогресса загрузки
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

    // Слушатель статуса запуска Minecraft
    window.electronAPI.onMinecraftLaunchStatus((event, status) => {
        console.log('Launch status received:', status);
        
        if (typeof status === 'object' && status.error) {
            const stack = status.stack || '';
            const matches = stack.match(/at\s+(.+?)\s+\((.+?):(\d+):\d+\)/);
            let errorMessage = status.error;
            
            if (matches) {
                const [_, func, file, line] = matches;
                const fileName = file.split(/[\/\\]/).pop();
                errorMessage += ` [${fileName}:${line}]`;
            }
            
            logProgress(errorMessage, "error");
        } else {
            logProgress(status, status.includes("Ошибка") ? "error" : "success");
        }
    });

    // Получаем ссылки на элементы статуса
    const javaStatus = document.getElementById("java-status");
    const javaStatusFooter = document.getElementById("java-status-footer");
    const minecraftStatus = document.getElementById("minecraft-status");
    const minecraftStatusIndicator = document.getElementById('minecraft-status-indicator');

    // Listen for Minecraft status updates
    window.electronAPI.onMinecraftStatusUpdate((status) => {
        if (minecraftStatus) minecraftStatus.textContent = status;
        
        if (minecraftStatusIndicator && launchGameBtn) {
            if (status === "Запущен") {
                launchGameBtn.classList.remove('launching');
                launchGameBtn.classList.add('launched');
                minecraftStatusIndicator.className = 'status-indicator online';
            } else if (status === "Запускается...") {
                minecraftStatusIndicator.className = 'status-indicator starting';
            } else {
                launchGameBtn.classList.remove('launching', 'launched');
                minecraftStatusIndicator.className = 'status-indicator offline';
            }
        }
    });

    // Обработчик кнопки запуска игры
    if (launchGameBtn) {
        launchGameBtn.addEventListener("click", async () => {
            launchGameBtn.disabled = true;
            launchGameBtn.classList.add('launching');
            if (progressArea) progressArea.innerHTML = "";
            
            // Показываем контейнер прогресса, если он есть
            const progressContainer = document.getElementById('progress-container');
            if (progressContainer) {
                progressContainer.classList.add('active');
            }
            
            // Обновляем статус Minecraft на "Запускается..."
            if (minecraftStatus) minecraftStatus.textContent = "Запускается...";
            if (minecraftStatusIndicator) minecraftStatusIndicator.className = 'status-indicator starting';

            // Собираем настройки для запуска
            const settings = {
                username: usernameInput ? usernameInput.value || CONFIG.LAUNCH.DEFAULT_USERNAME : CONFIG.LAUNCH.DEFAULT_USERNAME,
                password: passwordInput ? passwordInput.value || "" : "",
                ram: ramInput ? parseInt(ramInput.value) : 2048,
                gameDirectory: directoryInput ? directoryInput.value : "",
                debug: debugButton ? debugButton.checked : false,
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
                    await window.electronAPI.launchMinecraft(settings);
                } else {
                    logProgress("Не удалось скачать моды", "error");
                }
            } catch (error) {
                logProgress(`Критическая ошибка: ${error.message}`, "error");
            } finally {
                launchGameBtn.disabled = false;
            }
        });
    }

    // Обработчики для кнопок управления окном
    document.querySelectorAll(".control").forEach((control) => {
        control.addEventListener("click", (event) => {
            event.stopPropagation();
            const action = control.getAttribute("data-action");
            window.electronAPI.windowAction(action);
        });
    });

    // Загрузка настроек из хранилища
    async function loadSettings() {
        try {
            const settings = await window.electronAPI.loadSettings();
            
            if (usernameInput) usernameInput.value = settings.username || "";
            if (passwordInput) passwordInput.value = settings.password || "";
            if (ramInput) ramInput.value = settings.ram || 2048;
            if (ramDisplay) ramDisplay.textContent = `${ramInput ? ramInput.value : 2048} МБ`;
            if (directoryInput) directoryInput.value = settings.gameDirectory || "";
            if (debugButton) debugButton.checked = settings.debug || false;
        } catch (error) {
            console.error("Failed to load settings:", error);
        }
    }

    // Обработчик кнопки выбора директории
    if (selectDirectoryBtn && directoryInput) {
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
    }

    // Настройка управления RAM
    if (ramInput && ramDisplay) {
        window.electronAPI.getSystemMemory().then(maxRam => {
            ramInput.max = Math.min(maxRam, 32768);
            
            ramInput.addEventListener("input", () => {
                const value = Math.floor(ramInput.value / 1024) * 1024;
                ramDisplay.textContent = `${value} МБ`;
            });
        });
    }

    // Обработка модального окна настроек
    const modalOverlay = document.querySelector('.modal-overlay');
    const modalGroup = document.querySelector('.modal-group');
    const openSettingsBtn = document.getElementById("open-settings");
    const creditsSection = document.querySelector('.credits-section');

    // Создаем кнопку закрытия модального окна
    if (modalGroup) {
        let closeButton = modalGroup.querySelector('.modal-close');
        if (!closeButton) {
            closeButton = document.createElement('button');
            closeButton.className = 'modal-close';
            closeButton.innerHTML = '✕';
            modalGroup.prepend(closeButton);
        }

        // Скрываем секцию с разработчиками изначально
        if (creditsSection) {
            creditsSection.style.display = 'none';
        }

        // Открытие модального окна
        if (openSettingsBtn && modalOverlay) {
            openSettingsBtn.addEventListener("click", () => {
                modalOverlay.classList.add('active');
                modalGroup.classList.add('active');
                if (creditsSection) creditsSection.style.display = 'block';
                loadSettings();
            });
        }

        // Закрытие модального окна при клике на кнопку закрытия
        if (closeButton && modalOverlay) {
            closeButton.addEventListener('click', () => {
                modalOverlay.classList.remove('active');
                modalGroup.classList.remove('active');
                if (creditsSection) creditsSection.style.display = 'none';
                
                // Сохраняем настройки при закрытии окна
                const settings = {
                    username: usernameInput ? usernameInput.value || CONFIG.LAUNCH.DEFAULT_USERNAME : CONFIG.LAUNCH.DEFAULT_USERNAME,
                    password: passwordInput ? passwordInput.value || "" : "",
                    ram: ramInput ? parseInt(ramInput.value) : 2048,
                    gameDirectory: directoryInput ? directoryInput.value : "",
                    debug: debugButton ? debugButton.checked : false,
                };
                
                window.electronAPI.saveSettings(settings).then(saved => {
                    if (progressArea) {
                        logProgress(
                            saved ? "Настройки сохранены!" : "Не удалось сохранить настройки",
                            saved ? "success" : "error"
                        );
                    }
                });
            });
        }

        // Закрытие модального окна при клике на оверлей
        if (modalOverlay) {
            modalOverlay.addEventListener('click', () => {
                modalOverlay.classList.remove('active');
                modalGroup.classList.remove('active');
                if (creditsSection) creditsSection.style.display = 'none';
            });
        }

        // Предотвращаем закрытие модального окна при клике на само окно
        modalGroup.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // Загружаем настройки при инициализации
    loadSettings();

    // Обновление статуса Java
    async function updateJavaStatus() {
        try {
            const version = await window.electronAPI.getJavaVersion();
            const status = version || "Java не установлена";
            
            // Обновляем статус Java только в информационном блоке
            if (javaStatus) javaStatus.textContent = status;
        } catch (error) {
            console.error("Java check error:", error);
            if (javaStatus) javaStatus.textContent = "Ошибка проверки Java";
        }
    }
    
    // Обновляем статус Java при загрузке и периодически
    updateJavaStatus();
    setInterval(updateJavaStatus, 30000);

    // Слушатель для завершения установки Java
    window.electronAPI.onJavaInstallComplete(() => {
        updateJavaStatus();
    });

    // Обработчики для кнопок открытия директорий
    const openMinecraftDirBtn = document.getElementById('open-minecraft-dir');
    const openLauncherDirBtn = document.getElementById('open-launcher-dir');
    
    if (openMinecraftDirBtn) {
        openMinecraftDirBtn.addEventListener('click', () => {
            window.electronAPI.openDirectory('minecraft');
        });
    }
    
    if (openLauncherDirBtn) {
        openLauncherDirBtn.addEventListener('click', () => {
            window.electronAPI.openDirectory('launcher');
        });
    }

    // Функционал панели отладки
    const debugSidebar = document.getElementById('debug-sidebar');
    const contentWrapper = document.querySelector('.content-wrapper');
    const debugLiveLog = document.getElementById('debug-live-log');
    const toggleDebugSidebarBtn = document.getElementById('toggle-debug-sidebar');

    // Обновление информации об отладке
    function updateDebugInfo() {
        window.electronAPI.getBasicInfo().then(info => {
            const debugElements = {
                'debug-os': info.osDetails.windows,
                'debug-os-version': info.osDetails.windows_version,
                'debug-os-arch': info.osDetails.architecture,
                'debug-hostname': info.osDetails.hostname,
                'debug-cpu': `${info.osDetails.cpu} (${info.osDetails.cores} cores)`,
                'debug-total-ram': `${info.totalRam} GB`,
                'debug-free-ram': `${info.freeRam} GB`,
                'debug-game-dir': info.gameDirectory,
                'debug-logs-dir': info.logsDirectory,
                'debug-java-path': info.javaPath
            };
            
            // Обновляем каждый элемент, проверяя его наличие
            Object.entries(debugElements).forEach(([id, value]) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
            });
        }).catch(err => console.error('Failed to update debug info:', err));
    }

    // Обработчик переключения режима отладки
    if (debugButton && debugSidebar && contentWrapper) {
        debugButton.addEventListener('change', async () => {
            // Сохраняем состояние режима отладки
            const settings = await window.electronAPI.loadSettings();
            settings.debug = debugButton.checked;
            await window.electronAPI.saveSettings(settings);

            // Отображаем/скрываем панель отладки
            if (debugButton.checked) {
                debugSidebar.classList.add('active');
                contentWrapper.classList.add('debug-active');
                updateDebugInfo();
                debugSidebar.style.display = 'block';
            } else {
                debugSidebar.classList.remove('active');
                debugSidebar.classList.remove('collapsed');
                contentWrapper.classList.remove('debug-active');
                if (toggleDebugSidebarBtn) toggleDebugSidebarBtn.textContent = '›';
                debugSidebar.style.display = 'none';
            }
        });

        // Инициализация видимости панели отладки
        debugSidebar.style.display = debugButton.checked ? 'block' : 'none';

        // Добавляем функционал сворачивания панели отладки
        if (toggleDebugSidebarBtn) {
            toggleDebugSidebarBtn.addEventListener('click', () => {
                debugSidebar.classList.toggle('collapsed');
                contentWrapper.classList.toggle('debug-active');
                toggleDebugSidebarBtn.textContent = debugSidebar.classList.contains('collapsed') ? '‹' : '›';
            });
        }
    }

    // Проверка статуса сервера
    async function checkServerStatus() {
        const smpIndicator = document.getElementById('smp-status');
        const smpText = document.getElementById('smp-status-text');
        const smpPing = document.getElementById('smp-ping');
        const mainSmpStatus = document.getElementById('main-smp-status');
        const mainSmpStatusText = document.getElementById('main-smp-status-text');
        const mainSmpPing = document.getElementById('main-smp-ping');
        const playersCount = document.getElementById('players-count');
        
        // Если не нашли ни один элемент, выходим
        if (!smpIndicator && !mainSmpStatus) return;
        
        try {
            const startTime = performance.now();
            const smpResponse = await window.electronAPI.checkServerStatus(CONFIG.SERVERS.GAME.HOST);
            const endTime = performance.now();
            const pingTime = Math.round(endTime - startTime);
            
            // Проверка наличия данных о сервере
            const isOnline = smpResponse !== false;
            
            // Универсальные данные для обоих отображений
            const statusClass = isOnline ? 'status-indicator online' : 'status-indicator offline';
            const statusText = isOnline ? 'Онлайн' : 'Оффлайн';
            const pingTextContent = isOnline ? `${pingTime}ms` : '';
            const pingClass = isOnline ? getPingClass(pingTime) : 'ping-text';
            
            // Обновляем элементы в футере
            if (smpIndicator) smpIndicator.className = statusClass;
            if (smpText) smpText.textContent = statusText;
            if (smpPing) {
                smpPing.textContent = pingTextContent;
                smpPing.className = pingClass;
            }
            
            // Обновляем элементы на главной странице
            if (mainSmpStatus) mainSmpStatus.className = statusClass;
            if (mainSmpStatusText) mainSmpStatusText.textContent = statusText;
            if (mainSmpPing) {
                mainSmpPing.textContent = pingTextContent;
                mainSmpPing.className = pingClass;
            }
            
            // Обновляем счетчик игроков, если есть информация
            if (playersCount) {
                // Если ответ типа объект и содержит данные о игроках
                if (typeof smpResponse === 'object' && smpResponse !== null && smpResponse.players) {
                    playersCount.textContent = `${smpResponse.players.online || 0}/${smpResponse.players.max || 0}`;
                } else {
                    playersCount.textContent = isOnline ? "Информация недоступна" : "-";
                }
            }
        } catch (error) {
            console.error('Server status check error:', error);
            
            // Устанавливаем оффлайн статус при ошибке
            const setOffline = (indicator, text, ping) => {
                if (indicator) indicator.className = 'status-indicator offline';
                if (text) text.textContent = 'Ошибка';
                if (ping) {
                    ping.textContent = '';
                    ping.className = 'ping-text';
                }
            };
            
            setOffline(smpIndicator, smpText, smpPing);
            setOffline(mainSmpStatus, mainSmpStatusText, mainSmpPing);
            
            if (playersCount) {
                playersCount.textContent = "-";
            }
        }
    }

    // Проверяем статус сервера при загрузке и периодически
    checkServerStatus();
    setInterval(checkServerStatus, 5000);

    // Модальное окно обновлений
    const updateModal = document.getElementById('update-modal');
    const updateStatusText = document.getElementById('update-status-text');
    const updateProgressFill = document.getElementById('update-progress-fill');

    // Слушатель статуса обновлений
    if (updateModal && updateStatusText && updateProgressFill) {
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
    }

    // Обработчик кнопки Wiki
    const wikiButton = document.getElementById('open-wiki');
    if (wikiButton) {
        wikiButton.addEventListener('click', () => {
            window.electronAPI.openWiki();
        });
    }

    // Проверка статуса ely.by при загрузке и периодически
    checkElyStatus();
    setInterval(checkElyStatus, 5000);
});

// Функция обновления статуса версии лаунчера
async function updateVersionStatus(currentVersion) {
    const versionIndicator = document.getElementById('version-status-indicator');
    const versionDisplay = document.getElementById('version-display');
    
    if (!versionIndicator || !versionDisplay) return;
    
    try {
        const versionInfo = await window.electronAPI.checkVersion();
        
        if (versionInfo.isLatest) {
            versionIndicator.className = 'version-status latest';
            createTooltip(versionDisplay, 'Установлена последняя версия');
        } else if (versionInfo.isUnofficial) {
            versionIndicator.className = 'version-status unofficial';
            createTooltip(versionDisplay, 'Неофициальная версия');
        } else {
            versionIndicator.className = 'version-status outdated';
            createTooltip(versionDisplay, `Доступно обновление: ${versionInfo.latestVersion}`);
        }
    } catch (error) {
        console.error('Version check error:', error);
    }
}

// Создание подсказки для элемента
function createTooltip(element, text) {
    if (!element || !text) return;
    
    const parent = element.parentElement;
    if (!parent) return;
    
    // Удаляем старую подсказку, если есть
    const oldTooltip = parent.querySelector('.version-tooltip');
    if (oldTooltip) oldTooltip.remove();
    
    const tooltip = document.createElement('div');
    tooltip.className = 'version-tooltip';
    tooltip.textContent = text;
    parent.appendChild(tooltip);
}

// Проверка статуса ely.by
async function checkElyStatus() {
    const elyIndicator = document.getElementById('ely-status');
    const elyText = document.getElementById('ely-status-text');
    const elyPing = document.getElementById('ely-ping');
    
    if (!elyIndicator && !elyText) return;
    
    try {
        const startTime = performance.now();
        const response = await fetch('https://authserver.ely.by/auth/validate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ accessToken: 'ping-check' })
        });
        const endTime = performance.now();
        const pingTime = Math.round(endTime - startTime);

        // Даже если ответ 401 - сервер работает
        if (response.status === 401) {
            if (elyIndicator) elyIndicator.className = 'status-indicator online';
            if (elyText) elyText.textContent = 'Онлайн';
            if (elyPing) {
                elyPing.textContent = `${pingTime}ms`;
                elyPing.className = getPingClass(pingTime);
            }
        } else {
            if (elyIndicator) elyIndicator.className = 'status-indicator offline';
            if (elyText) elyText.textContent = 'Оффлайн';
            if (elyPing) {
                elyPing.textContent = '-1ms';
                elyPing.className = 'ping-text';
            }
        }
    } catch (error) {
        console.error('Ely.by status check error:', error);
        if (elyIndicator) elyIndicator.className = 'status-indicator offline';
        if (elyText) elyText.textContent = 'Ошибка';
        if (elyPing) {
            elyPing.textContent = '-1ms';
            elyPing.className = 'ping-text';
        }
    }
}

// Определение класса CSS для отображения пинга
function getPingClass(ping) {
    if (ping < 100) return 'ping-text ping-good';
    if (ping < 300) return 'ping-text ping-medium';
    return 'ping-text ping-bad';
}
