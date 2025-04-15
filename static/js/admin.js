// Admin dashboard functionality
document.addEventListener('DOMContentLoaded', function() {
    const deviceTemplate = document.getElementById('device-template');
    const devicesContainer = document.getElementById('devices-container');
    const refreshButton = document.getElementById('refresh-devices');
    
    // Load devices on page load
    loadDevices();
    
    // Refresh devices on button click
    refreshButton.addEventListener('click', loadDevices);
    
    function loadDevices() {
        fetch('/api/admin/devices')
            .then(response => response.json())
            .then(devices => {
                // Clear container
                devicesContainer.innerHTML = '';
                
                if (devices.length === 0) {
                    devicesContainer.innerHTML = `
                        <div class="no-devices-message">
                            <p>No devices currently connected.</p>
                        </div>
                    `;
                    return;
                }
                
                // Display each device
                devices.forEach(device => {
                    const deviceElement = deviceTemplate.content.cloneNode(true);
                    
                    deviceElement.querySelector('.device-id').textContent = `Device ID: ${device.id.substring(0, 8)}...`;
                    deviceElement.querySelector('.device-ip').textContent = `IP: ${device.ip_address}`;
                    deviceElement.querySelector('.device-agent').textContent = `Agent: ${device.user_agent.substring(0, 20)}...`;
                    deviceElement.querySelector('.device-last-active').textContent = `Last Active: ${device.last_active}`;
                    
                    // Role tag
                    const roleTag = deviceElement.querySelector('.tag-role');
                    if (device.role && device.role !== "Unknown") {
                        roleTag.textContent = `Role: ${device.role}`;
                    } else {
                        roleTag.style.display = 'none';
                    }
                    
                    // Table tag
                    const tableTag = deviceElement.querySelector('.tag-table');
                    if (device.table_number) {
                        tableTag.textContent = `Table #${device.table_number}`;
                    } else {
                        tableTag.style.display = 'none';
                    }
                    
                    // Status indicator
                    const statusIndicator = deviceElement.querySelector('.status-indicator');
                    statusIndicator.classList.add('status-online');
                    
                    // Reset button
                    const resetButton = deviceElement.querySelector('.reset-device');
                    resetButton.addEventListener('click', () => resetDevice(device.id));
                    
                    devicesContainer.appendChild(deviceElement);
                });
            })
            .catch(error => {
                console.error('Error loading devices:', error);
                devicesContainer.innerHTML = `
                    <div class="no-devices-message">
                        <p>Error loading devices information. Please try again.</p>
                    </div>
                `;
            });
    }
    
    function resetDevice(deviceId) {
        if (confirm('Are you sure you want to reset this device? This will clear its table assignment and role.')) {
            fetch(`/api/admin/devices/${deviceId}/reset`, {
                method: 'POST'
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('Device reset command sent successfully.');
                    loadDevices(); // Refresh the list
                } else {
                    alert(`Error: ${data.error}`);
                }
            })
            .catch(error => {
                console.error('Error resetting device:', error);
                alert('An error occurred while trying to reset the device.');
            });
        }
    
    }
    function initChatbotToggle() {
        const chatbotStatus = document.getElementById('chatbot-status');
        const switchStatusText = document.getElementById('switch-status-text');
        
        if (!chatbotStatus || !switchStatusText) return;
        
        // Update the text based on the current state
        function updateSwitchText(enabled) {
            switchStatusText.textContent = enabled ? 'Enabled' : 'Disabled';
            switchStatusText.style.color = enabled ? '#4CAF50' : '#F44336';
        }
        
        // Initialize the switch text based on the checkbox state
        updateSwitchText(chatbotStatus.checked);
        
        // Event listener for the toggle
        chatbotStatus.addEventListener('change', function() {
            const enabled = chatbotStatus.checked;
            updateSwitchText(enabled);
            
            // Disable the switch while the request is processing
            chatbotStatus.disabled = true;
            
            // Show a pending status
            switchStatusText.textContent = 'Updating...';
            switchStatusText.style.color = '#FFA000';
            
            fetch('/api/admin/chatbot-settings/toggle', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache'  // Add cache-busting header
                },
                body: JSON.stringify({ 
                    enabled: enabled,
                    timestamp: new Date().getTime()  // Add timestamp to prevent caching
                })
            })
            .then(response => response.json())
            .then(data => {
                // Re-enable the switch
                chatbotStatus.disabled = false;
                
                if (data.success) {
                    showNotification(`Chatbot ${enabled ? 'enabled' : 'disabled'} successfully.`);
                    updateSwitchText(enabled);
                    
                    // Force reload the status from server
                    setTimeout(() => {
                        fetch('/api/debug-chatbot-config?t=' + new Date().getTime())
                            .then(response => response.json())
                            .then(config => {
                                console.log('Current config from server:', config);
                            });
                    }, 500);
                } else {
                    showNotification('Error updating chatbot status.', 'error');
                    // Revert toggle if there was an error
                    chatbotStatus.checked = !enabled;
                    updateSwitchText(!enabled);
                }
            })
            .catch(error => {
                console.error('Error updating chatbot status:', error);
                showNotification('Error updating chatbot status.', 'error');
                
                // Re-enable the switch and revert state
                chatbotStatus.disabled = false;
                chatbotStatus.checked = !enabled;
                updateSwitchText(!enabled);
            });
        });
    }
    
    // Call this function when the DOM is loaded
    document.addEventListener('DOMContentLoaded', function() {
        initChatbotToggle();
    });
});