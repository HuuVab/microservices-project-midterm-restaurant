// Manager.js - Handles manager interface functionality
document.addEventListener('DOMContentLoaded', function() {
    // Initialize variables
    let menuItems = [];
    let orders = [];
    const socket = io();
    
    // DOM Elements - Tabs
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    // DOM Elements - Orders Tab
    const dateFilter = document.getElementById('date-filter');
    const statusFilter = document.getElementById('status-filter');
    const applyFiltersButton = document.getElementById('apply-filters');
    const exportOrdersButton = document.getElementById('export-orders');
    const ordersList = document.getElementById('orders-list');
    
    // DOM Elements - Menu Tab
    const menuCategoryFilter = document.getElementById('menu-category-filter');
    const searchMenuItems = document.getElementById('search-menu-items');
    const refreshMenuButton = document.getElementById('refresh-menu');
    const menuItemsList = document.getElementById('menu-items-list');
    const menuItemForm = document.getElementById('menu-item-form');
    const formTitle = document.getElementById('form-title');
    const itemIdInput = document.getElementById('item-id');
    const itemNameInput = document.getElementById('item-name');
    const itemCategoryInput = document.getElementById('item-category');
    const itemDescriptionInput = document.getElementById('item-description');
    const clearFormButton = document.getElementById('clear-form');
    const deleteItemButton = document.getElementById('delete-item');
    
    // Image upload elements
    const imageInput = document.getElementById('item-image');
    const imagePreview = document.getElementById('image-preview');
    const uploadImageButton = document.getElementById('upload-image');
    const imagePathInput = document.getElementById('item-image-path');
    
    // DOM Elements - Reports Tab
    const reportType = document.getElementById('report-type');
    const generateReportButton = document.getElementById('generate-report');
    const exportReportButton = document.getElementById('export-report');
    const reportResults = document.getElementById('report-results');
    const reportChart = document.getElementById('report-chart');
    const reportData = document.getElementById('report-data');

    // DOM Elements - Promo Tab
    const promoImage = document.getElementById('promo-image');
    const promoPreview = document.getElementById('promo-preview');
    const currentPromoImg = document.getElementById('current-promo-img');
    const uploadPromoButton = document.getElementById('upload-promo');
    const promoUploadMessage = document.getElementById('promo-upload-message');
    const promoTabButton = document.querySelector('.tab-button[data-tab="promo"]');

    const batchExchangeRateInput = document.getElementById('batch-exchange-rate');
    const updateAllPricesButton = document.getElementById('update-all-prices');
    const batchUpdateMessage = document.getElementById('batch-update-message');

    const importMenuButton = document.getElementById('import-menu');
    const importModal = document.getElementById('import-modal');
    const fileImportInput = document.getElementById('file-import');
    const updateExistingCheckbox = document.getElementById('update-existing');
    const previewImportButton = document.getElementById('preview-import');
    const processImportButton = document.getElementById('process-import');
    const importPreviewDiv = document.getElementById('import-preview');
    const previewHeader = document.getElementById('preview-header');
    const totalItemsSpan = document.getElementById('total-items');
    const newItemsSpan = document.getElementById('new-items');
    const updatedItemsSpan = document.getElementById('updated-items');
    const importMessageDiv = document.getElementById('import-message');
    
    const tabsContainer = document.querySelector('.tabs');
    // Initialize charts
    let currentChart = null;
    

    // Add these event listeners in your initialization section
    if (importMenuButton) {
        importMenuButton.addEventListener('click', openImportModal);
    }

    if (importModal) {
        const closeButton = importModal.querySelector('.close-button');
        if (closeButton) {
            closeButton.addEventListener('click', closeImportModal);
        }
        
        // Close when clicking outside the modal content
        importModal.addEventListener('click', function(event) {
            if (event.target === importModal) {
                closeImportModal();
            }
        });
    }

    if (fileImportInput) {
        fileImportInput.addEventListener('change', function() {
            // Reset UI when file changes
            importPreviewDiv.style.display = 'none';
            processImportButton.disabled = true;
            importMessageDiv.textContent = '';
            importMessageDiv.className = 'message';
        });
    }

    if (previewImportButton) {
        previewImportButton.addEventListener('click', previewImport);
    }

    if (processImportButton) {
        processImportButton.addEventListener('click', processImport);
    }

    // Initialize event listeners for promo tab
    if (promoImage) {
        promoImage.addEventListener('change', function() {
            if (this.files && this.files[0]) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    promoPreview.src = e.target.result;
                };
                reader.readAsDataURL(this.files[0]);
            }
        });
    }

    if (uploadPromoButton) {
        uploadPromoButton.addEventListener('click', uploadPromoBanner);
    }

    // Setup tabs
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all tabs
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));
            
            // Add active class to selected tab
            button.classList.add('active');
            document.getElementById(`${button.dataset.tab}-tab`).classList.add('active');
            
            // Load data for the selected tab
            if (button.dataset.tab === 'orders') {
                loadOrders();
            } else if (button.dataset.tab === 'menu') {
                loadMenuItems();
            } else if (button.dataset.tab === 'promo') {
                loadCurrentPromo();
            }
        });
    });
    
    // Load initial data
    loadOrders();
    
    // Event Listeners - Orders Tab
    applyFiltersButton.addEventListener('click', loadOrders);
    exportOrdersButton.addEventListener('click', exportOrders);
    
    // Event Listeners - Menu Tab
    menuCategoryFilter.addEventListener('change', filterMenuItems);
    searchMenuItems.addEventListener('input', filterMenuItems);
    refreshMenuButton.addEventListener('click', loadMenuItems);
    clearFormButton.addEventListener('click', clearMenuForm);
    deleteItemButton.addEventListener('click', deleteMenuItem);
    
    // Form submission event listener - THIS IS CRUCIAL
    menuItemForm.addEventListener('submit', function(event) {
        event.preventDefault(); // Prevent the form from submitting normally
        saveMenuItem();
    });
    
    // Image upload event listeners
    if (imageInput) {
        imageInput.addEventListener('change', function() {
            if (this.files && this.files[0]) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    imagePreview.src = e.target.result;
                };
                reader.readAsDataURL(this.files[0]);
            }
        });
    }
    
    if (uploadImageButton) {
        uploadImageButton.addEventListener('click', uploadImage);
    }
    
    // Event Listeners - Reports Tab
    if (generateReportButton) {
        generateReportButton.addEventListener('click', generateReport);
    }
    
    if (exportReportButton) {
        exportReportButton.addEventListener('click', exportReport);
    }
    
    // Socket.io event handlers
    socket.on('new_order', function(data) {
        // Reload orders if on orders tab
        if (document.getElementById('orders-tab').classList.contains('active')) {
            loadOrders();
        }
    });
    
    socket.on('order_updated', function(data) {
        // Reload orders if on orders tab
        if (document.getElementById('orders-tab').classList.contains('active')) {
            loadOrders();
        }
    });
    
    socket.on('menu_updated', function() {
        // Reload menu items if on menu tab
        if (document.getElementById('menu-tab').classList.contains('active')) {
            loadMenuItems();
        }
    });
    
    socket.on('promo_updated', function() {
        // Reload promo if on promo tab
        if (document.getElementById('promo-tab').classList.contains('active')) {
            loadCurrentPromo();
        }
        if (tabsContainer && !document.querySelector('.tab-button[data-tab="tables"]')) {
            const tablesButton = document.createElement('button');
            tablesButton.className = 'tab-button';
            tablesButton.setAttribute('data-tab', 'tables');
            tablesButton.textContent = 'Active Tables';
            tabsContainer.appendChild(tablesButton);
            
            // Create the new tab content area
            const tabContent = document.querySelector('.tab-content');
            const tablesTab = document.createElement('div');
            tablesTab.id = 'tables-tab';
            tablesTab.className = 'tab-pane';
            tablesTab.innerHTML = `
                <div class="tables-overview">
                    <h2>Active Tables Overview</h2>
                    <div class="refresh-controls">
                        <button id="refresh-tables" class="secondary-button">Refresh Tables</button>
                        <div class="auto-refresh">
                            <label>
                                <input type="checkbox" id="auto-refresh-tables" checked>
                                Auto-refresh (30s)
                            </label>
                        </div>
                    </div>
                    <div id="active-tables-grid" class="tables-grid"></div>
                </div>
                <div id="table-details-panel" class="table-details-panel">
                    <div class="details-header">
                        <h3>Table Details</h3>
                        <button id="close-table-details" class="secondary-button">Close</button>
                    </div>
                    <div id="selected-table-details"></div>
                </div>
            `;
            tabContent.appendChild(tablesTab);
            
            // Add CSS for the new elements
            const style = document.createElement('style');
            style.textContent = `
                .tables-overview {
                    padding: 20px;
                }
                
                .refresh-controls {
                    display: flex;
                    align-items: center;
                    margin-bottom: 20px;
                }
                
                .auto-refresh {
                    margin-left: 20px;
                }
                
                .tables-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 20px;
                }
                
                .table-card {
                    background-color: #fff;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    padding: 15px;
                    position: relative;
                    transition: transform 0.2s, box-shadow 0.2s;
                    cursor: pointer;
                }
                
                .table-card:hover {
                    transform: translateY(-5px);
                    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                }
                
                .table-card h3 {
                    margin-top: 0;
                    margin-bottom: 10px;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 8px;
                }
                
                .table-status {
                    position: absolute;
                    top: 15px;
                    right: 15px;
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    background-color: #2ecc71;
                }
                
                .table-card .table-status.busy {
                    background-color: #e74c3c;
                }
                
                .table-info {
                    margin-bottom: 10px;
                }
                
                .table-info div {
                    margin: 5px 0;
                }
                
                .latest-order {
                    background-color: #f9f9f9;
                    border-radius: 4px;
                    padding: 8px;
                }
                
                .latest-order p {
                    margin: 5px 0;
                    font-size: 13px;
                }
                
                .table-actions {
                    margin-top: 10px;
                    display: flex;
                    justify-content: flex-end;
                }
                
                .table-details-panel {
                    position: fixed;
                    top: 0;
                    right: -600px;
                    width: 600px;
                    height: 100%;
                    background-color: #fff;
                    box-shadow: -2px 0 5px rgba(0,0,0,0.2);
                    padding: 20px;
                    overflow-y: auto;
                    transition: right 0.3s ease;
                    z-index: 1000;
                }
                
                .table-details-panel.active {
                    right: 0;
                }
                
                .details-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 10px;
                    border-bottom: 1px solid #eee;
                }
                
                #selected-table-details {
                    padding: 10px;
                }
                
                .table-order {
                    background-color: #f9f9f9;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    padding: 15px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                
                .table-order-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 10px;
                    padding-bottom: 5px;
                    border-bottom: 1px solid #eee;
                }
                
                .table-order-items {
                    margin-bottom: 10px;
                }
                
                .order-item {
                    display: flex;
                    justify-content: space-between;
                    margin: 5px 0;
                    padding: 5px 0;
                    border-bottom: 1px dashed #eee;
                }
                
                .item-notes {
                    font-style: italic;
                    color: #777;
                    margin-left: 20px;
                    font-size: 12px;
                }
                
                .status-badge {
                    display: inline-block;
                    padding: 3px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    color: white;
                }
                
                .status-badge.status-pending {
                    background-color: #f39c12;
                }
                
                .status-badge.status-in-progress {
                    background-color: #3498db;
                }
                
                .status-badge.status-ready {
                    background-color: #2ecc71;
                }
                
                .status-badge.status-completed {
                    background-color: #27ae60;
                }
                
                .status-badge.status-cancelled {
                    background-color: #e74c3c;
                }
                
                .status-badge.status-delivered {
                    background-color: #9b59b6;
                }
                
                /* Dark mode support */
                body.dark-mode .table-card,
                body.dark-mode .table-details-panel {
                    background-color: #2c2c2c;
                    color: #f5f5f5;
                }
                
                body.dark-mode .table-card h3 {
                    border-color: #444;
                }
                
                body.dark-mode .latest-order,
                body.dark-mode .table-order {
                    background-color: #3a3a3a;
                }
                
                body.dark-mode .table-order-header,
                body.dark-mode .details-header {
                    border-color: #444;
                }
                
                body.dark-mode .order-item {
                    border-color: #444;
                }
                
                body.dark-mode .item-notes {
                    color: #aaa;
                }
            `;
            document.head.appendChild(style);
            
            // Initialize table monitoring functionality
            initTableMonitoring();
        }
    });

    // Functions - Orders Tab
    function loadOrders() {
        const date = dateFilter.value;
        const status = statusFilter.value;
        
        let url = '/api/orders?';
        
        if (date !== 'all') {
            url += `date=${date}&`;
        }
        
        if (status !== 'All') {
            url += `status=${status}`;
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
        
        // Display orders
        orders.forEach(order => {
            const row = document.createElement('tr');
            
            row.innerHTML = `
                <td>${order.id}</td>
                <td>${order.table_number}</td>
                <td><span class="status-badge status-${order.status.toLowerCase().replace(' ', '-')}">${order.status}</span></td>
                <td>${formatDateTime(order.created_at)}</td>
                <td>${order.item_count}</td>
                <td>$${order.total_amount.toFixed(2)}</td>
                <td>
                    <button class="view-button" data-id="${order.id}">View</button>
                </td>
            `;
            
            // Add event listener to view button
            row.querySelector('.view-button').addEventListener('click', () => {
                viewOrderDetails(order.id);
            });
            
            ordersList.appendChild(row);
        });
    }
    
    function viewOrderDetails(orderId) {
        // Show order details in a modal
        fetch(`/api/orders/${orderId}`)
            .then(response => response.json())
            .then(order => {
                // Create modal
                const modal = document.createElement('div');
                modal.className = 'modal';
                
                let itemsHtml = '';
                order.items.forEach(item => {
                    itemsHtml += `
                        <tr>
                            <td>${item.name}</td>
                            <td>${item.quantity}</td>
                            <td>$${item.price.toFixed(2)}</td>
                            <td>$${(item.price * item.quantity).toFixed(2)}</td>
                            <td>${item.status}</td>
                            <td>${item.notes || '-'}</td>
                        </tr>
                    `;
                });
                
                modal.innerHTML = `
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>Order #${order.id} Details</h3>
                            <button class="close-button">&times;</button>
                        </div>
                        <div class="modal-body">
                            <div class="order-details">
                                <div class="detail-row">
                                    <span class="label">Table:</span>
                                    <span>${order.table_number}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="label">Status:</span>
                                    <span class="status-badge status-${order.status.toLowerCase().replace(' ', '-')}">${order.status}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="label">Created:</span>
                                    <span>${formatDateTime(order.created_at)}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="label">Completed:</span>
                                    <span>${order.completed_at ? formatDateTime(order.completed_at) : '-'}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="label">Total:</span>
                                    <span>$${order.total_amount.toFixed(2)}</span>
                                </div>
                            </div>
                            
                            <h4>Order Items</h4>
                            <div class="items-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Item</th>
                                            <th>Quantity</th>
                                            <th>Price</th>
                                            <th>Total</th>
                                            <th>Status</th>
                                            <th>Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${itemsHtml}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                `;
                
                document.body.appendChild(modal);
                
                // Add event listener to close button
                modal.querySelector('.close-button').addEventListener('click', () => {
                    document.body.removeChild(modal);
                });
                
                // Close modal when clicking outside
                modal.addEventListener('click', (event) => {
                    if (event.target === modal) {
                        document.body.removeChild(modal);
                    }
                });
            })
            .catch(error => console.error('Error loading order details:', error));
    }
    
    function exportOrders() {
        // Not implemented in this version
        alert('Export feature is not implemented in the current version.');
    }
    
    // Functions - Menu Tab
    function loadMenuItems() {
        fetch('/api/menu')
            .then(response => response.json())
            .then(data => {
                menuItems = data;
                displayMenuItems();
            })
            .catch(error => console.error('Error loading menu items:', error));
    }
    
    function displayMenuItems() {
        // Clear container
        menuItemsList.innerHTML = '';
        
        const category = menuCategoryFilter.value;
        const searchTerm = searchMenuItems.value.toLowerCase();
        
        // Filter items
        let filteredItems = menuItems;
        
        if (category !== 'All') {
            filteredItems = filteredItems.filter(item => item.category === category);
        }
        
        if (searchTerm) {
            filteredItems = filteredItems.filter(item => 
                item.name.toLowerCase().includes(searchTerm) || 
                (item.description && item.description.toLowerCase().includes(searchTerm))
            );
        }
        
        // Display items
        filteredItems.forEach(item => {
            const row = document.createElement('tr');
            
            // Create best seller and discount badges
            let badges = '';
            if (item.best_seller) {
                badges += '<span class="badge best-seller-badge">Best Seller</span>';
            }
            if (item.discount_percentage > 0) {
                badges += `<span class="badge discount-badge">${item.discount_percentage}% Off</span>`;
            }
            
            row.innerHTML = `
                <td>${item.id}</td>
                <td><img src="${item.image_path || '/static/images/placeholder.jpg'}" class="menu-thumb" alt="${item.name}"></td>
                <td>
                    ${item.name}
                    ${badges}
                </td>
                <td>${item.category}</td>
                <td>$${item.price.toFixed(2)}</td>
                <td>
                    <button class="edit-button" data-id="${item.id}">Edit</button>
                </td>
            `;
            
            // Add event listener to edit button
            row.querySelector('.edit-button').addEventListener('click', () => {
                editMenuItem(item);
            });
            
            menuItemsList.appendChild(row);
        });
    }
    
    function filterMenuItems() {
        displayMenuItems();
    }
    
    function editMenuItem(item) {
        console.log("Editing menu item:", item);
        formTitle.textContent = 'Edit Menu Item';
        itemIdInput.value = item.id;
        itemNameInput.value = item.name;
        itemCategoryInput.value = item.category;
        itemDescriptionInput.value = item.description || '';
        
        // Set both price fields
        document.getElementById('edit-price').value = item.price;
        
        // Set the new fields
        document.getElementById('item-best-seller').checked = item.best_seller ? true : false;
        document.getElementById('item-discount').value = item.discount_percentage || 0;
        
        // Set the image preview and path if available
        if (imagePreview && imagePathInput) {
            if (item.image_path) {
                imagePreview.src = item.image_path;
                imagePathInput.value = item.image_path;
            } else {
                imagePreview.src = '/static/images/placeholder.jpg';
                imagePathInput.value = '';
            }
        }
        
        deleteItemButton.style.display = 'inline-block';
    }
    
    function clearMenuForm() {
        formTitle.textContent = 'Add New Menu Item';
        menuItemForm.reset();
        itemIdInput.value = '';
        
        // Reset the new fields
        document.getElementById('item-best-seller').checked = false;
        document.getElementById('item-discount').value = 0;
        
        if (imagePreview && imagePathInput) {
            imagePreview.src = '/static/images/placeholder.jpg';
            imagePathInput.value = '';
        }
        
        deleteItemButton.style.display = 'none';
    }
    
    function saveMenuItem() {
        // Get form values
        const itemId = document.getElementById('item-id').value;
        const name = document.getElementById('item-name').value;
        const category = document.getElementById('item-category').value;
        const price = parseFloat(document.getElementById('edit-price').value);
        const description = document.getElementById('item-description').value;
        const imagePath = document.getElementById('item-image-path').value;
        
        // Get the new field values
        const bestSeller = document.getElementById('item-best-seller').checked;
        const discountPercentage = parseInt(document.getElementById('item-discount').value) || 0;
        
        // Calculate or get VND price
        const autoConvert = document.getElementById('auto-convert-price') ? 
            document.getElementById('auto-convert-price').checked : false;
        // Validate required fields
        if (!name || !category || isNaN(price)) {
            alert('Please fill in all required fields (Name, Category, and Price).');
            return;
        }
        
        // Validate discount percentage
        if (discountPercentage < 0 || discountPercentage > 100) {
            alert('Discount percentage must be between 0 and 100.');
            return;
        }
        
        // Prepare item data
        const itemData = {
            name: name,
            category: category,
            price: price,
            description: description,
            auto_convert: autoConvert,
            best_seller: bestSeller,
            discount_percentage: discountPercentage
        };
        
        
        // Add image path if available
        if (imagePath) {
            itemData.image_path = imagePath;
        }
        
        // Determine if this is an update or new item
        const isUpdate = !!itemId;
        
        if (isUpdate) {
            // Update existing item
            fetch(`/api/menu/${itemId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(itemData)
            })
            .then(response => response.json())
            .then(data => {
                if (data.message) {
                    alert('Menu item updated successfully!');
                    clearMenuForm();
                    loadMenuItems();
                } else {
                    alert('Error updating menu item: ' + (data.error || 'Unknown error'));
                }
            })
            .catch(error => {
                console.error('Error updating menu item:', error);
                alert('An error occurred while updating the menu item. Please try again.');
            });
        } else {
            // Create new item
            fetch('/api/menu', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(itemData)
            })
            .then(response => response.json())
            .then(data => {
                if (data.id) {
                    alert('Menu item added successfully!');
                    clearMenuForm();
                    loadMenuItems();
                } else {
                    alert('Error adding menu item: ' + (data.error || 'Unknown error'));
                }
            })
            .catch(error => {
                console.error('Error adding menu item:', error);
                alert('An error occurred while adding the menu item. Please try again.');
            });
        }
    }
    
    function uploadImage() {
        if (!imageInput || !imageInput.files || !imageInput.files[0]) {
            alert('Please select an image to upload');
            return;
        }
        
        const formData = new FormData();
        formData.append('file', imageInput.files[0]);
        
        fetch('/api/upload-image', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.path) {
                imagePathInput.value = data.path;
                alert('Image uploaded successfully');
            } else {
                alert('Error uploading image: ' + (data.error || 'Unknown error'));
            }
        })
        .catch(error => {
            console.error('Error uploading image:', error);
            alert('An error occurred while uploading the image');
        });
    }
    
    function deleteMenuItem() {
        const itemId = itemIdInput.value;
        
        if (!itemId) {
            alert('No item selected to delete.');
            return;
        }
        
        if (!confirm('Are you sure you want to delete this menu item?')) {
            return;
        }
        
        fetch(`/api/menu/${itemId}`, {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            if (data.message) {
                alert('Menu item deleted successfully!');
                clearMenuForm();
                loadMenuItems();
            } else {
                alert('Error deleting menu item: ' + (data.error || 'Unknown error'));
            }
        })
        .catch(error => {
            console.error('Error deleting menu item:', error);
            alert('An error occurred while deleting the menu item. Please try again.');
        });
    }
    
    // Functions - Reports Tab
    function generateReport() {
        const type = reportType.value;
        
        // Clear previous report
        reportData.innerHTML = '';
        if (currentChart) {
            currentChart.destroy();
        }
        
        // Show loading indicator
        reportData.innerHTML = '<div class="loading">Loading report data...</div>';
        
        // Generate report based on type
        if (type === 'daily') {
            generateDailySalesReport();
        } else if (type === 'weekly') {
            generateWeeklySalesReport();
        } else if (type === 'monthly') {
            generateMonthlySalesReport();
        } else if (type === 'popular') {
            generatePopularItemsReport();
        } else if (type === 'category') {
            generateCategoryReport();
        }
    }
    
    function generateDailySalesReport() {
        // Fetch daily sales data
        fetch('/api/reports/daily')
            .then(response => response.json())
            .then(data => {
                displayDailySalesReport(data);
            })
            .catch(error => {
                console.error('Error fetching daily sales report:', error);
                reportData.innerHTML = '<div class="error-message">Error loading report data. Please try again.</div>';
            });
    }
    
    function displayDailySalesReport(data) {
        // Clear loading indicator
        reportData.innerHTML = '';
        reportChart.innerHTML = '';
        
        // Create a container for the chart
        const chartContainer = document.createElement('div');
        chartContainer.className = 'chart-container';
        reportChart.appendChild(chartContainer);
        
        // Create the canvas inside the container
        const chartCanvas = document.createElement('canvas');
        chartCanvas.id = 'sales-chart';
        chartContainer.appendChild(chartCanvas);
        
        // Prepare data for chart
        const labels = data.map(item => item.date);
        const salesData = data.map(item => item.total_amount);
        const ordersData = data.map(item => item.order_count);
        // Create chart
        const ctx = chartCanvas.getContext('2d');
        currentChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Sales ($)',
                        data: salesData,
                        backgroundColor: 'rgba(54, 162, 235, 0.5)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Orders',
                        data: ordersData,
                        backgroundColor: 'rgba(255, 99, 132, 0.5)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1,
                        type: 'line',
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        left: 10,
                        right: 30,
                        top: 20,
                        bottom: 20
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        type: 'linear',
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Sales ($)'
                        }
                    },
                    y1: {
                        beginAtZero: true,
                        type: 'linear',
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Order Count'
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Daily Sales Report',
                        font: {
                            size: 16
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.datasetIndex === 0) {
                                    label += '$' + context.raw.toFixed(2);
                                } else {
                                    label += context.raw;
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });

        const spacer = document.createElement('div');
        spacer.style.height = '30px';
        reportChart.appendChild(spacer);
        // Display table data
        const table = document.createElement('table');
        
        // Create table header
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th>Date</th>
                <th>Orders</th>
                <th>Items Sold</th>
                <th>Total Sales</th>
                <th>Average Order Value</th>
            </tr>
        `;
        table.appendChild(thead);
        
        // Create table body
        const tbody = document.createElement('tbody');
        
        // Calculate totals
        let totalOrders = 0;
        let totalItems = 0;
        let totalSales = 0;
        
        data.forEach(day => {
            totalOrders += day.order_count;
            totalItems += day.item_count;
            totalSales += day.total_amount;
            
            const row = document.createElement('tr');
            const avgOrderValue = day.order_count > 0 ? day.total_amount / day.order_count : 0;
            
            row.innerHTML = `
                <td>${day.date}</td>
                <td>${day.order_count}</td>
                <td>${day.item_count}</td>
                <td>$${day.total_amount.toFixed(2)}</td>
                <td>$${avgOrderValue.toFixed(2)}</td>
            `;
            
            tbody.appendChild(row);
        });
        
        // Add total row
        const totalRow = document.createElement('tr');
        const overallAvg = totalOrders > 0 ? totalSales / totalOrders : 0;
        
        totalRow.classList.add('total-row');
        totalRow.innerHTML = `
            <td><strong>Total</strong></td>
            <td><strong>${totalOrders}</strong></td>
            <td><strong>${totalItems}</strong></td>
            <td><strong>$${totalSales.toFixed(2)}</strong></td>
            <td><strong>$${overallAvg.toFixed(2)}</strong></td>
        `;
        
        tbody.appendChild(totalRow);
        table.appendChild(tbody);
        
        // Add the table to report data
        reportData.appendChild(table);
    }
    
    function generateWeeklySalesReport() {
        // Fetch weekly sales data
        fetch('/api/reports/weekly')
            .then(response => response.json())
            .then(data => {
                displayWeeklySalesReport(data);
            })
            .catch(error => {
                console.error('Error fetching weekly sales report:', error);
                reportData.innerHTML = '<div class="error-message">Error loading report data. Please try again.</div>';
            });
    }
    function displayWeeklySalesReport(data) {
        // Clear loading indicator
        reportData.innerHTML = '';
        reportChart.innerHTML = '';
        
        // Create a container for the chart
        const chartContainer = document.createElement('div');
        chartContainer.className = 'chart-container';
        reportChart.appendChild(chartContainer);
        
        // Create the canvas inside the container
        const chartCanvas = document.createElement('canvas');
        chartCanvas.id = 'sales-chart';
        chartContainer.appendChild(chartCanvas);
        
        // Prepare data for chart
        const labels = data.map(item => item.week);
        const salesData = data.map(item => item.total_amount);
        const ordersData = data.map(item => item.order_count);
        
        // Create chart
        const ctx = chartCanvas.getContext('2d');
        currentChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Sales ($)',
                        data: salesData,
                        backgroundColor: 'rgba(54, 162, 235, 0.5)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Orders',
                        data: ordersData,
                        backgroundColor: 'rgba(255, 99, 132, 0.5)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1,
                        type: 'line',
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // Add this to prevent aspect ratio issues
                layout: {
                    padding: {
                        left: 10,
                        right: 30,
                        top: 20,
                        bottom: 20
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        type: 'linear',
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Sales ($)'
                        }
                    },
                    y1: {
                        beginAtZero: true,
                        type: 'linear',
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Order Count'
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Week'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Weekly Sales Report',
                        font: {
                            size: 16
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.datasetIndex === 0) {
                                    label += '$' + context.raw.toFixed(2);
                                } else {
                                    label += context.raw;
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
        const spacer = document.createElement('div');
        spacer.style.height = '30px';
        reportChart.appendChild(spacer);
        // Display table data
        const table = document.createElement('table');
        
        // Create table header
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th>Week</th>
                <th>Orders</th>
                <th>Items Sold</th>
                <th>Total Sales</th>
                <th>Average Order Value</th>
            </tr>
        `;
        table.appendChild(thead);
        
        // Create table body
        const tbody = document.createElement('tbody');
        
        // Calculate totals
        let totalOrders = 0;
        let totalItems = 0;
        let totalSales = 0;
        
        data.forEach(week => {
            totalOrders += week.order_count;
            totalItems += week.item_count;
            totalSales += week.total_amount;
            
            const row = document.createElement('tr');
            const avgOrderValue = week.order_count > 0 ? week.total_amount / week.order_count : 0;
            
            row.innerHTML = `
                <td>${week.week}</td>
                <td>${week.order_count}</td>
                <td>${week.item_count}</td>
                <td>$${week.total_amount.toFixed(2)}</td>
                <td>$${avgOrderValue.toFixed(2)}</td>
            `;
            
            tbody.appendChild(row);
        });
        
        // Add total row
        const totalRow = document.createElement('tr');
        const overallAvg = totalOrders > 0 ? totalSales / totalOrders : 0;
        
        totalRow.classList.add('total-row');
        totalRow.innerHTML = `
            <td><strong>Total</strong></td>
            <td><strong>${totalOrders}</strong></td>
            <td><strong>${totalItems}</strong></td>
            <td><strong>$${totalSales.toFixed(2)}</strong></td>
            <td><strong>$${overallAvg.toFixed(2)}</strong></td>
        `;
        
        tbody.appendChild(totalRow);
        table.appendChild(tbody);
        
        // Add the table to report data
        reportData.appendChild(table);
    }

    function generateMonthlySalesReport() {
    // Fetch monthly sales data
    fetch('/api/reports/monthly')
        .then(response => response.json())
        .then(data => {
            displayMonthlySalesReport(data);
        })
        .catch(error => {
            console.error('Error fetching monthly sales report:', error);
            reportData.innerHTML = '<div class="error-message">Error loading report data. Please try again.</div>';
        });
    }
    
    function displayMonthlySalesReport(data) {
        // Clear loading indicator
        reportData.innerHTML = '';
        
        // Display chart
        const chartCanvas = document.createElement('canvas');
        chartCanvas.id = 'sales-chart';
        chartCanvas.style.height = '350px'; // Set a fixed height
        chartCanvas.style.marginBottom = '30px'; // Add margin
        reportChart.innerHTML = '';
        reportChart.appendChild(chartCanvas);
        
        // Prepare data for chart
        const labels = data.map(item => item.month);
        const salesData = data.map(item => item.total_amount);
        const ordersData = data.map(item => item.order_count);
        
        // Create chart
        const ctx = chartCanvas.getContext('2d');
        currentChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Sales ($)',
                        data: salesData,
                        backgroundColor: 'rgba(54, 162, 235, 0.5)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Orders',
                        data: ordersData,
                        backgroundColor: 'rgba(255, 99, 132, 0.5)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1,
                        type: 'line',
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        left: 10,
                        right: 30,
                        top: 20,
                        bottom: 20
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        type: 'linear',
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Sales ($)'
                        }
                    },
                    y1: {
                        beginAtZero: true,
                        type: 'linear',
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Order Count'
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Month'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Monthly Sales Report',
                        font: {
                            size: 16
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.datasetIndex === 0) {
                                    label += '$' + context.raw.toFixed(2);
                                } else {
                                    label += context.raw;
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
        
        // Display table data
        const table = document.createElement('table');
        
        // Create table header
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th>Month</th>
                <th>Orders</th>
                <th>Items Sold</th>
                <th>Total Sales</th>
                <th>Average Order Value</th>
            </tr>
        `;
        table.appendChild(thead);
        
        // Create table body
        const tbody = document.createElement('tbody');
        
        // Calculate totals
        let totalOrders = 0;
        let totalItems = 0;
        let totalSales = 0;
        
        data.forEach(month => {
            totalOrders += month.order_count;
            totalItems += month.item_count;
            totalSales += month.total_amount;
            
            const row = document.createElement('tr');
            const avgOrderValue = month.order_count > 0 ? month.total_amount / month.order_count : 0;
            
            row.innerHTML = `
                <td>${month.month}</td>
                <td>${month.order_count}</td>
                <td>${month.item_count}</td>
                <td>$${month.total_amount.toFixed(2)}</td>
                <td>$${avgOrderValue.toFixed(2)}</td>
            `;
            
            tbody.appendChild(row);
        });
        
        // Add total row
        const totalRow = document.createElement('tr');
        const overallAvg = totalOrders > 0 ? totalSales / totalOrders : 0;
        
        totalRow.classList.add('total-row');
        totalRow.innerHTML = `
            <td><strong>Total</strong></td>
            <td><strong>${totalOrders}</strong></td>
            <td><strong>${totalItems}</strong></td>
            <td><strong>$${totalSales.toFixed(2)}</strong></td>
            <td><strong>$${overallAvg.toFixed(2)}</strong></td>
        `;
        
        tbody.appendChild(totalRow);
        table.appendChild(tbody);
        
        // Add the table to report data
        reportData.appendChild(table);
    }

    function generatePopularItemsReport() {
    // Fetch popular items data
    fetch('/api/reports/popular-items')
        .then(response => response.json())
        .then(data => {
            displayPopularItemsReport(data);
        })
        .catch(error => {
            console.error('Error fetching popular items report:', error);
            reportData.innerHTML = '<div class="error-message">Error loading report data. Please try again.</div>';
        });
    }
    function displayPopularItemsReport(data) {
        reportData.innerHTML = '';
        reportChart.innerHTML = '';
        
        // Create a container for the chart with extra height for horizontal bars
        const chartContainer = document.createElement('div');
        chartContainer.className = 'chart-container';
        chartContainer.style.height = '500px'; // Extra height for horizontal bars
        reportChart.appendChild(chartContainer);
        
        // Create the canvas inside the container
        const chartCanvas = document.createElement('canvas');
        chartCanvas.id = 'popular-items-chart';
        chartContainer.appendChild(chartCanvas);
        
        // Get top 10 items for the chart
        const topItems = data.slice(0, 10);
        
        // Prepare data for chart
        const labels = topItems.map(item => item.name);
        const quantityData = topItems.map(item => item.quantity);
        const revenueData = topItems.map(item => item.revenue);
        
        // Create chart
        const ctx = chartCanvas.getContext('2d');
        currentChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Quantity Sold',
                        data: quantityData,
                        backgroundColor: 'rgba(54, 162, 235, 0.5)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Revenue ($)',
                        data: revenueData,
                        backgroundColor: 'rgba(255, 99, 132, 0.5)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1,
                        type: 'line',
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                indexAxis: 'y', // Horizontal bars
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        right: 30 // Extra padding for the right axis
                    }
                },
                scales: {
                    y: {
                        title: {
                            display: true,
                            text: 'Menu Items'
                        }
                    },
                    x: {
                        beginAtZero: true,
                        type: 'linear',
                        title: {
                            display: true,
                            text: 'Quantity Sold'
                        }
                    },
                    y1: {
                        beginAtZero: true,
                        type: 'linear',
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Revenue ($)'
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Top 10 Most Popular Items',
                        font: {
                            size: 16
                        },
                        padding: {
                            top: 10,
                            bottom: 30
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.datasetIndex === 1) {
                                    label += '$' + context.raw.toFixed(2);
                                } else {
                                    label += context.raw;
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
        const spacer = document.createElement('div');
        spacer.style.height = '30px';
        reportChart.appendChild(spacer);
        // Display table data
        const table = document.createElement('table');
        
        // Create table header
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th>Rank</th>
                <th>Item</th>
                <th>Category</th>
                <th>Quantity Sold</th>
                <th>Total Revenue</th>
                <th>% of Total Sales</th>
            </tr>
        `;
        table.appendChild(thead);
        
        // Create table body
        const tbody = document.createElement('tbody');
        
        // Calculate total revenue
        const totalRevenue = data.reduce((sum, item) => sum + item.revenue, 0);
        
        data.forEach((item, index) => {
            const row = document.createElement('tr');
            const percentOfSales = (item.revenue / totalRevenue) * 100;
            
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${item.name}</td>
                <td>${item.category}</td>
                <td>${item.quantity}</td>
                <td>$${item.revenue.toFixed(2)}</td>
                <td>${percentOfSales.toFixed(2)}%</td>
            `;
            
            tbody.appendChild(row);
        });
        
        table.appendChild(tbody);
        
        // Add the table to report data
        reportData.appendChild(table);
    }

    function generateCategoryReport() {
    // Fetch category report data
    fetch('/api/reports/category')
        .then(response => response.json())
        .then(data => {
            displayCategoryReport(data);
        })
        .catch(error => {
            console.error('Error fetching category report:', error);
            reportData.innerHTML = '<div class="error-message">Error loading report data. Please try again.</div>';
        });
    }
    function displayCategoryReport(data) {
        // Clear loading indicator
        reportData.innerHTML = '';
        reportChart.innerHTML = '';
        
        // Create a container for the bar chart
        const chartContainer = document.createElement('div');
        chartContainer.className = 'chart-container';
        reportChart.appendChild(chartContainer);
        
        // Create the canvas inside the container
        const chartCanvas = document.createElement('canvas');
        chartCanvas.id = 'category-chart';
        chartContainer.appendChild(chartCanvas);
        
        // Prepare data for chart
        const labels = data.map(item => item.category);
        const revenueData = data.map(item => item.revenue);
        const itemCountData = data.map(item => item.item_count);
        
        // Create chart with multiple chart types
        const ctx = chartCanvas.getContext('2d');
        currentChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Revenue ($)',
                        data: revenueData,
                        backgroundColor: 'rgba(54, 162, 235, 0.5)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Items Sold',
                        data: itemCountData,
                        backgroundColor: 'rgba(255, 99, 132, 0.5)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1,
                        type: 'line',
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        type: 'linear',
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Revenue ($)'
                        }
                    },
                    y1: {
                        beginAtZero: true,
                        type: 'linear',
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Items Sold'
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Sales by Category',
                        font: {
                            size: 16
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.datasetIndex === 0) {
                                    label += '$' + context.raw.toFixed(2);
                                } else {
                                    label += context.raw;
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });

        const spacer1 = document.createElement('div');
        spacer1.style.height = '30px';
        reportChart.appendChild(spacer1);

        const pieContainer = document.createElement('div');
        pieContainer.className = 'pie-chart-container';
        pieContainer.style.height = '400px';
        reportChart.appendChild(pieContainer);
        
        // Add a title for the pie chart
        const pieTitle = document.createElement('h3');
        pieTitle.textContent = 'Revenue Distribution by Category';
        pieTitle.style.textAlign = 'center';
        pieTitle.style.marginBottom = '20px';
        pieContainer.appendChild(pieTitle);
        
        // Create the pie chart canvas
        const pieCanvas = document.createElement('canvas');
        pieCanvas.id = 'category-pie-chart';
        pieContainer.appendChild(pieCanvas);
        
        // Calculate total revenue for percentages
        const totalRevenue = data.reduce((sum, item) => sum + item.revenue, 0);
        
        // Create pie chart colors
        const backgroundColors = [
            'rgba(255, 99, 132, 0.7)',
            'rgba(54, 162, 235, 0.7)',
            'rgba(255, 206, 86, 0.7)',
            'rgba(75, 192, 192, 0.7)',
            'rgba(153, 102, 255, 0.7)',
            'rgba(255, 159, 64, 0.7)',
            'rgba(199, 199, 199, 0.7)',
            'rgba(83, 102, 255, 0.7)',
            'rgba(40, 159, 64, 0.7)',
            'rgba(210, 199, 199, 0.7)'
        ];
        
        const pieCtx = pieCanvas.getContext('2d');
        new Chart(pieCtx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: revenueData,
                    backgroundColor: backgroundColors,
                    borderColor: 'white',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: false // Title is now a separate HTML element
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const percentage = ((context.raw / totalRevenue) * 100).toFixed(2);
                                return `${context.label}: $${context.raw.toFixed(2)} (${percentage}%)`;
                            }
                        }
                    },
                    legend: {
                        position: 'right'
                    }
                }
            }
        });

        const spacer2 = document.createElement('div');
        spacer2.style.height = '50px';
        reportChart.appendChild(spacer2);
        
        // Display table data
        const table = document.createElement('table');
        
        // Create table header
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th>Category</th>
                <th>Items Sold</th>
                <th>Revenue</th>
                <th>Average Price</th>
                <th>% of Total Revenue</th>
            </tr>
        `;
        table.appendChild(thead);
        
        // Create table body
        const tbody = document.createElement('tbody');
        
        // Calculate totals
        let totalItems = 0;
        let totalSales = 0;
        
        data.forEach(category => {
            totalItems += category.item_count;
            totalSales += category.revenue;
            
            const row = document.createElement('tr');
            const percentOfRevenue = (category.revenue / totalRevenue) * 100;
            const avgPrice = category.item_count > 0 ? category.revenue / category.item_count : 0;
            
            row.innerHTML = `
                <td>${category.category}</td>
                <td>${category.item_count}</td>
                <td>$${category.revenue.toFixed(2)}</td>
                <td>$${avgPrice.toFixed(2)}</td>
                <td>${percentOfRevenue.toFixed(2)}%</td>
            `;
            
            tbody.appendChild(row);
        });
        
        // Add total row
        const totalRow = document.createElement('tr');
        const overallAvg = totalItems > 0 ? totalSales / totalItems : 0;
        
        totalRow.classList.add('total-row');
        totalRow.innerHTML = `
            <td><strong>Total</strong></td>
            <td><strong>${totalItems}</strong></td>
            <td><strong>$${totalSales.toFixed(2)}</strong></td>
            <td><strong>$${overallAvg.toFixed(2)}</strong></td>
            <td><strong>100%</strong></td>
        `;
        
        tbody.appendChild(totalRow);
        table.appendChild(tbody);
        
        // Add the table to report data
        reportData.appendChild(table);
    }
    function exportReport() {
        const type = reportType.value;
        const format = prompt('Select export format (CSV or PDF):', 'CSV');
        
        if (!format || (format.toUpperCase() !== 'CSV' && format.toUpperCase() !== 'PDF')) {
            alert('Please select a valid format: CSV or PDF');
            return;
        }
        
        // For CSV export
        if (format.toUpperCase() === 'CSV') {
            fetch(`/api/reports/export?type=${type}&format=csv`, {
                method: 'GET'
            })
            .then(response => response.blob())
            .then(blob => {
                // Create a download link and trigger it
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${type}_report.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
            })
            .catch(error => {
                console.error('Error exporting report:', error);
                alert('Error exporting report. Please try again.');
            });
        } else if (format.toUpperCase() === 'PDF') {
            // For PDF export - this would typically use a library like jsPDF
            // For this implementation, we'll use a server-side endpoint
            
            fetch(`/api/reports/export?type=${type}&format=pdf`, {
                method: 'GET'
            })
            .then(response => response.blob())
            .then(blob => {
                // Create a download link and trigger it
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${type}_report.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
            })
            .catch(error => {
                console.error('Error exporting report as PDF:', error);
                alert('Error exporting report as PDF. Please try again.');
            });
        }
    }

    // Functions - Promo Tab
    function loadCurrentPromo() {
        if (!currentPromoImg) return;

        fetch('/api/promo/current')
            .then(response => response.json())
            .then(data => {
                if (data.image_path) {
                    currentPromoImg.src = data.image_path + '?t=' + new Date().getTime(); // Add timestamp to prevent caching
                }
            })
            .catch(error => {
                console.error('Error loading current promotion:', error);
                // Set a default image if there's an error
                if (currentPromoImg) {
                    currentPromoImg.src = '/static/images/placeholder.jpg';
                }
            });
    }

    function uploadPromoBanner() {
        if (!promoImage || !promoImage.files || !promoImage.files[0]) {
            if (promoUploadMessage) {
                promoUploadMessage.textContent = 'Please select an image to upload';
                promoUploadMessage.className = 'message error';
            }
            return;
        }
        
        const formData = new FormData();
        formData.append('file', promoImage.files[0]);
        
        // Disable button during upload
        if (uploadPromoButton) {
            uploadPromoButton.disabled = true;
        }
        
        if (promoUploadMessage) {
            promoUploadMessage.textContent = 'Uploading...';
            promoUploadMessage.className = 'message info';
        }
        
        fetch('/api/promo/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.path) {
                if (promoUploadMessage) {
                    promoUploadMessage.textContent = 'Promotional banner updated successfully!';
                    promoUploadMessage.className = 'message success';
                }
                
                // Update current promo preview
                if (currentPromoImg) {
                    currentPromoImg.src = data.path + '?t=' + new Date().getTime(); // Add timestamp to prevent caching
                }
                
                // Reset file input
                if (promoImage) {
                    promoImage.value = '';
                }
            } else {
                if (promoUploadMessage) {
                    promoUploadMessage.textContent = 'Error uploading banner: ' + (data.error || 'Unknown error');
                    promoUploadMessage.className = 'message error';
                }
            }
        })
        .catch(error => {
            console.error('Error uploading banner:', error);
            if (promoUploadMessage) {
                promoUploadMessage.textContent = 'Error uploading banner: ' + error.message;
                promoUploadMessage.className = 'message error';
            }
        })
        .finally(() => {
            // Re-enable button
            if (uploadPromoButton) {
                uploadPromoButton.disabled = false;
            }
        });
    }
    
    // Import/Export Functions
    function openImportModal() {
        importModal.style.display = 'flex';
        // Reset the form
        fileImportInput.value = '';
        importPreviewDiv.style.display = 'none';
        processImportButton.disabled = true;
        importMessageDiv.textContent = '';
        importMessageDiv.className = 'message';
    }

    function closeImportModal() {
        importModal.style.display = 'none';
    }
    
    function previewImport() {
        const file = fileImportInput.files[0];
        if (!file) {
            importMessageDiv.textContent = 'Please select a file to import.';
            importMessageDiv.className = 'message error';
            return;
        }
        
        const fileType = file.name.split('.').pop().toLowerCase();
        if (fileType !== 'xlsx' && fileType !== 'csv') {
            importMessageDiv.textContent = 'Please select a valid Excel (.xlsx) or CSV file.';
            importMessageDiv.className = 'message error';
            return;
        }
        
        // Show loading message
        importMessageDiv.textContent = 'Reading file...';
        importMessageDiv.className = 'message info';
        
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                let data;
                if (fileType === 'csv') {
                    // Parse CSV
                    const csvText = e.target.result;
                    data = parseCSV(csvText);
                } else {
                    // Parse Excel
                    const arrayBuffer = e.target.result;
                    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    data = XLSX.utils.sheet_to_json(firstSheet);
                }
                
                // Validate the data
                if (!data || data.length === 0) {
                    throw new Error('No data found in the file.');
                }
                
                // Check if required columns exist
                const requiredColumns = ['Name', 'Price($)', 'Type'];
                const firstItem = data[0];
                
                for (const column of requiredColumns) {
                    if (!(column in firstItem)) {
                        throw new Error(`Required column '${column}' is missing from the file.`);
                    }
                }
                
                // Show preview
                showPreview(data);
                
                // Enable import button
                processImportButton.disabled = false;
                
                // Clear message
                importMessageDiv.textContent = '';
                importMessageDiv.className = 'message';
            } catch (error) {
                console.error('Error parsing file:', error);
                importMessageDiv.textContent = 'Error: ' + error.message;
                importMessageDiv.className = 'message error';
                importPreviewDiv.style.display = 'none';
                processImportButton.disabled = true;
            }
        };
        
        reader.onerror = function() {
            importMessageDiv.textContent = 'Error reading the file.';
            importMessageDiv.className = 'message error';
        };
        
        if (fileType === 'csv') {
            reader.readAsText(file);
        } else {
            reader.readAsArrayBuffer(file);
        }
    }
    
    function parseCSV(csvText) {
        // Use PapaParse if available
        if (typeof Papa !== 'undefined') {
            const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });
            return result.data;
        }
        
        // Simple CSV parser as fallback
        const lines = csvText.split('\n');
        const headers = lines[0].split(',').map(header => header.trim().replace(/^"(.*)"$/, '$1'));
        
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = lines[i].split(',').map(value => value.trim().replace(/^"(.*)"$/, '$1'));
            
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index];
            });
            
            data.push(row);
        }
        
        return data;
    }

    function showPreview(data) {
        // Show the preview container
        importPreviewDiv.style.display = 'block';
        
        // Get column headers from the first item
        const firstItem = data[0];
        const columns = Object.keys(firstItem);
        
        // Create header row
        let headerHtml = '<tr>';
        columns.forEach(column => {
            headerHtml += `<th>${column}</th>`;
        });
        headerHtml += '</tr>';
        previewHeader.innerHTML = headerHtml;
        
        // Create data rows (max 5 for preview)
        let dataHtml = '';
        const previewItems = data.slice(0, 5);
        previewItems.forEach(item => {
            let rowHtml = '<tr>';
            columns.forEach(column => {
                rowHtml += `<td>${item[column] !== undefined ? item[column] : ''}</td>`;
            });
            rowHtml += '</tr>';
            dataHtml += rowHtml;
        });
        
        // Make sure we're assigning to the correct element
        document.getElementById('preview-data').innerHTML = dataHtml;
        
        // Update stats
        totalItemsSpan.textContent = data.length;
        
        // Fetch existing menu items to check what's new vs updated
        fetch('/api/menu')
            .then(response => response.json())
            .then(existingItems => {
                const existingIds = existingItems.map(item => item.id);
                
                let newCount = 0;
                let updateCount = 0;
                
                data.forEach(item => {
                    if (item.ID && existingIds.includes(parseInt(item.ID))) {
                        updateCount++;
                    } else {
                        newCount++;
                    }
                });
                
                newItemsSpan.textContent = newCount;
                updatedItemsSpan.textContent = updateCount;
            })
            .catch(error => {
                console.error('Error checking existing items:', error);
                newItemsSpan.textContent = 'unknown';
                updatedItemsSpan.textContent = 'unknown';
            });
    }

    function processImport() {
        const file = fileImportInput.files[0];
        if (!file) {
            importMessageDiv.textContent = 'Please select a file to import.';
            importMessageDiv.className = 'message error';
            return;
        }
        
        // Disable buttons during import
        previewImportButton.disabled = true;
        processImportButton.disabled = true;
        
        // Show loading message
        importMessageDiv.textContent = 'Importing data...';
        importMessageDiv.className = 'message info';
        
        // Create form data
        const formData = new FormData();
        formData.append('file', file);
        formData.append('update_existing', updateExistingCheckbox.checked);
        
        // Send to backend
        fetch('/api/menu/import', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                throw new Error(data.error);
            }
            
            importMessageDiv.textContent = `Import successful! ${data.imported} items imported, ${data.updated} items updated.`;
            importMessageDiv.className = 'message success';
            
            // Reload menu items to show the changes
            loadMenuItems();
            
            // Re-enable buttons
            previewImportButton.disabled = false;
            processImportButton.disabled = false;
            
            // Auto-close after 3 seconds
            setTimeout(() => {
                closeImportModal();
            }, 3000);
        })
        .catch(error => {
            console.error('Error importing data:', error);
            importMessageDiv.textContent = 'Error: ' + error.message;
            importMessageDiv.className = 'message error';
            
            // Re-enable buttons
            previewImportButton.disabled = false;
            processImportButton.disabled = false;
        });
    }

    // Batch update all VND prices
    if (updateAllPricesButton) {
        updateAllPricesButton.addEventListener('click', function() {
            const exchangeRate = parseFloat(batchExchangeRateInput.value);
            
            if (isNaN(exchangeRate) || exchangeRate <= 0) {
                batchUpdateMessage.textContent = 'Please enter a valid exchange rate';
                batchUpdateMessage.className = 'message error';
                return;
            }
            
            if (!confirm(`Are you sure you want to update ALL menu item VND prices using the exchange rate: 1 USD = ${exchangeRate} VND?`)) {
                return;
            }
            
            fetch('/api/menu/update-all-vnd-prices', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    exchange_rate: exchangeRate
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    throw new Error(data.error);
                }
                
                batchUpdateMessage.textContent = data.message;
                batchUpdateMessage.className = 'message success';
                
                // Reload menu items to reflect changes
                loadMenuItems();
            })
            .catch(error => {
                console.error('Error updating prices:', error);
                batchUpdateMessage.textContent = 'Error: ' + error.message;
                batchUpdateMessage.className = 'message error';
            });
        });
    }
    
    // Helper functions
    function formatDateTime(dateTimeStr) {
        const date = new Date(dateTimeStr);
        return date.toLocaleString();
    }
    
    function formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString();
    }
    let uiTranslations = {};
let menuTranslations = {};

// Load translations when translations tab is selected
function loadTranslations() {
    // Load UI translations
    fetch('/api/translations/ui')
        .then(response => response.json())
        .then(data => {
            uiTranslations = data;
            displayUITranslations();
        })
        .catch(error => console.error('Error loading UI translations:', error));
    
    // Load menu translations
    fetch('/api/translations/menu')
        .then(response => response.json())
        .then(data => {
            menuTranslations = data;
            displayMenuTranslations();
        })
        .catch(error => console.error('Error loading menu translations:', error));
}

function displayUITranslations() {
    const tbody = document.getElementById('ui-translations-list');
    if (!tbody) return;
    
    // Clear container
    tbody.innerHTML = '';
    
    // Filter translations if needed
    const languageFilter = document.getElementById('translation-language-filter').value;
    const searchTerm = document.getElementById('search-translations').value.toLowerCase();
    
    // Get all unique keys
    const keys = Object.keys(uiTranslations.en || {});
    
    // Filter keys based on search term
    let filteredKeys = keys;
    if (searchTerm) {
        filteredKeys = keys.filter(key => {
            // Search in key
            if (key.toLowerCase().includes(searchTerm)) return true;
            
            // Search in translations
            for (const lang in uiTranslations) {
                const translation = uiTranslations[lang][key];
                if (translation && translation.toLowerCase().includes(searchTerm)) {
                    return true;
                }
            }
            
            return false;
        });
    }
    
    // Create rows for each key
    filteredKeys.forEach(key => {
        const row = document.createElement('tr');
        
        // Create cells
        row.innerHTML = `
            <td>${key}</td>
            <td>${uiTranslations.en[key] || ''}</td>
            <td>${uiTranslations.vi?.[key] || ''}</td>
            <td>${uiTranslations.ko?.[key] || ''}</td>
            <td>${uiTranslations.zh?.[key] || ''}</td>
            <td>${uiTranslations.fr?.[key] || ''}</td>
            <td>
                <button class="edit-button" data-key="${key}" data-type="ui">Edit</button>
            </td>
        `;
        
        // Add event listener for edit button
        row.querySelector('.edit-button').addEventListener('click', function() {
            openTranslationModal(this.getAttribute('data-key'), this.getAttribute('data-type'));
        });
        
        tbody.appendChild(row);
    });
}

function displayMenuTranslations() {
    const tbody = document.getElementById('menu-translations-list');
    if (!tbody) return;
    
    // Clear container
    tbody.innerHTML = '';
    
    // Filter translations if needed
    const languageFilter = document.getElementById('translation-language-filter').value;
    const searchTerm = document.getElementById('search-translations').value.toLowerCase();
    
    // Get all menu items
    const menuItems = Object.keys(menuTranslations.items || {});
    
    // Filter menu items based on search term
    let filteredItems = menuItems;
    if (searchTerm) {
        filteredItems = menuItems.filter(itemId => {
            const item = menuTranslations.items[itemId];
            
            // Search in item ID
            if (itemId.toLowerCase().includes(searchTerm)) return true;
            
            // Search in item name
            if (item.name?.en?.toLowerCase().includes(searchTerm)) return true;
            
            // Search in translations
            for (const field in item) {
                for (const lang in item[field]) {
                    if (lang === 'en') continue; // Skip English as we already checked it
                    
                    const translation = item[field][lang];
                    if (translation && translation.toLowerCase().includes(searchTerm)) {
                        return true;
                    }
                }
            }
            
            return false;
        });
    }
    
    // Create rows for each menu item and field
    filteredItems.forEach(itemId => {
        const item = menuTranslations.items[itemId];
        
        // Create a row for each translatable field (name, description)
        for (const field of ['name', 'description']) {
            if (!item[field]) continue;
            
            const row = document.createElement('tr');
            
            // Create cells
            row.innerHTML = `
                <td>${itemId}</td>
                <td>${item.name?.en || 'Unknown'}</td>
                <td>${field}</td>
                <td>${item[field]?.en || ''}</td>
                <td>${item[field]?.vi || ''}</td>
                <td>${item[field]?.ko || ''}</td>
                <td>${item[field]?.zh || ''}</td>
                <td>${item[field]?.fr || ''}</td>
                <td>
                    <button class="edit-button" data-key="${itemId}" data-type="menu" data-field="${field}">Edit</button>
                </td>
            `;
            
            // Add event listener for edit button
            row.querySelector('.edit-button').addEventListener('click', function() {
                openTranslationModal(
                    this.getAttribute('data-key'),
                    this.getAttribute('data-type'),
                    this.getAttribute('data-field')
                );
            });
            
            tbody.appendChild(row);
        }
    });
}

function openTranslationModal(key, type, field = null) {
    const modal = document.getElementById('translation-modal');
    const form = document.getElementById('translation-form');
    const keyInput = document.getElementById('translation-key');
    const typeInput = document.getElementById('translation-type');
    const fieldInput = document.getElementById('translation-field');
    const enInput = document.getElementById('translation-english');
    const viInput = document.getElementById('translation-vietnamese');
    const koInput = document.getElementById('translation-korean');
    const zhInput = document.getElementById('translation-chinese');
    const frInput = document.getElementById('translation-french');
    
    // Set form values
    keyInput.value = key;
    typeInput.value = type;
    if (field) fieldInput.value = field;
    
    // Get translation values
    if (type === 'ui') {
        enInput.value = uiTranslations.en?.[key] || '';
        viInput.value = uiTranslations.vi?.[key] || '';
        koInput.value = uiTranslations.ko?.[key] || '';
        zhInput.value = uiTranslations.zh?.[key] || '';
        frInput.value = uiTranslations.fr?.[key] || '';
    } else if (type === 'menu') {
        const item = menuTranslations.items?.[key];
        if (item && item[field]) {
            enInput.value = item[field].en || '';
            viInput.value = item[field].vi || '';
            koInput.value = item[field].ko || '';
            zhInput.value = item[field].zh || '';
            frInput.value = item[field].fr || '';
        }
    }
    
    // Show modal
    modal.style.display = 'flex';
    
    // Focus on the first editable input
    viInput.focus();
}

function closeTranslationModal() {
    const modal = document.getElementById('translation-modal');
    modal.style.display = 'none';
}

function saveTranslation(event) {
    event.preventDefault();
    
    const keyInput = document.getElementById('translation-key');
    const typeInput = document.getElementById('translation-type');
    const fieldInput = document.getElementById('translation-field');
    const viInput = document.getElementById('translation-vietnamese');
    const koInput = document.getElementById('translation-korean');
    const zhInput = document.getElementById('translation-chinese');
    const frInput = document.getElementById('translation-french');
    
    const key = keyInput.value;
    const type = typeInput.value;
    const field = fieldInput.value;
    
    const translationData = {
        key: key,
        field: field,
        translations: {
            vi: viInput.value,
            ko: koInput.value,
            zh: zhInput.value,
            fr: frInput.value
        }
    };
    
    // Send to server
    fetch(`/api/translations/${type}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(translationData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update local data
            if (type === 'ui') {
                for (const lang in translationData.translations) {
                    if (!uiTranslations[lang]) uiTranslations[lang] = {};
                    uiTranslations[lang][key] = translationData.translations[lang];
                }
                displayUITranslations();
            } else if (type === 'menu') {
                for (const lang in translationData.translations) {
                    if (!menuTranslations.items[key][field]) menuTranslations.items[key][field] = {};
                    menuTranslations.items[key][field][lang] = translationData.translations[lang];
                }
                displayMenuTranslations();
            }
            
            // Close modal
            closeTranslationModal();
        } else {
            alert('Error saving translation: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error saving translation:', error);
        alert('An error occurred while saving the translation. Please try again.');
    });
}

function openImportTranslationsModal() {
    const modal = document.getElementById('import-translations-modal');
    if (!modal) return;
    
    // Reset form
    document.getElementById('translation-file-import').value = '';
    document.getElementById('translation-import-preview').style.display = 'none';
    document.getElementById('process-translation-import').disabled = true;
    document.getElementById('translation-import-message').textContent = '';
    document.getElementById('translation-import-message').className = 'message';
    
    // Show modal
    modal.style.display = 'flex';
}

function closeImportTranslationsModal() {
    const modal = document.getElementById('import-translations-modal');
    if (modal) modal.style.display = 'none';
}

function previewTranslationImport() {
    const fileInput = document.getElementById('translation-file-import');
    const previewDiv = document.getElementById('translation-import-preview');
    const previewHeader = document.getElementById('translation-preview-header');
    const previewData = document.getElementById('translation-preview-data');
    const messageDiv = document.getElementById('translation-import-message');
    const importButton = document.getElementById('process-translation-import');
    
    if (!fileInput.files || !fileInput.files[0]) {
        messageDiv.textContent = 'Please select a file to import.';
        messageDiv.className = 'message error';
        return;
    }
    
    const file = fileInput.files[0];
    const fileType = file.name.split('.').pop().toLowerCase();
    
    if (fileType !== 'xlsx' && fileType !== 'csv') {
        messageDiv.textContent = 'Please select a valid Excel (.xlsx) or CSV file.';
        messageDiv.className = 'message error';
        return;
    }
    
    // Show loading message
    messageDiv.textContent = 'Reading file...';
    messageDiv.className = 'message info';
    
    // Read and parse file
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            let data;
            
            if (fileType === 'csv') {
                // Parse CSV
                const csvText = e.target.result;
                data = parseCSV(csvText);
            } else {
                // Parse Excel
                const arrayBuffer = e.target.result;
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                data = XLSX.utils.sheet_to_json(firstSheet);
            }
            
            // Validate the data
            if (!data || data.length === 0) {
                throw new Error('No data found in the file.');
            }
            
            // Check for required columns based on import type
            const importType = document.querySelector('input[name="translation-import-type"]:checked').value;
            let requiredColumns;
            
            if (importType === 'ui') {
                requiredColumns = ['Key', 'English'];
            } else {
                requiredColumns = ['ID', 'Field', 'English'];
            }
            
            const firstRow = data[0];
            for (const column of requiredColumns) {
                if (!(column in firstRow)) {
                    throw new Error(`Required column '${column}' is missing from the file.`);
                }
            }
            
            // Show preview
            showTranslationPreview(data, previewHeader, previewData);
            previewDiv.style.display = 'block';
            
            // Enable import button
            importButton.disabled = false;
            
            // Clear message
            messageDiv.textContent = '';
            messageDiv.className = 'message';
        } catch (error) {
            console.error('Error parsing file:', error);
            messageDiv.textContent = 'Error: ' + error.message;
            messageDiv.className = 'message error';
            previewDiv.style.display = 'none';
            importButton.disabled = true;
        }
    };
    
    reader.onerror = function() {
        messageDiv.textContent = 'Error reading the file.';
        messageDiv.className = 'message error';
    };
    
    if (fileType === 'csv') {
        reader.readAsText(file);
    } else {
        reader.readAsArrayBuffer(file);
    }
}

function showTranslationPreview(data, headerElement, dataElement) {
    // Get column headers from first row
    const columns = Object.keys(data[0]);
    
    // Create header row
    let headerHtml = '<tr>';
    columns.forEach(column => {
        headerHtml += `<th>${column}</th>`;
    });
    headerHtml += '</tr>';
    
    headerElement.innerHTML = headerHtml;
    
    // Create data rows (max 5 for preview)
    let dataHtml = '';
    const previewItems = data.slice(0, 5);
    
    previewItems.forEach(item => {
        let rowHtml = '<tr>';
        columns.forEach(column => {
            rowHtml += `<td>${item[column] !== undefined ? item[column] : ''}</td>`;
        });
        rowHtml += '</tr>';
        dataHtml += rowHtml;
    });
    
    dataElement.innerHTML = dataHtml;
}

function processTranslationImport() {
    const fileInput = document.getElementById('translation-file-import');
    const updateExisting = document.getElementById('translations-update-existing').checked;
    const importType = document.querySelector('input[name="translation-import-type"]:checked').value;
    const messageDiv = document.getElementById('translation-import-message');
    
    if (!fileInput.files || !fileInput.files[0]) {
        messageDiv.textContent = 'Please select a file to import.';
        messageDiv.className = 'message error';
        return;
    }
    
    // Create form data
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('update_existing', updateExisting);
    formData.append('type', importType);
    
    // Disable buttons during import
    document.getElementById('preview-translation-import').disabled = true;
    document.getElementById('process-translation-import').disabled = true;
    
    // Show loading message
    messageDiv.textContent = 'Importing translations...';
    messageDiv.className = 'message info';
    
    // Send to server
    fetch('/api/translations/import', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            throw new Error(data.error);
        }
        
        messageDiv.textContent = `Import successful! ${data.count} translations imported.`;
        messageDiv.className = 'message success';
        
        // Reload translations to show changes
        loadTranslations();
        
        // Re-enable buttons
        document.getElementById('preview-translation-import').disabled = false;
        document.getElementById('process-translation-import').disabled = false;
        
        // Auto-close after 3 seconds
        setTimeout(closeImportTranslationsModal, 3000);
    })
    .catch(error => {
        console.error('Error importing translations:', error);
        messageDiv.textContent = 'Error: ' + error.message;
        messageDiv.className = 'message error';
        
        // Re-enable buttons
        document.getElementById('preview-translation-import').disabled = false;
        document.getElementById('process-translation-import').disabled = false;
    });
}

function exportTranslations() {
    const languageFilter = document.getElementById('translation-language-filter').value;
    
    let url = '/api/translations/export';
    if (languageFilter !== 'all') {
        url += `?language=${languageFilter}`;
    }
    
    // Open in new window/tab
    window.open(url, '_blank');
}
// Function to display active tables
function displayActiveTables(tables) {
    const activeTablesGrid = document.getElementById('active-tables-grid');
    if (!activeTablesGrid) return;
    
    // Clear previous content
    activeTablesGrid.innerHTML = '';
    
    if (tables.length === 0) {
        activeTablesGrid.innerHTML = '<div class="no-data">No active tables found</div>';
        return;
    }
    
    // Sort tables by table number
    tables.sort((a, b) => a.table_number - b.table_number);
    
    // Create a card for each table
    tables.forEach(table => {
        const tableCard = document.createElement('div');
        tableCard.className = 'table-card';
        tableCard.setAttribute('data-table', table.table_number);
        
        const hasActiveOrders = table.orders && table.orders.length > 0;
        const latestOrder = hasActiveOrders ? table.orders[0] : null;
        
        // Create card content
        tableCard.innerHTML = `
            <div class="table-status ${hasActiveOrders ? 'busy' : ''}"></div>
            <h3>Table ${table.table_number}</h3>
            
            <div class="table-info">
                <div>Status: <strong>${hasActiveOrders ? 'Busy' : 'Available'}</strong></div>
                <div>Last activity: <span>${formatDateTime(table.last_active)}</span></div>
            </div>
            
            ${latestOrder ? `
                <div class="latest-order">
                    <p><strong>Latest Order:</strong> #${latestOrder.id}</p>
                    <p>Status: <span class="status-badge status-${latestOrder.status.toLowerCase().replace(' ', '-')}">${latestOrder.status}</span></p>
                    <p>Items: ${latestOrder.items.length}</p>
                    <p>Total: $${latestOrder.total_amount.toFixed(2)}</p>
                </div>
            ` : '<div class="no-orders">No active orders</div>'}
            
            <div class="table-actions">
                <button class="view-details-button secondary-button">View Details</button>
            </div>
        `;
        
        // Add click event to show details
        tableCard.querySelector('.view-details-button').addEventListener('click', function(e) {
            e.stopPropagation();
            showTableDetails(table);
        });
        
        // Also make the entire card clickable
        tableCard.addEventListener('click', function() {
            showTableDetails(table);
        });
        
        activeTablesGrid.appendChild(tableCard);
    });
}
// Function to initialize the table monitoring functionality
function initTableMonitoring() {
    const refreshTablesButton = document.getElementById('refresh-tables');
    const autoRefreshCheckbox = document.getElementById('auto-refresh-tables');
    const tableDetailsPanel = document.getElementById('table-details-panel');
    const closeTableDetailsButton = document.getElementById('close-table-details');
    let autoRefreshInterval;
    
    // Initialize event listeners
    if (refreshTablesButton) {
        refreshTablesButton.addEventListener('click', loadActiveTables);
    }
    
    if (autoRefreshCheckbox) {
        autoRefreshCheckbox.addEventListener('change', function() {
            if (this.checked) {
                // Set up auto-refresh every 30 seconds
                autoRefreshInterval = setInterval(loadActiveTables, 30000);
            } else {
                // Clear auto-refresh
                clearInterval(autoRefreshInterval);
            }
        });
        
        // Initially set up auto-refresh if checked
        if (autoRefreshCheckbox.checked) {
            autoRefreshInterval = setInterval(loadActiveTables, 30000);
        }
    }
    
    if (closeTableDetailsButton) {
        closeTableDetailsButton.addEventListener('click', function() {
            tableDetailsPanel.classList.remove('active');
        });
    }
    
    // Load tables data initially
    loadActiveTables();
    
    // Listen for socket events for real-time updates
    socket.on('new_order', function(data) {
        if (document.getElementById('tables-tab').classList.contains('active')) {
            loadActiveTables();
        }
    });
    
    socket.on('order_updated', function(data) {
        if (document.getElementById('tables-tab').classList.contains('active')) {
            loadActiveTables();
        }
    });
}

// Function to load active tables data
function loadActiveTables() {
    const activeTablesGrid = document.getElementById('active-tables-grid');
    if (!activeTablesGrid) return;
    
    // Clear previous content and show loading state
    activeTablesGrid.innerHTML = '<div class="loading">Loading table data...</div>';
    
    // Fetch data for all connected tables
    fetch('/api/admin/tables/active')
        .then(response => response.json())
        .then(data => {
            displayActiveTables(data);
        })
        .catch(error => {
            console.error('Error loading active tables:', error);
            activeTablesGrid.innerHTML = `<div class="error">Error loading table data: ${error.message}</div>`;
        });
}
function showTableDetails(table) {
    const tableDetailsPanel = document.getElementById('table-details-panel');
    const selectedTableDetails = document.getElementById('selected-table-details');
    
    if (!tableDetailsPanel || !selectedTableDetails) return;
    
    // Clear previous content
    selectedTableDetails.innerHTML = '';
    
    // Create table info section
    const tableInfo = document.createElement('div');
    tableInfo.className = 'table-info-section';
    tableInfo.innerHTML = `
        <h2>Table ${table.table_number}</h2>
        <div class="table-stats">
            <div><strong>Status:</strong> ${table.orders && table.orders.length > 0 ? 'Busy' : 'Available'}</div>
            <div><strong>Device IP:</strong> ${table.ip_address || 'Unknown'}</div>
            <div><strong>Last Activity:</strong> ${formatDateTime(table.last_active)}</div>
        </div>
    `;
    
    // Create orders section
    const ordersSection = document.createElement('div');
    ordersSection.className = 'orders-section';
    
    if (!table.orders || table.orders.length === 0) {
        ordersSection.innerHTML = '<div class="no-data">No active orders for this table</div>';
    } else {
        const ordersHeader = document.createElement('h3');
        ordersHeader.textContent = 'Active Orders';
        ordersSection.appendChild(ordersHeader);
        
        // Create a section for each order
        table.orders.forEach(order => {
            const orderDiv = document.createElement('div');
            orderDiv.className = 'table-order';
            
            // Order header
            const orderHeader = document.createElement('div');
            orderHeader.className = 'table-order-header';
            orderHeader.innerHTML = `
                <div>
                    <strong>Order #${order.id}</strong>
                    <span class="status-badge status-${order.status.toLowerCase().replace(' ', '-')}">${order.status}</span>
                </div>
                <div>${formatDateTime(order.created_at)}</div>
            `;
            
            // Order items
            const orderItems = document.createElement('div');
            orderItems.className = 'table-order-items';
            
            order.items.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'order-item';
                
                itemDiv.innerHTML = `
                    <div>
                        <span>${item.quantity}× ${item.name}</span>
                        ${item.notes ? `<div class="item-notes">Note: ${item.notes}</div>` : ''}
                    </div>
                    <div class="status-badge status-${item.status.toLowerCase().replace(' ', '-')}">${item.status}</div>
                `;
                
                orderItems.appendChild(itemDiv);
            });
            
            // Order total
            const orderTotal = document.createElement('div');
            orderTotal.className = 'order-total';
            orderTotal.innerHTML = `<strong>Total:</strong> $${order.total_amount.toFixed(2)}`;
            
            // Order actions
            const orderActions = document.createElement('div');
            orderActions.className = 'order-actions';
            orderActions.innerHTML = `
                <button class="secondary-button update-order-button" data-order="${order.id}" data-status="Completed">Mark Completed</button>
                <button class="secondary-button view-order-button" data-order="${order.id}">View Details</button>
            `;
            
            // Add event listeners to buttons
            orderActions.querySelector('.update-order-button').addEventListener('click', function() {
                updateOrderStatus(order.id, 'Completed');
            });
            
            orderActions.querySelector('.view-order-button').addEventListener('click', function() {
                viewOrderDetails(order.id);
            });
            
            // Assemble order div
            orderDiv.appendChild(orderHeader);
            orderDiv.appendChild(orderItems);
            orderDiv.appendChild(orderTotal);
            orderDiv.appendChild(orderActions);
            
            ordersSection.appendChild(orderDiv);
        });
    }
    
    // Add sections to the details panel
    selectedTableDetails.appendChild(tableInfo);
    selectedTableDetails.appendChild(ordersSection);
    
    // Show the panel
    tableDetailsPanel.classList.add('active');
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
            // Success, reload the tables data
            loadActiveTables();
            
            // If the table details panel is open, update it as well
            const tableDetailsPanel = document.getElementById('table-details-panel');
            if (tableDetailsPanel.classList.contains('active')) {
                // Find the table number from the currently displayed details
                const tableNumberElem = document.querySelector('#selected-table-details h2');
                if (tableNumberElem) {
                    const tableNumber = tableNumberElem.textContent.replace('Table ', '');
                    
                    // Fetch updated data for this table
                    fetch(`/api/admin/tables/active/${tableNumber}`)
                        .then(response => response.json())
                        .then(table => {
                            showTableDetails(table);
                        })
                        .catch(error => {
                            console.error('Error updating table details:', error);
                        });
                }
            }
        } else {
            alert('Error updating order status: ' + (data.error || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error updating order status:', error);
        alert('An error occurred while updating the order status. Please try again.');
    });
}
// Add event listeners when DOM is loaded

    // Check if we're on the manager page
    if (!document.querySelector('.tab-button[data-tab="translations"]')) return;
    document.getElementById('import-translations').onclick = function() {
        document.getElementById('import-translations-modal').style.display = 'flex';
    };
    // Add translations tab event listener
    document.querySelector('.tab-button[data-tab="translations"]').addEventListener('click', loadTranslations);
    
    // Add filter event listeners
    document.getElementById('translation-language-filter')?.addEventListener('change', function() {
        if (document.getElementById('ui-translations-list')) {
            displayUITranslations();
        }
        if (document.getElementById('menu-translations-list')) {
            displayMenuTranslations();
        }
    });
    
    document.getElementById('search-translations')?.addEventListener('input', function() {
        if (document.getElementById('ui-translations-list')) {
            displayUITranslations();
        }
        if (document.getElementById('menu-translations-list')) {
            displayMenuTranslations();
        }
    });
    
    // Add modal event listeners
    document.getElementById('translation-form')?.addEventListener('submit', saveTranslation);
    document.getElementById('cancel-translation')?.addEventListener('click', closeTranslationModal);
    document.querySelector('#translation-modal .close-button')?.addEventListener('click', closeTranslationModal);
    
    // Add import/export event listeners
    document.getElementById('import-translations')?.addEventListener('click', openImportTranslationsModal);
    document.getElementById('export-translations')?.addEventListener('click', exportTranslations);
    
    document.querySelector('#import-translations-modal .close-button')?.addEventListener('click', closeImportTranslationsModal);
    document.getElementById('preview-translation-import')?.addEventListener('click', previewTranslationImport);
    document.getElementById('process-translation-import')?.addEventListener('click', processTranslationImport);
    
    // Close modals when clicking outside
    window.addEventListener('click', function(event) {
        const translationModal = document.getElementById('translation-modal');
        if (event.target === translationModal) {
            closeTranslationModal();
        }
        
        const importModal = document.getElementById('import-translations-modal');
        if (event.target === importModal) {
            closeImportTranslationsModal();
        }
    });

});