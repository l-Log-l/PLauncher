document.addEventListener('DOMContentLoaded', () => {
    const welcomeTitle = document.getElementById('welcome-title');
    let clickCount = 0;
    let clickCountGlobal = 0;
    let isEscapeModeActive = false;
    let clones = [];
    let mouseX = 0, mouseY = 0;

    // Звуковые эффекты
    const clickSound = new Audio('click-sound.mp3');
    const activateSound = new Audio('activate.mp3');
    const deactivateSound = new Audio('deactivate.mp3');
    const WHATSound = new Audio('WHAT.mp3');

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    // Функция тряски элемента
    function shakeElement(element) {
        element.style.animation = 'none';
        element.offsetHeight; // триггер reflow
        element.style.animation = 'shake 0.4s cubic-bezier(.36,.07,.19,.97)';
    }

    // Заменяем старую анимацию тряски на более плавную
    
    // Добавляем функции для конфетти эффектов
    function fireConfettiCannon() {
        const end = Date.now() + 1000; // продолжительность эффекта

        (function frame() {
            confetti({
                particleCount: 2,
                angle: 60,
                spread: 55,
                origin: { x: 0, y: 0.8 }
            });
            confetti({
                particleCount: 2,
                angle: 120,
                spread: 55,
                origin: { x: 1, y: 0.8 }
            });

            if (Date.now() < end) {
                requestAnimationFrame(frame);
            }
        }());
    }

    function showGiantEmoji() {
        const emoji = document.createElement('div');
        emoji.textContent = '😠';
        emoji.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0);
            font-size: 150px;
            z-index: 9999;
            opacity: 0;
            transition: all 1s cubic-bezier(0.34, 1.56, 0.64, 1);
            pointer-events: none;
            animation: none;
            transform-origin: center center;
        `;
        document.body.appendChild(emoji);

        // Появление с анимацией
        setTimeout(() => {
            emoji.style.transform = 'translate(-50%, -50%) scale(1)';
            emoji.style.opacity = '1';
            emoji.style.animation = 'shakeEmoji 2s ease-in-out infinite';
        }, 100);

        // Исчезновение
        setTimeout(() => {
            emoji.style.transform = 'translate(-50%, -50%) scale(2)';
            emoji.style.opacity = '0';
            setTimeout(() => emoji.remove(), 1000);
        }, 5000);
    }

    // Добавляем новую анимацию специально для эмодзи
    const emojiStyle = document.createElement('style');
    emojiStyle.textContent = `
        @keyframes shakeEmoji {
            0%, 100% { 
                transform: translate(-50%, -50%) rotate(0deg) scale(1); 
            }
            10% { 
                transform: translate(-52%, -50%) rotate(-5deg) scale(1.1); 
            }
            20% { 
                transform: translate(-48%, -50%) rotate(5deg) scale(0.9); 
            }
            30% { 
                transform: translate(-50%, -52%) rotate(0deg) scale(1.1); 
            }
            40% { 
                transform: translate(-50%, -48%) rotate(3deg) scale(0.9); 
            }
            50% { 
                transform: translate(-52%, -50%) rotate(-3deg) scale(1.1); 
            }
            60% { 
                transform: translate(-48%, -52%) rotate(2deg) scale(0.9); 
            }
            70% { 
                transform: translate(-50%, -48%) rotate(-2deg) scale(1.1); 
            }
            80% { 
                transform: translate(-52%, -50%) rotate(1deg) scale(0.9); 
            }
            90% { 
                transform: translate(-48%, -50%) rotate(-1deg) scale(1); 
            }
        }
    `;
    document.head.appendChild(emojiStyle);

    welcomeTitle.onclick = async (event) => {
        event.stopPropagation();
        shakeElement(welcomeTitle);
        
        try {
            clickSound.currentTime = 0;
            await clickSound.play().catch(console.error);
        } catch(e) {
            console.error('Ошибка со звуком:', e);
        }

        clickCount++;
        clickCountGlobal++;
        console.log('Количество кликов:', clickCount);
        if (clickCountGlobal >= 60) {
            clickCountGlobal = 0;
            WHATSound.play().catch(console.error);
            showGiantEmoji();
        
            // Специальный конфетти эффект
            confetti({
                particleCount: 150,
                spread: 180,
                origin: { y: 0.5 },
                gravity: 0.8,
                scalar: 2,
                shapes: ['circle', 'square'],
                colors: ['#FF0000', '#8B0000', '#DC143C', '#B22222'] // Оттенки красного
            });
        
        
        } else {
            if (clickCount >= 10) {
                clickCount = 0; // Сброс для следующей активации
                if (!isEscapeModeActive) {
                    console.log('Активация режима побега');
                    activateSound.play().catch(console.error);
                    fireConfettiCannon();
                    activateEscapeMode();
                } else {
                    console.log('Деактивация режима побега');
                    deactivateSound.play().catch(console.error);
                    deactivateEscapeMode();
                }
            }
        }
    };

    function activateEscapeMode() {
        isEscapeModeActive = true;
        const elements = document.querySelectorAll('label, button, input, #ram-display, span');
        
        elements.forEach(element => {
            if (element.closest('.window-controls')) return; // Пропускаем элементы управления окном

            const rect = element.getBoundingClientRect();
            const computedStyle = window.getComputedStyle(element);
            
            const clone = element.cloneNode(true);
            document.body.appendChild(clone);

            // Копируем стили и позиционирование
            Object.values(computedStyle).forEach(property => {
                try {
                    clone.style[property] = computedStyle[property];
                } catch (e) {}
            });

            clone.style.position = 'fixed';
            clone.style.left = rect.left + 'px';
            clone.style.top = rect.top + 'px';
            clone.style.width = rect.width + 'px';
            clone.style.height = rect.height + 'px';
            clone.style.margin = '0';
            clone.style.zIndex = '1000';
            clone.style.pointerEvents = 'none';

            element.style.opacity = '0';
            element.style.pointerEvents = 'none';

            const state = {
                x: rect.left,
                y: rect.top,
                speedX: 0,
                speedY: 0,
                element: clone,
                original: element,
                rect: rect
            };

            clones.push(state);
        });

        requestAnimationFrame(updateAllElements);
    }

    function deactivateEscapeMode() {
        isEscapeModeActive = false;
        clones.forEach(clone => {
            clone.element.remove();
            clone.original.style.opacity = '1';
            clone.original.style.pointerEvents = 'auto';
        });
        clones = [];
    }

    // Оптимизируем обновление позиций
    function updateAllElements() {
        if (!isEscapeModeActive) return;

        // Используем requestAnimationFrame для синхронизации с обновлением экрана
        const timestamp = performance.now();

        clones.forEach(state => {
            const deltaX = state.x + state.rect.width/2 - mouseX;
            const deltaY = state.y + state.rect.height/2 - mouseY;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            if (distance < 150) {
                const force = Math.min(20, 150 / distance);
                const escapeX = (deltaX / distance) * force;
                const escapeY = (deltaY / distance) * force;
                state.speedX += escapeX;
                state.speedY += escapeY;
            }

            // Улучшенная физика движения
            state.speedX *= 0.96;
            state.speedY *= 0.96;

            // Ограничиваем максимальную скорость
            const maxSpeed = 30;
            const currentSpeed = Math.sqrt(state.speedX * state.speedX + state.speedY * state.speedY);
            if (currentSpeed > maxSpeed) {
                const scale = maxSpeed / currentSpeed;
                state.speedX *= scale;
                state.speedY *= scale;
            }

            state.x += state.speedX;
            state.y += state.speedY;

            // Улучшенные отскоки от стен
            if (state.x < 0) {
                state.x = 0;
                state.speedX = Math.abs(state.speedX) * 0.7;
            } else if (state.x > window.innerWidth - state.rect.width) {
                state.x = window.innerWidth - state.rect.width;
                state.speedX = -Math.abs(state.speedX) * 0.7;
            }

            if (state.y < 0) {
                state.y = 0;
                state.speedY = Math.abs(state.speedY) * 0.7;
            } else if (state.y > window.innerHeight - state.rect.height) {
                state.y = window.innerHeight - state.rect.height;
                state.speedY = -Math.abs(state.speedY) * 0.7;
            }

            // Оптимизированное обновление transform
            state.element.style.transform = `translate3d(${state.x - state.rect.left}px, ${state.y - state.rect.top}px, 0)`;
        });

        requestAnimationFrame(updateAllElements);
    }
});