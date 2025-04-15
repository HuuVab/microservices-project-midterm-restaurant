from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import os
import jwt
import datetime
import logging
import sys
import base64
import time
import hashlib
import bcrypt

# Add common directory to path for event modules
sys.path.append(os.path.join(os.path.dirname(__file__), 'common'))
from events.producer import publish_event
import sys
print("PYTHON PATH:", sys.path)

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
DATABASE = os.getenv('DATABASE_FILE', 'users.db')
JWT_SECRET = os.getenv('JWT_SECRET', 'restaurant-system-secret')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION = 24 * 60 * 60  # 24 hours in seconds

# Admin credentials
ADMIN_USERNAME = os.getenv('ADMIN_USERNAME', 'admin')
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', '060704')

# Database setup
def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def create_tables():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create users table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL
    )
    ''')
    
    # Create sessions table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        token TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    ''')
    
    # Create table_auth table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS table_auth (
        id INTEGER PRIMARY KEY,
        table_number INTEGER NOT NULL,
        auth_token TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        expires_at TIMESTAMP NOT NULL
    )
    ''')
    
    conn.commit()
    conn.close()
    logger.info("Database tables created or confirmed")

# Create tables on startup
create_tables()

# Insert admin user if it doesn't exist
def ensure_admin_user():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if admin user exists
    cursor.execute("SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,))
    admin = cursor.fetchone()
    
    if not admin:
        # Hash the admin password
        password_hash = bcrypt.hashpw(ADMIN_PASSWORD.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        # Insert admin user
        cursor.execute("""
            INSERT INTO users (username, password_hash, role, created_at)
            VALUES (?, ?, ?, ?)
        """, (ADMIN_USERNAME, password_hash, 'admin', datetime.datetime.now().isoformat()))
        
        conn.commit()
        logger.info("Admin user created")
    
    conn.close()

# Ensure admin user exists
ensure_admin_user()

# Helper functions
def generate_jwt_token(user_data):
    """Generate a JWT token for a user"""
    payload = {
        'user_id': user_data['id'],
        'username': user_data['username'],
        'role': user_data['role'],
        'exp': datetime.datetime.utcnow() + datetime.timedelta(seconds=JWT_EXPIRATION)
    }
    
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token

def verify_password(password, password_hash):
    """Verify a password against a hash"""
    try:
        return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))
    except Exception as e:
        logger.error(f"Error verifying password: {e}")
        return False
@app.route('/api/admin/auth', methods=['POST'])
def admin_authentication():
    """Admin authentication endpoint"""
    # Explicitly load the JSON data
    data = request.get_json(force=True, silent=True) or {}
    
    # Extract credentials
    username = data.get('username')
    password = data.get('password')
    
    # Debug logging
    logger.info(f"Admin login attempt for user: {username}")
    logger.info(f"Request content type: {request.content_type}")
    logger.info(f"Request data received: {data}")
    
    # Check admin credentials
    if username == os.getenv('ADMIN_USERNAME', 'admin') and password == os.getenv('ADMIN_PASSWORD', '060704'):
        # Generate admin token
        expiration = datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        payload = {
            'user_id': 'admin',
            'username': username,
            'role': 'admin',
            'exp': expiration
        }
        token = jwt.encode(payload, os.getenv('JWT_SECRET', 'restaurant-system-secret'), algorithm='HS256')
        
        logger.info(f"Admin login successful: {username}")
        
        return jsonify({
            'success': True,
            'token': token,
            'user': {
                'id': 'admin',
                'username': username,
                'role': 'admin'
            }
        })
    else:
        logger.warning(f"Admin login failed: {username}")
        return jsonify({'error': 'Invalid admin credentials'}), 401

@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.form if request.form else request.json
    username = data.get('username')
    password = data.get('password')
    
    # Check if credentials match admin user
    if username == os.getenv('ADMIN_USERNAME', 'admin') and password == os.getenv('ADMIN_PASSWORD', '060704'):
        # Generate admin token
        expiration = datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        payload = {
            'user_id': 'admin',
            'role': 'admin',
            'exp': expiration
        }
        token = jwt.encode(payload, os.getenv('JWT_SECRET', 'your-secret-key-here'), algorithm='HS256')
        
        return jsonify({
            'success': True,
            'token': token,
            'user': {
                'id': 'admin',
                'username': username,
                'role': 'admin'
            }
        })
    else:
        return jsonify({'error': 'Invalid credentials'}), 401

def generate_table_auth_token(table_number):
    """Generate a table authentication token"""
    timestamp = int(time.time() * 1000)
    token_parts = ['table', str(table_number), 'time', str(timestamp)]
    token = ':'.join(token_parts)
    return base64.b64encode(token.encode('utf-8')).decode('utf-8')

# API Routes
@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({"error": "Username and password are required"}), 400
    
    username = data['username']
    password = data['password']
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get user by username
    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    
    if not user or not verify_password(password, user['password_hash']):
        conn.close()
        return jsonify({"error": "Invalid username or password"}), 401
    
    # Generate JWT token
    token = generate_jwt_token(dict(user))
    
    # Store session in database
    cursor.execute("""
        INSERT INTO sessions (user_id, token, created_at, expires_at)
        VALUES (?, ?, ?, ?)
    """, (
        user['id'],
        token,
        datetime.datetime.now().isoformat(),
        (datetime.datetime.now() + datetime.timedelta(seconds=JWT_EXPIRATION)).isoformat()
    ))
    
    conn.commit()
    conn.close()
    
    # Return token and user info
    return jsonify({
        "token": token,
        "user": {
            "id": user['id'],
            "username": user['username'],
            "role": user['role']
        }
    })

@app.route('/api/auth/table', methods=['POST'])
def table_auth():
    data = request.json
    
    if not data or 'table_number' not in data:
        return jsonify({"error": "Table number is required"}), 400
    
    table_number = data['table_number']
    
    try:
        # Generate table authentication token
        auth_token = generate_table_auth_token(table_number)
        
        # Store token in database
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Remove expired tokens for this table
        cursor.execute("""
            DELETE FROM table_auth
            WHERE table_number = ? AND expires_at < ?
        """, (
            table_number,
            datetime.datetime.now().isoformat()
        ))
        
        # Store new token
        cursor.execute("""
            INSERT INTO table_auth (table_number, auth_token, created_at, expires_at)
            VALUES (?, ?, ?, ?)
        """, (
            table_number,
            auth_token,
            datetime.datetime.now().isoformat(),
            (datetime.datetime.now() + datetime.timedelta(hours=1)).isoformat()
        ))
        
        conn.commit()
        conn.close()
        
        # Publish event for table authentication
        publish_event('table_authenticated', {
            'table_number': table_number,
            'timestamp': int(time.time())
        })
        
        return jsonify({
            "auth_token": auth_token,
            "table_number": table_number,
            "expires_at": (datetime.datetime.now() + datetime.timedelta(hours=1)).isoformat()
        })
    
    except Exception as e:
        logger.error(f"Error generating table authentication: {e}")
        return jsonify({"error": "Failed to authenticate table"}), 500



@app.route('/api/users', methods=['GET'])
def get_users():
    # This would typically require admin authentication
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, username, role, created_at FROM users")
    users = cursor.fetchall()
    
    conn.close()
    
    return jsonify([dict(user) for user in users])

@app.route('/api/users/<int:user_id>', methods=['GET'])
def get_user(user_id):
    # This would typically require authentication
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, username, role, created_at FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    
    conn.close()
    
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    return jsonify(dict(user))

@app.route('/api/users', methods=['POST'])
def create_user():
    # This would typically require admin authentication
    data = request.json
    
    if not data or not data.get('username') or not data.get('password') or not data.get('role'):
        return jsonify({"error": "Username, password, and role are required"}), 400
    
    username = data['username']
    password = data['password']
    role = data['role']
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if username already exists
    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    if cursor.fetchone():
        conn.close()
        return jsonify({"error": "Username already taken"}), 400
    
    # Hash the password
    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    # Insert user
    cursor.execute("""
        INSERT INTO users (username, password_hash, role, created_at)
        VALUES (?, ?, ?, ?)
    """, (username, password_hash, role, datetime.datetime.now().isoformat()))
    
    user_id = cursor.lastrowid
    
    conn.commit()
    conn.close()
    
    return jsonify({
        "id": user_id,
        "username": username,
        "role": role,
        "message": "User created successfully"
    })

@app.route('/api/users/<int:user_id>', methods=['PUT'])
def update_user(user_id):
    # This would typically require authentication
    data = request.json
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if user exists
    cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"error": "User not found"}), 404
    
    # Build update query
    updates = []
    values = []
    
    if 'username' in data:
        # Check if username is already taken
        cursor.execute("SELECT id FROM users WHERE username = ? AND id != ?", (data['username'], user_id))
        if cursor.fetchone():
            conn.close()
            return jsonify({"error": "Username already taken"}), 400
            
        updates.append("username = ?")
        values.append(data['username'])
    
    if 'password' in data:
        password_hash = bcrypt.hashpw(data['password'].encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        updates.append("password_hash = ?")
        values.append(password_hash)
    
    if 'role' in data:
        updates.append("role = ?")
        values.append(data['role'])
    
    if not updates:
        conn.close()
        return jsonify({"message": "No changes made"})
    
    # Execute update
    values.append(user_id)  # Add user_id for WHERE clause
    cursor.execute(
        f"UPDATE users SET {', '.join(updates)} WHERE id = ?",
        tuple(values)
    )
    
    conn.commit()
    conn.close()
    
    return jsonify({"message": "User updated successfully"})

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    # This would typically require admin authentication
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if user exists
    cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"error": "User not found"}), 404
    
    # Delete user's sessions
    cursor.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    
    # Delete user
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    
    conn.commit()
    conn.close()
    
    return jsonify({"message": "User deleted successfully"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5003)