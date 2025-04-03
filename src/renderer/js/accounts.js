/**
 * Модуль для управления аккаунтами
 */
let accountsList = [];
let currentAccount = null;

// Инициализация модуля аккаунтов
async function initializeAccounts() {
    try {
        // Загружаем сохраненные аккаунты
        accountsList = await loadAccounts();
        
        // Настраиваем UI элементы
        setupAccountsListeners();
        
        // Отображаем список аккаунтов
        renderAccountsList();
        
        // Если есть последний использованный аккаунт, автоматически выбираем его и обновляем отображение
        const lastUsedAccount = await getLastUsedAccount();
        if (lastUsedAccount) {
            selectAccount(lastUsedAccount);
            
            // Обновляем отображение аватарки на главной странице
            updateAccountDisplay(lastUsedAccount);
        }
        
        return true;
    } catch (error) {
        console.error('Failed to initialize accounts:', error);
        return false;
    }
}

// Загрузка аккаунтов из хранилища
async function loadAccounts() {
    try {
        const settings = await window.electronAPI.loadSettings();
        return settings.accounts || [];
    } catch (error) {
        console.error('Failed to load accounts:', error);
        return [];
    }
}

// Сохранение аккаунтов в хранилище
async function saveAccounts(accounts) {
    try {
        const settings = await window.electronAPI.loadSettings();
        settings.accounts = accounts;
        await window.electronAPI.saveSettings(settings);
        return true;
    } catch (error) {
        console.error('Failed to save accounts:', error);
        return false;
    }
}

// Получение последнего использованного аккаунта
async function getLastUsedAccount() {
    try {
        const settings = await window.electronAPI.loadSettings();
        return settings.lastUsedAccount || null;
    } catch (error) {
        console.error('Failed to get last used account:', error);
        return null;
    }
}

// Сохранение последнего использованного аккаунта
async function saveLastUsedAccount(account) {
    try {
        const settings = await window.electronAPI.loadSettings();
        settings.lastUsedAccount = account;
        await window.electronAPI.saveSettings(settings);
        return true;
    } catch (error) {
        console.error('Failed to save last used account:', error);
        return false;
    }
}

// Добавление нового аккаунта
async function addAccount(username, password, rememberPassword = true) {
    if (!username) return false;
    
    try {
        // Проверяем, существует ли такой аккаунт
        const existingAccount = accountsList.find(acc => acc.username.toLowerCase() === username.toLowerCase());
        
        if (existingAccount) {
            // Обновляем существующий аккаунт только если пароль предоставлен
            if (password) {
                existingAccount.password = rememberPassword ? password : '';
                existingAccount.rememberPassword = rememberPassword;
                existingAccount.lastUsed = new Date().toISOString();
            }
        } else {
            // Создаем новый аккаунт
            const newAccount = {
                id: Date.now().toString(),
                username,
                password: rememberPassword ? password : '',
                rememberPassword,
                server: 'ely.by',
                avatar: null,
                lastUsed: new Date().toISOString()
            };
            
            accountsList.push(newAccount);
        }
        
        // Сохраняем обновленный список аккаунтов
        await saveAccounts(accountsList);
        
        // Обновляем отображение списка аккаунтов
        renderAccountsList();
        
        return true;
    } catch (error) {
        console.error('Failed to add account:', error);
        return false;
    }
}

// Удаление аккаунта
async function deleteAccount(accountId) {
    try {
        accountsList = accountsList.filter(acc => acc.id !== accountId);
        await saveAccounts(accountsList);
        renderAccountsList();
        renderAccountsManagementList();
        return true;
    } catch (error) {
        console.error('Failed to delete account:', error);
        return false;
    }
}

// Выбор аккаунта
async function selectAccount(account) {
    currentAccount = account;
    
    // Обновляем UI
    const accountItems = document.querySelectorAll('.account-item');
    accountItems.forEach(item => {
        if (item.dataset.id === account.id) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
    
    // Заполняем форму входа
    document.getElementById('username-input').value = account.username;
    document.getElementById('password-input').value = account.password || '';
    
    // Обновляем отображение аватарки
    updateAccountDisplay(account);
    
    // Сохраняем последний использованный аккаунт
    await saveLastUsedAccount(account);
}

// Проверка учетных данных аккаунта - модифицируем для реальной проверки через API
async function validateAccount(username, password) {
    try {
        // Пытаемся выполнить запрос к ely.by API через основной процесс
        const result = await window.electronAPI.validateAccount(username, password);
        
        if (result.valid) {
            // Если включен режим отладки, показываем UUID в консоли
            if (document.getElementById('debug-input')?.checked) {
                console.log('Account UUID:', result.uuid);
                console.log('Application data:', result.applicationData);
                if (result.avatar) {
                    console.log('Avatar data received');
                }
            }
        }
        
        return result;
    } catch (error) {
        console.error('Account validation failed:', error);
        return {
            valid: false,
            error: error.message || 'Ошибка проверки учетных данных'
        };
    }
}

// Отображение списка аккаунтов
function renderAccountsList() {
    const accountsListElement = document.getElementById('accounts-list');
    if (!accountsListElement) return;
    
    accountsListElement.innerHTML = '';
    
    if (accountsList.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'empty-accounts-message';
        emptyMessage.textContent = 'Нет сохраненных аккаунтов';
        accountsListElement.appendChild(emptyMessage);
        return;
    }
    
    accountsList.forEach(account => {
        const accountItem = document.createElement('div');
        accountItem.className = 'account-item';
        accountItem.dataset.id = account.id;
        
        if (currentAccount && account.id === currentAccount.id) {
            accountItem.classList.add('selected');
        }
        
        // Проверяем наличие аватарки
        const avatarContent = account.avatar ? 
            `<img src="${account.avatar}" alt="${account.username}" class="account-avatar-img">` : 
            account.username.charAt(0).toUpperCase();
        
        accountItem.innerHTML = `
            <div class="account-icon">${avatarContent}</div>
            <div class="account-info">
                <div class="account-username">${account.username}</div>
                <div class="account-server">${account.server}</div>
            </div>
        `;
        
        accountItem.addEventListener('click', () => selectAccount(account));
        
        accountsListElement.appendChild(accountItem);
    });
}

// Отображение списка аккаунтов в модальном окне управления
function renderAccountsManagementList() {
    const accountsManagementList = document.getElementById('accounts-management-list');
    if (!accountsManagementList) return;
    
    accountsManagementList.innerHTML = '';
    
    if (accountsList.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'empty-accounts-message';
        emptyMessage.textContent = 'Нет сохраненных аккаунтов';
        accountsManagementList.appendChild(emptyMessage);
        return;
    }
    
    accountsList.forEach(account => {
        const accountItem = document.createElement('div');
        accountItem.className = 'account-management-item';
        accountItem.dataset.id = account.id;
        
        // Проверяем наличие аватарки
        const avatarContent = account.avatar ? 
            `<img src="${account.avatar}" alt="${account.username}" class="account-avatar-img">` : 
            account.username.charAt(0).toUpperCase();
        
        accountItem.innerHTML = `
            <div class="account-management-info">
                <div class="account-icon">${avatarContent}</div>
                <div class="account-info">
                    <div class="account-username">${account.username}</div>
                    <div class="account-server">${account.server}</div>
                </div>
            </div>
            <div class="account-management-actions">
                <button class="delete-account-btn" data-id="${account.id}">Удалить</button>
            </div>
        `;
        
        accountsManagementList.appendChild(accountItem);
    });
    
    // Добавляем обработчики для кнопок управления
    document.querySelectorAll('.delete-account-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const accountId = btn.dataset.id;
            if (confirm('Вы уверены, что хотите удалить этот аккаунт?')) {
                deleteAccount(accountId);
            }
        });
    });
}

// Настройка обработчиков событий UI
function setupAccountsListeners() {
    // Кнопка "Добавить аккаунт" на странице входа
    const addAccountBtn = document.getElementById('add-account-btn');
    if (addAccountBtn) {
        addAccountBtn.addEventListener('click', () => {
            document.getElementById('username-input').value = '';
            document.getElementById('password-input').value = '';
            document.getElementById('username-input').focus();
        });
    }
    
    // Кнопка "Войти" на странице входа
    const loginButton = document.getElementById('login-button');
    if (loginButton) {
        loginButton.addEventListener('click', handleLogin);
    }
    
    // Кнопка "Управление аккаунтами" в настройках
    const manageAccountsBtn = document.getElementById('manage-accounts-btn');
    if (manageAccountsBtn) {
        manageAccountsBtn.addEventListener('click', () => {
            renderAccountsManagementList();
            document.querySelector('.accounts-modal-overlay').classList.add('active');
            document.querySelector('.accounts-modal').classList.add('active');
        });
    }
    
    // Кнопка закрытия модального окна управления аккаунтами
    const accountsModalClose = document.getElementById('accounts-modal-close');
    if (accountsModalClose) {
        accountsModalClose.addEventListener('click', () => {
            document.querySelector('.accounts-modal-overlay').classList.remove('active');
            document.querySelector('.accounts-modal').classList.remove('active');
        });
    }
    
    // Закрытие модального окна при клике на оверлей
    const accountsModalOverlay = document.querySelector('.accounts-modal-overlay');
    if (accountsModalOverlay) {
        accountsModalOverlay.addEventListener('click', () => {
            accountsModalOverlay.classList.remove('active');
            document.querySelector('.accounts-modal').classList.remove('active');
        });
    }
    
    // Предотвращаем закрытие модального окна при клике на само окно
    const accountsModal = document.querySelector('.accounts-modal');
    if (accountsModal) {
        accountsModal.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    
    // Кнопка "Добавить новый аккаунт" в модальном окне управления аккаунтами
    const addNewAccountBtn = document.getElementById('add-new-account-btn');
    if (addNewAccountBtn) {
        addNewAccountBtn.addEventListener('click', () => {
            document.querySelector('.accounts-modal-overlay').classList.remove('active');
            document.querySelector('.accounts-modal').classList.remove('active');
            
            // Переключаемся на страницу входа
            showPage('login-page');
            
            // Очищаем поля ввода
            document.getElementById('username-input').value = '';
            document.getElementById('password-input').value = '';
            document.getElementById('username-input').focus();
        });
    }
    
    // Кнопка "Выйти из аккаунта" в настройках
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

// Обработка входа в аккаунт
async function handleLogin() {
    const usernameInput = document.getElementById("username-input");
    const passwordInput = document.getElementById("password-input");
    const rememberAccount = document.getElementById("remember-account");
    
    if (!usernameInput || !passwordInput) {
        console.error('Не найдены поля ввода логина/пароля');
        return;
    }
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    
    if (!username || !password) {
        showMessage('Введите имя пользователя и пароль', 'error');
        return;
    }
    
    try {
        // Показываем индикатор загрузки
        const loginButton = document.getElementById('login-button');
        if (loginButton) {
            loginButton.disabled = true;
            loginButton.textContent = 'Проверка...';
        }
        
        // Сначала проверяем учетные данные на сервере
        const validation = await validateAccount(username, password);
        
        // Если валидация прошла успешно, сохраняем аккаунт
        if (validation.valid) {
            let account;
            
            // Сохраняем аккаунт, только если выбрана опция "Запомнить" и аутентификация прошла успешно
            if (rememberAccount.checked) {
                // Получаем существующий аккаунт или создаем новый
                const existingAccount = accountsList.find(acc => 
                    acc.username.toLowerCase() === username.toLowerCase()
                );
                
                if (existingAccount) {
                    // Обновляем существующий аккаунт
                    existingAccount.password = password;
                    existingAccount.lastUsed = new Date().toISOString();
                    existingAccount.uuid = validation.uuid; // Сохраняем UUID, полученный при валидации
                    
                    // Обновляем аватарку только если она получена
                    if (validation.avatar) {
                        existingAccount.avatar = validation.avatar;
                    }
                    
                    account = existingAccount;
                    // Сохраняем изменения в списке аккаунтов
                    await saveAccounts(accountsList);
                } else {
                    // Создаем новый аккаунт
                    account = {
                        id: Date.now().toString(),
                        username,
                        password,
                        rememberPassword: true,
                        server: 'ely.by',
                        lastUsed: new Date().toISOString(),
                        uuid: validation.uuid, // Сохраняем UUID, полученный при валидации
                        avatar: validation.avatar // Сохраняем аватарку, если получена
                    };
                    // Добавляем аккаунт в список и сохраняем
                    accountsList.push(account);
                    await saveAccounts(accountsList);
                }
                
                // Обновляем отображение списка аккаунтов
                renderAccountsList();
            } else {
                // Если не запоминаем, создаем временный объект аккаунта
                account = {
                    id: 'temp-' + Date.now(),
                    username,
                    password: '',
                    rememberPassword: false,
                    server: 'ely.by',
                    lastUsed: new Date().toISOString(),
                    uuid: validation.uuid, // Сохраняем UUID, полученный при валидации
                    avatar: validation.avatar // Сохраняем аватарку, если получена
                };
            }
            
            // Устанавливаем текущий аккаунт
            currentAccount = account;
            
            // Сохраняем последний использованный аккаунт (даже если не запоминаем пароль)
            await saveLastUsedAccount({
                ...account,
                password: rememberAccount.checked ? password : ''
            });
            
            // Устанавливаем имя пользователя и аватарку на главной странице
            updateAccountDisplay(account);
            
            // Переходим на главную страницу
            if (typeof window.showPage === 'function') {
                window.showPage('main-page');
            } else {
                console.error('Функция showPage не найдена');
            }
        } else {
            // Показываем сообщение об ошибке
            const errorMsg = validation.applicationStatus === 'pending' ? 
                'Ваша заявка на сервер находится на рассмотрении.' : 
                (validation.applicationStatus === 'rejected' ? 
                    'Ваша заявка на сервер была отклонена.' : 
                    (validation.error || 'Ошибка авторизации'));
            
            showMessage(errorMsg, 'error');
        }
    } catch (error) {
        console.error('Ошибка при авторизации:', error);
        showMessage('Ошибка авторизации: ' + error.message, 'error');
    } finally {
        // Восстанавливаем кнопку
        const loginButton = document.getElementById('login-button');
        if (loginButton) {
            loginButton.disabled = false;
            loginButton.textContent = 'Войти';
        }
    }
}

// Функция для обновления отображения аккаунта на главной странице
function updateAccountDisplay(account) {
    if (!account) return;
    
    const displayUsername = document.getElementById('display-username');
    const accountName = document.getElementById('account-name');
    const avatarElement = document.getElementById('avatar-letter');
    
    if (displayUsername) displayUsername.textContent = account.username;
    if (accountName) accountName.textContent = account.username;
    
    // Обновляем аватарку
    if (avatarElement) {
        console.log('Updating avatar element with account:', account.username, 'Has avatar:', !!account.avatar);
        if (account.avatar) {
            // Если есть аватарка, меняем содержимое на изображение
            avatarElement.innerHTML = `<img src="${account.avatar}" alt="${account.username}" class="avatar-img">`;
            avatarElement.classList.add('has-avatar');
        } else {
            // Иначе показываем первую букву имени пользователя
            avatarElement.textContent = account.username.charAt(0).toUpperCase();
            avatarElement.classList.remove('has-avatar');
        }
    }
}

// Обработка выхода из аккаунта
function handleLogout() {
    if (confirm('Вы уверены, что хотите выйти из аккаунта?')) {
        currentAccount = null;
        
        // Очищаем последний использованный аккаунт
        saveLastUsedAccount(null);
        
        // Переходим на страницу входа
        showPage('login-page');
        
        // Закрываем модальное окно настроек
        document.querySelector('.modal-overlay').classList.remove('active');
        document.querySelector('.modal-group').classList.remove('active');
    }
}

// Отображение сообщения пользователю
function showMessage(message, type = 'info') {
    // Проверяем наличие элемента для отображения сообщений
    const messageContainer = document.getElementById('message-container');
    
    if (messageContainer) {
        // Создаем новый элемент сообщения
        const messageElement = document.createElement('div');
        messageElement.className = `message ${type}`;
        messageElement.textContent = message;
        
        // Добавляем сообщение
        messageContainer.innerHTML = '';
        messageContainer.appendChild(messageElement);
        
        // Автоматически скрываем через 5 секунд
        setTimeout(() => {
            messageElement.remove();
        }, 5000);
    } else {
        // Временная реализация через alert, если нет специального контейнера
        alert(message);
    }
}

// Инициализируем модуль при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    initializeAccounts();
});
