// Language translation system
const translationSystem = (function() {
    // Default translations for UI elements
    const defaultTranslations = {
        'en': {
            'your_order': 'Your Order',
            'total': 'Total',
            'clear': 'Clear',
            'place_order': 'Place Order',
            'your_orders': 'Your Orders',
            'no_active_orders': 'No active orders',
            'add_to_order': 'Add',
            'welcome': 'Welcome to our Restaurant',
            'search_placeholder': 'Search menu...',
            'all_categories': 'All Categories',
            'appetizers': 'Appetizers',
            'side_dishes': 'Side Dishes',
            'main_courses': 'Main Courses',
            'beverages': 'Beverages',
            'desserts': 'Desserts',
            'add_notes': 'Add notes...',
            'order_placed_success': 'Order has been placed successfully!',
            'order_error': 'Error placing order: ',
            'general_error': 'An error occurred. Please try again.'
        },
        'vi': {
            'your_order': 'Đơn Hàng Của Bạn',
            'total': 'Tổng Cộng',
            'clear': 'Xóa',
            'place_order': 'Đặt Món',
            'your_orders': 'Đơn Đã Đặt',
            'no_active_orders': 'Không có đơn hàng',
            'add_to_order': 'Thêm',
            'welcome': 'Chào mừng đến nhà hàng',
            'search_placeholder': 'Tìm kiếm món ăn...',
            'all_categories': 'Tất Cả Danh Mục',
            'appetizers': 'Món Khai Vị',
            'side_dishes': 'Món Phụ',
            'main_courses': 'Món Chính',
            'beverages': 'Đồ Uống',
            'desserts': 'Tráng Miệng',
            'add_notes': 'Thêm ghi chú...',
            'order_placed_success': 'Đơn hàng đã được đặt thành công!',
            'order_error': 'Lỗi khi đặt hàng: ',
            'general_error': 'Đã xảy ra lỗi. Vui lòng thử lại.'
        },
        'ko': {
            'your_order': '주문 내역',
            'total': '총액',
            'clear': '지우기',
            'place_order': '주문하기',
            'your_orders': '주문 현황',
            'no_active_orders': '활성 주문 없음',
            'add_to_order': '추가',
            'welcome': '저희 레스토랑에 오신 것을 환영합니다',
            'search_placeholder': '메뉴 검색...',
            'all_categories': '모든 카테고리',
            'appetizers': '에피타이저',
            'side_dishes': '사이드 메뉴',
            'main_courses': '메인 요리',
            'beverages': '음료',
            'desserts': '디저트',
            'add_notes': '메모 추가...',
            'order_placed_success': '주문이 성공적으로 완료되었습니다!',
            'order_error': '주문 오류: ',
            'general_error': '오류가 발생했습니다. 다시 시도해 주세요.'
        },
        'zh': {
            'your_order': '您的订单',
            'total': '总计',
            'clear': '清除',
            'place_order': '下单',
            'your_orders': '已下订单',
            'no_active_orders': '没有活动订单',
            'add_to_order': '添加',
            'welcome': '欢迎光临我们的餐厅',
            'search_placeholder': '搜索菜单...',
            'all_categories': '所有类别',
            'appetizers': '开胃菜',
            'side_dishes': '配菜',
            'main_courses': '主菜',
            'beverages': '饮料',
            'desserts': '甜点',
            'add_notes': '添加备注...',
            'order_placed_success': '订单已成功下达！',
            'order_error': '下单错误: ',
            'general_error': '发生错误，请重试。'
        },
        'fr': {
            'your_order': 'Votre Commande',
            'total': 'Total',
            'clear': 'Effacer',
            'place_order': 'Commander',
            'your_orders': 'Vos Commandes',
            'no_active_orders': 'Aucune commande active',
            'add_to_order': 'Ajouter',
            'welcome': 'Bienvenue à notre Restaurant',
            'search_placeholder': 'Rechercher dans le menu...',
            'all_categories': 'Toutes les Catégories',
            'appetizers': 'Entrées',
            'side_dishes': 'Accompagnements',
            'main_courses': 'Plats Principaux',
            'beverages': 'Boissons',
            'desserts': 'Desserts',
            'add_notes': 'Ajouter des notes...',
            'order_placed_success': 'La commande a été passée avec succès !',
            'order_error': 'Erreur lors de la commande: ',
            'general_error': 'Une erreur s\'est produite. Veuillez réessayer.'
        }
    };
    
    // Custom translations for dynamic menu items (populated from database)
    const customTranslations = {
        'en': {},
        'vi': {},
        'ko': {},
        'zh': {},
        'fr': {}
    };
    
    // Current language
    let currentLanguage = localStorage.getItem('language') || 'en';
    
    // Check if we need to load custom translations from server
    function loadCustomTranslations() {
        fetch('/api/translations')
            .then(response => response.json())
            .then(data => {
                if (data && typeof data === 'object') {
                    // Merge translations with existing ones
                    Object.keys(data).forEach(lang => {
                        if (customTranslations[lang]) {
                            customTranslations[lang] = {...customTranslations[lang], ...data[lang]};
                        } else {
                            customTranslations[lang] = data[lang];
                        }
                    });
                    
                    // Apply translations if any are already on page
                    applyTranslations();
                }
            })
            .catch(error => {
                console.error('Error loading translations:', error);
            });
    }
    
    // Get translation for a key in current language
    function getTranslation(key) {
        // First check custom translations
        if (customTranslations[currentLanguage] && customTranslations[currentLanguage][key]) {
            return customTranslations[currentLanguage][key];
        }
        
        // Then check default translations
        if (defaultTranslations[currentLanguage] && defaultTranslations[currentLanguage][key]) {
            return defaultTranslations[currentLanguage][key];
        }
        
        // Fallback to English
        if (customTranslations.en && customTranslations.en[key]) {
            return customTranslations.en[key];
        }
        
        if (defaultTranslations.en && defaultTranslations.en[key]) {
            return defaultTranslations.en[key];
        }
        
        // Return the key itself if no translation found
        return key;
    }
    
    // Get translation for a specific item by ID
    function getItemTranslation(itemId, field) {
        const key = `item_${itemId}_${field}`;
        return getTranslation(key);
    }
    
    // Add or update custom translations
    function addCustomTranslation(language, key, value) {
        if (!customTranslations[language]) {
            customTranslations[language] = {};
        }
        
        customTranslations[language][key] = value;
    }
    
    // Set current language and apply translations
    function setLanguage(lang) {
        if (currentLanguage === lang) return;
        
        // Store the old language for animation
        const oldLanguage = currentLanguage;
        
        // Update language
        currentLanguage = lang;
        localStorage.setItem('language', lang);
        
        // Find all translatable elements and animate transitions
        applyTranslationsWithAnimation();
        
        // Update language switcher display
        updateLanguageSwitcherDisplay();
        
        // Dispatch a custom event for other components to react
        document.dispatchEvent(new CustomEvent('languageChanged', { 
            detail: { language: lang, previousLanguage: oldLanguage }
        }));
    }
    
    // Apply translations to the page without animation
    function applyTranslations() {
        // Update data-i18n elements
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = getTranslation(key);
            if (translation) {
                element.textContent = translation;
            }
        });
        
        // Update placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            const translation = getTranslation(key);
            if (translation) {
                element.placeholder = translation;
            }
        });
        
        // Update menu items that have data-item-id
        document.querySelectorAll('[data-item-id]').forEach(element => {
            const itemId = element.getAttribute('data-item-id');
            const field = element.getAttribute('data-field');
            
            if (itemId && field) {
                const translation = getItemTranslation(itemId, field);
                if (translation) {
                    element.textContent = translation;
                }
            }
        });
    }
    
    // Function to create a shake with blur effect for text transition
    function animateLetterTransformation(element, currentText, newText) {
        return new Promise(resolve => {
            if (!element) {
                resolve();
                return;
            }
            
            // Wrap each letter in a span
            let oldContent = element.innerHTML;
            element.innerHTML = '';
            
            // Create and append span for each letter
            for (let i = 0; i < currentText.length; i++) {
                const letterSpan = document.createElement('span');
                letterSpan.className = 'letter';
                letterSpan.textContent = currentText[i];
                element.appendChild(letterSpan);
            }
            
            // Get all the letter spans
            const letterSpans = element.querySelectorAll('.letter');
            
            // STEP 1: Start with normal text, then apply shake with blur animation
            letterSpans.forEach((letterSpan, index) => {
                const delay = Math.random() * 200;
                
                // Apply shake and blur together after a small random delay
                setTimeout(() => {
                    letterSpan.classList.add('letter-shake');
                }, delay);
            });
            
            // STEP 2: Make sure shake and blur continues while fading out
            setTimeout(() => {
                letterSpans.forEach((letterSpan, index) => {
                    const delay = Math.random() * 200;
                    setTimeout(() => {
                        // Ensure the shake animation is still active
                        if (!letterSpan.classList.contains('letter-shake')) {
                            letterSpan.classList.add('letter-shake');
                        }
                        // Reset animation to make sure it continues during fade out
                        letterSpan.style.animation = 'none';
                        letterSpan.offsetHeight; // Trigger reflow
                        letterSpan.style.animation = 'letterShake 0.8s cubic-bezier(.36,.07,.19,.97) both infinite';
                        
                        // Now fade out while shaking continues
                        letterSpan.style.opacity = 0;
                    }, delay);
                });
            }, 400);
            
            // STEP 3: After all letters have faded out, replace with new text
            setTimeout(() => {
                // Clear element completely
                element.innerHTML = '';
                
                // Add new letters as spans
                const newLetters = [];
                for (let i = 0; i < newText.length; i++) {
                    const letterSpan = document.createElement('span');
                    letterSpan.className = 'letter';
                    letterSpan.textContent = newText[i];
                    letterSpan.style.opacity = 0;
                    element.appendChild(letterSpan);
                    newLetters.push(letterSpan);
                }
                
                // STEP 4: Fade in the new letters with shake and blur
                newLetters.forEach((letterSpan, index) => {
                    const delay = Math.random() * 300;
                    
                    // First make them visible
                    setTimeout(() => {
                        letterSpan.style.opacity = 1;
                        // Apply shake and blur immediately on appearance
                        letterSpan.classList.add('letter-shake');
                    }, delay);
                });
                
                // Resolve after all animations should be complete
                setTimeout(() => {
                    // Replace with clean text (no spans) for better accessibility
                    element.innerHTML = newText;
                    resolve();
                }, 1200);
            }, 800);
        });
    }
    
    // Apply translations with animation
    function applyTranslationsWithAnimation() {
        // Create an array of promises for all elements
        const animationPromises = [];
        
        // Animate data-i18n elements
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = getTranslation(key);
            
            if (translation && element.textContent !== translation) {
                const currentText = element.textContent;
                const promise = animateLetterTransformation(element, currentText, translation);
                animationPromises.push(promise);
            }
        });
        
        // Animate menu items with data-item-id
        document.querySelectorAll('[data-item-id]').forEach(element => {
            const itemId = element.getAttribute('data-item-id');
            const field = element.getAttribute('data-field');
            
            if (itemId && field) {
                const translation = getItemTranslation(itemId, field);
                
                if (translation && element.textContent !== translation) {
                    const currentText = element.textContent;
                    const promise = animateLetterTransformation(element, currentText, translation);
                    animationPromises.push(promise);
                }
            }
        });
        
        // Update placeholders without animation
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            const translation = getTranslation(key);
            if (translation) {
                element.placeholder = translation;
            }
        });
        
        // Return a promise that resolves when all animations are complete
        return Promise.all(animationPromises);
    }
    
    // Update language switcher display
    function updateLanguageSwitcherDisplay() {
        const currentFlag = document.querySelector('.language-current img');
        const currentName = document.querySelector('.language-current span');
        
        if (currentFlag && currentName) {
            currentFlag.src = `/static/images/flags/${currentLanguage}.png`;
            currentName.textContent = getLanguageName(currentLanguage);
        }
    }
    
    // Get full language name from code
    function getLanguageName(code) {
        const languages = {
            'en': 'English',
            'vi': 'Tiếng Việt',
            'ko': '한국어',
            'zh': '中文',
            'fr': 'Français'
        };
        
        return languages[code] || code;
    }
    
    // Initialize language switcher UI
    function initLanguageSwitcher() {
        const header = document.querySelector('.utilities');
        
        if (!header) return;
        
        // Create language switcher HTML
        const languageSwitcher = document.createElement('div');
        languageSwitcher.className = 'language-switcher';
        languageSwitcher.innerHTML = `
            <div class="language-current">
                <img src="/static/images/flags/${currentLanguage}.png" alt="${currentLanguage}">
                <span>${getLanguageName(currentLanguage)}</span>
            </div>
            <div class="language-dropdown">
                <div class="language-option" data-lang="en">
                    <img src="/static/images/flags/en.png" alt="English">
                    <span>English</span>
                </div>
                <div class="language-option" data-lang="vi">
                    <img src="/static/images/flags/vi.png" alt="Tiếng Việt">
                    <span>Tiếng Việt</span>
                </div>
                <div class="language-option" data-lang="ko">
                    <img src="/static/images/flags/ko.png" alt="한국어">
                    <span>한국어</span>
                </div>
                <div class="language-option" data-lang="zh">
                    <img src="/static/images/flags/zh.png" alt="中文">
                    <span>中文</span>
                </div>
                <div class="language-option" data-lang="fr">
                    <img src="/static/images/flags/fr.png" alt="Français">
                    <span>Français</span>
                </div>
            </div>
        `;
        
        // Add to header before dark mode toggle if it exists
        const darkModeContainer = header.querySelector('.dark-mode-container');
        if (darkModeContainer) {
            header.insertBefore(languageSwitcher, darkModeContainer);
        } else {
            header.appendChild(languageSwitcher);
        }
        
        // Add event listeners
        const currentLang = languageSwitcher.querySelector('.language-current');
        const dropdown = languageSwitcher.querySelector('.language-dropdown');
        const options = languageSwitcher.querySelectorAll('.language-option');
        
        currentLang.addEventListener('click', function(e) {
            e.stopPropagation();
            dropdown.classList.toggle('active');
        });
        
        options.forEach(option => {
            option.addEventListener('click', function() {
                const lang = this.getAttribute('data-lang');
                setLanguage(lang);
                dropdown.classList.remove('active');
            });
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function() {
            dropdown.classList.remove('active');
        });
    }
    
    // Create directories and files needed for translation system
    function ensureTranslationAssets() {
        // Only relevant for server-side
        if (typeof fetch === 'undefined') return;
    
        // Create flags directory and default files
        fetch('/api/translations/ensure-assets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        }).catch(error => {
            console.error('Error creating translation assets:', error);
        });
    }
    
    
    // Initialize the translation system
    function init() {
        // Ensure we have the necessary assets
        ensureTranslationAssets();
        
        // Load any custom translations
        loadCustomTranslations();
        
        // Set up language switcher UI
        initLanguageSwitcher();
        
        // Apply initial translations
        applyTranslations();
    }
    
    // Return public API
    return {
        init: init,
        setLanguage: setLanguage,
        getTranslation: getTranslation,
        addCustomTranslation: addCustomTranslation,
        getCurrentLanguage: () => currentLanguage
    };
})();

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add data-i18n attributes to elements
    const elementsToTranslate = [
        { selector: '.order-section h2', key: 'your_order' },
        { selector: '.total span:first-child', key: 'total' },
        { selector: '#clear-order', key: 'clear' },
        { selector: '#submit-order', key: 'place_order' },
        { selector: '.orders-tracking h2', key: 'your_orders' },
        { selector: '.no-orders-message', key: 'no_active_orders' },
        { selector: '.category-tab[data-category="All"]', key: 'all_categories' },
        { selector: '.category-tab[data-category="Appetizer"]', key: 'appetizers' },
        { selector: '.category-tab[data-category="Side-dish"]', key: 'side_dishes' },
        { selector: '.category-tab[data-category="Main"]', key: 'main_courses' },
        { selector: '.category-tab[data-category="Beverage"]', key: 'beverages' },
        { selector: '.category-tab[data-category="Dessert"]', key: 'desserts' }
    ];
    
    // Add placeholders
    const placeholdersToTranslate = [
        { selector: '#search-menu', key: 'search_placeholder' },
        { selector: '.item-notes', key: 'add_notes' }
    ];
    
    // Apply data-i18n attributes
    elementsToTranslate.forEach(item => {
        const elements = document.querySelectorAll(item.selector);
        elements.forEach(element => {
            element.setAttribute('data-i18n', item.key);
        });
    });
    
    // Apply data-i18n-placeholder attributes
    placeholdersToTranslate.forEach(item => {
        const elements = document.querySelectorAll(item.selector);
        elements.forEach(element => {
            element.setAttribute('data-i18n-placeholder', item.key);
        });
    });
    
    // Add data-item-id and data-field attributes to menu items
    document.querySelectorAll('.menu-item').forEach(item => {
        const itemId = item.getAttribute('data-id');
        if (itemId) {
            const nameElement = item.querySelector('.item-name');
            const descElement = item.querySelector('.item-description');
            
            if (nameElement) {
                nameElement.setAttribute('data-item-id', itemId);
                nameElement.setAttribute('data-field', 'name');
            }
            
            if (descElement) {
                descElement.setAttribute('data-item-id', itemId);
                descElement.setAttribute('data-field', 'description');
            }
        }
    });
    
    // Initialize the translation system
    translationSystem.init();
    
    // Add event listener for 'add to order' buttons to ensure new buttons get translations
    const menuObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(function(node) {
                    if (node.classList && node.classList.contains('add-to-order-button')) {
                        node.setAttribute('data-i18n', 'add_to_order');
                        node.textContent = translationSystem.getTranslation('add_to_order');
                    }
                });
            }
        });
    });
    
    menuObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // Override the original submitOrder function to handle translations
    if (typeof window.submitOrder === 'function') {
        const originalSubmitOrder = window.submitOrder;
        window.submitOrder = function() {
            
            // Store the original alert function
            const originalAlert = window.alert;
            
            // Override alert to translate messages
            window.alert = function(message) {
                // Check if message contains "has been placed successfully"
                if (message.includes('has been placed successfully')) {
                    const orderId = message.match(/#([a-zA-Z0-9]+)/)[1];
                    const translatedMessage = translationSystem.getTranslation('order_placed_success').replace('{id}', orderId);
                    originalAlert(translatedMessage);
                }
                // Check if message contains "Error placing order"
                else if (message.includes('Error placing order')) {
                    const error = message.replace('Error placing order: ', '');
                    const translatedMessage = translationSystem.getTranslation('order_error') + error;
                    originalAlert(translatedMessage);
                }
                // For other messages, use original alert
                else {
                    originalAlert(message);
                }
            };
            
            // Call the original function
            const result = originalSubmitOrder.apply(this, arguments);
            
            // Restore the original alert function
            window.alert = originalAlert;
            
            return result;
        };
    }
});