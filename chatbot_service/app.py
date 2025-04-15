from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import logging
import sys
import re
import time
import sqlite3
from datetime import datetime

# Add common directory to path for event modules
sys.path.append(os.path.join(os.path.dirname(__file__), 'common'))
from events.consumer import setup_consumer, register_event_handler

# Import RAG system and LLM chat
from rag_system import RAGSystem
from llm_chat import LLMChat

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configuration
DATABASE = os.getenv('DATABASE_FILE', 'chatbot.db')
CHATBOT_CONFIG_FILE = 'chatbot_config.json'
LLM_API_URL = os.getenv('LLM_API_URL', 'http://host.docker.internal:1234/v1/chat/completions')
MODEL_NAME = os.getenv('LLM_MODEL', 'meta-llama-3.1-8b-instruct')

# Default configuration
DEFAULT_CHATBOT_CONFIG = {
    'enabled': True,
    'api_url': LLM_API_URL,
    'model_name': MODEL_NAME,
    'system_prompt': """You are a professional restaurant waiter at 'Saigon Nouveau'. 
    When responding to customer queries, use the knowledge from the restaurant documents when relevant.
    Always maintain a polite, helpful, and professional demeanor."""
}

# Helper functions for configuration
def get_chatbot_config():
    """Get the current chatbot configuration"""
    if os.path.exists(CHATBOT_CONFIG_FILE):
        try:
            with open(CHATBOT_CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading chatbot config: {e}")
    
    # If file doesn't exist or has an error, return default config
    config = DEFAULT_CHATBOT_CONFIG.copy()
    save_chatbot_config(config)
    return config

def save_chatbot_config(config):
    """Save the chatbot configuration to file"""
    try:
        with open(CHATBOT_CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=4)
        return True
    except Exception as e:
        logger.error(f"Error saving chatbot config: {e}")
        return False

# Database setup
def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def create_tables():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create chat_sessions table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        table_number TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        last_active TIMESTAMP NOT NULL
    )
    ''')
    
    # Create chat_messages table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        FOREIGN KEY (session_id) REFERENCES chat_sessions (id)
    )
    ''')
    
    conn.commit()
    conn.close()
    logger.info("Database tables created or confirmed")

# Create tables on startup
create_tables()

# Initialize the RAG system
rag_system = RAGSystem()

# User conversation sessions
user_sessions = {}

# Initialize system prompt
if os.path.exists('system_prompt.txt'):
    with open('system_prompt.txt', 'r', encoding='utf-8') as f:
        system_prompt = f.read().strip()
else:
    system_prompt = DEFAULT_CHATBOT_CONFIG['system_prompt']
    with open('system_prompt.txt', 'w', encoding='utf-8') as f:
        f.write(system_prompt)

# API Routes
@app.route('/api/chatbot', methods=['POST'])
def chatbot_api():
    data = request.json
    
    if not data or 'message' not in data:
        return jsonify({"error": "No message provided"}), 400
    
    # Check if chatbot is enabled in settings
    config = get_chatbot_config()
    if not config.get('enabled', True):
        return jsonify({
            "response": "I'm sorry, the chatbot service is currently unavailable. Please ask a staff member for assistance.",
            "table": data.get('tableNumber', 'unknown')
        })
    
    user_message = data['message']
    table_number = data.get('tableNumber', 'unknown')
    use_rag = data.get('useRag', True)
    
    # Create a session ID based on table number
    session_id = f"table_{table_number}"
    
    # Initialize a new chat session if needed
    if session_id not in user_sessions:
        # Check if there's a session in the database
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id FROM chat_sessions 
            WHERE table_number = ? 
            ORDER BY last_active DESC LIMIT 1
        """, (table_number,))
        
        existing_session = cursor.fetchone()
        
        if existing_session:
            # Load messages from database
            db_session_id = existing_session['id']
            cursor.execute("""
                SELECT role, content FROM chat_messages
                WHERE session_id = ?
                ORDER BY created_at ASC
            """, (db_session_id,))
            
            messages = cursor.fetchall()
            
            # Initialize with system prompt
            history = [{"role": "system", "content": system_prompt}]
            
            # Add messages from database
            for msg in messages:
                history.append({
                    "role": msg['role'],
                    "content": msg['content']
                })
            
            # Create new LLM chat with history
            user_sessions[session_id] = LLMChat(config['api_url'], config['model_name'], rag_system)
            user_sessions[session_id].conversation_history = history
            
            # Update last active
            cursor.execute("""
                UPDATE chat_sessions
                SET last_active = ?
                WHERE id = ?
            """, (datetime.now().isoformat(), db_session_id))
            
        else:
            # Create new session in database
            db_session_id = f"session_{int(time.time())}_{table_number}"
            cursor.execute("""
                INSERT INTO chat_sessions (id, table_number, created_at, last_active)
                VALUES (?, ?, ?, ?)
            """, (
                db_session_id,
                table_number,
                datetime.now().isoformat(),
                datetime.now().isoformat()
            ))
            
            # Store system prompt
            cursor.execute("""
                INSERT INTO chat_messages (session_id, role, content, created_at)
                VALUES (?, ?, ?, ?)
            """, (
                db_session_id,
                "system",
                system_prompt,
                datetime.now().isoformat()
            ))
            
            # Create new LLM chat
            user_sessions[session_id] = LLMChat(config['api_url'], config['model_name'], rag_system)
        
        conn.commit()
        conn.close()
    
    # Get the chat session for this table
    chat_session = user_sessions[session_id]
    
    try:
        # Store the user message in database
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get session ID from database
        cursor.execute("""
            SELECT id FROM chat_sessions 
            WHERE table_number = ? 
            ORDER BY last_active DESC LIMIT 1
        """, (table_number,))
        
        db_session = cursor.fetchone()
        if db_session:
            db_session_id = db_session['id']
            
            # Store user message
            cursor.execute("""
                INSERT INTO chat_messages (session_id, role, content, created_at)
                VALUES (?, ?, ?, ?)
            """, (
                db_session_id,
                "user",
                user_message,
                datetime.now().isoformat()
            ))
            
            # Update last active
            cursor.execute("""
                UPDATE chat_sessions
                SET last_active = ?
                WHERE id = ?
            """, (datetime.now().isoformat(), db_session_id))
            
            conn.commit()
        
        # Send the message to the LLM
        response = chat_session.send_message(user_message, use_rag=use_rag)
        
        # Filter out <think>...</think> tags and content
        filtered_response = re.sub(r'<think>[\s\S]*?<\/think>', '', response)
        
        # Remove any remaining HTML/XML tags for safety
        filtered_response = re.sub(r'<\/?[^>]+(>|$)', '', filtered_response)
        
        # Trim any excess whitespace
        filtered_response = filtered_response.strip()
        
        # Store assistant response in database
        if db_session:
            cursor.execute("""
                INSERT INTO chat_messages (session_id, role, content, created_at)
                VALUES (?, ?, ?, ?)
            """, (
                db_session_id,
                "assistant",
                filtered_response,
                datetime.now().isoformat()
            ))
            
            conn.commit()
        
        conn.close()
        
        return jsonify({
            "response": filtered_response,
            "table": table_number
        })
    except Exception as e:
        logger.error(f"Error processing chatbot request: {e}")
        return jsonify({
            "error": "Failed to generate response",
            "details": str(e)
        }), 500

@app.route('/api/chatbot/clear', methods=['POST'])
def clear_chat():
    data = request.json
    table_number = data.get('tableNumber', 'unknown')
    session_id = f"table_{table_number}"
    
    if session_id in user_sessions:
        user_sessions[session_id].clear_history()
        
        # Clear chat messages from database
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get session ID
        cursor.execute("""
            SELECT id FROM chat_sessions 
            WHERE table_number = ? 
            ORDER BY last_active DESC LIMIT 1
        """, (table_number,))
        
        db_session = cursor.fetchone()
        if db_session:
            db_session_id = db_session['id']
            
            # Delete all non-system messages
            cursor.execute("""
                DELETE FROM chat_messages
                WHERE session_id = ? AND role != 'system'
            """, (db_session_id,))
            
            conn.commit()
        
        conn.close()
        
        return jsonify({"message": f"Chat history cleared for table {table_number}"})
    
    return jsonify({"error": "No active session found"}), 404

@app.route('/api/chatbot-status', methods=['GET'])
def check_chatbot_status():
    """Public API to check if chatbot is enabled"""
    # Force reload the config from disk every time
    if os.path.exists(CHATBOT_CONFIG_FILE):
        try:
            with open(CHATBOT_CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
        except Exception as e:
            logger.error(f"Error loading chatbot config: {e}")
            config = DEFAULT_CHATBOT_CONFIG.copy()
    else:
        config = DEFAULT_CHATBOT_CONFIG.copy()
    
    # Create response with cache control headers
    response = jsonify({
        "enabled": config.get('enabled', True),
        "timestamp": int(time.time() * 1000)  # Add timestamp to prevent caching
    })
    
    # Prevent caching
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    
    logger.info(f"Returning chatbot status: enabled = {config.get('enabled', True)}")
    return response

@app.route('/api/admin/chatbot-settings', methods=['GET'])
def get_chatbot_settings():
    config = get_chatbot_config()
    return jsonify(config)

@app.route('/api/admin/chatbot-settings/toggle', methods=['POST'])
def toggle_chatbot_status():
    data = request.json
    if data is None or 'enabled' not in data:
        return jsonify({"error": "Missing required field 'enabled'"}), 400
    
    enabled = bool(data['enabled'])
    toggle_only = data.get('toggle_only', False)  # Check if we're only toggling
    
    # Load the current config directly from disk
    config = get_chatbot_config()
    
    # Update the enabled status
    config['enabled'] = enabled
    
    # Save config
    success = save_chatbot_config(config)
    
    if success:
        # Create response with cache control headers
        response = jsonify({
            "success": True, 
            "enabled": enabled,
            "timestamp": int(time.time() * 1000)
        })
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        
        return response
    else:
        return jsonify({"error": "Failed to save configuration"}), 500

@app.route('/api/admin/chatbot-settings/config', methods=['POST'])
def update_llm_config():
    data = request.json
    if data is None:
        return jsonify({"error": "No data provided"}), 400
    
    # Validate required fields
    if 'api_url' not in data or not data['api_url']:
        return jsonify({"error": "API URL is required"}), 400
    
    if 'model_name' not in data or not data['model_name']:
        return jsonify({"error": "Model name is required"}), 400
    
    # Update config
    config = get_chatbot_config()
    config['api_url'] = data['api_url']
    config['model_name'] = data['model_name']
    
    if 'system_prompt' in data:
        config['system_prompt'] = data['system_prompt']
        
        # Update system prompt file
        try:
            with open('system_prompt.txt', 'w', encoding='utf-8') as f:
                f.write(data['system_prompt'])
        except Exception as e:
            logger.error(f"Error updating system prompt file: {e}")
    
    if save_chatbot_config(config):
        # Reset all chat sessions to use new configuration
        global user_sessions
        
        # Clear all chat sessions so they'll be recreated with new settings
        user_sessions = {}
        
        # Update the RAG system
        global rag_system
        rag_system = RAGSystem()
        
        return jsonify({"success": True})
    else:
        return jsonify({"error": "Failed to save configuration"}), 500

@app.route('/api/admin/rag-documents', methods=['GET'])
def get_rag_documents():
    documents = []
    for path in rag_system.document_paths:
        documents.append({
            'path': path,
            'filename': os.path.basename(path)
        })
    
    return jsonify(documents)

@app.route('/api/admin/rag-documents/upload', methods=['POST'])
def upload_rag_document():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file part"}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400
        
        # Save the file to the documents folder
        try:
            filename = secure_filename(file.filename)
            documents_folder = 'documents'
            os.makedirs(documents_folder, exist_ok=True)
            
            file_path = os.path.join(documents_folder, filename)
            logger.info(f"Saving file to {file_path}")
            file.save(file_path)
            
            # Add to RAG system
            success = rag_system.add_document(file_path)
            
            if success:
                try:
                    # Re-vectorize documents
                    rag_system._vectorize_documents()
                    
                    # Clear all user sessions to ensure they use the updated RAG system
                    global user_sessions
                    user_sessions = {}
                    
                    logger.info(f"Document {filename} added and RAG system updated successfully")
                    return jsonify({"success": True, "path": file_path, "filename": filename})
                except Exception as inner_e:
                    logger.error(f"Error during vectorization: {str(inner_e)}")
                    # Clean up file if RAG system couldn't process it
                    if os.path.exists(file_path):
                        os.remove(file_path)
                    return jsonify({"error": f"Failed during vectorization: {str(inner_e)}"}), 500
            else:
                # Clean up file if RAG system couldn't process it
                if os.path.exists(file_path):
                    os.remove(file_path)
                return jsonify({"error": "RAG system failed to process document"}), 500
        
        except Exception as e:
            logger.error(f"Error in file handling: {str(e)}")
            return jsonify({"error": f"File handling error: {str(e)}"}), 500
    
    except Exception as e:
        logger.error(f"Outer error in upload_rag_document: {str(e)}")
        return jsonify({"error": f"Server error: {str(e)}"}), 500

@app.route('/api/admin/rag-documents/remove', methods=['POST'])
def remove_rag_document():
    data = request.json
    if data is None or 'path' not in data:
        return jsonify({"error": "Document path is required"}), 400
    
    path = data['path']
    filename = os.path.basename(path)
    
    # Remove from document registry
    if path in rag_system.document_paths:
        rag_system.document_paths.remove(path)
        rag_system.save_document_registry()
        
        # Remove from loaded documents
        if filename in rag_system.documents:
            del rag_system.documents[filename]
            
            # Update vectors
            rag_system._vectorize_documents()
            
            # Clear all user sessions to ensure they use the updated RAG system
            global user_sessions
            user_sessions = {}
        
        # Delete file from disk (optional)
        try:
            if os.path.exists(path) and path.startswith('documents/'):
                os.remove(path)
        except Exception as e:
            logger.warning(f"Could not delete file {path}: {e}")
        
        logger.info(f"Document {filename} removed and RAG system updated successfully")
        return jsonify({"success": True})
    else:
        return jsonify({"error": "Document not found in registry"}), 404

# Event Handlers
def handle_menu_updated(payload):
    """Handle menu_updated event"""
    # When menu is updated, we might want to update the RAG system
    # to reflect the latest menu information
    logger.info("Menu updated, updating RAG system...")
    
    # In a real implementation, we might refresh menu documents in the RAG system

# Register event handlers
register_event_handler('menu_updated', handle_menu_updated)

# Setup consumer
setup_consumer(['menu_updated'])

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5006)