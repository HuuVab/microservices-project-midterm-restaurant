
document.addEventListener('DOMContentLoaded', function() {
    // Initialize variables
   
    let menuItems = [];
    let cart = window.cart || [];
    window.cart = cart;
    let tableNumber = null;
    let currentLanguage = localStorage.getItem('language') || 'en';
    const socket = io();
    const chatContainer = document.createElement('div');
    chatContainer.className = 'chat-container';
    chatContainer.innerHTML = `
        <!-- Chat Bubble Button -->
        <div class="chat-bubble" id="chat-bubble">
            <span class="notification-badge" id="notification-badge">1</span>
            <i class="fas fa-comment"></i>
        </div>

        <!-- Chat Box -->
        <div class="chat-box" id="chat-box">
            <div class="chat-header">
                <h3>Saigon Nouveau Assistant</h3>
                <button id="close-chat"><i class="fas fa-times"></i></button>
            </div>
            <div class="chat-messages" id="chat-messages">
                <div class="message bot-message">
                    Hi there! I'm your restaurant assistant. How can I help you today?
                </div>
                <div class="typing-indicator" id="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
            <div class="chat-input">
                <input type="text" id="user-input" placeholder="Type your message here...">
                <button id="send-button"><i class="fas fa-paper-plane"></i></button>
            </div>
        </div>
    `;
    document.body.appendChild(chatContainer);

    // Add Font Awesome if not already included
    if (!document.querySelector('link[href*="font-awesome"]')) {
        const fontAwesome = document.createElement('link');
        fontAwesome.rel = 'stylesheet';
        fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
        document.head.appendChild(fontAwesome);
    }
    const categoryMap = {
        'All': 'All',
        'Appetizer': 'Appetizer',
        'Side-dish': 'Side-dish',
        'Main': 'Main',
        'Beverage': 'Beverage',
        'Dessert': 'Dessert'
    };
    window.socket = window.socket || io();
    window.socket.on('menu_item_availability_updated', function(data) {
        console.log('Received availability update:', data);
        
        // Find the item in the menuItems array (if it's loaded)
        if (window.menuItems && window.menuItems.length > 0) {
            const itemIndex = window.menuItems.findIndex(item => item.id === data.item_id);
            if (itemIndex !== -1) {
                // Update the item availability
                window.menuItems[itemIndex].available = data.available;
                console.log(`Updated item ${data.item_id} availability to ${data.available}`);
                
                // Refresh the menu display if it exists
                if (typeof displayMenuItems === 'function') {
                    displayMenuItems();
                }
            } else {
                console.warn(`Item with ID ${data.item_id} not found in menu items`);
            }
        } else {
            console.warn('Menu items not loaded yet, update will apply on next load');
        }
        
        // Also update any specific item in the DOM directly
        const menuItem = document.querySelector(`.menu-item[data-id="${data.item_id}"]`);
        if (menuItem) {
            if (!data.available) {
                // Create out of stock overlay if it doesn't exist
                if (!menuItem.querySelector('.out-of-stock-overlay')) {
                    const outOfStockOverlay = document.createElement('div');
                    outOfStockOverlay.className = 'out-of-stock-overlay';
                    
                    const outOfStockLabel = document.createElement('div');
                    outOfStockLabel.className = 'out-of-stock-label';
                    outOfStockLabel.textContent = 'Out of Stock' ;
                    
                    outOfStockOverlay.appendChild(outOfStockLabel);
                    menuItem.appendChild(outOfStockOverlay);
                    
                    // Disable add button and quantity controls
                    const addButton = menuItem.querySelector('.add-to-order-button');
                    if (addButton) {
                        addButton.disabled = true;
                        addButton.style.opacity = '0.5';
                        addButton.style.cursor = 'not-allowed';
                    }
                    
                    const quantityControls = menuItem.querySelectorAll('.quantity-control button');
                    quantityControls.forEach(button => {
                        button.disabled = true;
                        button.style.opacity = '0.5';
                        button.style.cursor = 'not-allowed';
                    });
                    
                    const quantityInput = menuItem.querySelector('.quantity-input');
                    if (quantityInput) {
                        quantityInput.disabled = true;
                        quantityInput.style.opacity = '0.5';
                    }
                }
            } else {
                // Remove out of stock overlay if it exists
                const overlay = menuItem.querySelector('.out-of-stock-overlay');
                if (overlay) {
                    menuItem.removeChild(overlay);
                }
                
                // Enable add button and quantity controls
                const addButton = menuItem.querySelector('.add-to-order-button');
                if (addButton) {
                    addButton.disabled = false;
                    addButton.style.opacity = '1';
                    addButton.style.cursor = 'pointer';
                }
                
                const quantityControls = menuItem.querySelectorAll('.quantity-control button');
                quantityControls.forEach(button => {
                    button.disabled = false;
                    button.style.opacity = '1';
                    button.style.cursor = 'pointer';
                });
                
                const quantityInput = menuItem.querySelector('.quantity-input');
                if (quantityInput) {
                    quantityInput.disabled = false;
                    quantityInput.style.opacity = '1';
                }
            }
        }
    });
    // Handle category tab clicks
    const categoryTabs = document.querySelectorAll('.category-tab');
    if (categoryTabs.length > 0) {
        categoryTabs.forEach(tab => {
            tab.addEventListener('click', function() {
                // Remove active class from all tabs
                categoryTabs.forEach(t => t.classList.remove('active'));
                
                // Add active class to clicked tab
                this.classList.add('active');
                
                // Get the category value
                const category = this.getAttribute('data-category');
                
                // Update the hidden category filter select (for compatibility)
                const categoryFilter = document.getElementById('category-filter');
                if (categoryFilter) {
                    categoryFilter.value = categoryMap[category] || 'All';
                    
                    // Trigger the change event to filter menu items
                    const event = new Event('change');
                    categoryFilter.dispatchEvent(event);
                }
            });
        });
    }
    // Set up order panel toggle
    const orderToggle = document.querySelector('.order-toggle');
    const orderSection = document.querySelector('.order-section');
    const orderCloseBtn = document.querySelector('.order-close-btn');
    
    if (orderToggle && orderSection && orderCloseBtn) {
        // Open order panel when toggle is clicked
        orderToggle.addEventListener('click', function() {
            orderSection.classList.add('active');
        });
        
        // Close order panel when close button is clicked
        orderCloseBtn.addEventListener('click', function() {
            orderSection.classList.remove('active');
        });
        
        // Also close order panel when clicking outside it
        document.addEventListener('click', function(event) {
            if (!orderSection.contains(event.target) && 
                !orderToggle.contains(event.target) && 
                orderSection.classList.contains('active')) {
                orderSection.classList.remove('active');
            }
        });
    }
    function updateCartBadge() {
        const orderToggleCount = document.querySelector('.order-toggle-count');
        if (!orderToggleCount) return;
        
        // Calculate total quantity in cart
        const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
        
        // Update badge
        orderToggleCount.textContent = totalQuantity;
        
        // Show/hide badge based on cart content
        orderToggleCount.style.display = totalQuantity > 0 ? 'flex' : 'none';
    }
    function updateMenuItemsWithDataId() {
        // Update the displayMenuItems function to add data-id attribute
        const displayMenuItemsStr = displayMenuItems.toString();
        
        // Check if the function already has the modification
        if (!displayMenuItemsStr.includes('.dataset.id = item.id')) {
            // Find a good spot to add the attribute (after creating the menu item)
            const modifiedFunction = displayMenuItemsStr.replace(
                'const menuItemElement = menuItemTemplate.content.cloneNode(true);',
                'const menuItemElement = menuItemTemplate.content.cloneNode(true);\n' +
                '    menuItemElement.querySelector(\'.menu-item\').dataset.id = item.id;'
            );
            
            // Replace the function
            eval('displayMenuItems = ' + modifiedFunction);
            console.log('Updated displayMenuItems function with data-id attribute');
        }
    }
    document.addEventListener('DOMContentLoaded', function() {
        // Make sure displayMenuItems is defined before trying to modify it
        if (typeof displayMenuItems === 'function') {
            updateMenuItemsWithDataId();
        } else {
            // If not available immediately, try again after a short delay
            setTimeout(function() {
                if (typeof displayMenuItems === 'function') {
                    updateMenuItemsWithDataId();
                }
            }, 1000);
        }
    });
    // Override the existing updateOrderDisplay function to also update the badge
    const originalUpdateOrderDisplay = window.updateOrderDisplay;
    if (typeof originalUpdateOrderDisplay === 'function') {
        window.updateOrderDisplay = function() {
            // Call the original function
            originalUpdateOrderDisplay.apply(this, arguments);
            
            // Update the badge
            updateCartBadge();
        };
    }
    const searchInput = document.getElementById('search-menu');
    if (searchInput) {
        // Clear any existing event listeners
        searchInput.removeEventListener('input', filterMenuItems);
        
        // Add event listener
        searchInput.addEventListener('input', function() {
            // Use the existing filterMenuItems function if available
            if (typeof window.filterMenuItems === 'function') {
                window.filterMenuItems();
            }
        });
    }
    
    // ---- Initial Setup ----
    
    // Make sure the first category tab is active by default
    const firstCategoryTab = document.querySelector('.category-tab');
    if (firstCategoryTab) {
        firstCategoryTab.classList.add('active');
    }
    
    // Initialize cart badge
    updateCartBadge();
    // Initialize chatbot functionality
    initChatbot();
    // DOM Elements
    const tableNumberDisplay = document.getElementById('table-number');
    const menuItemsContainer = document.getElementById('menu-items');
    const categoryFilter = document.getElementById('category-filter');
    const searchMenu = document.getElementById('search-menu');
    const orderItemsContainer = document.getElementById('order-items');
    const orderTotalElement = document.getElementById('order-total');
    const clearOrderButton = document.getElementById('clear-order');
    const submitOrderButton = document.getElementById('submit-order');
    const languageEnButton = document.getElementById('lang-en');
    const currentTimeElement = document.getElementById('current-time');
    const currentDateElement = document.getElementById('current-date');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const darkModeButton = document.getElementById('dark-mode-toggle');
    
    darkModeButton.addEventListener('click', toggleDarkMode);

    function toggleDarkMode() {
        // Toggle the dark-mode class on the body
        document.body.classList.toggle('dark-mode');
        
        // Update the toggle button state
        const darkModeToggle = document.getElementById('dark-mode-toggle');
        if (darkModeToggle) {
            darkModeToggle.checked = document.body.classList.contains('dark-mode');
        }
        
        // Save preference to localStorage
        localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
        
        // Update menu items - important fix
        updateMenuItemsForCurrentMode();
        
        // Also update chat box if present
        const chatBox = document.getElementById('chat-box');
        if (chatBox) {
            chatBox.classList.toggle('dark-mode', document.body.classList.contains('dark-mode'));
        }
    }
    // Add this new function to update menu items when mode changes
function updateMenuItemsForCurrentMode() {
    const isDarkMode = document.body.classList.contains('dark-mode');
    
    // Update all menu items
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        const details = item.querySelector('.menu-item-details');
        const title = details ? details.querySelector('h3') : null;
        const description = details ? details.querySelector('p') : null;
        const quantityInput = item.querySelector('.quantity-input');
        const quantityButtons = item.querySelectorAll('.quantity-control button');
        
        // Apply appropriate colors based on mode
        if (isDarkMode) {
            if (title) title.style.color = '#fff';
            if (description) description.style.color = '#ccc';
            if (quantityInput) {
                quantityInput.style.backgroundColor = 'transparent';
                quantityInput.style.color = '#fff';
            }
            quantityButtons.forEach(btn => {
                btn.style.backgroundColor = '#444';
                btn.style.color = '#fff';
            });
        } else {
            if (title) title.style.color = '#333';
            if (description) description.style.color = '#666';
            if (quantityInput) {
                quantityInput.style.backgroundColor = '#fff';
                quantityInput.style.color = '#333';
            }
            quantityButtons.forEach(btn => {
                btn.style.backgroundColor = '#eee';
                btn.style.color = '#333';
            });
        }
    });
    
    // Update active orders display if present
    if (typeof displayActiveOrders === 'function') {
        displayActiveOrders();
    }
}
document.addEventListener('DOMContentLoaded', function() {
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        const darkModeToggle = document.getElementById('dark-mode-toggle');
        if (darkModeToggle) darkModeToggle.checked = true;
    }
    
    // Initialize menu items with the correct colors
    updateMenuItemsForCurrentMode();
    initLanguageSwitcher();
});
    
    // Templates
    const menuItemTemplate = document.getElementById('menu-item-template');
    const orderItemTemplate = document.getElementById('order-item-template');
    const tableSetupTemplate = document.getElementById('table-setup-template');
    // Add these variables after your other DOM selections
    const activeOrdersContainer = document.getElementById('active-orders');
    let activeOrders = [];
    let orderUpdateInterval;

// Add this function to initialize order tracking
function initializeOrderTracking() {
    // Load active orders immediately
    loadActiveOrders();
    
    // Set up automatic refresh every 30 seconds
    orderUpdateInterval = setInterval(loadActiveOrders, 30000);
    
    // Also refresh orders when the socket notifies us of updates
    socket.on('order_updated', function(data) {
        loadActiveOrders();
    });
}

function initChatbot() {
    // Elements
    const chatBubble = document.getElementById('chat-bubble');
    const chatBox = document.getElementById('chat-box');
    const closeChat = document.getElementById('close-chat');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const chatMessages = document.getElementById('chat-messages');
    const typingIndicator = document.getElementById('typing-indicator');
    const notificationBadge = document.getElementById('notification-badge');

    // Show notification on initial load
    setTimeout(() => {
        notificationBadge.style.visibility = 'visible';
    }, 3000);

    // Open/close chat box
    chatBubble.addEventListener('click', function() {
        chatBox.classList.toggle('active');
        notificationBadge.style.visibility = 'hidden';
    });

    closeChat.addEventListener('click', function() {
        chatBox.classList.remove('active');
    });

    // Send message on button click or Enter key
    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    function sendMessage() {
        const message = userInput.value.trim();
        if (message === '') return;

        // Add user message to chat
        addMessage(message, 'user');
        userInput.value = '';

        // Show typing indicator
        typingIndicator.style.display = 'block';
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Send the message to your Python RAG API
        fetchRagResponse(message);
    }

    function addMessage(text, sender) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        messageElement.classList.add(sender + '-message');
        messageElement.textContent = text;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // This function connects to your Python RAG API
    function fetchRagResponse(userMessage) {
        // Get the current table number from the page if available
        const tableNumber = localStorage.getItem('tableNumber') || 'unknown';
        
        // Make a request to your Python RAG API
        fetch('/api/chatbot', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: userMessage,
                tableNumber: tableNumber,
                useRag: true
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            // Process the response to remove thinking tags
            let botResponse = data.response;
            
            // Filter out <think>...</think> content using regex
            botResponse = botResponse.replace(/<think>[\s\S]*?<\/think>/g, '');
            
            // Remove any remaining tags for safety
            botResponse = botResponse.replace(/<\/?[^>]+(>|$)/g, '');
            
            // Trim any excess whitespace that might remain
            botResponse = botResponse.trim();
            
            // Hide typing indicator and add bot response
            typingIndicator.style.display = 'none';
            addMessage(botResponse, 'bot');
        })
        .catch(error => {
            console.error('Error fetching from RAG API:', error);
            typingIndicator.style.display = 'none';
            
            // Fallback response if the API fails
            addMessage("I'm sorry, I'm having trouble connecting to my knowledge base. Please try again later.", 'bot');
        });
    }
    
    // Check for dark mode and apply if needed
    function checkDarkMode() {
        if (document.body.classList.contains('dark-mode')) {
            chatBox.classList.add('dark-mode');
        } else {
            chatBox.classList.remove('dark-mode');
        }
    }

    // Initial check and set up observer for dark mode
    checkDarkMode();
    const darkModeObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.attributeName === 'class') {
                checkDarkMode();
            }
        });
    });

    darkModeObserver.observe(document.body, {
        attributes: true
    });
}
function initLanguageSwitcher() {
    // Find the container for the language switcher
    const utilitiesContainer = document.querySelector('.utilities');
    
    if (!utilitiesContainer) {
        console.error('Could not find utilities container for language switcher');
        return;
    }
    
    // Create language switcher container
    const languageSwitcher = document.createElement('div');
    languageSwitcher.className = 'language-switcher';
    languageSwitcher.style.opacity = '1'; // Make it visible
    languageSwitcher.style.pointerEvents = 'auto'; // Enable interaction
    languageSwitcher.style.marginRight = '15px'; // Add some spacing
    languageSwitcher.style.display = 'flex'; // Use flexbox
    
    // Create English button
    const enButton = document.createElement('button');
    enButton.className = 'lang-button';
    enButton.id = 'lang-en';
    enButton.textContent = '🇺🇸';
    enButton.title = 'English';
    enButton.style.cursor = 'pointer';
    enButton.style.background = 'none';
    enButton.style.border = 'none';
    enButton.style.fontSize = '20px';
    enButton.style.padding = '5px';
    enButton.style.borderRadius = '4px';
    enButton.style.opacity = currentLanguage === 'en' ? '1' : '0.5';
    
    // Create Vietnamese button
    const viButton = document.createElement('button');
    viButton.className = 'lang-button';
    viButton.id = 'lang-vi';
    viButton.textContent = '🇻🇳';
    viButton.title = 'Tiếng Việt';
    viButton.style.cursor = 'pointer';
    viButton.style.background = 'none';
    viButton.style.border = 'none';
    viButton.style.fontSize = '20px';
    viButton.style.padding = '5px';
    viButton.style.borderRadius = '4px';
    viButton.style.opacity = currentLanguage === 'vi' ? '1' : '0.5';
    
    // Add event listeners
    enButton.addEventListener('click', () => {
        setLanguage('en');
        enButton.style.opacity = '1';
        viButton.style.opacity = '0.5';
    });
    
    viButton.addEventListener('click', () => {
        setLanguage('vi');
        viButton.style.opacity = '1';
        enButton.style.opacity = '0.5';
    });
    
    // Add buttons to language switcher
    languageSwitcher.appendChild(enButton);
    languageSwitcher.appendChild(viButton);
    
    // Add language switcher to utilities container (before dark mode toggle)
    const darkModeContainer = utilitiesContainer.querySelector('.dark-mode-container');
    if (darkModeContainer) {
        utilitiesContainer.insertBefore(languageSwitcher, darkModeContainer);
    } else {
        utilitiesContainer.appendChild(languageSwitcher);
    }
}

// Update loadActiveOrders function
function loadActiveOrders() {
    if (!tableNumber) return;
    
    fetch(`/api/orders/table/${tableNumber}`)
        .then(response => response.json())
        .then(data => {
            activeOrders = data;
            displayActiveOrders();
        })
        .catch(error => {
            console.error('Error loading active orders:', error);
            activeOrdersContainer.innerHTML = `<div style="color: red; padding: 20px;">Error loading orders: ${error.message}</div>`;
        });
}

// We'll skip the displayActiveOrders function since we're handling the display in loadActiveOrders

function displayActiveOrders() {
    activeOrdersContainer.innerHTML = '';
    
    if (activeOrders.length === 0) {
        const noOrdersMessage = document.createElement('div');
        noOrdersMessage.className = 'no-orders-message';
        noOrdersMessage.textContent = currentLanguage === 'en' ? 'No active orders' : 'Không có đơn hàng';
        activeOrdersContainer.appendChild(noOrdersMessage);
        return;
    }
    
    // Check if dark mode is active
    const isDarkMode = document.body.classList.contains('dark-mode');
    const textColor = isDarkMode ? '#ffffff' : '#333333';
    const cardBackground = isDarkMode ? '#2c2c2c' : '#f5f5f5';
    const borderColor = isDarkMode ? '#3c3c3c' : '#ddd';
    
    // Language-dependent text
    const translations = {
        orderPrefix: currentLanguage === 'en' ? 'Order #' : 'Đơn hàng #',
        noteLabel: currentLanguage === 'en' ? 'Note:' : 'Ghi chú:',
        currency: currentLanguage === 'en' ? '$' : '$' // Keep dollar symbol for both languages
    };
    
    // Create a simple display for each order
    activeOrders.forEach(order => {
        const orderCard = document.createElement('div');
        orderCard.className = 'order-tracking-card';
        orderCard.style.margin = '10px 0';
        orderCard.style.padding = '15px';
        orderCard.style.backgroundColor = cardBackground;
        orderCard.style.borderRadius = '5px';
        orderCard.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        orderCard.style.color = textColor; // Set text color based on mode
        
        // Order header
        const orderHeader = document.createElement('div');
        orderHeader.style.display = 'flex';
        orderHeader.style.justifyContent = 'space-between';
        orderHeader.style.marginBottom = '10px';
        
        const orderId = document.createElement('div');
        orderId.style.fontWeight = 'bold';
        orderId.textContent = `${translations.orderPrefix}${order.id}`;
        
        const orderStatus = document.createElement('div');
        orderStatus.style.padding = '2px 8px';
        orderStatus.style.borderRadius = '3px';
        orderStatus.style.backgroundColor = getStatusColor(order.status);
        orderStatus.style.color = 'white'; // Status badges always have white text
        orderStatus.textContent = translateStatus(order.status);
        orderStatus.setAttribute('data-status', order.status); // Store original status for language updates
        orderStatus.className = 'translatable-status'; // Add class for easy targeting
        
        orderHeader.appendChild(orderId);
        orderHeader.appendChild(orderStatus);
        
        // Order details
        const orderInfo = document.createElement('div');
        orderInfo.style.marginBottom = '10px';
        // Format date according to current language
        const formattedDateTime = formatDateTime(order.created_at);
        orderInfo.textContent = `${formattedDateTime} - ${translations.currency}${order.total_amount.toFixed(2)}`;
        
        // Items list
        const itemsList = document.createElement('div');
        itemsList.style.borderTop = `1px solid ${borderColor}`;
        itemsList.style.paddingTop = '10px';
        
        order.items.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.style.marginBottom = '10px'; // Increase spacing between items
            
            // Item name and status in one row
            const itemHeader = document.createElement('div');
            itemHeader.style.display = 'flex';
            itemHeader.style.justifyContent = 'space-between';
            itemHeader.style.marginBottom = '5px';
            
            const itemName = document.createElement('div');
            // Choose appropriate name based on language
            const displayName = currentLanguage === 'en' ? item.name : (item.name_vi || item.name);
            itemName.textContent = `${item.quantity}× ${displayName}`;
            itemName.setAttribute('data-en-name', item.name);
            itemName.setAttribute('data-vi-name', item.name_vi || item.name);
            itemName.setAttribute('data-quantity', item.quantity);
            itemName.className = 'translatable-item-name'; // Add class for targeting
            
            const itemStatus = document.createElement('div');
            itemStatus.style.padding = '0 5px';
            itemStatus.style.borderRadius = '3px';
            itemStatus.style.backgroundColor = getStatusColor(item.status);
            itemStatus.style.color = 'white'; // Item status badges always have white text
            itemStatus.textContent = translateStatus(item.status);
            itemStatus.setAttribute('data-status', item.status); // Store original status for language updates
            itemStatus.className = 'translatable-status'; // Add class for targeting
            
            itemHeader.appendChild(itemName);
            itemHeader.appendChild(itemStatus);
            itemElement.appendChild(itemHeader);
            
            // Add notes display if there are notes
            if (item.notes && item.notes.trim() !== '') {
                const noteElement = document.createElement('div');
                noteElement.style.fontSize = '0.9em';
                noteElement.style.padding = '3px 5px 3px 10px';
                noteElement.style.marginTop = '3px';
                noteElement.style.marginLeft = '10px';
                noteElement.style.borderLeft = '2px solid #e9a942'; // Yellow border line
                noteElement.style.backgroundColor = isDarkMode ? '#3c3c3c' : '#f9f5e8';
                noteElement.className = 'item-note-container'; // Add class for styling
                
                const noteLabel = document.createElement('span');
                noteLabel.style.fontWeight = 'bold';
                noteLabel.style.marginRight = '5px';
                noteLabel.textContent = translations.noteLabel;
                noteLabel.className = 'note-label'; // Add class for language switching
                noteLabel.setAttribute('data-en-text', 'Note:');
                noteLabel.setAttribute('data-vi-text', 'Ghi chú:');
                
                noteElement.appendChild(noteLabel);
                noteElement.appendChild(document.createTextNode(item.notes));
                itemElement.appendChild(noteElement);
            }
            
            itemsList.appendChild(itemElement);
        });
        
        // Assemble card
        orderCard.appendChild(orderHeader);
        orderCard.appendChild(orderInfo);
        orderCard.appendChild(itemsList);
        
        activeOrdersContainer.appendChild(orderCard);
    });
}

// Enhanced function to update language in order tracking
function updateOrderTrackingLanguage() {
    // Update no orders message if present
    const noOrdersMessage = document.querySelector('.no-orders-message');
    if (noOrdersMessage) {
        noOrdersMessage.textContent = currentLanguage === 'en' ? 'No active orders' : 'Không có đơn hàng';
    }
    
    // Update order IDs
    const orderIds = document.querySelectorAll('.order-tracking-card div:first-child div:first-child');
    orderIds.forEach(element => {
        const orderId = element.textContent.split('#')[1];
        element.textContent = (currentLanguage === 'en' ? 'Order #' : 'Đơn hàng #') + orderId;
    });
    
    // Update statuses
    const statuses = document.querySelectorAll('.translatable-status');
    statuses.forEach(element => {
        const originalStatus = element.getAttribute('data-status');
        element.textContent = translateStatus(originalStatus);
    });
    
    // Update item names
    const itemNames = document.querySelectorAll('.translatable-item-name');
    itemNames.forEach(element => {
        const qty = element.getAttribute('data-quantity');
        const enName = element.getAttribute('data-en-name');
        const viName = element.getAttribute('data-vi-name');
        element.textContent = `${qty}× ${currentLanguage === 'en' ? enName : viName}`;
    });
    
    // Update note labels
    const noteLabels = document.querySelectorAll('.note-label');
    noteLabels.forEach(element => {
        element.textContent = currentLanguage === 'en' ? 'Note:' : 'Ghi chú:';
    });
    
    // Update dates and times
    const orderInfos = document.querySelectorAll('.order-tracking-card > div:nth-child(2)');
    orderInfos.forEach(element => {
        const dateTimeStr = element.textContent.split(' - ')[0];
        const priceStr = element.textContent.split(' - ')[1];
        
        // Try to extract the original date
        try {
            // Extract the date object from the text
            const dateParts = dateTimeStr.match(/(\w+) (\d+), (\d+:\d+)/);
            const originalDateStr = element.getAttribute('data-original-date');
            let originalDate;
            
            if (originalDateStr) {
                originalDate = new Date(originalDateStr);
            } else {
                // If we don't have the original, try to parse it from what's displayed
                // This is not ideal but a fallback
                originalDate = new Date();
                element.setAttribute('data-original-date', originalDate.toISOString());
            }
            
            // Format according to current language
            const formattedDate = formatDateTime(originalDate);
            element.textContent = `${formattedDate} - ${priceStr}`;
        } catch (e) {
            // If parsing fails, leave as is
            console.error('Could not parse date for language update', e);
        }
    });
}
function translateStatus(status) {
    const statusTranslations = {
        'Pending': 'Chờ xử lý',
        'In Progress': 'Đang chế biến',
        'Ready': 'Sẵn sàng',
        'Delivered': 'Đã phục vụ',
        'Completed': 'Hoàn thành',
        'Cancelled': 'Đã hủy'
    };
    
    return statusTranslations[status] || status;
}

function getStatusColor(status) {
    const statusColors = {
        'Pending': '#f39c12',
        'In Progress': '#3498db',
        'Ready': '#2ecc71',
        'Delivered': '#9b59b6',
        'Completed': '#27ae60',
        'Cancelled': '#e74c3c'

    };
    
    return statusColors[status] || '#95a5a6';
}
function formatDateTime(dateTimeStr) {
    const date = new Date(dateTimeStr);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    const options = { month: 'short', day: 'numeric' };
    const dateFormatted = date.toLocaleDateString(
        currentLanguage === 'en' ? 'en-US' : 'vi-VN', 
        options
    );
    
    return `${dateFormatted}, ${hours}:${minutes}`;
}
// Helper function to get translated status
function getStatusTranslation(status) {
    if (currentLanguage === 'en') {
        return status;
    }
    
    // Vietnamese translations for statuses
    const statusTranslations = {
        'Pending': 'Chờ xử lý',
        'In Progress': 'Đang chế biến',
        'Ready': 'Sẵn sàng',
        'Delivered': 'Đã phục vụ',
        'Completed': 'Hoàn thành'
    };
    
    return statusTranslations[status] || status;
}

    // Apply saved language
    setLanguage(currentLanguage);
    
    // Initialize clock
    updateClock();
    setInterval(updateClock, 1000); // Update clock every second
    
    // Initialize dark mode from localStorage
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        darkModeToggle.checked = true;
    }
    
    // Get table number from URL parameter or device ID
    function initializeTableNumber() {
        // First try to get from URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        const paramTableNumber = urlParams.get('table');
        
        if (paramTableNumber) {
            tableNumber = parseInt(paramTableNumber);
            tableNumberDisplay.textContent = tableNumber;
            localStorage.setItem('tableNumber', tableNumber);
            return;
        }
        
        // Then try to get from localStorage (saved on this device)
        const storedTableNumber = localStorage.getItem('tableNumber');
        if (storedTableNumber) {
            tableNumber = parseInt(storedTableNumber);
            tableNumberDisplay.textContent = tableNumber;
            return;
        }
        
        // If not found, show setup prompt
        showTableSetupPrompt();
    }
    
    function showTableSetupPrompt() {
        const setupModal = tableSetupTemplate.content.cloneNode(true);
        document.body.appendChild(setupModal);
        
        // Apply current language to the modal
        updateLanguageElements();
        
        // Add event listener to save button
        document.getElementById('save-table-setup').addEventListener('click', function() {
            const tableInput = document.getElementById('setup-table-number');
            const pinInput = document.getElementById('setup-device-pin');
            
            if (!tableInput.value) {
                alert(currentLanguage === 'en' ? 'Please enter a table number' : 'Vui lòng nhập số bàn');
                return;
            }
            
            if (pinInput.value !== '1234') { // Replace with your actual setup PIN
                alert(currentLanguage === 'en' ? 'Invalid setup PIN' : 'Mã PIN không hợp lệ');
                return;
            }
            
            tableNumber = parseInt(tableInput.value);
            localStorage.setItem('tableNumber', tableNumber);
            tableNumberDisplay.textContent = tableNumber;
            
            const modal = document.querySelector('.setup-modal');
            document.body.removeChild(modal);
            loadMenu(); // Load menu after setup
            
            // Register device with the server
            socket.emit('register_device', {
                role: 'customer',
                table_number: tableNumber
            });
        });
    }
    
    // Language switching functions
    function setLanguage(lang) {
        currentLanguage = lang;
        localStorage.setItem('language', lang);
        
        // Update UI language elements
        updateLanguageElements();
    
        // Update date format for clock
        updateClock();
        
        // Refresh menu display if items are loaded
        if (menuItems.length > 0) {
            displayMenuItems();
        }
        updateOrderDisplay();
    
        // Update active orders display with language changes
        updateOrderTrackingLanguage();
    }
    
    function updateLanguageElements() {
        // Update all elements with data-lang-en and data-lang-vi attributes
        document.querySelectorAll('[data-lang-en]').forEach(element => {
            const enText = element.getAttribute('data-lang-en');
            const viText = element.getAttribute('data-lang-vi');
            element.textContent = currentLanguage === 'en' ? enText : viText;
        });
        
        // Update placeholders
        document.querySelectorAll('[data-lang-en-placeholder]').forEach(element => {
            const enPlaceholder = element.getAttribute('data-lang-en-placeholder');
            const viPlaceholder = element.getAttribute('data-lang-vi-placeholder');
            element.placeholder = currentLanguage === 'en' ? enPlaceholder : viPlaceholder;
        });
        
        // Update add to order buttons in menu items
        document.querySelectorAll('.add-to-order-button').forEach(button => {
            const enText = button.getAttribute('data-lang-en');
            const viText = button.getAttribute('data-lang-vi');
            if (enText && viText) {
                button.textContent = currentLanguage === 'en' ? enText : viText;
            }
        });
        
        // Update select options
        const categorySelect = document.getElementById('category-filter');
        if (categorySelect) {
            Array.from(categorySelect.options).forEach(option => {
                const enText = option.getAttribute('data-lang-en');
                const viText = option.getAttribute('data-lang-vi');
                if (enText && viText) {
                    option.textContent = currentLanguage === 'en' ? enText : viText;
                }
            });
        }
    }
    
    // Clock function
    function updateClock() {
        const now = new Date();
        
        // Update time (HH:MM:SS)
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        currentTimeElement.textContent = `${hours}:${minutes}:${seconds}`;
        
        // Update date with language-specific format
        const options = { 
            weekday: 'long', 
            month: 'short', 
            day: 'numeric' 
        };
        
        currentDateElement.textContent = now.toLocaleDateString(
            currentLanguage === 'en' ? 'en-US' : 'vi-VN', 
            options
        );
    }
    
    // Load menu items
    function loadMenu() {
        fetch('/api/menu')
            .then(response => response.json())
            .then(data => {
                menuItems = data;
                displayMenuItems();
            })
            .catch(error => console.error('Error loading menu:', error));
    }
    
    // Initialize
    initializeTableNumber();
    
    if (tableNumber) {

        loadMenu();
        initializeOrderTracking();

        // Register device with the server
        socket.emit('register_device', {
            role: 'customer',
            table_number: tableNumber
        });
    }
    
    // Event Listeners
    categoryFilter.addEventListener('change', filterMenuItems);
    searchMenu.addEventListener('input', filterMenuItems);
    clearOrderButton.addEventListener('click', clearOrder);
    submitOrderButton.addEventListener('click', submitOrder);
    
    
    darkModeToggle.addEventListener('change', toggleDarkMode);
    
    // Socket.io event handlers
    socket.on('menu_updated', function() {
        loadMenu();
    });
    
    socket.on('reset_device', function() {
        // Clear local storage
        localStorage.removeItem('tableNumber');
        
        // Show alert
        alert(currentLanguage === 'en' ? 
            'This device has been reset by the administrator. The page will reload.' : 
            'Thiết bị này đã được đặt lại bởi quản trị viên. Trang sẽ tải lại.');
        
        // Reload the page
        setTimeout(() => {
            window.location.reload();
        }, 2000);
    });
    

    function toggleDarkMode() {
        // Toggle the dark-mode class on the body
        document.body.classList.toggle('dark-mode');
        
        // Save preference to localStorage
        localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
        
        // Update the header specifically
        updateHeaderAppearance();
        
        // Update menu items and other UI elements
        updateMenuItemsForCurrentMode();
        
        // Update any other components that need specific handling
        const chatBox = document.getElementById('chat-box');
        if (chatBox) {
            chatBox.classList.toggle('dark-mode', document.body.classList.contains('dark-mode'));
        }
    }
    
    // Function to specifically update the header appearance
    function updateHeaderAppearance() {
        const isDarkMode = document.body.classList.contains('dark-mode');
        const header = document.querySelector('.header-container');
        
        if (header) {
            if (isDarkMode) {
                header.style.backgroundColor = '#2c2c2c';
            } else {
                header.style.backgroundColor = '#3498db'; // Light blue for light mode
            }
        }
    }
    document.addEventListener('DOMContentLoaded', function() {
        const isDarkMode = localStorage.getItem('darkMode') === 'true';
        if (isDarkMode) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        
        // Update the header appearance on load
        updateHeaderAppearance();
        
        // Initialize other UI elements
        updateMenuItemsForCurrentMode();
        initLanguageSwitcher();
    });
    // Functions
    // Update the displayMenuItems function in customer.js to show best seller badge and discounts

// Modified displayMenuItems function for customer.js

function displayMenuItems() {
    // Clear container
    menuItemsContainer.innerHTML = '';
    
    const category = categoryFilter.value;
    const searchTerm = searchMenu.value.toLowerCase();
    
    // Filter items
    let filteredItems = menuItems;
    
    if (category !== 'All') {
        filteredItems = filteredItems.filter(item => item.category === category);
    }
    
    if (searchTerm) {
        filteredItems = filteredItems.filter(item => {
            // Search in both languages
            const nameMatch = (
                (item.name && item.name.toLowerCase().includes(searchTerm)) || 
                (item.name_vi && item.name_vi.toLowerCase().includes(searchTerm))
            );
            
            const descMatch = (
                (item.description && item.description.toLowerCase().includes(searchTerm)) || 
                (item.description_vi && item.description_vi.toLowerCase().includes(searchTerm))
            );
            
            return nameMatch || descMatch;
        });
    }
    
    // Display items
    filteredItems.forEach(item => {
        const menuItemElement = menuItemTemplate.content.cloneNode(true);
        
        // Set the data-id attribute on the menu-item element
        const menuItemCard = menuItemElement.querySelector('.menu-item');
        menuItemCard.dataset.id = item.id;
        
        // Display name and description in current language
        const itemName = currentLanguage === 'en' ? item.name : (item.name_vi || item.name);
        const itemDescription = currentLanguage === 'en' ? 
            (item.description || '') : (item.description_vi || item.description || '');
        const nameElement = menuItemElement.querySelector('.item-name');
        const descElement = menuItemElement.querySelector('.item-description');
        
        nameElement.textContent = itemName;
        descElement.textContent = itemDescription;
        
        // Add data attributes for translation system
        nameElement.setAttribute('data-item-id', item.id);
        nameElement.setAttribute('data-field', 'name');
        
        descElement.setAttribute('data-item-id', item.id);
        descElement.setAttribute('data-field', 'description');

        // Check item availability - fix for proper boolean handling
        const isAvailable = item.available !== false; // Will handle both undefined and true as available
        
        // Handle best seller badge
        const bestSellerRibbon = menuItemElement.querySelector('.best-seller-ribbon');
        if (item.best_seller) {
            bestSellerRibbon.style.display = 'inline-block';
        } else {
            bestSellerRibbon.style.display = 'none';
        }

        // Handle out of stock overlay - NEW CODE
        if (!isAvailable) {
            // Create out of stock overlay
            const outOfStockOverlay = document.createElement('div');
            outOfStockOverlay.className = 'out-of-stock-overlay';
            
            const outOfStockLabel = document.createElement('div');
            outOfStockLabel.className = 'out-of-stock-label';
            outOfStockLabel.textContent =  'Out of Stock';
            
            outOfStockOverlay.appendChild(outOfStockLabel);
            menuItemCard.appendChild(outOfStockOverlay);
            
            // Disable add button and quantity controls
            const addButton = menuItemElement.querySelector('.add-to-order-button');
            addButton.disabled = true;
            addButton.style.opacity = '0.5';
            addButton.style.cursor = 'not-allowed';
            
            const quantityControls = menuItemElement.querySelectorAll('.quantity-control button');
            quantityControls.forEach(button => {
                button.disabled = true;
                button.style.opacity = '0.5';
                button.style.cursor = 'not-allowed';
            });
            
            const quantityInput = menuItemElement.querySelector('.quantity-input');
            quantityInput.disabled = true;
            quantityInput.style.opacity = '0.5';
        }
        
        // Handle discounted price display
        const priceContainer = menuItemElement.querySelector('.item-price-container');
        const originalPriceElement = menuItemElement.querySelector('.item-original-price');
        const currentPriceElement = menuItemElement.querySelector('.item-price');
        const discountBadge = menuItemElement.querySelector('.discount-badge');
                
        if (item.discount_percentage > 0) {
            // Calculate discounted price
            const originalPrice = item.price;
            const discountedPrice = originalPrice * (1 - item.discount_percentage / 100);
            
            // Display original price with strikethrough
            originalPriceElement.textContent = `$${originalPrice.toFixed(2)}`;
            originalPriceElement.style.display = 'inline';
            
            // Display discounted price
            currentPriceElement.textContent = `$${discountedPrice.toFixed(2)}`;
            currentPriceElement.style.color = '#e74c3c'; // Highlight discounted price in red
            
            // Show discount badge
            discountBadge.textContent = `${item.discount_percentage}% ⬇️`;
            discountBadge.style.display = 'inline-block';
        } else {
            // Regular price display (no discount)
            originalPriceElement.style.display = 'none';
            currentPriceElement.textContent = `$${item.price.toFixed(2)}`;
            discountBadge.style.display = 'none';
        }
        
        // Handle image if it exists
        const imageElement = menuItemElement.querySelector('.item-image');
        if (imageElement) {
            if (item.image_path) {
                imageElement.src = item.image_path;
                imageElement.alt = itemName;
            } else {
                imageElement.src = '/static/images/menu/placeholder-food.jpg';
                imageElement.alt = 'No image available';
            }
        }
        
        const addButton = menuItemElement.querySelector('.add-to-order-button');
        
        const quantityInput = menuItemElement.querySelector('.quantity-input');
        const decreaseButton = menuItemElement.querySelector('.quantity-decrease');
        const increaseButton = menuItemElement.querySelector('.quantity-increase');
        
        // Add event listeners only if item is available
        if (isAvailable) {
            addButton.addEventListener('click', () => {
                // Calculate the actual price (considering discounts)
                const actualPrice = item.discount_percentage > 0 
                    ? item.price * (1 - item.discount_percentage / 100) 
                    : item.price;
                    
                // Create a copy of the item with the actual price
                const itemWithDiscount = {
                    ...item,
                    price: actualPrice
                };
                
                addToOrder(itemWithDiscount, parseInt(quantityInput.value));
            });
            
            decreaseButton.addEventListener('click', () => {
                let qty = parseInt(quantityInput.value);
                if (qty > 1) {
                    quantityInput.value = qty - 1;
                }
            });
            
            increaseButton.addEventListener('click', () => {
                let qty = parseInt(quantityInput.value);
                quantityInput.value = qty + 1;
            });
        }
        
        menuItemsContainer.appendChild(menuItemElement);
    });
    
    // Apply translations to newly added elements
    if (typeof translationSystem !== 'undefined' && typeof translationSystem.applyTranslations === 'function') {
        translationSystem.applyTranslations();
    }
}
    
    function filterMenuItems() {
        displayMenuItems();
    }
    
    function addToOrder(item, quantity) {
        if (quantity < 1) {
            return;
        }
        
        // Use the current language name for the item in the cart
        const itemName = currentLanguage === 'en' ? item.name : (item.name_vi || item.name);
        
        // Store both prices
        const priceUSD = item.price;
       
        
        // Check if item is already in cart
        const existingItemIndex = cart.findIndex(cartItem => cartItem.menu_item_id === item.id);
        
        if (existingItemIndex !== -1) {
            // Update quantity
            cart[existingItemIndex].quantity += quantity;
        } else {
            // Add new item to cart
            cart.push({
                menu_item_id: item.id,
                name: itemName,
                price: priceUSD,
                quantity: quantity,
                notes: ''
            });
        }
        
        updateOrderDisplay();
    }
    
    // Update the updateOrderDisplay function to capture notes
function updateOrderDisplay() {
    // Clear container
    orderItemsContainer.innerHTML = '';
    
    // Calculate total
    let total = 0;
    let totalUSD = 0;
   
    // Display cart items
    cart.forEach((item, index) => {
        const orderItemElement = orderItemTemplate.content.cloneNode(true);

        let itemName = item.name; // Default to stored name
    
        // Try to find the menu item to get its translated name
        const menuItem = menuItems.find(mi => mi.id === item.menu_item_id);
        if (menuItem) {
            // Use language-specific name if available
            itemName = currentLanguage === 'en' ? menuItem.name : 
                      (menuItem.name_vi && currentLanguage === 'vi' ? menuItem.name_vi : 
                       menuItem.name); // Fallback to original name
        }
        orderItemElement.querySelector('.item-name').textContent = item.name;
        orderItemElement.querySelector('.item-quantity').textContent = item.quantity;
        
        
        const notesInput = orderItemElement.querySelector('.item-notes');
        // Set existing notes if any
        if (item.notes) {
            notesInput.value = item.notes;
        }
        
        // Add event listener to save notes when changed
        notesInput.addEventListener('change', function() {
            cart[index].notes = this.value;
        });
        
        const itemPriceUSD = item.price * item.quantity;

        totalUSD += itemPriceUSD;

        const priceText = `$${itemPriceUSD.toFixed(2)}` 
        orderItemElement.querySelector('.order-item-price').textContent = priceText;
        
        
        const removeButton = orderItemElement.querySelector('.remove-item-button');
        removeButton.addEventListener('click', () => removeFromOrder(index));
        
        orderItemsContainer.appendChild(orderItemElement);
        
        // Add to total
        total += item.price * item.quantity;
    });
    const totalText = `$${totalUSD.toFixed(2)}`
    orderTotalElement.textContent = totalText;
    
    // Update cart badge
    updateCartBadge();
}
    
    function removeFromOrder(index) {
        cart.splice(index, 1);
        updateOrderDisplay();
    }
    
    function clearOrder() {
        cart = [];
        updateOrderDisplay();
    }
    
    function submitOrder(method) {
         // Show loading state
         const paymentDetails = document.getElementById(`payment-details-${method}`);
         if (!paymentDetails) return;
         
         const confirmButton = paymentDetails.querySelector('button');
         if (confirmButton) {
             confirmButton.disabled = true;
             confirmButton.textContent = currentLanguage === 'en' ? 'Processing...' : 'Đang xử lý...';
         }
         
         // Add a timeout to reset the button if process takes too long
         const resetTimeout = setTimeout(() => {
             resetPaymentButton(confirmButton);
         }, 30000); // 30 seconds timeout
         
         // Prepare order data
         const orderData = {
            table_number: tableNumber,
            items: cart,
 
         };
             // First, create the order
             fetch('/api/orders', {
                 method: 'POST',
                 headers: {
                     'Content-Type': 'application/json',
                     'X-Table-Auth': generateTableAuth(tableNumber)
                 },
                 body: JSON.stringify(orderData)
             })
             .then(response => {
                 if (!response.ok) {
                     throw new Error(currentLanguage === 'en' ? 
                         'Error creating order. Please try again.' : 
                         'Lỗi khi tạo đơn hàng. Vui lòng thử lại.');
                 }
                 return response.json();
             })
             .then(orderData => {
                 if (!orderData.id) {
                     throw new Error(currentLanguage === 'en' ? 
                         'Invalid order response from server.' : 
                         'Phản hồi đơn hàng không hợp lệ từ máy chủ.');
                 }
                 
                 console.log('Order created:', orderData);
                 
                 // Now process the payment
                 return fetch('/api/payment/process', {
                     method: 'POST',
                     headers: {
                         'Content-Type': 'application/json',
                         'X-Table-Auth': generateTableAuth(tableNumber)
                     },
                     body: JSON.stringify({
                         table_number: tableNumber,
                         method: method,
                         order_id: orderData.id
                     })
                 })
                 .then(response => {
                     if (!response.ok) {
                         throw new Error(currentLanguage === 'en' ? 
                             'Error processing payment. Please try again.' : 
                             'Lỗi khi xử lý thanh toán. Vui lòng thử lại.');
                     }
                     return response.json();
                 })
                 .then(paymentData => {
                     // Payment successful, now explicitly update the order status to ensure it's visible
                     return fetch(`/api/orders/${orderData.id}`, { // Use existing endpoint instead of /status
                         method: 'PUT',
                         headers: {
                             'Content-Type': 'application/json',
                             'X-Table-Auth': generateTableAuth(tableNumber)
                         },
                         body: JSON.stringify({ 
                             status: 'Pending',
                             payment_status: 'paid' 
                         })
                     })
                     .then(response => {
                         if (!response.ok) {
                             throw new Error(currentLanguage === 'en' ? 
                                 'Error updating order status. Your payment was processed but please contact staff.' : 
                                 'Lỗi khi cập nhật trạng thái đơn hàng. Thanh toán của bạn đã được xử lý nhưng vui lòng liên hệ với nhân viên.');
                         }
                         return { order: orderData, payment: paymentData };
                     });
                 });
             })
             .then(result => {
                 // Hide all payment details
                 const allPaymentDetails = document.querySelectorAll('.payment-details');
                 allPaymentDetails.forEach(detail => {
                     detail.style.display = 'none';
                 });
                 
                 // Show success message
                 const successSection = document.getElementById('payment-success');
                 if (successSection) {
                     successSection.style.display = 'block';
                     
                     // Update receipt number
                     const receiptElement = document.getElementById('receipt-number');
                     if (receiptElement) {
                         receiptElement.textContent = result.payment.receipt_number || result.order.id;
                     }
                 }
                 
                 // Clear the cart
                 cart = [];
                 window.cart = cart;
                 updateOrderDisplay();
                 
                 // Emit socket event to force refresh on all clients
                 if (socket) {
                     socket.emit('order_paid', { 
                         order_id: result.order.id,
                         table_number: tableNumber
                     });
                 }
                 
                 // Make multiple attempts to refresh the active orders
                 console.log("Refreshing active orders after payment...");
                 loadActiveOrders();
                 
                 // Try again after short delays to ensure the order appears
                 setTimeout(loadActiveOrders, 1000);
                 setTimeout(loadActiveOrders, 3000);
                 
                 // Close the modal after success
                 setTimeout(() => {
                     const modal = document.getElementById('payment-modal');
                     if (modal) {
                         modal.style.display = 'none';
                     }
                 }, 5000);
             })
             .catch(error => {
                 console.error('Payment process error:', error);
                 alert(error.message || (currentLanguage === 'en' ? 
                     'An error occurred while processing your payment. Please try again or contact staff.' : 
                     'Đã xảy ra lỗi khi xử lý thanh toán của bạn. Vui lòng thử lại hoặc liên hệ với nhân viên.'));
                 
                 // Reset button state
                 if (confirmButton) {
                     confirmButton.disabled = false;
                     confirmButton.textContent = currentLanguage === 'en' ? 'Confirm Payment' : 'Xác Nhận Thanh Toán';
                 }
             });
             clearTimeout(resetTimeout);
             resetPaymentButton(confirmButton);
    }
    
    // Simple security token generator
    function generateTableAuth(tableNumber) {
        // In a real application, use a more secure method
        const timestamp = Date.now();
        return btoa(`table:${tableNumber}:time:${timestamp}`);
    }
    // Add this line near the top of the file, after initializing other variables




// Call this when initializing if table number is set
if (tableNumber) {
    loadMenu();
    initializeOrderTracking();

    // Register device with the server
    socket.emit('register_device', {
        role: 'customer',
        table_number: tableNumber
    });
}
// Final fixed version that ensures animation starts exactly at button position
// This replaces any previous versions

// Add the styles we need for the animation
function addSpreadingStyles() {
    // Remove any existing styles first
    const existingStyles = document.getElementById('spreading-effect-styles');
    if (existingStyles) {
      existingStyles.remove();
    }
    
    // Create new styles
    const style = document.createElement('style');
    style.id = 'spreading-effect-styles';
    style.textContent = `
      /* Base styles for the transition layers */
      .theme-layer {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
        z-index: -1;
      }
      
      /* Dark theme layer */
      .dark-theme-layer {
        background-color: #1a1a1a;
        clip-path: circle(0px at -999px -999px); /* Start offscreen */
        transition: clip-path 1.5s ease-out;
      }
      
      /* Light theme layer */
      .light-theme-layer {
        background-color: #f0f0f0;
        clip-path: circle(0px at -999px -999px); /* Start offscreen */
        transition: clip-path 1.5s ease-out;
      }
      
      /* Make sure content stays visible */
      .menu-item, 
      .header-container, 
      .menu-section,
      .order-section, 
      .orders-tracking {
        position: relative;
        z-index: 1;
      }
    `;
    
    document.head.appendChild(style);
  }
  
  // Setup theme layers
  function setupSpreadingEffect() {
    // Add our styles
    addSpreadingStyles();
    
    // Create and add layers to the DOM
    const darkLayer = document.createElement('div');
    darkLayer.className = 'theme-layer dark-theme-layer';
    document.body.appendChild(darkLayer);
    
    const lightLayer = document.createElement('div');
    lightLayer.className = 'theme-layer light-theme-layer';
    document.body.appendChild(lightLayer);
    
    // Get the dark mode toggle button
    const darkModeButton = document.getElementById('dark-mode-toggle');
    if (!darkModeButton) {
      console.error('Dark mode toggle button not found!');
      return;
    }
    
    // Make sure we set up a clean event listener
    const newButton = darkModeButton.cloneNode(true);
    darkModeButton.parentNode.replaceChild(newButton, darkModeButton);
    
    // Add our toggle handler
    newButton.addEventListener('click', function(event) {
      // Get EXACT button position - this is critical
      const rect = newButton.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      // Get the current mode
      const isDarkMode = document.body.classList.contains('dark-mode');
      
      // Determine which layer to show
      const activeLayer = isDarkMode ? lightLayer : darkLayer;
      
      // Calculate maximum distance to ensure coverage
      const distanceToFurthestCorner = Math.max(
        Math.hypot(centerX, centerY),
        Math.hypot(centerX, window.innerHeight - centerY),
        Math.hypot(window.innerWidth - centerX, centerY),
        Math.hypot(window.innerWidth - centerX, window.innerHeight - centerY)
      );
      
      // Apply the initial position (at button center)
      activeLayer.style.clipPath = `circle(0px at ${centerX}px ${centerY}px)`;
      
      // Force a browser reflow to ensure the initial state is applied
      void activeLayer.offsetWidth;
      
      // Now expand the circle
      activeLayer.style.clipPath = `circle(${distanceToFurthestCorner * 2}px at ${centerX}px ${centerY}px)`;
      
      // Toggle the class mid-animation
      setTimeout(() => {
        // Toggle the class
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
        
        // Update related UI elements
        const chatBox = document.getElementById('chat-box');
        if (chatBox) {
          chatBox.classList.toggle('dark-mode', document.body.classList.contains('dark-mode'));
        }
        
        // Clean up after animation finishes
        setTimeout(() => {
          // Reset the layers
          darkLayer.style.clipPath = 'circle(0px at -999px -999px)';
          lightLayer.style.clipPath = 'circle(0px at -999px -999px)';
        }, 1500);
      }, 500);
    });
    
    // Set initial state
    if (localStorage.getItem('darkMode') === 'true' && !document.body.classList.contains('dark-mode')) {
      document.body.classList.add('dark-mode');
    }
  }
  
  // Initialize
  document.addEventListener('DOMContentLoaded', setupSpreadingEffect);
  
  // Run right away if DOM is already loaded
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    setupSpreadingEffect();
  }
// Listen for currency updates via socket

});