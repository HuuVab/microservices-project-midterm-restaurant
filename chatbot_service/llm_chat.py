import requests
import os
import json
import logging
import re
import time

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class LLMChat:
    """Class to interact with a local LLM API for conversation with RAG support"""
    
    def __init__(self, api_url, model_name, rag_system=None):
        self.api_url = api_url
        self.model_name = model_name
        self.rag_system = rag_system
        
        # Load system prompt from file if available, otherwise use default
        if os.path.exists('system_prompt.txt'):
            with open('system_prompt.txt', 'r', encoding='utf-8') as f:
                system_prompt = f.read().strip()
                logger.info(f"Loaded system prompt from system_prompt.txt")
        else:
            system_prompt = """You are a professional restaurant waiter at 'Saigon Nouveau'. 
            When responding to customer queries, use the knowledge from the restaurant documents when relevant.
            Always maintain a polite, helpful, and professional demeanor."""
            logger.info(f"Using default system prompt (file system_prompt.txt not found)")
            
            # Save the default prompt so it can be edited
            with open('system_prompt.txt', 'w', encoding='utf-8') as f:
                f.write(system_prompt)
                logger.info(f"Created default system prompt file")
        
        self.conversation_history = [
            {"role": "system", "content": system_prompt}
        ]
    
    def send_message(self, message, use_rag=True):
        """Send a message to the LLM and get a response, with optional RAG context"""
        # First add the user message to the conversation history
        self.conversation_history.append({"role": "user", "content": message})
        
        # Prepare the payload - start with just the conversation history
        messages = list(self.conversation_history)
        
        # If RAG is enabled, prepend relevant context from documents
        if use_rag and self.rag_system and message.strip():
            context = self.rag_system.get_relevant_context(message)
            # If no strong matches found for specific query, try to get general menu information
            if not context and any(keyword in message.lower() for keyword in ['recommend', 'suggestion', 'popular', 'best', 'favorite']):
                context = self.rag_system.get_relevant_context("What are the most popular dishes on the menu?")
                
            if context:
                # Insert context right before the user's message as a system message
                rag_index = len(messages) - 1  # Position before last message (user)
                messages.insert(rag_index, {
                    "role": "system",
                    "content": f"Here is relevant information from Saigon Nouveau restaurant documents that you MUST use to answer the user's question. Base your response primarily on this information:\n\n{context}"
                })
                
                logger.info(f"Adding RAG context: {len(context)} characters")
        
        # Prepare the API call payload
        payload = {
            "model": self.model_name,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 1000
        }
        
        try:
            # Make the API request
            response = requests.post(
                self.api_url,
                headers={"Content-Type": "application/json"},
                data=json.dumps(payload),
                timeout=30  # Add timeout to prevent hanging requests
            )
            
            # Check if the request was successful
            if response.status_code == 200:
                try:
                    resp_json = response.json()
                    assistant_response = resp_json['choices'][0]['message']['content']
                    logger.info(f"Received response of {len(assistant_response)} characters")
                except (KeyError, IndexError) as e:
                    logger.error(f"Error parsing response: {e}")
                    logger.error(f"Response: {response.text[:500]}...")
                    assistant_response = "Sorry, I'm having trouble generating a response right now. Please try again later."
            else:
                logger.error(f"Error: API returned status code {response.status_code}")
                logger.error(f"Response: {response.text[:500]}...")
                assistant_response = "Sorry, I'm having trouble connecting to my knowledge base. Please try again later."
                
            # Add the assistant's response to the conversation history
            assistant_response = self._filter_thinking_tags(assistant_response)
            self.conversation_history.append({"role": "assistant", "content": assistant_response})
            return assistant_response
        
        except requests.RequestException as e:
            logger.error(f"Network error while calling the LLM API: {e}")
            error_message = "Sorry, I'm having trouble connecting to my knowledge base. Please try again later."
            self.conversation_history.append({"role": "assistant", "content": error_message})
            return error_message
        except Exception as e:
            logger.error(f"Unexpected error while calling the LLM API: {e}")
            error_message = "Sorry, I encountered an unexpected error. Please try again later."
            self.conversation_history.append({"role": "assistant", "content": error_message})
            return error_message

    def _filter_thinking_tags(self, response):
        """Filter out <think> tags and contents from the LLM response"""
        # Remove <think>...</think> blocks
        filtered = re.sub(r'<think>[\s\S]*?<\/think>', '', response)
        
        # Clean up whitespace
        filtered = filtered.strip()
        
        return filtered
    
    def clear_history(self):
        """Clear the conversation history but keep system prompt"""
        # Re-load system prompt to get any updates
        if os.path.exists('system_prompt.txt'):
            with open('system_prompt.txt', 'r', encoding='utf-8') as f:
                system_prompt = f.read().strip()
        else:
            system_prompt = """You are a professional restaurant waiter at 'Saigon Nouveau'.
            When responding to customer queries, use the knowledge from the restaurant documents when relevant.
            Always maintain a polite, helpful, and professional demeanor."""
        
        self.conversation_history = [
            {"role": "system", "content": system_prompt}
        ]
        logger.info("Conversation history cleared")