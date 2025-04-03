/**
 * Star Wars style credits animation
 * Inspired by https://codepen.io/timpietrusky/pen/NGwWGP
 */

document.addEventListener('DOMContentLoaded', function() {
    // Кнопка для открытия credits
    const openCreditsBtn = document.getElementById('open-credits');
    // Модальное окно credits
    const creditsModal = document.getElementById('credits-modal');
    // Кнопка закрытия credits
    const closeCreditsBtn = document.querySelector('.close-credits-btn');
    // Кнопка начала анимации в starwars
    const startButton = document.querySelector('.starwars .start');
    // Элемент анимации
    const animation = document.querySelector('.starwars .animation');
    // Клонированная анимация для перезапуска
    let clonedAnimation = animation.cloneNode(true);
    // Аудио элемент
    const audio = document.querySelector('.starwars audio');
    
    // Показываем кнопку credits только когда модальное окно настроек активно
    const settingsBtn = document.getElementById('open-settings');
    const modalOverlay = document.querySelector('.modal-overlay');
    const modalGroup = document.querySelector('.modal-group');
    
    // Инициализация - удаляем анимацию из DOM и скрываем кнопку О нас
    animation.remove();
    openCreditsBtn.style.visibility = 'hidden';
    
    // Наблюдатель за изменениями классов модального окна
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.attributeName === 'class') {
                if (modalGroup.classList.contains('active')) {
                    openCreditsBtn.style.visibility = 'visible';
                } else {
                    openCreditsBtn.style.visibility = 'hidden';
                }
            }
        });
    });
    
    // Начинаем наблюдение за модальным окном
    observer.observe(modalGroup, { attributes: true });
    
    // Показываем кнопку credits когда открывается модалка с настройками
    if (settingsBtn && openCreditsBtn) {
        settingsBtn.addEventListener('click', function() {
            openCreditsBtn.style.visibility = 'visible';
        });
        
        // Скрываем кнопку при закрытии настроек через оверлей
        modalOverlay.addEventListener('click', function() {
            openCreditsBtn.style.visibility = 'hidden';
        });
        
        // Скрываем при нажатии на крестик в настройках
        document.addEventListener('click', function(event) {
            const modalClose = document.querySelector('.modal-close');
            if (event.target === modalClose || modalClose?.contains(event.target)) {
                openCreditsBtn.style.visibility = 'hidden';
            }
        });
        
        // Закрытие при нажатии Escape
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                openCreditsBtn.style.visibility = 'hidden';
            }
        });
    }
    
    // Обработчик нажатия на кнопку открытия credits
    openCreditsBtn.addEventListener('click', function() {
        creditsModal.style.display = 'block';
        // Сбрасываем анимацию при открытии
        resetAnimation();
    });
    
    // Обработчик нажатия на кнопку закрытия credits
    closeCreditsBtn.addEventListener('click', function() {
        creditsModal.style.display = 'none';
        // Останавливаем аудио при закрытии
        audio.pause();
        audio.currentTime = 0;
        // Сбрасываем анимацию
        resetAnimation();
    });
    
    // Обработчик нажатия на кнопку Start в starwars
    startButton.addEventListener('click', function() {
        startButton.style.display = 'none';
        audio.play();
        document.querySelector('.starwars').appendChild(animation);
    });
    
    // При окончании аудио сбрасываем анимацию
    audio.addEventListener('ended', function() {
        audio.currentTime = 0;
        resetAnimation();
    });
    
    // Функция сброса анимации
    function resetAnimation() {
        startButton.style.display = 'block';
        clonedAnimation = animation.cloneNode(true);
        animation.remove();
        animation = clonedAnimation;
    }
    
    // Замена логотипа Star Wars на SMP Planet
    const logoSection = document.querySelector('.starwars .logo');
    if (logoSection) {
        // Удаляем SVG-логотип Star Wars
        logoSection.innerHTML = '';
        
        // Создаем новый элемент для текста SMP Planet
        const smpLogo = document.createElement('div');
        smpLogo.className = 'smp-planet-logo';
        smpLogo.textContent = 'SMP Planet';
        
        // Добавляем новый логотип
        logoSection.appendChild(smpLogo);
    }
});
