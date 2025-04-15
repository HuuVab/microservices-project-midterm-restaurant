// admin_chatbot.js - Chatbot admin management functionality

document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const chatbotStatus = document.getElementById('chatbot-status');
    const ragDocumentsList = document.getElementById('rag-documents-list');
    const documentUploadForm = document.getElementById('document-upload-form');
    const apiUrlInput = document.getElementById('api-url');
    const modelNameInput = document.getElementById('model-name');
    const systemPromptInput = document.getElementById('system-prompt');
    const saveLlmConfigBtn = document.getElementById('save-llm-config');
    
    // Make sure we're on the admin dashboard page with chatbot elements
    if (!chatbotStatus) {
        console.log('Chatbot admin elements not found, skipping initialization');
        return; // Not on the admin dashboard page or elements not found
    }
    
    console.log('Initializing chatbot admin functionality');
    
    // Load initial settings
    loadChatbotSettings();
    loadRagDocuments();
    
    // Event listeners
    chatbotStatus.addEventListener('change', toggleChatbotStatus);
    
    if (documentUploadForm) {
        documentUploadForm.addEventListener('submit', uploadDocument);
    }
    
    if (saveLlmConfigBtn) {
        saveLlmConfigBtn.addEventListener('click', saveLlmConfiguration);
    }
    
    // Functions
    function loadChatbotSettings() {
        console.log('Loading chatbot settings...');
        fetch('/api/admin/chatbot-settings?t=' + new Date().getTime())
            .then(response => response.json())
            .then(settings => {
                // Update chatbot status toggle
                chatbotStatus.checked = settings.enabled;
                console.log('Loaded chatbot settings, enabled =', settings.enabled);
                
                // Update LLM config fields
                if (apiUrlInput) {
                    apiUrlInput.value = settings.api_url || '';
                }
                
                if (modelNameInput) {
                    modelNameInput.value = settings.model_name || '';
                }
                
                if (systemPromptInput) {
                    systemPromptInput.value = settings.system_prompt || '';
                }
            })
            .catch(error => {
                console.error('Error loading chatbot settings:', error);
                showNotification('Error loading chatbot settings.', 'error');
            });
    }
    
    // In toggleChatbotStatus function, make sure it's completely separate from LLM configuration
    function toggleChatbotStatus() {
        const enabled = chatbotStatus.checked;
        console.log('Toggling chatbot status to:', enabled);
        
        // Disable the switch while the request is processing
        chatbotStatus.disabled = true;
        
        fetch('/api/admin/chatbot-settings/toggle', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            },
            body: JSON.stringify({ 
                enabled: enabled,
                timestamp: new Date().getTime(),
                toggle_only: true  // Add this flag to indicate we're only toggling status
            })
        })
        .then(response => response.json())
        .then(data => {
            console.log('Toggle response:', data);
            
            // Re-enable the switch
            chatbotStatus.disabled = false;
            
            if (data.success) {
                showNotification(`Chatbot ${enabled ? 'enabled' : 'disabled'} successfully.`);
            } else {
                showNotification(data.error || 'Error updating chatbot status.', 'error');
                // Revert toggle if there was an error
                chatbotStatus.checked = !enabled;
            }
        })
        .catch(error => {
            console.error('Error updating chatbot status:', error);
            showNotification('Error updating chatbot status.', 'error');
            
            // Re-enable the switch and revert state
            chatbotStatus.disabled = false;
            chatbotStatus.checked = !enabled;
        });
    }
    
    function loadRagDocuments() {
        if (!ragDocumentsList) return;
        
        console.log('Loading RAG documents...');
        fetch('/api/admin/rag-documents')
            .then(response => response.json())
            .then(documents => {
                ragDocumentsList.innerHTML = '';
                
                if (documents.length === 0) {
                    ragDocumentsList.innerHTML = `
                        <div class="no-documents-message">
                            <p>No documents loaded. Add documents to improve chatbot responses.</p>
                        </div>
                    `;
                    return;
                }
                
                documents.forEach(doc => {
                    const docElement = document.createElement('div');
                    docElement.className = 'document-item';
                    
                    docElement.innerHTML = `
                        <div class="document-info">
                            <span class="document-name">${doc.filename}</span>
                            <span class="document-path">${doc.path}</span>
                        </div>
                        <div class="document-actions">
                            <button class="delete-document secondary-button" data-path="${doc.path}">Remove</button>
                        </div>
                    `;
                    
                    ragDocumentsList.appendChild(docElement);
                    
                    // Add event listener to delete button
                    const deleteBtn = docElement.querySelector('.delete-document');
                    deleteBtn.addEventListener('click', () => removeDocument(doc.path));
                });
            })
            .catch(error => {
                console.error('Error loading RAG documents:', error);
                ragDocumentsList.innerHTML = `
                    <div class="no-documents-message">
                        <p>Error loading documents. Please try again.</p>
                    </div>
                `;
            });
    }
    
    function uploadDocument(event) {
        event.preventDefault();
        
        const fileInput = document.getElementById('document-file');
        const file = fileInput.files[0];
        
        if (!file) {
            showNotification('Please select a file to upload.', 'error');
            return;
        }
        
        // Show upload in progress notification
        showNotification('Uploading document, please wait...', 'info');
        
        // Disable the upload button while processing
        const submitButton = event.target.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        
        const formData = new FormData();
        formData.append('file', file);
        
        fetch('/api/admin/rag-documents/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Document uploaded and RAG system updated successfully.');
                fileInput.value = ''; // Clear the file input
                loadRagDocuments(); // Refresh the document list
            } else {
                showNotification(data.error || 'Error uploading document.', 'error');
            }
        })
        .catch(error => {
            console.error('Error uploading document:', error);
            showNotification('Error uploading document.', 'error');
        })
        .finally(() => {
            // Re-enable the upload button
            submitButton.disabled = false;
        });
    }
    
    function removeDocument(path) {
        if (confirm('Are you sure you want to remove this document?')) {
            // Show processing notification
            showNotification('Removing document, please wait...', 'info');
            
            fetch('/api/admin/rag-documents/remove', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ path: path })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showNotification('Document removed and RAG system updated successfully.');
                    loadRagDocuments(); // Refresh the document list
                } else {
                    showNotification(data.error || 'Error removing document.', 'error');
                }
            })
            .catch(error => {
                console.error('Error removing document:', error);
                showNotification('Error removing document.', 'error');
            });
        }
    }
    
    function saveLlmConfiguration() {
        if (!apiUrlInput || !modelNameInput || !systemPromptInput) return;
        
        const config = {
            api_url: apiUrlInput.value.trim(),
            model_name: modelNameInput.value.trim(),
            system_prompt: systemPromptInput.value.trim()
        };
        
        // Validate inputs
        if (!config.api_url) {
            showNotification('API URL is required.', 'error');
            return;
        }
        
        if (!config.model_name) {
            showNotification('Model Name is required.', 'error');
            return;
        }
        
        fetch('/api/admin/chatbot-settings/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('LLM configuration saved successfully.');
            } else {
                showNotification(data.error || 'Error saving LLM configuration.', 'error');
            }
        })
        .catch(error => {
            console.error('Error saving LLM configuration:', error);
            showNotification('Error saving LLM configuration.', 'error');
        });
    }
    
    // Helper function to show notifications
    function showNotification(message, type = 'success') {
        // Check if notification container exists, if not create it
        let notificationContainer = document.getElementById('notification-container');
        if (!notificationContainer) {
            notificationContainer = document.createElement('div');
            notificationContainer.id = 'notification-container';
            document.body.appendChild(notificationContainer);
        }
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        notificationContainer.appendChild(notification);
        
        // Automatically remove after 5 seconds
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 500);
        }, 5000);
    }
    
    console.log('Chatbot admin functionality initialized');
});