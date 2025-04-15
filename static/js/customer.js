// Customer.js - Handles customer interface functionality
document.addEventListener('DOMContentLoaded', function() {
    
    // Initialize variables
    let menuItems = [];
    let cart = window.cart || [];
    window.cart = cart;
    let tableNumber = null;
    let currentLanguage = localStorage.getItem('language') || 'en';
    let activeOrders = [];
    const socket = io();
    // DOM Elements
    const tableNumberDisplay = document.getElementById('table-number');
    const menuItemsContainer = document.getElementById('menu-items');
    const categoryFilter = document.getElementById('category-filter');
    const searchMenu = document.getElementById('search-menu');
    const orderItemsContainer = document.getElementById('order-items');
    const orderTotalElement = document.getElementById('order-total');
    const clearOrderButton = document.getElementById('clear-order');
    const submitOrderButton = document.getElementById('submit-order');
    const currentTimeElement = document.getElementById('current-time');
    const currentDateElement = document.getElementById('current-date');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const darkModeButton = document.getElementById('dark-mode-toggle');
    const activeOrdersContainer = document.getElementById('active-orders');
    
    // Templates
    const menuItemTemplate = document.getElementById('menu-item-template');
    const orderItemTemplate = document.getElementById('order-item-template');
    const tableSetupTemplate = document.getElementById('table-setup-template');
    
    // Create and add the chat container
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
    
    // Initialize dark mode from localStorage
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        if (darkModeToggle) darkModeToggle.checked = true;
    }
    
    // Category mapping for filtering
    const categoryMap = {
        'All': 'All',
        'Appetizer': 'Appetizer',
        'Side-dish': 'Side-dish',
        'Main': 'Main',
        'Beverage': 'Beverage',
        'Dessert': 'Dessert'
    };
    
    // Initialize core components
    updateMenuItemsForCurrentMode();
    initLanguageSwitcher();
    updateHeaderAppearance();
    updateCartBadge();
    initChatbot();
    updateOrderAndPaymentUI();
    addPayAllOrdersButton();
    setTimeout(setupOrderRefresh);
    // Initialize payment system - THIS IS CRUCIAL FOR SHOWING THE PAY BUTTON
    initPaymentSystem();
    // Make sure the first category tab is active by default
    const firstCategoryTab = document.querySelector('.category-tab');
    if (firstCategoryTab) {
        firstCategoryTab.classList.add('active');
    }
    // Initialize clock
    updateClock();
    // Initialize table number and load data
    initializeTableNumber();
    
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
    
    // Event Listeners
    if (categoryFilter) categoryFilter.addEventListener('change', filterMenuItems);
    if (searchMenu) searchMenu.addEventListener('input', filterMenuItems);
    if (clearOrderButton) clearOrderButton.addEventListener('click', clearOrder);
    if (submitOrderButton) submitOrderButton.addEventListener('click', submitOrder);
    if (darkModeToggle) darkModeToggle.addEventListener('change', toggleDarkMode);
    if (darkModeButton) darkModeButton.addEventListener('click', toggleDarkMode);
    
    // Initialize search functionality
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
    
    // Update displayMenuItems function if needed
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
    
    // Override the existing updateOrderDisplay function to also update the badge
    const originalUpdateOrderDisplay = window.updateOrderDisplay;
    if (typeof originalUpdateOrderDisplay === 'function') {
        window.updateOrderDisplay = function() {
            // Call the original function
            originalUpdateOrderDisplay.apply(this, arguments);
            
            // Update the badge
            updateCartBadge();
            
            // Ensure payment button exists after cart update
            ensurePaymentButton();
        };
    }
    
    // Socket.io event handlers
    socket.on('menu_item_availability_updated', function(data) {
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
                    outOfStockLabel.textContent = 'Out of Stock';
                    
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
    
    socket.on('menu_updated', function() {
        loadMenu();
    });
    
    socket.on('order_updated', function(data) {
        // Refresh active orders when an order is updated
        loadActiveOrders();
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
    socket.on('order_paid', function(data) {
        console.log('Order paid notification received:', data);
        // Force immediate refresh
        if (typeof loadActiveOrders === 'function') {
            loadActiveOrders();
        }
        if (typeof loadOrders === 'function') {
            loadOrders();
        }
    });
    
    // Dark mode setup
    setupSpreadingEffect();
    
    // ------------------ FUNCTION DEFINITIONS ------------------
    
    // Helper function to ensure payment button exists
    // Override the existing ensurePaymentButton function to prevent creating the Pay Now button
    function ensurePaymentButton() {
        // If we're using the combined approach, don't create the Pay Now button
        if (window.usingCombinedOrderAndPayment) {
            return;
        }
        
        // Check if payment button already exists
        
        // Find the order summary section
        const orderSummary = document.querySelector('.order-summary');
        if (!orderSummary) {
            return;
        }
        
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
        

        
        // Add language switcher to utilities container (before dark mode toggle)
        const darkModeContainer = utilitiesContainer.querySelector('.dark-mode-container');
        if (darkModeContainer) {
            utilitiesContainer.insertBefore(languageSwitcher, darkModeContainer);
        } else {
            utilitiesContainer.appendChild(languageSwitcher);
        }
    }
    
    function loadActiveOrders() {
        if (!tableNumber) {
            console.log("No table number set, cannot load active orders");
            return;
        }
    
        console.log(`Loading active orders for table ${tableNumber}...`);
        console.log(`Current table number: ${tableNumber}, typeof: ${typeof tableNumber}`);
    
        const authToken = generateTableAuth(tableNumber);
        console.log("🔐 Sending X-Table-Auth:", authToken);
    
        fetch(`/api/orders/table/${tableNumber}`, {
            method: 'GET',
            headers: {
                'X-Table-Auth': authToken
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            console.log(`Received ${data.length} orders from server:`, data);
    
            activeOrders = data.filter(order =>
                order.status !== 'Completed' &&
                order.status !== 'Cancelled'
            );
    
            console.log(`Filtered to ${activeOrders.length} active orders:`, activeOrders);
    
            if (activeOrders.length > 0 && activeOrders[0].created_at) {
                activeOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            }
    
            displayActiveOrders();
        })
        .catch(error => {
            console.error('Error loading active orders:', error);
            if (activeOrdersContainer) {
                activeOrdersContainer.innerHTML = `
                    <div style="color: red; padding: 20px;">
                        Error loading orders: ${error.message}
                        <button id="retry-load-orders" style="display: block; margin-top: 10px; padding: 5px 10px;">
                            Retry
                        </button>
                    </div>
                `;
    
                const retryButton = document.getElementById('retry-load-orders');
                if (retryButton) {
                    retryButton.addEventListener('click', loadActiveOrders);
                }
            }
        });
    }
    
    
    
    function displayActiveOrders() {
        if (!activeOrdersContainer) {
            console.error("Active orders container not found!");
            return;
        }
        
        console.log('Starting displayActiveOrders with:', activeOrders);
        
        // Save the Pay All Orders button if it exists
        const payAllContainer = document.querySelector('.pay-all-orders-container');
        
        // Clear container
        activeOrdersContainer.innerHTML = '';
        
        // Add the Pay All Orders button back or create a new one
        if (payAllContainer) {
            activeOrdersContainer.appendChild(payAllContainer);
        } else {
            addPayAllOrdersButton();
        }
        
        // Check if active orders exists and has items
        if (!activeOrders || activeOrders.length === 0) {
            const noOrdersMessage = document.createElement('div');
            noOrdersMessage.className = 'no-orders-message';
            noOrdersMessage.textContent = currentLanguage === 'en' ? 'No active orders' : 'Không có đơn hàng';
            activeOrdersContainer.appendChild(noOrdersMessage);
            
            // Hide the Pay All button if no orders
            const payAllButton = document.querySelector('.pay-all-orders-container');
            if (payAllButton) {
                payAllButton.style.display = 'none';
            }
            return;
        }
        
        // IMPORTANT CHANGE: No more additional filtering by table number
        // We'll display all orders in the activeOrders array
        const ordersToDisplay = activeOrders;
        
        console.log(`Displaying ${ordersToDisplay.length} orders:`, ordersToDisplay);
        
        if (ordersToDisplay.length === 0) {
            const noOrdersMessage = document.createElement('div');
            noOrdersMessage.className = 'no-orders-message';
            noOrdersMessage.textContent = currentLanguage === 'en' ? 'No active orders' : 'Không có đơn hàng';
            activeOrdersContainer.appendChild(noOrdersMessage);
            
            // Hide the Pay All button if no orders
            const payAllButton = document.querySelector('.pay-all-orders-container');
            if (payAllButton) {
                payAllButton.style.display = 'none';
            }
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
        
        // Show the Pay All button since we have orders
        const payAllButton = document.querySelector('.pay-all-orders-container');
        if (payAllButton) {
            payAllButton.style.display = 'block';
        }
        
        // Create a simple display for each order
        ordersToDisplay.forEach(order => {
            // Skip cancelled or completed orders
            if (order.status === 'Cancelled' || order.status === 'Completed') {
                console.log(`Skipping order ${order.id} with status ${order.status}`);
                return;
            }
            
            console.log(`Creating card for order ${order.id}`);
            
            const orderCard = document.createElement('div');
            orderCard.className = 'order-tracking-card';
            orderCard.style.margin = '10px 0';
            orderCard.style.padding = '15px';
            orderCard.style.backgroundColor = cardBackground;
            orderCard.style.borderRadius = '5px';
            orderCard.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            orderCard.style.color = textColor;
            
            // Add order ID data attribute for easy reference
            orderCard.dataset.orderId = order.id;
            
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
            orderStatus.style.color = 'white';
            orderStatus.textContent = translateStatus(order.status);
            orderStatus.setAttribute('data-status', order.status);
            orderStatus.className = 'translatable-status';
            
            orderHeader.appendChild(orderId);
            orderHeader.appendChild(orderStatus);
            
            // Order details
            const orderInfo = document.createElement('div');
            orderInfo.style.marginBottom = '10px';
            
            // Check if created_at exists and is a valid date
            let formattedDateTime = 'Unknown date';
            if (order.created_at) {
                try {
                    formattedDateTime = formatDateTime(order.created_at);
                } catch (e) {
                    console.error(`Error formatting date for order ${order.id}:`, e);
                }
            }
            
            // Make sure total_amount is a number
            const totalAmount = !isNaN(parseFloat(order.total_amount)) ? 
                parseFloat(order.total_amount).toFixed(2) : '0.00';
                
            orderInfo.textContent = `${formattedDateTime} - ${translations.currency}${totalAmount}`;
            
            // Items list
            const itemsList = document.createElement('div');
            itemsList.style.borderTop = `1px solid ${borderColor}`;
            itemsList.style.paddingTop = '10px';
            
            if (order.items && Array.isArray(order.items) && order.items.length > 0) {
                order.items.forEach(item => {
                    const itemElement = document.createElement('div');
                    itemElement.style.marginBottom = '10px';
                    
                    // Item name and status in one row
                    const itemHeader = document.createElement('div');
                    itemHeader.style.display = 'flex';
                    itemHeader.style.justifyContent = 'space-between';
                    itemHeader.style.marginBottom = '5px';
                    
                    const itemName = document.createElement('div');
                    const quantity = item.quantity || 1;
                    const displayName = currentLanguage === 'en' ? 
                        (item.name || 'Unknown item') : 
                        (item.name_vi || item.name || 'Unknown item');
                        
                    itemName.textContent = `${quantity}× ${displayName}`;
                    itemName.setAttribute('data-en-name', item.name || '');
                    itemName.setAttribute('data-vi-name', item.name_vi || item.name || '');
                    itemName.setAttribute('data-quantity', quantity);
                    itemName.className = 'translatable-item-name';
                    
                    const itemStatus = document.createElement('div');
                    itemStatus.style.padding = '0 5px';
                    itemStatus.style.borderRadius = '3px';
                    itemStatus.style.backgroundColor = getStatusColor(item.status || 'Pending');
                    itemStatus.style.color = 'white';
                    itemStatus.textContent = translateStatus(item.status || 'Pending');
                    itemStatus.setAttribute('data-status', item.status || 'Pending');
                    itemStatus.className = 'translatable-status';
                    
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
                        noteElement.style.borderLeft = '2px solid #e9a942';
                        noteElement.style.backgroundColor = isDarkMode ? '#3c3c3c' : '#f9f5e8';
                        noteElement.className = 'item-note-container';
                        
                        const noteLabel = document.createElement('span');
                        noteLabel.style.fontWeight = 'bold';
                        noteLabel.style.marginRight = '5px';
                        noteLabel.textContent = translations.noteLabel;
                        noteLabel.className = 'note-label';
                        noteLabel.setAttribute('data-en-text', 'Note:');
                        noteLabel.setAttribute('data-vi-text', 'Ghi chú:');
                        
                        noteElement.appendChild(noteLabel);
                        noteElement.appendChild(document.createTextNode(item.notes));
                        itemElement.appendChild(noteElement);
                    }
                    
                    itemsList.appendChild(itemElement);
                });
            } else {
                // Fallback if items is not properly formatted
                const itemElement = document.createElement('div');
                itemElement.textContent = currentLanguage === 'en' ? 
                    'Order details not available' : 
                    'Không có chi tiết đơn hàng';
                itemsList.appendChild(itemElement);
            }
            
            // Assemble card
            orderCard.appendChild(orderHeader);
            orderCard.appendChild(orderInfo);
            orderCard.appendChild(itemsList);
            
            activeOrdersContainer.appendChild(orderCard);
        });
    }
    
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
            if (!element) return;
            
            const parts = element.textContent.split(' - ');
            if (parts.length !== 2) return;
            
            const dateTimeStr = parts[0];
            const priceStr = parts[1];
            
            // Try to extract the original date
            try {
                const dateParts = dateTimeStr.match(/(\w+) (\d+), (\d+:\d+)/);
                const originalDateStr = element.getAttribute('data-original-date');
                let originalDate;
                
                if (originalDateStr) {
                    originalDate = new Date(originalDateStr);
                } else {
                    originalDate = new Date();
                    element.setAttribute('data-original-date', originalDate.toISOString());
                }
                
                // Format according to current language
                const formattedDate = formatDateTime(originalDate);
                element.textContent = `${formattedDate} - ${priceStr}`;
            } catch (e) {
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
        
        return currentLanguage === 'en' ? status : (statusTranslations[status] || status);
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
        
            options
        );
        
        return `${dateFormatted}, ${hours}:${minutes}`;
    }
    
    function updateClock() {
        if (!currentTimeElement || !currentDateElement) return;
        
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
        currentDateElement.textContent = now.toLocaleDateString(undefined, options);
       
    }
    setInterval(updateClock, 1000);
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
        
        // Update payment button text
      
        
        // Update payment translation texts
        updatePaymentTranslations(lang);
    }
    
    function updatePaymentTranslations(lang) {
        const translationMap = {
            'payment_method': {
                'en': 'Select Payment Method',
                'vi': 'Chọn Phương Thức Thanh Toán'
            },
            'card_payment': {
                'en': 'Credit/Debit Card',
                'vi': 'Thẻ Tín Dụng/Ghi Nợ'
            },
            'cash_payment': {
                'en': 'Cash Payment',
                'vi': 'Tiền Mặt'
            },
            'qr_payment': {
                'en': 'QR Code Payment',
                'vi': 'Thanh Toán QR'
            },
            'card_not_available': {
                'en': 'Card payment is not available at the moment. Please choose another payment method.',
                'vi': 'Thanh toán bằng thẻ hiện không khả dụng. Vui lòng chọn phương thức thanh toán khác.'
            },
            'cash_instruction': {
                'en': 'Please proceed to the cashier to complete your payment. Your order number is:',
                'vi': 'Vui lòng đến quầy thu ngân để hoàn tất thanh toán. Mã đơn hàng của bạn là:'
            },
            'scan_qr': {
                'en': 'Scan this QR code with your banking app or e-wallet to complete the payment.',
                'vi': 'Quét mã QR này bằng ứng dụng ngân hàng hoặc ví điện tử để hoàn tất thanh toán.'
            },
            'confirm_payment': {
                'en': 'Confirm Payment',
                'vi': 'Xác Nhận Thanh Toán'
            },
            'payment_successful': {
                'en': 'Payment Successful!',
                'vi': 'Thanh Toán Thành Công!'
            },
            'receipt_number': {
                'en': 'Receipt Number:',
                'vi': 'Số Biên Lai:'
            },
            'thank_you': {
                'en': 'Thank you for dining with us at Saigon Nouveau.',
                'vi': 'Cảm ơn bạn đã dùng bữa tại Saigon Nouveau.'
            },
            'pay_all_orders': {
                'en': 'Pay All Orders',
                'vi': 'Thanh Toán Tất Cả'
            },
            'place_order': {
                'en': 'Place Order',
                'vi': 'Đặt Hàng'
            }
        };
        
        // Update all elements with data-i18n attributes
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            if (translationMap[key] && translationMap[key][lang]) {
                element.textContent = translationMap[key][lang];
            }
        });
        
        // Update the Pay All Orders button if it exists
        const payAllButton = document.getElementById('pay-all-orders-button');
        if (payAllButton) {
            payAllButton.innerHTML = `<i class="fas fa-credit-card" style="margin-right: 8px;"></i> ${lang === 'en' ? 'Pay All Orders' : 'Thanh Toán Tất Cả'}`;
        }
    }
    
    
    function initializeTableNumber() {
        // First try to get from URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        const paramTableNumber = urlParams.get('table');
        
        if (paramTableNumber) {
            tableNumber = parseInt(paramTableNumber);
            if (tableNumberDisplay) tableNumberDisplay.textContent = tableNumber;
            localStorage.setItem('tableNumber', tableNumber);
            
            // Initialize with this table number
            if (tableNumber) {
                loadMenu();
                initializeOrderTracking();
                
                // Register device with the server
                socket.emit('register_device', {
                    role: 'customer',
                    table_number: tableNumber
                });
            }
            return;
        }
        
        // Then try to get from localStorage (saved on this device)
        const storedTableNumber = localStorage.getItem('tableNumber');
        if (storedTableNumber) {
            tableNumber = parseInt(storedTableNumber);
            if (tableNumberDisplay) tableNumberDisplay.textContent = tableNumber;
            
            // Initialize with this table number
            if (tableNumber) {
                loadMenu();
                initializeOrderTracking();
                
                // Register device with the server
                socket.emit('register_device', {
                    role: 'customer',
                    table_number: tableNumber
                });
            }
            return;
        }
        
        // If not found, show setup prompt
        showTableSetupPrompt();
    }
    // Add this function definition to your consolidated customer.js file
    function displayMenuItems() {
        // Clear container
        console.log("Menu items data:", menuItems);
        if (!menuItemsContainer) return;
        menuItemsContainer.innerHTML = '';
        
        const category = categoryFilter ? categoryFilter.value : 'All';
        const searchTerm = searchMenu ? searchMenu.value.toLowerCase() : '';
        
        // Filter items
        let filteredItems = menuItems || [];
        
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
            if (!menuItemTemplate) return;
            const menuItemElement = menuItemTemplate.content.cloneNode(true);
            
            // Set the data-id attribute on the menu-item element
            const menuItemCard = menuItemElement.querySelector('.menu-item');
            if (menuItemCard) menuItemCard.dataset.id = item.id;
            
            // Display name and description in current language - with extra safeguards
            const itemName = currentLanguage === 'en' ? 
                (item.name || `Item ${item.id}`) : 
                (item.name_vi || item.name || `Item ${item.id}`);
                
            const itemDescription = currentLanguage === 'en' ? 
                (item.description || '') : 
                (item.description_vi || item.description || '');
                
            const nameElement = menuItemElement.querySelector('.item-name');
            const descElement = menuItemElement.querySelector('.item-description');
            
            // Set content with enhanced logging
            if (nameElement) {
                console.log(`Setting name for item ${item.id} to "${itemName}"`);
                nameElement.textContent = itemName;
                
                // Important: Remove any data attributes that might be used by a translation system
                nameElement.removeAttribute('data-i18n');
                nameElement.removeAttribute('data-translate');
                
                // Set custom attributes for our specific needs
                nameElement.setAttribute('data-item-id', item.id);
                nameElement.setAttribute('data-field', 'name');
                nameElement.setAttribute('data-original-name', itemName);
            }
            
            if (descElement) {
                console.log(`Setting description for item ${item.id} to "${itemDescription}"`);
                descElement.textContent = itemDescription;
                
                // Remove translation attributes
                descElement.removeAttribute('data-i18n');
                descElement.removeAttribute('data-translate');
                
                // Set custom attributes
                descElement.setAttribute('data-item-id', item.id);
                descElement.setAttribute('data-field', 'description');
                descElement.setAttribute('data-original-desc', itemDescription);
            }
    
            // Check item availability - fix for proper boolean handling
            const isAvailable = item.available !== false; // Will handle both undefined and true as available
            
            // Handle best seller badge
            const bestSellerRibbon = menuItemElement.querySelector('.best-seller-ribbon');
            if (bestSellerRibbon) {
                if (item.best_seller) {
                    bestSellerRibbon.style.display = 'inline-block';
                } else {
                    bestSellerRibbon.style.display = 'none';
                }
            }
    
            // Handle out of stock overlay
            if (!isAvailable && menuItemCard) {
                // Create out of stock overlay
                const outOfStockOverlay = document.createElement('div');
                outOfStockOverlay.className = 'out-of-stock-overlay';
                
                const outOfStockLabel = document.createElement('div');
                outOfStockLabel.className = 'out-of-stock-label';
                outOfStockLabel.textContent = 'Out of Stock';
                
                outOfStockOverlay.appendChild(outOfStockLabel);
                menuItemCard.appendChild(outOfStockOverlay);
                
                // Disable add button and quantity controls
                const addButton = menuItemElement.querySelector('.add-to-order-button');
                if (addButton) {
                    addButton.disabled = true;
                    addButton.style.opacity = '0.5';
                    addButton.style.cursor = 'not-allowed';
                }
                
                const quantityControls = menuItemElement.querySelectorAll('.quantity-control button');
                quantityControls.forEach(button => {
                    button.disabled = true;
                    button.style.opacity = '0.5';
                    button.style.cursor = 'not-allowed';
                });
                
                const quantityInput = menuItemElement.querySelector('.quantity-input');
                if (quantityInput) {
                    quantityInput.disabled = true;
                    quantityInput.style.opacity = '0.5';
                }
            }
            
            // Handle discounted price display
            const priceContainer = menuItemElement.querySelector('.item-price-container');
            const originalPriceElement = menuItemElement.querySelector('.item-original-price');
            const currentPriceElement = menuItemElement.querySelector('.item-price');
            const discountBadge = menuItemElement.querySelector('.discount-badge');
                    
            if (item.discount_percentage > 0 && originalPriceElement && currentPriceElement && discountBadge) {
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
            } else if (currentPriceElement) {
                // Regular price display (no discount)
                if (originalPriceElement) originalPriceElement.style.display = 'none';
                currentPriceElement.textContent = `$${item.price.toFixed(2)}`;
                if (discountBadge) discountBadge.style.display = 'none';
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
                if (addButton && quantityInput) {
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
                }
                
                if (decreaseButton && quantityInput) {
                    decreaseButton.addEventListener('click', () => {
                        let qty = parseInt(quantityInput.value);
                        if (qty > 1) {
                            quantityInput.value = qty - 1;
                        }
                    });
                }
                
                if (increaseButton && quantityInput) {
                    increaseButton.addEventListener('click', () => {
                        let qty = parseInt(quantityInput.value);
                        quantityInput.value = qty + 1;
                    });
                }
            }
            
            menuItemsContainer.appendChild(menuItemElement);
        });
        
        
    }
    function showTableSetupPrompt() {
        if (!tableSetupTemplate) return;
        
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
            
            if (pinInput.value !== '1234') { // Your setup PIN
                alert(currentLanguage === 'en' ? 'Invalid setup PIN' : 'Mã PIN không hợp lệ');
                return;
            }
            
            tableNumber = parseInt(tableInput.value);
            localStorage.setItem('tableNumber', tableNumber);
            if (tableNumberDisplay) tableNumberDisplay.textContent = tableNumber;
            
            const modal = document.querySelector('.setup-modal');
            document.body.removeChild(modal);
            
            // Load data with the new table number
            loadMenu();
            initializeOrderTracking();
            
            // Register device with the server
            socket.emit('register_device', {
                role: 'customer',
                table_number: tableNumber
            });
        });
    }
    
    function loadMenu() {
        fetch('/api/menu')
        .then(response => response.json())
        .then(data => {
            console.log("Menu data loaded:", data);
            menuItems = data;
            window.menuItems = data;
            displayMenuItems();
        })
        .catch(error => console.error('Error loading menu:', error));
    }
    
    function filterMenuItems() {
        if (typeof displayMenuItems === 'function') {
            displayMenuItems();
        }
    }
    
    function addToOrder(item, quantity) {
        if (quantity < 1) {
            return;
        }
        
        // Use the current language name for the item in the cart
        const itemName = currentLanguage === 'en' ? item.name : (item.name_vi || item.name);
        
        // Store price
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
    
    function updateOrderDisplay() {
        // Clear container
        if (!orderItemsContainer) return;
        orderItemsContainer.innerHTML = '';
        
        // Calculate total
        let total = 0;
        
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
            orderItemElement.querySelector('.item-name').textContent = itemName;
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
            
            const itemPrice = item.price * item.quantity;
            total += itemPrice;
            
            orderItemElement.querySelector('.order-item-price').textContent = `$${itemPrice.toFixed(2)}`;
            
            const removeButton = orderItemElement.querySelector('.remove-item-button');
            removeButton.addEventListener('click', () => removeFromOrder(index));
            
            orderItemsContainer.appendChild(orderItemElement);
        });
        
        // Update total
        if (orderTotalElement) {
            orderTotalElement.textContent = `$${total.toFixed(2)}`;
        }
        
        // Update cart badge
        updateCartBadge();
        
        // Update button text based on the content in cart
        if (submitOrderButton) {
            if (cart.length > 0) {
                submitOrderButton.textContent = currentLanguage === 'en' ? 
                    'Place Order' : 'Đặt Hàng';
                submitOrderButton.disabled = false;
            } else {
                submitOrderButton.disabled = true;
            }
        }
    }
    
    function removeFromOrder(index) {
        cart.splice(index, 1);
        updateOrderDisplay();
    }
    
    function clearOrder() {
        cart = [];
        window.cart = cart;
        updateOrderDisplay();
    }
    function getExistingPricesFromDOM() {
        // Create a map of item name to price
        const priceMap = new Map();
        
        // Find all order items in the current order panel
        const orderItems = document.querySelectorAll('.order-item');
        
        orderItems.forEach(item => {
            // Get the item name
            const nameElement = item.querySelector('.item-name');
            // Get the price (remove $ sign and convert to float)
            const priceElement = item.querySelector('.order-item-price');
            
            if (nameElement && priceElement) {
                const name = nameElement.textContent.trim();
                const priceText = priceElement.textContent.trim();
                const price = parseFloat(priceText.replace('$', ''));
                
                if (!isNaN(price)) {
                    priceMap.set(name, price);
                }
            }
        });
        
        // Also check active orders for prices
        const activeOrderCards = document.querySelectorAll('.order-tracking-card');
        
        activeOrderCards.forEach(card => {
            // Get all item names in this card
            const itemNames = card.querySelectorAll('.translatable-item-name');
            
            itemNames.forEach(nameElement => {
                const fullText = nameElement.textContent.trim();
                // Extract quantity and name (format is "2× Item Name")
                const matches = fullText.match(/(\d+)×\s+(.+)/);
                
                if (matches && matches.length > 2) {
                    const quantity = parseInt(matches[1]);
                    const name = matches[2].trim();
                    
                    // Find the price in nearby elements or from the card
                    const infoText = card.querySelector('div:nth-child(2)').textContent;
                    const priceMatch = infoText.match(/\$(\d+\.\d+)/);
                    
                    if (priceMatch && priceMatch.length > 1) {
                        const totalPrice = parseFloat(priceMatch[1]);
                        // Divide by quantity to get unit price if not already in map
                        if (!priceMap.has(name)) {
                            priceMap.set(name, totalPrice / quantity);
                        }
                    }
                }
            });
        });
        
        console.log("Extracted prices from DOM:", Object.fromEntries(priceMap));
        return priceMap;
    }
    
    function addPayAllOrdersButton() {
        // Check if the button already exists
        if (document.getElementById('pay-all-orders-button')) {
            return; // Button already exists
        }
        
        // Find the active orders container
        const activeOrdersContainer = document.getElementById('active-orders');
        if (!activeOrdersContainer) {
            console.error('Active orders container not found');
            return;
        }
        
        // Create the button container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'pay-all-orders-container';
        buttonContainer.style.padding = '15px';
        buttonContainer.style.textAlign = 'center';
        buttonContainer.style.margin = '10px 0';
        
        // Create the button
        const payAllButton = document.createElement('button');
        payAllButton.id = 'pay-all-orders-button';
        payAllButton.className = 'primary-button';
        payAllButton.style.padding = '10px 20px';
        payAllButton.style.background = '#2ecc71';
        payAllButton.style.color = 'white';
        payAllButton.style.border = 'none';
        payAllButton.style.borderRadius = '5px';
        payAllButton.style.fontSize = '16px';
        payAllButton.style.cursor = 'pointer';
        payAllButton.style.display = 'flex';
        payAllButton.style.alignItems = 'center';
        payAllButton.style.justifyContent = 'center';
        payAllButton.style.margin = '0 auto';
        
        // Add icon to button
        payAllButton.innerHTML = `<i class="fas fa-credit-card" style="margin-right: 8px;"></i> ${currentLanguage === 'en' ? 'Pay All Orders' : 'Thanh Toán Tất Cả'}`;
        
        // Add data attributes for translation
        payAllButton.setAttribute('data-lang-en', 'Pay All Orders');
        payAllButton.setAttribute('data-lang-vi', 'Thanh Toán Tất Cả');
        
        // Add event listener
        payAllButton.addEventListener('click', payAllOrders);
        
        // Add button to container
        buttonContainer.appendChild(payAllButton);
        
        // Insert before the first child of active orders container
        if (activeOrdersContainer.firstChild) {
            activeOrdersContainer.insertBefore(buttonContainer, activeOrdersContainer.firstChild);
        } else {
            activeOrdersContainer.appendChild(buttonContainer);
        }
    }

    function submitOrder() {
        // Validate order
        if (!tableNumber) {
            alert(currentLanguage === 'en' ? 
                'Table number is not set. Please refresh and set up the device.' :
                'Số bàn chưa được thiết lập. Vui lòng làm mới và thiết lập thiết bị.');
            return;
        }
        
        if (cart.length === 0) {
            alert(currentLanguage === 'en' ? 
                'Please add at least one item to your order.' :
                'Vui lòng thêm ít nhất một món vào đơn hàng.');
            return;
        }
        
        // Prepare order data
        const orderData = {
            table_number: tableNumber,
            items: cart
        };
    
        // Send order to server
        fetch('/api/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Table-Auth': generateTableAuth(tableNumber) // Add security token
            },
            body: JSON.stringify(orderData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.id) {
                alert(currentLanguage === 'en' ? 
                    `Order #${data.id} has been placed successfully!` :
                    `Đơn hàng #${data.id} đã được đặt thành công!`);
                clearOrder();
                loadActiveOrders();
            } else {
                alert(currentLanguage === 'en' ? 
                    'Error placing order: ' + data.error :
                    'Lỗi khi đặt hàng: ' + data.error);
            }
        })
        .catch(error => {
            console.error('Error submitting order:', error);
            alert(currentLanguage === 'en' ? 
                'An error occurred while placing your order. Please try again.' :
                'Đã xảy ra lỗi khi đặt hàng. Vui lòng thử lại.');
        });
    }
    function payAllOrders() {
        console.log('Pay All Orders clicked, activeOrders:', activeOrders);
        
        // Check if there are any active orders
        if (!activeOrders || activeOrders.length === 0) {
            alert(currentLanguage === 'en' ? 
                'You have no active orders to pay for.' :
                'Bạn không có đơn hàng đang hoạt động để thanh toán.');
            return;
        }
        
        // Filter unpaid orders (all orders that aren't completed/cancelled)
        const unpaidOrders = activeOrders.filter(order => 
            order.status !== 'Completed' && 
            order.status !== 'Cancelled'
        );
        
        console.log('Filtered unpaid orders:', unpaidOrders);
        
        if (unpaidOrders.length === 0) {
            alert(currentLanguage === 'en' ? 
                'You have no unpaid orders.' :
                'Bạn không có đơn hàng chưa thanh toán.');
            return;
        }
        
        // Show the payment modal with all active orders
        showAllOrdersPaymentModal(unpaidOrders);
    }
    function refreshOrders() {
        loadActiveOrders();
    }
    function setupOrderRefresh() {
        // First load orders immediately
        loadActiveOrders();
        
        // Then set up a refresh interval (every 30 seconds)
        setInterval(loadActiveOrders, 30000);
        
        // Add a refresh button to the orders section header
        const ordersHeader = document.querySelector('.orders-tracking h2');
        if (ordersHeader) {
            const refreshButton = document.createElement('button');
            refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i>';
            refreshButton.style.marginLeft = '10px';
            refreshButton.style.background = 'transparent';
            refreshButton.style.border = 'none';
            refreshButton.style.cursor = 'pointer';
            refreshButton.style.fontSize = '16px';
            refreshButton.style.color = 'inherit';
            refreshButton.title = 'Refresh Orders';
            refreshButton.addEventListener('click', refreshOrders);
            
            ordersHeader.appendChild(refreshButton);
        }
    }
    function showAllOrdersPaymentModal(ordersToProcess) {
        // Show the modal
        const paymentModal = document.getElementById('payment-modal');
        if (!paymentModal) {
            console.error("Payment modal not found!");
            return;
        }
        
        // Reset the modal state
        const paymentMethods = paymentModal.querySelectorAll('.payment-method');
        paymentMethods.forEach(m => m.classList.remove('selected'));
        
        const paymentDetails = paymentModal.querySelectorAll('.payment-details');
        paymentDetails.forEach(detail => {
            detail.style.display = 'none';
        });
        
        const successSection = document.getElementById('payment-success');
        if (successSection) {
            successSection.style.display = 'none';
        }
        
        // Make sure we populate all order items
        updatePaymentModalWithAllOrders(ordersToProcess);
        
        // Save the orders to be processed in a global variable for later use
        window.ordersToProcess = ordersToProcess;
        
        // Show the modal
        paymentModal.style.display = 'flex';
    }
    function updatePaymentModalWithAllOrders(orders) {
        const orderItemsElement = document.getElementById('modal-order-items');
        const orderTotalElement = document.getElementById('modal-order-total');
        
        if (!orderItemsElement || !orderTotalElement) return;
        
        // Clear container
        orderItemsElement.innerHTML = '';
        
        // Calculate total for all orders
        let grandTotal = 0;
        
        console.log('Updating payment modal with orders:', orders);
        
        // Display each order
        orders.forEach(order => {
            // Create order header
            const orderHeader = document.createElement('div');
            orderHeader.className = 'modal-order-header';
            orderHeader.innerHTML = `<strong>${currentLanguage === 'en' ? 'Order' : 'Đơn hàng'} #${order.id}</strong>`;
            orderItemsElement.appendChild(orderHeader);
            
            let orderTotal = 0;
            
            // Add order items
            if (order.items && Array.isArray(order.items)) {
                order.items.forEach(item => {
                    const orderItemElement = document.createElement('div');
                    orderItemElement.className = 'modal-order-item';
                    
                    let itemName = item.name || 'Unknown Item';
                    
                    // Get the base price
                    let basePrice = 10.00; // Default fallback
                    
                    // First try to get from menuItems for most accuracy
                    if (window.menuItems && Array.isArray(window.menuItems)) {
                        // Try to find by menu_item_id first
                        if (item.menu_item_id) {
                            const menuItem = window.menuItems.find(mi => mi.id === item.menu_item_id);
                            if (menuItem) {
                                // Get the base price
                                if (menuItem.price && !isNaN(parseFloat(menuItem.price))) {
                                    basePrice = parseFloat(menuItem.price);
                                }
                                
                                // Copy discount information if available
                                if (menuItem.discount_percentage !== undefined && 
                                    item.discount_percentage === undefined) {
                                    item.discount_percentage = menuItem.discount_percentage;
                                }
                            }
                        }
                    }
                    
                    // If menuItems lookup failed, try item.price
                    if (basePrice === 10.00 && item.price !== undefined && item.price !== null) {
                        const parsedPrice = parseFloat(item.price);
                        if (!isNaN(parsedPrice) && parsedPrice > 0) {
                            basePrice = parsedPrice;
                        }
                    }
                    
                    // Calculate the final price using EXACTLY the same discount logic as the menu display
                    let finalPrice = basePrice;
                    if (item.discount_percentage > 0) {
                        finalPrice = basePrice * (1 - item.discount_percentage / 100);
                        console.log(`Discounted item: ${itemName}, Original: $${basePrice}, Discount: ${item.discount_percentage}%, Final: $${finalPrice.toFixed(2)}`);
                    }
                    
                    const quantity = parseInt(item.quantity) || 1;
                    const itemTotal = finalPrice * quantity;
                    
                    // Add to totals
                    orderTotal += itemTotal;
                    grandTotal += itemTotal;
                    
                    // Display the item with appropriate discount formatting if needed
                    if (item.discount_percentage > 0) {
                        // Calculate original total for display
                        const originalTotal = basePrice * quantity;
                        
                        orderItemElement.innerHTML = `
                            <span>${quantity}× ${itemName}</span>
                            <span>
                                <span style="text-decoration: line-through; opacity: 0.7;">$${originalTotal.toFixed(2)}</span>
                                <span style="color: #e74c3c; margin-left: 5px;">$${itemTotal.toFixed(2)}</span>
                            </span>
                        `;
                    } else {
                        orderItemElement.innerHTML = `
                            <span>${quantity}× ${itemName}</span>
                            <span>$${itemTotal.toFixed(2)}</span>
                        `;
                    }
                    
                    orderItemsElement.appendChild(orderItemElement);
                });
            }
            
            // Add a divider after each order
            const divider = document.createElement('div');
            divider.className = 'modal-order-divider';
            orderItemsElement.appendChild(divider);
        });
        
        console.log('Grand total calculated:', grandTotal);
        
        // Update grand total
        orderTotalElement.textContent = `$${grandTotal.toFixed(2)}`;
        
        // Also update QR payment amount if that section exists
        const qrPaymentTotal = document.getElementById('qr-payment-total');
        if (qrPaymentTotal) {
            qrPaymentTotal.textContent = `$${grandTotal.toFixed(2)}`;
        }
    }
    // Simple security token generator
    function generateTableAuth(tableNumber) {
        // In a real application, use a more secure method
        const timestamp = Date.now();
        return btoa(`table:${tableNumber}:time:${timestamp}`);
    }
    
    // Add the styles for spreading effect animation
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
    
    // Initialize payment system
    function initPaymentSystem() {
        // First, check if payment button already exists

        
        // Create the payment modal HTML if it doesn't exist
        if (!document.getElementById('payment-modal')) {
            const modalHTML = `
                <div id="payment-modal" class="modal">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3 data-i18n="payment_method_order">Select Payment Method to Complete Order</h3>
                            <button class="close-button">&times;</button>
                        </div>
                        <div class="modal-body">
                            <!-- Order summary will be inserted here by updatePaymentModal -->
                            
                            <div class="payment-methods">
                                <div class="payment-method" data-method="card">
                                    <div class="payment-icon">💳</div>
                                    <div class="payment-name" data-i18n="card_payment">Credit/Debit Card</div>
                                </div>
                                <div class="payment-method" data-method="cash">
                                    <div class="payment-icon">💵</div>
                                    <div class="payment-name" data-i18n="cash_payment">Cash Payment</div>
                                </div>
                                <div class="payment-method" data-method="qr">
                                    <div class="payment-icon">📱</div>
                                    <div class="payment-name" data-i18n="qr_payment">QR Code Payment</div>
                                </div>
                            </div>
                            
                            <div id="payment-details-card" class="payment-details" style="display: none;">
                                <div class="notification-card">
                                    <div class="notification-icon">ℹ️</div>
                                    <div class="notification-message" data-i18n="card_not_available">
                                        Card payment is not available at the moment. Please choose another payment method.
                                    </div>
                                </div>
                            </div>
                            
                            <div id="payment-details-cash" class="payment-details" style="display: none;">
                                <div class="notification-card">
                                    <div class="notification-icon">💵</div>
                                    <div class="notification-message" data-i18n="cash_instruction">
                                        Please proceed to the cashier to complete your payment. 
                                        Your order number is: <span id="cash-order-number"></span>
                                    </div>
                                </div>
                                <button id="confirm-cash-payment" class="primary-button" data-i18n="confirm_payment">
                                    Confirm Payment
                                </button>
                            </div>
                            
                            <div id="payment-details-qr" class="payment-details" style="display: none;">
                                <div class="qr-container">
                                    <div class="qr-code">
                                        <img src="/static/images/payment-qr.png" alt="Payment QR Code">
                                    </div>
                                    <div class="qr-instructions">
                                        <p data-i18n="Scan this QR code with your banking app or e-wallet to complete the payment">qr.</p>
                                        <p class="qr-amount">Total: <span id="qr-payment-total"></span></p>
                                    </div>
                                </div>
                                <button id="confirm-qr-payment" class="primary-button" data-i18n="confirm_payment">
                                    Confirm Payment
                                </button>
                            </div>
                            
                            <div id="payment-success" class="payment-details" style="display: none;">
                                <div class="success-animation">
                                    <div class="checkmark-circle">
                                        <div class="checkmark-circle-bg"></div>
                                        <div class="checkmark-stem"></div>
                                        <div class="checkmark-kick"></div>
                                    </div>
                                </div>
                                <h3 data-i18n="payment_successful">Payment Successful!</h3>
                                <p data-i18n="receipt_number">Receipt Number: <span id="receipt-number"></span></p>
                                <p data-i18n="thank_you">Thank you for dining with us at Saigon Nouveau.</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Add stylesheets same as before (payment system styles)
            const styleHTML = `
                <style>

                    
                    /* Modal styling */
                    .modal {
                        display: none;
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background-color: rgba(0, 0, 0, 0.7);
                        z-index: 1000;
                        align-items: center;
                        justify-content: center;
                    }
                    
                    .modal-content {
                        background-color: white;
                        width: 90%;
                        max-width: 500px;
                        border-radius: 10px;
                        overflow: hidden;
                        animation: modalFadeIn 0.3s;
                    }
                    
                    @keyframes modalFadeIn {
                        from { opacity: 0; transform: translateY(-50px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    
                    .modal-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 15px 20px;
                        background-color: #3498db;
                        color: white;
                    }
                    
                    .modal-header h3 {
                        margin: 0;
                        font-size: 18px;
                    }
                    
                    .close-button {
                        background: none;
                        border: none;
                        color: white;
                        font-size: 24px;
                        cursor: pointer;
                    }
                    
                    .modal-body {
                        padding: 20px;
                    }
                    
                    /* Payment methods */
                    .payment-methods {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 20px;
                    }
                    
                    .payment-method {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        padding: 15px 10px;
                        border: 2px solid #eee;
                        border-radius: 8px;
                        margin: 0 5px;
                        cursor: pointer;
                        transition: transform 0.2s, border-color 0.2s, background-color 0.2s;
                    }
                    
                    .payment-method:hover {
                        transform: translateY(-3px);
                        border-color: #3498db;
                        background-color: #f7fbfe;
                    }
                    
                    .payment-method.selected {
                        border-color: #3498db;
                        background-color: #ebf5fb;
                    }
                    
                    .payment-icon {
                        font-size: 24px;
                        margin-bottom: 10px;
                    }
                    
                    .payment-name {
                        text-align: center;
                        font-size: 14px;
                    }
                    
                    /* Payment details sections */
                    .payment-details {
                        margin-top: 20px;
                        padding: 15px;
                        border-radius: 8px;
                        background-color: #f5f5f5;
                    }
                    
                    /* Notification card */
                    .notification-card {
                        display: flex;
                        padding: 15px;
                        background-color: #fff;
                        border-radius: 8px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                        margin-bottom: 15px;
                    }
                    
                    .notification-icon {
                        font-size: 24px;
                        margin-right: 15px;
                    }
                    
                    /* QR code styling */
                    .qr-container {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        margin-bottom: 20px;
                    }
                    
                    .qr-code {
                        background-color: white;
                        padding: 15px;
                        border-radius: 8px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                        margin-bottom: 15px;
                    }
                    
                    .qr-code img {
                        width: 200px;
                        height: 200px;
                    }
                    
                    .qr-instructions {
                        text-align: center;
                    }
                    
                    .qr-amount {
                        font-weight: bold;
                        font-size: 18px;
                        margin-top: 10px;
                    }
                    
                    /* Success animation */
                    .success-animation {
                        display: flex;
                        justify-content: center;
                        margin: 20px 0;
                    }
                    
                    .checkmark-circle {
                        width: 80px;
                        height: 80px;
                        position: relative;
                        display: inline-block;
                        vertical-align: top;
                    }
                    
                    .checkmark-circle-bg {
                        width: 80px;
                        height: 80px;
                        border-radius: 50%;
                        background: #2ecc71;
                        position: absolute;
                    }
                    
                    .checkmark-stem {
                        position: absolute;
                        width: 3px;
                        height: 30px;
                        background-color: #fff;
                        left: 35px;
                        top: 20px;
                        transform: rotate(45deg);
                        animation: stem 0.3s ease-out;
                    }
                    
                    .checkmark-kick {
                        position: absolute;
                        width: 3px;
                        height: 15px;
                        background-color: #fff;
                        left: 28px;
                        top: 44px;
                        transform: rotate(-45deg);
                        animation: kick 0.3s ease-out;
                    }
                    
                    @keyframes stem {
                        0% { height: 0; }
                        100% { height: 30px; }
                    }
                    
                    @keyframes kick {
                        0% { width: 0; }
                        100% { width: 15px; }
                    }
                    
                    #payment-success {
                        text-align: center;
                    }
                    
                    #receipt-number {
                        font-weight: bold;
                    }
                    
                    /* Dark mode support */
                    body.dark-mode .modal-content {
                        background-color: #2c2c2c;
                        color: #f5f5f5;
                    }
                    
                    body.dark-mode .modal-header {
                        background-color: #2980b9;
                    }
                    
                    body.dark-mode .payment-method {
                        border-color: #444;
                        background-color: #333;
                    }
                    
                    body.dark-mode .payment-method:hover,
                    body.dark-mode .payment-method.selected {
                        border-color: #3498db;
                        background-color: #2c3e50;
                    }
                    
                    body.dark-mode .payment-details {
                        background-color: #333;
                    }
                    
                    body.dark-mode .notification-card {
                        background-color: #444;
                    }
                    
                    body.dark-mode .qr-code {
                        background-color: white; /* Keep white for QR visibility */
                    }
                </style>
            `;
            
            // Inject the modal HTML and styles into the document
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            document.head.insertAdjacentHTML('beforeend', styleHTML);
            
            // Add event listeners to the modal
            const paymentModal = document.getElementById('payment-modal');
            const closeButton = paymentModal.querySelector('.close-button');
            
            closeButton.addEventListener('click', function() {
                paymentModal.style.display = 'none';
            });
            
            // Close when clicking outside the modal content
            paymentModal.addEventListener('click', function(event) {
                if (event.target === paymentModal) {
                    paymentModal.style.display = 'none';
                }
            });
            
            // Add event listeners to payment methods
            const paymentMethods = paymentModal.querySelectorAll('.payment-method');
            
            paymentMethods.forEach(method => {
                method.addEventListener('click', function() {
                    // Remove selected class from all methods
                    paymentMethods.forEach(m => m.classList.remove('selected'));
                    
                    // Add selected class to this method
                    this.classList.add('selected');
                    
                    // Hide all payment details
                    const paymentDetails = paymentModal.querySelectorAll('.payment-details');
                    paymentDetails.forEach(detail => {
                        detail.style.display = 'none';
                    });
                    
                    // Show details for the selected method
                    const methodType = this.getAttribute('data-method');
                    const detailsSection = document.getElementById(`payment-details-${methodType}`);
                    
                    if (detailsSection) {
                        detailsSection.style.display = 'block';
                        
                        // If it's the card method, we'll show the notification and then after 2 seconds reset the selection
                        if (methodType === 'card') {
                            setTimeout(() => {
                                // Reset selection
                                this.classList.remove('selected');
                                detailsSection.style.display = 'none';
                            }, 3000);
                        }
                        
                        // If it's QR or cash, update the payment total
                        if (methodType === 'qr') {
                            const totalElement = document.getElementById('modal-order-total');
                            if (totalElement) {
                                document.getElementById('qr-payment-total').textContent = totalElement.textContent;
                            }
                        }
                        
                        if (methodType === 'cash') {
                            // Generate an order reference number
                            const orderRef = 'ORD-' + Date.now().toString().substr(-6);
                            document.getElementById('cash-order-number').textContent = orderRef;
                        }
                    }
                });
            });
            
            // Add event listeners to the confirm buttons
            const confirmCashButton = document.getElementById('confirm-cash-payment');
            const confirmQrButton = document.getElementById('confirm-qr-payment');
            
            if (confirmCashButton) {
                confirmCashButton.addEventListener('click', function() {
                    processPayment('cash');
                });
            }
            
            if (confirmQrButton) {
                confirmQrButton.addEventListener('click', function() {
                    processPayment('qr');
                });
            }
        }
        
        // Update order UI (combine place order & pay buttons)
        updateOrderAndPaymentUI();
        
        // Update payment modal to include order summary
        updatePaymentModal();
    }
    
    function showPaymentModal() {
                // First check if there's anything in the order
                if (cart.length === 0) {
                    alert(currentLanguage === 'en' ? 
                        'Please add items to your order before proceeding to payment.' : 
                        'Vui lòng thêm món ăn vào đơn hàng trước khi thanh toán.');
                    return;
                }
                
                // Check if we have a table number
                if (!tableNumber) {
                    alert(currentLanguage === 'en' ? 
                        'Table number is not set. Please refresh and set up the device.' : 
                        'Số bàn chưa được thiết lập. Vui lòng làm mới và thiết lập thiết bị.');
                    return;
                }
                
                // Show the modal
                const paymentModal = document.getElementById('payment-modal');
                if (!paymentModal) {
                    console.error("Payment modal not found!");
                    return;
                }
                
                // Reset the modal state
                const paymentMethods = paymentModal.querySelectorAll('.payment-method');
                paymentMethods.forEach(m => m.classList.remove('selected'));
                
                const paymentDetails = paymentModal.querySelectorAll('.payment-details');
                paymentDetails.forEach(detail => {
                    detail.style.display = 'none';
                });
                
                const successSection = document.getElementById('payment-success');
                if (successSection) {
                    successSection.style.display = 'none';
                }
                
                // Make sure we populate the order items before showing the modal
                updatePaymentModalItems();
                
                // Show the modal
                paymentModal.style.display = 'flex';
            }
            
            // Fix 1: Improved payment processing to work without API endpoint
            function processPayment(method) {
                // Check if we're processing all orders or just the current cart
                if (window.ordersToProcess && window.ordersToProcess.length > 0) {
                    const orderIds = window.ordersToProcess.map(order => order.id);
                    
                    console.log('Processing payment for orders:', orderIds);
                    
                    // Generate a receipt number
                    const receiptNumber = generateReceiptNumber();
                    
                    // Remove all these orders from activeOrders completely
                    activeOrders = activeOrders.filter(order => 
                        !orderIds.includes(order.id)
                    );
                    
                    // Show success immediately
                    showPaymentSuccess(receiptNumber);
                    
                    // Immediately clear the order tracking display
                    if (activeOrdersContainer) {
                        const noOrdersMessage = document.createElement('div');
                        noOrdersMessage.className = 'no-orders-message';
                        noOrdersMessage.textContent = currentLanguage === 'en' ? 'No active orders' : 'Không có đơn hàng';
                        
                        // Clear container but keep the Pay All Orders button if it exists
                        const payAllContainer = document.querySelector('.pay-all-orders-container');
                        activeOrdersContainer.innerHTML = '';
                        
                        if (payAllContainer) {
                            activeOrdersContainer.appendChild(payAllContainer);
                            // Hide the button since there are no orders
                            payAllContainer.style.display = 'none';
                        }
                        
                        activeOrdersContainer.appendChild(noOrdersMessage);
                    }
                    
                    // Try to mark the orders as complete on the server using individual order endpoints
                    // This is more likely to work since we know the individual order API exists
                    orderIds.forEach(orderId => {
                        try {
                            fetch(`/api/orders/${orderId}`, {
                                method: 'PUT',  // Use PUT to update order status
                                headers: {
                                    'Content-Type': 'application/json',
                                    'X-Table-Auth': generateTableAuth(tableNumber)
                                },
                                body: JSON.stringify({
                                    status: 'Completed',
                                    payment_method: method,
                                    receipt_number: receiptNumber
                                })
                            }).catch(err => {
                                console.log(`Order ${orderId} completion notification failed, but payment was processed locally:`, err);
                            });
                        } catch (e) {
                            console.log(`Error when trying to update order ${orderId}, but payment was processed locally:`, e);
                        }
                    });
                    
                    // Clear the global variable
                    window.ordersToProcess = null;
                } else {
                    alert(currentLanguage === 'en' ? 
                        'Please use the "Place Order" button to place your order first.' :
                        'Vui lòng sử dụng nút "Đặt hàng" để đặt hàng trước.');
                }
            }



// Fix 3: Improved Pay All Orders button styling and function
function addPayAllOrdersButton() {
    // Check if the button already exists
    if (document.querySelector('.pay-all-orders-container')) {
        return; // Button already exists
    }
    
    // Find the active orders container
    const activeOrdersContainer = document.getElementById('active-orders');
    if (!activeOrdersContainer) {
        console.error('Active orders container not found');
        return;
    }
    
    // Create the button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'pay-all-orders-container';
    buttonContainer.style.padding = '10px';
    buttonContainer.style.textAlign = 'center';
    buttonContainer.style.margin = '0 0 15px 0';
    buttonContainer.style.width = '100%';
    
    // Create the button
    const payAllButton = document.createElement('button');
    payAllButton.id = 'pay-all-orders-button';
    payAllButton.className = 'primary-button';
    payAllButton.style.padding = '12px 20px';
    payAllButton.style.width = '100%';
    payAllButton.style.background = '#2ecc71';
    payAllButton.style.color = 'white';
    payAllButton.style.border = 'none';
    payAllButton.style.borderRadius = '5px';
    payAllButton.style.fontSize = '16px';
    payAllButton.style.cursor = 'pointer';
    payAllButton.style.display = 'flex';
    payAllButton.style.alignItems = 'center';
    payAllButton.style.justifyContent = 'center';
    payAllButton.style.margin = '0 auto';
    
    // Add icon to button
    payAllButton.innerHTML = `<i class="fas fa-credit-card" style="margin-right: 8px;"></i> ${currentLanguage === 'en' ? 'Pay All Orders' : 'Thanh Toán Tất Cả'}`;
    
    // Add data attributes for translation
    payAllButton.setAttribute('data-lang-en', 'Pay All Orders');
    payAllButton.setAttribute('data-lang-vi', 'Thanh Toán Tất Cả');
    
    // Add event listener
    payAllButton.addEventListener('click', payAllOrders);
    
    // Add button to container
    buttonContainer.appendChild(payAllButton);
    
    // Insert at the beginning of active orders container
    activeOrdersContainer.insertBefore(buttonContainer, activeOrdersContainer.firstChild);
    
    console.log('Pay All Orders button added');
}

// Fix 4: Enhanced payAllOrders function with better filtering
function payAllOrders() {
    console.log('Pay All Orders clicked, activeOrders:', activeOrders);
    
    // Check if there are any active orders
    if (!activeOrders || activeOrders.length === 0) {
        alert(currentLanguage === 'en' ? 
            'You have no active orders to pay for.' :
            'Bạn không có đơn hàng đang hoạt động để thanh toán.');
        return;
    }
    
    // Filter unpaid orders for this table
    const unpaidOrders = activeOrders.filter(order => 
        order.table_number === tableNumber &&
        order.status !== 'Completed' && 
        order.status !== 'Cancelled'
    );
    
    console.log('Filtered unpaid orders for table', tableNumber, ':', unpaidOrders);
    
    if (unpaidOrders.length === 0) {
        alert(currentLanguage === 'en' ? 
            'You have no unpaid orders.' :
            'Bạn không có đơn hàng chưa thanh toán.');
        return;
    }
    
    // Show the payment modal with all active orders
    showAllOrdersPaymentModal(unpaidOrders);
}
    function generateReceiptNumber() {
                return 'RCP-' + Date.now().toString().substr(-6);
    }

    function showPaymentSuccess(receiptNumber) {
        // Hide all payment details
        const paymentDetails = document.querySelectorAll('.payment-details');
        paymentDetails.forEach(detail => {
            detail.style.display = 'none';
        });
        
        // Show success section
        const successSection = document.getElementById('payment-success');
        if (successSection) {
            successSection.style.display = 'block';
            
            // Set receipt number
            const receiptNumberElement = document.getElementById('receipt-number');
            if (receiptNumberElement) {
                receiptNumberElement.textContent = receiptNumber;
            }
            
            // Update success message to indicate orders have been cleared
            const thankYouElement = successSection.querySelector('[data-i18n="thank_you"]');
            if (thankYouElement) {
                thankYouElement.innerHTML = currentLanguage === 'en' ? 
                    'Thank you for dining with us at Saigon Nouveau.<br>All orders have been paid and cleared.' : 
                    'Cảm ơn bạn đã dùng bữa tại Saigon Nouveau.<br>Tất cả đơn hàng đã được thanh toán và xóa.';
            }
        }
        
        // Close the modal after a few seconds
        setTimeout(() => {
            const paymentModal = document.getElementById('payment-modal');
            if (paymentModal) {
                paymentModal.style.display = 'none';
            }
        }, 5000);
    }

    function updateOrderAndPaymentUI() {
    // Change the submit button text to reflect the new functionality
    if (submitOrderButton) {
        submitOrderButton.textContent = currentLanguage === 'en' ? 
            'Place Order' : 'Đặt Hàng';
    }
    
    // Add language data attributes to submit button if needed
    if (submitOrderButton) {
        submitOrderButton.setAttribute('data-lang-en', 'Place Order');
        submitOrderButton.setAttribute('data-lang-vi', 'Đặt Hàng');
    }
    
    // Add the pay all orders button to the active orders section
    addPayAllOrdersButton();
    
    // Update the payment modal style to accommodate the all orders view
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        .modal-order-header {
            font-weight: bold;
            margin-top: 10px;
            padding: 5px 0;
            border-bottom: 1px solid #ddd;
        }
        
        .modal-order-divider {
            height: 1px;
            background-color: #ddd;
            margin: 10px 0;
        }
        
        /* Dark mode support */
        body.dark-mode .modal-order-header {
            border-bottom-color: #555;
        }
        
        body.dark-mode .modal-order-divider {
            background-color: #555;
        }
        
        /* Make the order items scrollable if many */
        #modal-order-items {
            max-height: 200px;
            overflow-y: auto;
            margin-bottom: 15px;
            padding-right: 5px;
        }
    `;
    document.head.appendChild(styleElement);
}
    function updatePaymentModal() {
        // Update the header text
        const modalHeader = document.querySelector('#payment-modal .modal-header h3');
        if (modalHeader) {
            modalHeader.setAttribute('data-i18n', 'payment_method_order');
            modalHeader.textContent = currentLanguage === 'en' ? 
                'Select Payment Method to Complete Order' : 
                'Chọn Phương Thức Thanh Toán để Hoàn Tất Đơn Hàng';
        }
        
        // Add order summary to the modal
        const modalBody = document.querySelector('#payment-modal .modal-body');
        if (modalBody) {
            // Create order summary section
            const orderSummarySection = document.createElement('div');
            orderSummarySection.className = 'order-summary-modal';
            orderSummarySection.innerHTML = `
                <h4 data-i18n="order_summary">${currentLanguage === 'en' ? 'Order Summary' : 'Tóm Tắt Đơn Hàng'}</h4>
                <div id="modal-order-items"></div>
                <div class="modal-order-total">
                    <span data-i18n="total">${currentLanguage === 'en' ? 'Total:' : 'Tổng Cộng:'}</span>
                    <span id="modal-order-total"></span>
                </div>
            `;
            
            // Insert order summary at the beginning of modal body
            const firstChild = modalBody.firstChild;
            modalBody.insertBefore(orderSummarySection, firstChild);
            
            // Add styles for order summary
            const styleElement = document.createElement('style');
            styleElement.textContent = `
                .order-summary-modal {
                    margin-bottom: 20px;
                    padding: 15px;
                    border-radius: 8px;
                    background-color: #f8f9fa;
                    border: 1px solid #e9ecef;
                }
                
                .order-summary-modal h4 {
                    margin-top: 0;
                    margin-bottom: 10px;
                    font-size: 16px;
                    color: #495057;
                }
                
                #modal-order-items {
                    max-height: 150px;
                    overflow-y: auto;
                    margin-bottom: 10px;
                }
                
                .modal-order-item {
                    display: flex;
                    justify-content: space-between;
                    padding: 5px 0;
                    border-bottom: 1px solid #e9ecef;
                }
                
                .modal-order-total {
                    display: flex;
                    justify-content: space-between;
                    font-weight: bold;
                    padding-top: 10px;
                    font-size: 16px;
                }
                
                /* Dark mode support */
                body.dark-mode .order-summary-modal {
                    background-color: #343a40;
                    border-color: #495057;
                }
                
                body.dark-mode .order-summary-modal h4 {
                    color: #f8f9fa;
                }
                
                body.dark-mode .modal-order-item {
                    border-bottom-color: #495057;
                }
            `;
            document.head.appendChild(styleElement);
        }
    }
    function updatePaymentModalItems() {
        const orderItemsElement = document.getElementById('modal-order-items');
        const orderTotalElement = document.getElementById('modal-order-total');
        
        if (!orderItemsElement || !orderTotalElement) return;
        
        // Clear container
        orderItemsElement.innerHTML = '';
        
        // Calculate total
        let total = 0;
        
        // Display cart items
        cart.forEach(item => {
            const orderItemElement = document.createElement('div');
            orderItemElement.className = 'modal-order-item';
            
            let itemName = item.name; // Default to stored name
            
            // Try to find the menu item to get its translated name
            const menuItem = menuItems.find(mi => mi.id === item.menu_item_id);
            if (menuItem) {
                // Use language-specific name if available
                itemName = currentLanguage === 'en' ? menuItem.name : 
                         (menuItem.name_vi && currentLanguage === 'vi' ? menuItem.name_vi : 
                          menuItem.name); // Fallback to original name
            }
            
            const itemPrice = item.price * item.quantity;
            total += itemPrice;
            
            orderItemElement.innerHTML = `
                <span>${item.quantity}× ${itemName}</span>
                <span>$${itemPrice.toFixed(2)}</span>
            `;
            
            orderItemsElement.appendChild(orderItemElement);
        });
        
        // Update total
        orderTotalElement.textContent = `$${total.toFixed(2)}`;
        
        // Also update QR payment amount if that section exists
        const qrPaymentTotal = document.getElementById('qr-payment-total');
        if (qrPaymentTotal) {
            qrPaymentTotal.textContent = `$${total.toFixed(2)}`;
        }
    }
    
});