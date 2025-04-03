document.addEventListener('DOMContentLoaded', () => {
    const welcomeTitle = document.getElementById('welcome-title');
    const welcomeTitleMain = document.getElementById('welcome-title-main');
    let clickCount = 0;
    let clickCountGlobal = 0;
    let isEscapeModeActive = false;
    let clones = [];
    let mouseX = 0, mouseY = 0;
    let crazinessLevel = 0; // Новый уровень безумия
    let sakuraEffect = null; // Переменная для хранения экземпляра эффекта сакуры

    // Звуковые эффекты
    const clickSound = new Audio('assets/audio/click-sound.mp3');
    const activateSound = new Audio('assets/audio/activate.mp3');
    const deactivateSound = new Audio('assets/audio/deactivate.mp3');
    const WHATSound = new Audio('assets/audio/WHAT.mp3');

    // Инициализируем эффект сакуры при загрузке DOM
    initSakura();

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    // Инициализация эффекта сакуры
    function initSakura() {
        if (typeof Sakura !== 'undefined') {
            sakuraEffect = new Sakura('body', {
                colors: [
                    {
                        gradientColorStart: 'rgba(154, 140, 152, 0.7)',
                        gradientColorEnd: 'rgba(242, 233, 228, 0.7)',
                        gradientColorDegree: 120,
                    },
                    {
                        gradientColorStart: 'rgba(74, 78, 105, 0.7)',
                        gradientColorEnd: 'rgba(154, 140, 152, 0.7)',
                        gradientColorDegree: 120,
                    },
                    {
                        gradientColorStart: 'rgba(34, 34, 59, 0.7)',
                        gradientColorEnd: 'rgba(74, 78, 105, 0.7)',
                        gradientColorDegree: 120,
                    },
                ],
                fallSpeed: 1.5,
                delay: 300,
                maxSize: 12,
                minSize: 8
            });
        } else {
            console.error('Sakura library is not loaded!');
        }
    }

    // Функция тряски элемента
    function shakeElement(element) {
        element.style.animation = 'none';
        element.offsetHeight; // триггер reflow
        element.style.animation = 'shake 0.4s cubic-bezier(.36,.07,.19,.97)';
    }

    // Улучшенный массив эмодзи разного настроения
    const moodEmojis = ['😐', '😯', '😕', '😤', '😠', '😡', '🤬', '💢', '👿', '👹'];

    // Улучшенные функции для эффектов
    function fireConfettiCannon(intensity = 1) {
        const duration = 1000 * intensity;
        const end = Date.now() + duration;
        const colors = intensity > 2 ? 
            ['#FF0000', '#8B0000', '#DC143C', '#B22222'] : 
            ['#FFD700', '#FFA500', '#FF8C00', '#FF4500'];

        (function frame() {
            confetti({
                particleCount: 2 * intensity,
                angle: 60,
                spread: 55 + (intensity * 5),
                origin: { x: 0, y: 0.8 },
                colors: colors
            });
            confetti({
                particleCount: 2 * intensity,
                angle: 120,
                spread: 55 + (intensity * 5),
                origin: { x: 1, y: 0.8 },
                colors: colors
            });

            if (Date.now() < end) {
                requestAnimationFrame(frame);
            }
        }());
    }

    function showGiantEmoji(level = 9) {
        const emojiIndex = Math.min(level, moodEmojis.length - 1);
        const emojiText = moodEmojis[emojiIndex];
        
        const emoji = document.createElement('div');
        emoji.textContent = emojiText;
        emoji.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0);
            font-size: ${100 + (level * 10)}px;
            z-index: 9999;
            opacity: 0;
            transition: all 1s cubic-bezier(0.34, 1.56, 0.64, 1);
            pointer-events: none;
            animation: none;
            transform-origin: center center;
            text-shadow: 0 0 ${level * 2}px rgba(255, 0, 0, 0.7);
        `;
        document.body.appendChild(emoji);

        setTimeout(() => {
            emoji.style.transform = 'translate(-50%, -50%) scale(1)';
            emoji.style.opacity = '1';
            emoji.style.animation = `shakeEmoji ${3 - (level/10)}s ease-in-out infinite`;
        }, 100);

        setTimeout(() => {
            emoji.style.transform = 'translate(-50%, -50%) scale(2)';
            emoji.style.opacity = '0';
            setTimeout(() => emoji.remove(), 1000);
        }, 3000 + (level * 300));
        
        if (level >= 7) {
            setTimeout(() => {
                const miniEmojis = Math.min(level, 10);
                for (let i = 0; i < miniEmojis; i++) {
                    createMiniEmoji(emojiText);
                }
            }, 1000);
        }
    }
    
    function createMiniEmoji(emojiText) {
        const mini = document.createElement('div');
        mini.textContent = emojiText;
        
        const randomAngle = Math.random() * Math.PI * 2;
        const randomDistance = 50 + Math.random() * 100;
        const startX = (window.innerWidth / 2) + Math.cos(randomAngle) * randomDistance;
        const startY = (window.innerHeight / 2) + Math.sin(randomAngle) * randomDistance;
        
        const endAngle = Math.random() * Math.PI * 2;
        const endX = (window.innerWidth / 2) + Math.cos(endAngle) * (window.innerWidth / 2);
        const endY = (window.innerHeight / 2) + Math.sin(endAngle) * (window.innerHeight / 2);
        
        mini.style.cssText = `
            position: fixed;
            top: ${startY}px;
            left: ${startX}px;
            font-size: ${30 + Math.random() * 20}px;
            z-index: 9998;
            opacity: 1;
            transition: all 2s cubic-bezier(0.34, 1.56, 0.64, 1);
            pointer-events: none;
            transform-origin: center center;
            text-shadow: 0 0 5px rgba(255, 0, 0, 0.7);
        `;
        document.body.appendChild(mini);
        
        setTimeout(() => {
            mini.style.top = `${endY}px`;
            mini.style.left = `${endX}px`;
            mini.style.opacity = '0';
            setTimeout(() => mini.remove(), 2000);
        }, 10);
    }

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

    const handleTitleClick = async (event) => {
        event.stopPropagation();
        const clickedElement = event.currentTarget;
        shakeElement(clickedElement);
        
        try {
            clickSound.currentTime = 0;
            await clickSound.play().catch(console.error);
        } catch(e) {
            console.error('Ошибка со звуком:', e);
        }

        clickCount++;
        clickCountGlobal++;
        
        if (clickCountGlobal % 10 === 0) {
            crazinessLevel = Math.min(10, crazinessLevel + 1);
        }
        
        document.documentElement.style.setProperty('--primary-hue', 240 - (crazinessLevel * 5));
        document.documentElement.style.setProperty('--primary-saturation', `${20 + (crazinessLevel * 7)}%`);
        
        console.log('Количество кликов:', clickCount, 'Уровень безумия:', crazinessLevel);
        
        if (clickCountGlobal % (15 - Math.floor(crazinessLevel/2)) === 0) {
            const emojiLevel = Math.floor(crazinessLevel * clickCountGlobal / 30);
            showGiantEmoji(emojiLevel);
            
            WHATSound.volume = 0.3 + (crazinessLevel * 0.07);
            WHATSound.play().catch(console.error);
            
            confetti({
                particleCount: 50 + (crazinessLevel * 10),
                spread: 150 + (crazinessLevel * 5),
                origin: { y: 0.5 },
                gravity: 0.8,
                scalar: 1 + (crazinessLevel * 0.2),
                shapes: ['circle', 'square'],
                colors: ['#FF0000', '#8B0000', '#DC143C', '#B22222']
            });
        }
        
        if (clickCountGlobal >= 100) {
            clickCountGlobal = 0;
            crazinessLevel = 0;
            document.documentElement.style.removeProperty('--primary-hue');
            document.documentElement.style.removeProperty('--primary-saturation');
            
            WHATSound.volume = 1.0;
            WHATSound.play().catch(console.error);
            
            const finalEmoji = document.createElement('div');
            finalEmoji.textContent = '💥';
            finalEmoji.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0);
                font-size: 300px;
                z-index: 10000;
                opacity: 0;
                transition: all 1s cubic-bezier(0.34, 1.56, 0.64, 1);
                pointer-events: none;
                text-shadow: 0 0 30px rgba(255, 0, 0, 0.9);
            `;
            document.body.appendChild(finalEmoji);
            
            setTimeout(() => {
                finalEmoji.style.transform = 'translate(-50%, -50%) scale(1)';
                finalEmoji.style.opacity = '1';
                
                confetti({
                    particleCount: 500,
                    spread: 360,
                    origin: { x: 0.5, y: 0.5 },
                    gravity: 0.5,
                    scalar: 3,
                    shapes: ['circle', 'square', 'star'],
                    colors: ['#FF0000', '#FF8800', '#FFFF00', '#88FF00', '#00FFFF', '#0088FF', '#8800FF', '#FF00FF']
                });
                
                if (!isEscapeModeActive) {
                    activateSound.play().catch(console.error);
                    activateEscapeMode(3);
                }
                
                setTimeout(() => {
                    finalEmoji.style.transform = 'translate(-50%, -50%) scale(3)';
                    finalEmoji.style.opacity = '0';
                    setTimeout(() => finalEmoji.remove(), 1000);
                }, 3000);
                
            }, 100);
        } else {
            if (clickCount >= 10) {
                clickCount = 0;
                if (!isEscapeModeActive) {
                    console.log('Активация режима побега');
                    activateSound.play().catch(console.error);
                    fireConfettiCannon(crazinessLevel / 3);
                    activateEscapeMode(crazinessLevel / 5);
                } else {
                    console.log('Деактивация режима побега');
                    deactivateSound.play().catch(console.error);
                    deactivateEscapeMode();
                }
            }
        }
    };

    if (welcomeTitle) {
        welcomeTitle.addEventListener('click', handleTitleClick);
    }
    
    if (welcomeTitleMain) {
        welcomeTitleMain.addEventListener('click', handleTitleClick);
    }

    welcomeTitle.onclick = null;

    function activateEscapeMode(intensity = 1) {
        isEscapeModeActive = true;
        
        // Останавливаем эффект сакуры при активации режима безумия
        if (sakuraEffect) {
            sakuraEffect.stop();
        }
        
        const elements = document.querySelectorAll('label, button, input, #ram-display, span, img, h1, h2, h3');
        
        // Добавляем постепенную анимацию элементов с задержкой
        let delay = 0;
        const delayIncrement = 20; // миллисекунды между анимацией элементов
        
        elements.forEach(element => {
            // Исключаем логотипы из эффекта "убегания"
            if (element.id === 'welcome-title' || element.id === 'welcome-title-main') {
                return;
            }
            
            if (element.closest('.window-controls')) return;
            if (element.closest('.debug-sidebar')) return;

            const rect = element.getBoundingClientRect();
            const computedStyle = window.getComputedStyle(element);
            
            if (rect.width < 5 || rect.height < 5 || 
                rect.right < 0 || rect.bottom < 0 || 
                rect.left > window.innerWidth || rect.top > window.innerHeight ||
                computedStyle.display === 'none') {
                return;
            }
            
            setTimeout(() => {
                const clone = element.cloneNode(true);
                document.body.appendChild(clone);

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
                clone.style.transition = 'transform 0.2s ease'; // добавляем плавный переход
                
                if (intensity > 1) {
                    clone.style.boxShadow = `0 0 ${intensity * 5}px rgba(255, ${Math.floor(255 - intensity * 50)}, 0, 0.7)`;
                }

                element.style.opacity = '0';
                element.style.pointerEvents = 'none';

                const state = {
                    x: rect.left,
                    y: rect.top,
                    speedX: (Math.random() - 0.5) * intensity * 2,
                    speedY: (Math.random() - 0.5) * intensity * 2,
                    element: clone,
                    original: element,
                    rect: rect,
                    rotationSpeed: (Math.random() - 0.5) * intensity * 4,
                    rotation: 0,
                    gravity: 0.05 * intensity
                };

                clones.push(state);
            }, delay);
            
            delay += delayIncrement;
        });

        // Особая обработка логотипов - создаем их клоны и делаем кликабельными
        const welcomeTitles = [document.getElementById('welcome-title'), document.getElementById('welcome-title-main')];
        
        welcomeTitles.forEach(title => {
            if (!title) return;
            
            // Сохраняем текущее положение логотипа
            const rect = title.getBoundingClientRect();
            
            // Создаем фиксированный клон логотипа через задержку
            setTimeout(() => {
                const fixedClone = title.cloneNode(true);
                fixedClone.id = title.id + '-fixed';
                fixedClone.style.position = 'fixed';
                fixedClone.style.left = rect.left + 'px';
                fixedClone.style.top = rect.top + 'px';
                fixedClone.style.width = rect.width + 'px';
                fixedClone.style.height = rect.height + 'px';
                fixedClone.style.margin = '0';
                fixedClone.style.zIndex = '1500'; // Выше чем у других убегающих элементов
                fixedClone.style.animation = 'pulse-logo 2s infinite';
                fixedClone.style.textShadow = '0 0 15px var(--accent)'; // Используем переменную цвета вместо красного
                fixedClone.style.cursor = 'pointer';
                fixedClone.style.pointerEvents = 'auto'; // Делаем элемент кликабельным
                document.body.appendChild(fixedClone);
                
                // Добавляем обработчик клика на фиксированный клон
                fixedClone.addEventListener('click', handleTitleClick);
                
                // Скрываем оригинал
                title.style.opacity = '0';
                title.style.pointerEvents = 'none';
                
                // Сохраняем фиксированный клон для последующего удаления
                clones.push({
                    element: fixedClone,
                    original: title,
                    isFixedLogo: true
                });
            }, delay);
            
            delay += delayIncrement;
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
        
        // Восстанавливаем CSS переменные
        document.documentElement.style.removeProperty('--primary-hue');
        document.documentElement.style.removeProperty('--primary-saturation');
        
        // Возобновляем эффект сакуры после деактивации режима безумия
        if (sakuraEffect) {
            sakuraEffect.start();
        }
    }

    function updateAllElements() {
        if (!isEscapeModeActive) return;

        const timestamp = performance.now();

        clones.forEach(state => {
            // Пропускаем фиксированные логотипы
            if (state.isFixedLogo) return;
            
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

            state.speedX *= 0.96;
            state.speedY *= 0.96;
            state.speedY += state.gravity;

            const maxSpeed = 30;
            const currentSpeed = Math.sqrt(state.speedX * state.speedX + state.speedY * state.speedY);
            if (currentSpeed > maxSpeed) {
                const scale = maxSpeed / currentSpeed;
                state.speedX *= scale;
                state.speedY *= scale;
            }

            state.x += state.speedX;
            state.y += state.speedY;
            
            state.rotation += state.rotationSpeed;

            if (state.x < 0) {
                state.x = 0;
                state.speedX = Math.abs(state.speedX) * 0.7;
                state.rotationSpeed *= -0.8;
            } else if (state.x > window.innerWidth - state.rect.width) {
                state.x = window.innerWidth - state.rect.width;
                state.speedX = -Math.abs(state.speedX) * 0.7;
                state.rotationSpeed *= -0.8;
            }

            if (state.y < 0) {
                state.y = 0;
                state.speedY = Math.abs(state.speedY) * 0.7;
                state.rotationSpeed *= 0.9;
            } else if (state.y > window.innerHeight - state.rect.height) {
                state.y = window.innerHeight - state.rect.height;
                state.speedY = -Math.abs(state.speedY) * 0.7;
                state.rotationSpeed *= 0.9;
            }

            state.element.style.transform = `translate3d(${state.x - state.rect.left}px, ${state.y - state.rect.top}px, 0) rotate(${state.rotation}deg)`;
        });

        requestAnimationFrame(updateAllElements);
    }

    const dynamicStyles = document.createElement('style');
    document.head.appendChild(dynamicStyles);
    dynamicStyles.textContent = `
        :root {
            --primary-hue: 240;
            --primary-saturation: 20%;
        }
        
        body {
            background: linear-gradient(135deg, 
                hsl(calc(var(--primary-hue) - 10), var(--primary-saturation), 15%), 
                hsl(var(--primary-hue), var(--primary-saturation), 27%)
            );
        }
        
        .welcome-section h1 {
            transition: text-shadow 0.3s ease, transform 0.2s ease, color 0.3s ease;
        }
        
        .welcome-section h1:hover {
            text-shadow: 0 0 15px var(--accent);
            color: hsl(calc(var(--primary-hue) - 10), 80%, 95%);
        }
    `;
});