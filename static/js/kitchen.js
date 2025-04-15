// Kitchen.js - Handles kitchen interface functionality with menu availability management
document.addEventListener('DOMContentLoaded', function() {
    // Initialize variables
    let orders = [];
    let menuItems = [];
    const socket = io();
    
    // DOM Elements for orders
    const kitchenOrdersContainer = document.getElementById('kitchen-orders');
    const statusFilter = document.getElementById('status-filter');
    const refreshButton = document.getElementById('refresh-orders');
    
    // DOM Elements for menu management - Need to verify these exist before using
    let menuItemsContainer = null;
    let categoryFilter = null;
    let searchMenu = null;
    let refreshMenuButton = null;
    
    // We'll initialize these elements when the tab is clicked to ensure they exist
    function initMenuManagementElements() {
        menuItemsContainer = document.getElementById('menu-items-container');
        categoryFilter = document.getElementById('category-filter');
        searchMenu = document.getElementById('search-menu');
        refreshMenuButton = document.getElementById('refresh-menu');
        
        // Add event listeners only if elements exist
        if (categoryFilter) categoryFilter.addEventListener('change', filterMenuItems);
        if (searchMenu) searchMenu.addEventListener('input', filterMenuItems);
        if (refreshMenuButton) refreshMenuButton.addEventListener('click', loadMenuItems);
    }
    
    // Templates
    const kitchenOrderTemplate = document.getElementById('kitchen-order-template');
    const kitchenItemTemplate = document.getElementById('kitchen-item-template');
    
    // Load initial orders only
    loadOrders();
    
    // We'll load menu items only when that tab is clicked
    
    // Event Listeners for orders
    statusFilter.addEventListener('change', loadOrders);
    refreshButton.addEventListener('click', loadOrders);
    
    // Listen for a custom event when the menu tab is activated
    document.addEventListener('menuTabActivated', function() {
        console.log('Menu tab activated, initializing menu management');
        initMenuManagementElements();
        loadMenuItems();
    });
    
    // If we're already on the menu tab, initialize elements
    if (document.querySelector('.tab-button[data-tab="menu"].active')) {
        initMenuManagementElements();
    }
  
    // Socket.io event handlers
    socket.on('new_order', function(data) {
        // Reload orders when a new order is created
        loadOrders();
    });
    
    socket.on('order_updated', function(data) {
        // Reload orders when an order is updated
        loadOrders();
    });
    
    socket.on('menu_updated', function(data) {
        // Reload menu items when the menu is updated
        loadMenuItems();
    });
    
    // ------------ Orders Functions ------------
    
    function loadOrders() {
        const status = statusFilter.value;
        let url = '/api/orders';
        
        if (status !== 'All') {
            url += `?status=${status}`;
        }
        
        fetch(url)
            .then(response => response.json())
            .then(data => {
                orders = data.filter(order => 
                    order.status !== 'Completed' && order.status !== 'Cancelled'
                );
                displayOrders();
            })
            .catch(error => console.error('Error loading orders:', error));
    }
    
    // Modified displayOrders function with error handling
function displayOrders() {
    // Clear container
    kitchenOrdersContainer.innerHTML = '';
    
    if (orders.length ===
 0) {
        kitchenOrdersContainer.innerHTML = '<div class="no-orders-message">No active orders</div>';
        return;
    }
    
    // Display orders
    orders.forEach(order => {
        // Fetch order details
        fetch(`/api/orders/${order.id}`)
            .then(response => {
                // Check if the response is ok before trying to parse JSON
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(orderDetails => {
                const orderElement = kitchenOrderTemplate.content.cloneNode(true);
                
                orderElement.querySelector('.order-id').textContent = `Order #${orderDetails.id}`;
                orderElement.querySelector('.table-number').textContent = `Table ${orderDetails.table_number}`;
                orderElement.querySelector('.order-time').textContent = formatTime(orderDetails.created_at);
                orderElement.querySelector('.order-status').textContent = orderDetails.status;
                orderElement.querySelector('.order-status').classList.add(`status-${orderDetails.status.toLowerCase().replace(' ', '-')}`);
                
                const itemsContainer = orderElement.querySelector('.order-items');
                
                // Add order items
                orderDetails.items.forEach(item => {
                    const itemElement = kitchenItemTemplate.content.cloneNode(true);
                    
                    const checkbox = itemElement.querySelector('.item-checkbox');
                    checkbox.checked = item.status === 'Ready';
                    checkbox.disabled = orderDetails.status === 'Ready' || orderDetails.status === 'Delivered';
                    checkbox.addEventListener('change', () => {
                        updateItemStatus(item.id, checkbox.checked ? 'Ready' : 'Pending');
                    });
                    
                    itemElement.querySelector('.item-name').textContent = item.name;
                    itemElement.querySelector('.item-quantity').textContent = item.quantity;
                    
                    if (item.notes) {
                        itemElement.querySelector('.item-notes').textContent = `Note: ${item.notes}`;
                    } else {
                        itemElement.querySelector('.item-notes').style.display = 'none';
                    }
                    
                    itemsContainer.appendChild(itemElement);
                });
                
                // Setup action buttons
                const startCookingButton = orderElement.querySelector('.start-cooking-button');
                const readyButton = orderElement.querySelector('.ready-button');
                
                startCookingButton.style.display = orderDetails.status === 'Pending' ? 'inline-block' : 'none';
                readyButton.style.display = orderDetails.status === 'In Progress' ? 'inline-block' : 'none';
                
                startCookingButton.addEventListener('click', () => {
                    updateOrderStatus(orderDetails.id, 'In Progress');
                });
                
                readyButton.addEventListener('click', () => {
                    updateOrderStatus(orderDetails.id, 'Ready');
                });
                
                kitchenOrdersContainer.appendChild(orderElement);
            })
            .catch(error => {
                console.error(`Error loading details for order ${order.id}:`, error);
                // Create a simpler order element with error message
                const errorOrderElement = document.createElement('div');
                errorOrderElement.className = 'kitchen-order error';
                errorOrderElement.innerHTML = `
                    <div class="order-header">
                        <h3 class="order-id">Order #${order.id}</h3>
                        <span class="order-status status-error">Error</span>
                    </div>
                    <div class="error-message">Failed to load order details. Please refresh or check server logs.</div>
                `;
                kitchenOrdersContainer.appendChild(errorOrderElement);
            });
    });
}
    
    function updateItemStatus(itemId, status) {
        fetch(`/api/order-items/${itemId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: status })
        })
        .then(response => response.json())
        .catch(error => console.error('Error updating item status:', error));
    }
    
    function updateOrderStatus(orderId, status) {
        fetch(`/api/orders/${orderId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: status })
        })
        .then(response => response.json())
        .then(data => {
            if (data.message) {
                // Reload orders
                loadOrders();
            } else {
                alert('Error updating order: ' + data.error);
            }
        })
        .catch(error => {
            console.error('Error updating order:', error);
            alert('An error occurred while updating the order. Please try again.');
        });
    }
    
    // Helper function to format time
    function formatTime(dateTimeStr) {
        const date = new Date(dateTimeStr);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // ------------ Menu Management Functions ------------
    
    function loadMenuItems() {
        // First check if menuItemsContainer exists
        if (!menuItemsContainer) {
            console.warn('Menu items container not found, initializing elements');
            initMenuManagementElements();
            
            // If still not found, we can't continue
            if (!menuItemsContainer) {
                console.error('Cannot find menu items container element');
                return;
            }
        }
        
        // Show loading message
        menuItemsContainer.innerHTML = '<div class="loading-message">Loading menu items...</div>';
        
        fetch('/api/menu')
            .then(response => response.json())
            .then(data => {
                menuItems = data;
                displayMenuItems();
            })
            .catch(error => {
                console.error('Error loading menu items:', error);
                if (menuItemsContainer) {
                    menuItemsContainer.innerHTML = '<div class="error-message">Error loading menu items. Please try again.</div>';
                }
            });
    }
    
    function displayMenuItems() {
        // Check if menuItemsContainer exists
        if (!menuItemsContainer) {
            console.error('Menu items container not found in displayMenuItems');
            return;
        }
        
        // Clear container
        menuItemsContainer.innerHTML = '';
        
        if (menuItems.length === 0) {
            menuItemsContainer.innerHTML = '<div class="no-items-message">No menu items found</div>';
            return;
        }
        
        // Filter items based on category and search
        const categoryValue = categoryFilter ? categoryFilter.value : 'All';
        const searchTerm = searchMenu ? searchMenu.value.toLowerCase() : '';
        
        let filteredItems = menuItems;
        
        if (categoryValue !== 'All') {
            filteredItems = filteredItems.filter(item => item.category === categoryValue);
        }
        
        if (searchTerm) {
            filteredItems = filteredItems.filter(item => 
                (item.name && item.name.toLowerCase().includes(searchTerm)) || 
                (item.description && item.description.toLowerCase().includes(searchTerm))
            );
        }
        
        // Create the menu items grid
        const menuGrid = document.createElement('div');
        menuGrid.className = 'menu-items-grid';
        
        filteredItems.forEach(item => {
            const menuItemCard = document.createElement('div');
            menuItemCard.className = 'menu-item-card';
            menuItemCard.dataset.id = item.id;
            
            // Check item availability
            // SQLite stores booleans as 0/1, but when coming through JSON they might be converted to actual booleans
            const isAvailable = item.available !== 0 && item.available !== false;
            
            menuItemCard.classList.toggle('unavailable', !isAvailable);
            
            menuItemCard.innerHTML = `
                <div class="menu-item-details">
                    <h3>${item.name}</h3>
                    <p class="item-category">${item.category}</p>
                    <p class="item-price">$${item.price.toFixed(2)}</p>
                </div>
                <div class="menu-item-controls">
                    <label class="availability-toggle">
                        <input type="checkbox" class="availability-checkbox" ${isAvailable ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                        <span class="toggle-text">${isAvailable ? 'Available' : 'Out of Stock'}</span>
                    </label>
                </div>
            `;
            
            // Add event listener to the toggle button
            const toggleCheckbox = menuItemCard.querySelector('.availability-checkbox');
            toggleCheckbox.addEventListener('change', function() {
                toggleItemAvailability(item.id, this.checked);
                
                // Update UI
                const toggleText = menuItemCard.querySelector('.toggle-text');
                toggleText.textContent = this.checked ? 'Available' : 'Out of Stock';
                menuItemCard.classList.toggle('unavailable', !this.checked);
            });
            
            menuGrid.appendChild(menuItemCard);
        });
        
        menuItemsContainer.appendChild(menuGrid);
    }
    
    function filterMenuItems() {
        // Make sure menuItemsContainer exists before trying to display
        if (menuItemsContainer) {
            displayMenuItems();
        } else {
            console.warn('Cannot filter menu items: container not found');
            initMenuManagementElements();
            if (menuItemsContainer) {
                displayMenuItems();
            }
        }
    }
    
    function toggleItemAvailability(itemId, available) {
        // Update local data first for immediate feedback
        const itemIndex = menuItems.findIndex(item => item.id === itemId);
        if (itemIndex !== -1) {
            menuItems[itemIndex].available = available ? 1 : 0;
        }
        
        // Send update to server
        fetch(`/api/menu/${itemId}/availability`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ available: available })
        })
        .then(response => response.json())
        .then(data => {
            console.log(`Item ${itemId} availability updated to ${available ? 'available' : 'unavailable'}`);
        })
        .catch(error => {
            console.error('Error updating item availability:', error);
            
            // Revert local change if update failed
            if (itemIndex !== -1) {
                menuItems[itemIndex].available = available ? 0 : 1;
                displayMenuItems(); // Refresh display
                
                // Show error message
                alert('Error updating item availability. Please try again.');
            }
        });
    }
});