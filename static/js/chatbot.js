// chatbot.js - With added functionality to check if chatbot is enabled

// Function to check if the chatbot is enabled (available globally)
function checkChatbotStatus() {
    console.log('Checking chatbot status...');
    return fetch('/api/chatbot-status')
        .then(response => {
            console.log('Chatbot status response received');
            return response.json();
        })
        .then(data => {
            console.log('Chatbot status:', data);
            return data.enabled === true; // Explicitly compare to ensure boolean result
        })
        .catch(error => {
            console.error('Error checking chatbot status:', error);
            return false; // Default to disabled if there's an error
        });
}

// Function to forcibly remove typing indicators (available globally)
function forceRemoveTypingIndicators() {
    const indicators = document.querySelectorAll('.typing-indicator');
    indicators.forEach(indicator => {
        if (indicator && indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
        }
    });
}
function removeExistingChatbot() {
    const chatbotContainer = document.getElementById('chatbot-container');
    if (chatbotContainer) {
        chatbotContainer.remove();
    }
}
function setupChatbotStatusCheck() {
    // Check status every 30 seconds
    setInterval(() => {
        checkChatbotStatus().then(enabled => {
            const chatbotContainer = document.getElementById('chatbot-container');
            
            if (!enabled && chatbotContainer) {
                console.log('Chatbot has been disabled. Removing from page.');
                removeExistingChatbot();
            } else if (enabled && !chatbotContainer) {
                console.log('Chatbot has been enabled. Adding to page.');
                injectChatbot();
            }
        });
    }, 30000); // Check every 30 seconds
}

// Main chatbot functionality that gets initialized when the chatbot is injected
function initChatbotFunctionality() {
    // Elements
    const chatBubble = document.getElementById('chat-bubble');
    const chatBox = document.getElementById('chat-box');
    const closeChat = document.getElementById('close-chat');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const chatMessages = document.getElementById('chat-messages');
    const notificationBadge = document.getElementById('notification-badge');

    // Run this immediately
    forceRemoveTypingIndicators();
    
    // And again after a slight delay
    setTimeout(forceRemoveTypingIndicators, 100);
    
    // And one more time to be absolutely certain
    setTimeout(forceRemoveTypingIndicators, 500);

    // Show notification on initial load
    setTimeout(() => {
        notificationBadge.style.visibility = 'visible';
    }, 3000);

    // Open/close chat box
    chatBubble.addEventListener('click', function() {
        chatBox.classList.toggle('active');
        notificationBadge.style.visibility = 'hidden';
        // Also remove any indicators when opening the chat
        forceRemoveTypingIndicators();
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
        
        // First ensure no typing indicators exist
        forceRemoveTypingIndicators();
        
        // Then show the typing indicator after the user message with a delay
        setTimeout(() => {
            // Create new typing indicator
            const typingIndicator = document.createElement('div');
            typingIndicator.className = 'typing-indicator';
            typingIndicator.innerHTML = '<span></span><span></span><span></span>';
            
            // Add to chat as the last element
            chatMessages.appendChild(typingIndicator);
            
            // Make sure it's displayed
            typingIndicator.style.display = 'flex';
            
            // Scroll to ensure it's visible
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            // Now fetch the response
            fetchRagResponse(message);
        }, 200); // Longer delay to ensure proper rendering
    }

    function addMessage(text, sender) {
        // Remove any typing indicators first
        forceRemoveTypingIndicators();
        
        // Create and add the message
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        messageElement.classList.add(sender + '-message');
        messageElement.textContent = text;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

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
            // Remove typing indicator before adding bot response
            forceRemoveTypingIndicators();
            
            // Process the response to remove thinking tags
            let botResponse = data.response;
            
            // Filter out <think>...</think> content using regex
            botResponse = botResponse.replace(/<think>[\s\S]*?<\/think>/g, '');
            
            // Remove any remaining tags for safety
            botResponse = botResponse.replace(/<\/?[^>]+(>|$)/g, '');
            
            // Trim any excess whitespace that might remain
            botResponse = botResponse.trim();
            
            // Add bot response
            addMessage(botResponse, 'bot');
        })
        .catch(error => {
            console.error('Error fetching from RAG API:', error);
            
            // Remove typing indicator
            forceRemoveTypingIndicators();
            
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

// Function to programmatically inject the chatbot into the page
function injectChatbot() {
    console.log('Starting chatbot injection process');
    
    // First check if chatbot is enabled
    checkChatbotStatus().then(enabled => {
        console.log('Chatbot enabled status:', enabled);
        
        // If disabled, don't inject the chatbot at all
        if (!enabled) {
            console.log('Chatbot is disabled. Not injecting chatbot UI.');
            return;
        }
        
        // Only create and inject the chatbot if it's enabled
        console.log('Chatbot is enabled. Injecting chatbot UI.');
        
        // Create a div to load the HTML content
        const chatbotContainer = document.createElement('div');
        chatbotContainer.id = 'chatbot-container';
        
        // Load the HTML content
        fetch('/static/html/chatbot.html')
            .then(response => response.text())
            .then(html => {
                chatbotContainer.innerHTML = html;
                document.body.appendChild(chatbotContainer);
                
                // Force remove any typing indicators
                forceRemoveTypingIndicators();
                
                // Initialize chatbot functionality
                initChatbotFunctionality();
                
                // Ensure styles are loaded
                if (!document.querySelector('link[href*="font-awesome"]')) {
                    const fontAwesome = document.createElement('link');
                    fontAwesome.rel = 'stylesheet';
                    fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
                    document.head.appendChild(fontAwesome);
                }
                
                if (!document.querySelector('link[href*="chatbot.css"]')) {
                    const chatbotCss = document.createElement('link');
                    chatbotCss.rel = 'stylesheet';
                    chatbotCss.href = '/static/css/chatbot.css';
                    document.head.appendChild(chatbotCss);
                }
            })
            .catch(error => {
                console.error('Error loading chatbot HTML:', error);
            });
    });
}

// Initialize on DOMContentLoaded for pages that include the chatbot directly
document.addEventListener('DOMContentLoaded', function() {
    // Check if chatbot elements already exist in the DOM
    setupChatbotStatusCheck();
});