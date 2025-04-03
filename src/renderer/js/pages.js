/**
 * Модуль для управления страницами приложения
 */

// Список всех страниц
const pages = ['loading-page', 'login-page', 'main-page'];

// Показать указанную страницу
function showPage(pageId) {
    pages.forEach(page => {
        const pageElement = document.getElementById(page);
        if (pageElement) {
            if (page === pageId) {
                pageElement.classList.add('active');
            } else {
                pageElement.classList.remove('active');
            }
        }
    });
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    // Начинаем с загрузочной страницы
    showPage('loading-page');
    
    const progressFill = document.getElementById('loading-progress-fill');
    const statusText = document.getElementById('loading-status-text');
    const versionDisplay = document.getElementById('loading-version-display');
    
    if (!progressFill || !statusText || !versionDisplay) {
        console.error('Не найдены элементы загрузочной страницы');
        return;
    }
    
    // Инициализируем прогресс
    let currentProgress = 0;
    
    // Функция для обновления прогресса
    function updateProgress(value, text) {
        currentProgress = value;
        progressFill.style.width = `${currentProgress}%`;
        statusText.textContent = text;
    }
    
    // Начинаем процесс реальной загрузки
    async function startLoading() {
        try {
            // Получаем конфигурацию и версию
            updateProgress(10, 'Загрузка конфигурации...');
            const config = await window.electronAPI.getConfig();
            if (versionDisplay) {
                versionDisplay.textContent = `v${config.VERSION.LAUNCHER}`;
            }
            
            // Проверяем обновления
            updateProgress(30, 'Проверка обновлений...');
            await new Promise(resolve => setTimeout(resolve, 300)); // Небольшая задержка для UX
            
            // Инициализируем ресурсы
            updateProgress(50, 'Инициализация ресурсов...');
            await window.electronAPI.loadSettings().catch(err => {
                console.warn('Не удалось загрузить настройки:', err);
            });
            
            // Проверяем Java
            updateProgress(70, 'Проверка Java...');
            const javaVersion = await window.electronAPI.getJavaVersion();
            
            // Проверяем соединение с серверами
            updateProgress(80, 'Подключение к серверам...');
            await Promise.allSettled([
                window.electronAPI.checkServerStatus(config.SERVERS.GAME.HOST),
                fetch('https://authserver.ely.by/auth/validate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accessToken: 'ping-check' })
                }).catch(() => {})
            ]);
            
            // Загружаем информацию о пользователе
            updateProgress(90, 'Загрузка пользовательских данных...');
            
            // Готово!
            updateProgress(100, 'Готово!');
            
            // После завершения загрузки проверяем наличие сохраненного аккаунта
            setTimeout(() => {
                window.electronAPI.loadSettings().then(settings => {
                    const displayUsername = document.getElementById('display-username');
                    const accountName = document.getElementById('account-name');
                    const avatarElement = document.getElementById('avatar-letter');
                    
                    if (settings.lastUsedAccount) {
                        // Если есть сохраненный аккаунт, сразу показываем главную страницу
                        if (displayUsername) {
                            displayUsername.textContent = settings.lastUsedAccount.username || 'Игрок';
                        }
                        if (accountName) {
                            accountName.textContent = settings.lastUsedAccount.username || 'Не выбран';
                        }
                        
                        // Обновление аватарки
                        if (avatarElement) {
                            if (settings.lastUsedAccount.avatar) {
                                avatarElement.innerHTML = `<img src="${settings.lastUsedAccount.avatar}" alt="${settings.lastUsedAccount.username}" class="avatar-img">`;
                                avatarElement.classList.add('has-avatar');
                            } else {
                                const letter = settings.lastUsedAccount.username ? 
                                    settings.lastUsedAccount.username.charAt(0).toUpperCase() : '?';
                                avatarElement.textContent = letter;
                                avatarElement.classList.remove('has-avatar');
                            }
                        }
                        
                        showPage('main-page');
                    } else {
                        // Иначе переходим на страницу входа
                        showPage('login-page');
                    }
                }).catch(err => {
                    console.error('Ошибка загрузки настроек:', err);
                    showPage('login-page');
                });
            }, 800); // Небольшая задержка для лучшего визуального эффекта
            
        } catch (error) {
            console.error('Ошибка при загрузке:', error);
            statusText.textContent = 'Ошибка при запуске';
            
            // В случае ошибки все равно пытаемся перейти на страницу входа
            setTimeout(() => {
                showPage('login-page');
            }, 2000);
        }
    }
    
    // Запускаем процесс загрузки
    startLoading();
    
    // Настраиваем переключение между страницами
    setupPageNavigation();
});

// Настройка навигации между страницами
function setupPageNavigation() {
    // Обработка кнопки входа больше не нужна здесь, так как она обрабатывается в accounts.js
    const loginButton = document.getElementById('login-button');
    if (loginButton) {
        // Удаляем обработчик, чтобы избежать дублирования
        loginButton.removeEventListener('click', handleLogin);
    }
    
    // Управление аккаунтами на главной странице
    const manageAccountsBtn = document.getElementById('manage-accounts-btn');
    const accountsModalOverlay = document.querySelector('.accounts-modal-overlay');
    const accountsModal = document.querySelector('.accounts-modal');
    const closeAccountsModalBtn = document.getElementById('accounts-modal-close');
    
    if (manageAccountsBtn && accountsModalOverlay && accountsModal) {
        manageAccountsBtn.addEventListener('click', async () => {
            // Загружаем список аккаунтов и отображаем их
            try {
                const settings = await window.electronAPI.loadSettings();
                const accounts = settings.accounts || [];
                
                const accountsList = document.getElementById('accounts-management-list');
                if (accountsList) {
                    accountsList.innerHTML = '';
                    
                    if (accounts.length === 0) {
                        accountsList.innerHTML = '<div class="empty-accounts-message">Нет сохраненных аккаунтов</div>';
                    } else {
                        accounts.forEach(account => {
                            const accountItem = document.createElement('div');
                            accountItem.className = 'account-management-item';
                            accountItem.dataset.id = account.id;
                            
                            accountItem.innerHTML = `
                                <div class="account-management-info">
                                    <div class="account-icon">${account.username.charAt(0).toUpperCase()}</div>
                                    <div class="account-info">
                                        <div class="account-username">${account.username}</div>
                                        <div class="account-server">${account.server}</div>
                                    </div>
                                </div>
                                <div class="account-management-actions">
                                    <button class="delete-account-btn" data-id="${account.id}">Удалить</button>
                                </div>
                            `;
                            
                            accountsList.appendChild(accountItem);
                        });
                        
                        // Добавляем обработчики для кнопок удаления
                        document.querySelectorAll('.delete-account-btn').forEach(btn => {
                            btn.addEventListener('click', async (e) => {
                                e.stopPropagation();
                                const accountId = btn.dataset.id;
                                if (confirm('Вы уверены, что хотите удалить этот аккаунт?')) {
                                    try {
                                        const settings = await window.electronAPI.loadSettings();
                                        settings.accounts = settings.accounts.filter(acc => acc.id !== accountId);
                                        
                                        // Если удалили последний использованный аккаунт, очищаем его
                                        if (settings.lastUsedAccount && 
                                            settings.accounts.findIndex(acc => 
                                                acc.username === settings.lastUsedAccount.username) === -1) {
                                            settings.lastUsedAccount = null;
                                        }
                                        
                                        await window.electronAPI.saveSettings(settings);
                                        
                                        // Обновляем список аккаунтов
                                        btn.closest('.account-management-item').remove();
                                        
                                        if (settings.accounts.length === 0) {
                                            accountsList.innerHTML = '<div class="empty-accounts-message">Нет сохраненных аккаунтов</div>';
                                        }
                                        
                                    } catch (error) {
                                        console.error('Ошибка удаления аккаунта:', error);
                                        alert('Ошибка удаления аккаунта');
                                    }
                                }
                            });
                        });
                    }
                }
                
                // Открываем модальное окно
                accountsModalOverlay.classList.add('active');
                accountsModal.classList.add('active');
                
            } catch (error) {
                console.error('Ошибка управления аккаунтами:', error);
                alert('Ошибка управления аккаунтами');
            }
        });
        
        // Закрытие модального окна
        if (closeAccountsModalBtn) {
            closeAccountsModalBtn.addEventListener('click', () => {
                accountsModalOverlay.classList.remove('active');
                accountsModal.classList.remove('active');
            });
        }
        
        // Закрытие по клику на оверлей
        accountsModalOverlay.addEventListener('click', () => {
            accountsModalOverlay.classList.remove('active');
            accountsModal.classList.remove('active');
        });
        
        // Предотвращение закрытия при клике на само окно
        accountsModal.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    
    // Обработка кнопки выхода из аккаунта
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (confirm('Вы уверены, что хотите выйти из аккаунта?')) {
                try {
                    const settings = await window.electronAPI.loadSettings();
                    settings.lastUsedAccount = null;
                    await window.electronAPI.saveSettings(settings);
                    
                    // Переходим на страницу входа
                    showPage('login-page');
                    
                } catch (error) {
                    console.error('Ошибка выхода из аккаунта:', error);
                    alert('Ошибка выхода из аккаунта');
                }
            }
        });
    }
    
    // Обработчик для модального окна настроек
    const openSettingsBtn = document.getElementById('open-settings');
    const modalOverlay = document.querySelector('.modal-overlay');
    const modalGroup = document.querySelector('.modal-group');
    const closeModalBtn = document.querySelector('.modal-close');
    
    if (openSettingsBtn && modalOverlay && modalGroup) {
        openSettingsBtn.addEventListener('click', () => {
            modalOverlay.classList.add('active');
            modalGroup.classList.add('active');
        });
        
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => {
                modalOverlay.classList.remove('active');
                modalGroup.classList.remove('active');
            });
        }
        
        modalOverlay.addEventListener('click', () => {
            modalOverlay.classList.remove('active');
            modalGroup.classList.remove('active');
        });
        
        modalGroup.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    
    // Кнопка добавления нового аккаунта
    const addNewAccountBtn = document.getElementById('add-new-account-btn');
    if (addNewAccountBtn) {
        addNewAccountBtn.addEventListener('click', () => {
            // Скрываем модальное окно управления аккаунтами
            if (accountsModalOverlay) accountsModalOverlay.classList.remove('active');
            if (accountsModal) accountsModal.classList.remove('active');
            
            // Переходим на страницу входа
            showPage('login-page');
            
            // Очищаем поля ввода
            const usernameInput = document.getElementById('username-input');
            const passwordInput = document.getElementById('password-input');
            if (usernameInput) usernameInput.value = '';
            if (passwordInput) passwordInput.value = '';
            if (usernameInput) usernameInput.focus();
        });
    }
}

// Экспортируем функцию для использования в других модулях
window.showPage = showPage;
