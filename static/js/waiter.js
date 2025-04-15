// Waiter.js - Handles waiter interface functionality
document.addEventListener('DOMContentLoaded', function() {
    // Initialize variables
    let orders = [];
    let selectedOrderId = null;
    const socket = io();
    
    // DOM Elements
    const ordersList = document.getElementById('orders-list');
    const statusFilter = document.getElementById('status-filter');
    const searchOrders = document.getElementById('search-orders');
    const refreshButton = document.getElementById('refresh-orders');
    const orderInfo = document.getElementById('order-info');
    const orderItemsList = document.getElementById('order-items-list');
    const markDeliveredButton = document.getElementById('mark-delivered');
    const markPaidButton = document.getElementById('mark-paid');
    
    // Templates
    const orderCardTemplate = document.getElementById('order-card-template');
    const detailItemTemplate = document.getElementById('detail-item-template');
    
    // Load initial orders
    loadOrders();
    
    // Event Listeners
    statusFilter.addEventListener('change', loadOrders);
    searchOrders.addEventListener('input', filterOrders);
    refreshButton.addEventListener('click', loadOrders);
    markDeliveredButton.addEventListener('click', markOrderDelivered);
    markPaidButton.addEventListener('click', markOrderPaid);
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
    
    // Socket.io event handlers
    socket.on('new_order', function(data) {
        // Reload orders when a new order is created
        loadOrders();
    });
    
    socket.on('order_updated', function(data) {
        // Reload orders when an order is updated
        loadOrders();
        
        // If the updated order is the currently selected one, refresh details
        if (selectedOrderId && data.order_id === selectedOrderId) {
            loadOrderDetails(selectedOrderId);
        }
    });
    
    // Functions
    function loadOrders() {
        const status = statusFilter.value;
        let url = '/api/orders';
        
        if (status !== 'All') {
            url += `?status=${status}`;
        }
        
        fetch(url)
            .then(response => response.json())
            .then(data => {
                orders = data;
                displayOrders();
            })
            .catch(error => console.error('Error loading orders:', error));
    }
    
    function displayOrders() {
        // Clear container
        ordersList.innerHTML = '';
        
        const searchTerm = searchOrders.value.toLowerCase();
        
        // Filter by search term if provided
        let filteredOrders = orders;
        if (searchTerm) {
            filteredOrders = orders.filter(order => 
                order.id.toLowerCase().includes(searchTerm) || 
                (order.customer_name && order.customer_name.toLowerCase().includes(searchTerm)) ||
                order.table_number.toString().includes(searchTerm)
            );
        }
        
        // Display orders
        filteredOrders.forEach(order => {
            const orderElement = orderCardTemplate.content.cloneNode(true);
            
            orderElement.querySelector('.order-id').textContent = `Order #${order.id}`;
            orderElement.querySelector('.order-status').textContent = order.status;
            orderElement.querySelector('.order-status').classList.add(`status-${order.status.toLowerCase().replace(' ', '-')}`);
            orderElement.querySelector('.table-number').textContent = order.table_number;
            orderElement.querySelector('.order-time').textContent = formatDateTime(order.created_at);
            orderElement.querySelector('.items-count').textContent = order.item_count;
            orderElement.querySelector('.order-amount').textContent = `$${order.total_amount.toFixed(2)}`;
            
            // Add click event to select order
            const orderCard = orderElement.querySelector('.order-card');
            orderCard.addEventListener('click', () => {
                // Deselect previous selection
                const prevSelected = document.querySelector('.order-card.selected');
                if (prevSelected) {
                    prevSelected.classList.remove('selected');
                }
                
                // Select current
                orderCard.classList.add('selected');
                selectedOrderId = order.id;
                
                // Load order details
                loadOrderDetails(order.id);
            });
            
            ordersList.appendChild(orderElement);
        });
    }
    
    function filterOrders() {
        displayOrders();
    }
    
    function loadOrderDetails(orderId) {
        fetch(`/api/orders/${orderId}`)
            .then(response => response.json())
            .then(order => {
                // Update order info
                orderInfo.innerHTML = `
                    <div class="order-detail-header">
                        <h3>Order #${order.id}</h3>
                        <span class="order-status status-${order.status.toLowerCase().replace(' ', '-')}">${order.status}</span>
                    </div>
                    <div class="order-detail-row">
                        <span class="label">Table:</span>
                        <span>${order.table_number}</span>
                    </div>
                    
                    <div class="order-detail-row">
                        <span class="label">Time:</span>
                        <span>${formatDateTime(order.created_at)}</span>
                    </div>
                    <div class="order-detail-row">
                        <span class="label">Total:</span>
                        <span>$${order.total_amount.toFixed(2)}</span>
                    </div>
                `;
                
                // Update order items
                orderItemsList.innerHTML = '';
                order.items.forEach(item => {
                    const itemElement = detailItemTemplate.content.cloneNode(true);
                    
                    itemElement.querySelector('.item-name').textContent = item.name;
                    itemElement.querySelector('.item-quantity').textContent = item.quantity;
                    
                    if (item.notes) {
                        itemElement.querySelector('.item-notes').textContent = `Note: ${item.notes}`;
                    } else {
                        itemElement.querySelector('.item-notes').style.display = 'none';
                    }
                    
                    itemElement.querySelector('.item-status').textContent = item.status;
                    itemElement.querySelector('.item-status').classList.add(`status-${item.status.toLowerCase().replace(' ', '-')}`);
                    
                    orderItemsList.appendChild(itemElement);
                });
                
                // Update buttons state
                markDeliveredButton.disabled = !(order.status === 'Ready');
                markPaidButton.disabled = !(order.status === 'Delivered');
            })
            .catch(error => console.error('Error loading order details:', error));
    }
    
    function markOrderDelivered() {
        if (!selectedOrderId) return;
        
        updateOrderStatus(selectedOrderId, 'Delivered');
    }
    
    function markOrderPaid() {
        if (!selectedOrderId) return;
        
        updateOrderStatus(selectedOrderId, 'Completed');
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
                // Reload order details
                loadOrderDetails(orderId);
            } else {
                alert('Error updating order: ' + data.error);
            }
        })
        .catch(error => {
            console.error('Error updating order:', error);
            alert('An error occurred while updating the order. Please try again.');
        });
    }
    
    // Helper function to format date and time
    function formatDateTime(dateTimeStr) {
        const date = new Date(dateTimeStr);
        return date.toLocaleString();
    }
});