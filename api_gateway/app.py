from flask import Flask, request, jsonify, Response, send_from_directory, render_template, redirect
import requests
import os
import jwt
import datetime
import time
import uuid
import logging
import base64
import json
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
import eventlet
import socketio

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Load configuration
JWT_SECRET = os.getenv('JWT_SECRET', 'restaurant-system-secret')
JWT_ALGORITHM = 'HS256'

# Initialize Socket.IO server
sio = socketio.Server(cors_allowed_origins="*", async_mode='eventlet')
app.wsgi_app = socketio.WSGIApp(sio, app.wsgi_app)

# Service registry - would be replaced with service discovery in production
SERVICE_REGISTRY = {
    'menu_service': os.getenv('MENU_SERVICE_URL', 'http://localhost:5001'),
    'order_service': os.getenv('ORDER_SERVICE_URL', 'http://localhost:5002'),
    'user_service': os.getenv('USER_SERVICE_URL', 'http://localhost:5003'),
    'payment_service': os.getenv('PAYMENT_SERVICE_URL', 'http://localhost:5004'),
    'notification_service': os.getenv('NOTIFICATION_SERVICE_URL', 'http://localhost:5005'),
    'chatbot_service': os.getenv('CHATBOT_SERVICE_URL', 'http://localhost:5006'),
    'translation_service': os.getenv('TRANSLATION_SERVICE_URL', 'http://localhost:5007'),
    'reporting_service': os.getenv('REPORTING_SERVICE_URL', 'http://localhost:5008'),
    'content_service': os.getenv('CONTENT_SERVICE_URL', 'http://localhost:5009')
}


# Connected clients for WebSocket tracking
connected_devices = {}

# Authentication utility functions
def proxy_request(service, path, method='GET', params=None, data=None, files=None, headers=None):
    """Forward request to the appropriate microservice"""
    try:
        service_url = SERVICE_REGISTRY.get(service)
        if not service_url:
            return jsonify({'error': f'Service {service} not found'}), 404

        url = f"{service_url}{path}"

        # Tạo headers forwarding đầy đủ (trừ các header không an toàn)
        forwarded_headers = {
            key: value
            for key, value in request.headers
            if key.lower() not in ['host', 'content-length']
        }

        # Nếu headers được truyền vào (ví dụ để thêm X-Table-Auth thủ công), gộp lại
        if headers:
            forwarded_headers.update(headers)

        # DEBUG: In header đang forward
        logger.info(f"🔁 Forwarding headers to {service}: {forwarded_headers}")

        # Forward the request
        if method == 'GET':
            response = requests.get(url, params=params, headers=forwarded_headers)
        elif method == 'POST':
            if files:
                response = requests.post(url, data=data, files=files, headers=forwarded_headers)
            else:
                response = requests.post(url, json=data, headers=forwarded_headers)
        elif method == 'PUT':
            response = requests.put(url, json=data, headers=forwarded_headers)
        elif method == 'DELETE':
            response = requests.delete(url, headers=forwarded_headers)
        else:
            return jsonify({'error': 'Method not supported'}), 405

        # Return the service response
        return Response(
            response.content,
            status=response.status_code,
            content_type=response.headers.get('Content-Type', 'application/json')
        )

    except requests.RequestException as e:
        logger.error(f"Error proxying request to {service}: {e}")
        return jsonify({'error': f'Service {service} is unavailable'}), 503
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return jsonify({'error': 'Internal gateway error'}), 500

@app.route('/api/menu/import', methods=['POST'])
def import_menu():
    try:
        # Check if file exists in request
        if 'file' not in request.files:
            return jsonify({"error": "No file part"}), 400
            
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400
        
        # Get form data
        update_existing = request.form.get('update_existing', 'false')
        
        # Forward the file and form data to menu service
        service_url = SERVICE_REGISTRY.get('menu_service')
        if not service_url:
            return jsonify({"error": "Menu service not found"}), 404
            
        url = f"{service_url}/api/menu/import"
        
        # Create multipart form-data with file and form fields
        files = {'file': (file.filename, file.stream, file.content_type)}
        data = {'update_existing': update_existing}
        
        # Forward the request
        response = requests.post(url, files=files, data=data)
        
        return Response(
            response.content,
            status=response.status_code,
            content_type=response.headers.get('Content-Type', 'application/json')
        )
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
# Static files for web application
@app.route('/')
def index():
    return send_from_directory('templates', 'setup.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('static', path)

@app.route('/<role>')
def role_view(role):
    if role in ['customer', 'waiter', 'kitchen', 'manager']:
        return send_from_directory('templates', f'{role}.html')
    return send_from_directory('templates', 'index.html')

# API routes that proxy to services
# Menu Service Routes
@app.route('/api/menu', methods=['GET'])
def get_menu():
    return proxy_request('menu_service', '/api/menu', params=request.args)

@app.route('/api/menu/<int:item_id>', methods=['GET'])
def get_menu_item(item_id):
    return proxy_request('menu_service', f'/api/menu/{item_id}')

@app.route('/api/menu', methods=['POST'])
def add_menu_item():
    return proxy_request('menu_service', '/api/menu', method='POST', data=request.json)

@app.route('/api/menu/<int:item_id>', methods=['PUT'])
def update_menu_item(item_id):
    return proxy_request('menu_service', f'/api/menu/{item_id}', method='PUT', data=request.json)

@app.route('/api/menu/<int:item_id>', methods=['DELETE'])
def delete_menu_item(item_id):
    return proxy_request('menu_service', f'/api/menu/{item_id}', method='DELETE')

@app.route('/api/menu/<int:item_id>/availability', methods=['PUT'])
def update_item_availability(item_id):
    return proxy_request('menu_service', f'/api/menu/{item_id}/availability', method='PUT', data=request.json)

@app.route('/api/upload-image', methods=['POST'])
def upload_image():
    # Check if the post request has the file part
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    # Create a copy of the file content
    file_content = file.read()
    
    # Forward file upload to menu service with the copied content
    try:
        service_url = SERVICE_REGISTRY.get('menu_service')
        if not service_url:
            return jsonify({'error': 'Menu service not found'}), 404

        url = f"{service_url}/api/upload-image"
        
        # Forward with a new file object created from the content
        files = {'file': (file.filename, file_content, file.content_type)}
        
        response = requests.post(url, files=files)
        
        # Return the service response
        return Response(
            response.content,
            status=response.status_code,
            content_type=response.headers.get('Content-Type', 'application/json')
        )
        
    except Exception as e:
        return jsonify({'error': f'Error forwarding request: {str(e)}'}), 500

# Order Service Routes
@app.route('/api/orders', methods=['GET'])
def get_orders():
    return proxy_request('order_service', '/api/orders', params=request.args)

@app.route('/api/orders/<order_id>', methods=['GET'])
def get_order(order_id):
    return proxy_request('order_service', f'/api/orders/{order_id}')

@app.route('/api/orders', methods=['POST'])
def create_order():
    return proxy_request('order_service', '/api/orders', method='POST', data=request.json)

@app.route('/api/orders/<order_id>', methods=['PUT'])
def update_order(order_id):
    return proxy_request('order_service', f'/api/orders/{order_id}', method='PUT', data=request.json)

@app.route('/api/order-items/<item_id>', methods=['PUT'])
def update_order_item(item_id):
    return proxy_request('order_service', f'/api/order-items/{item_id}', method='PUT', data=request.json)

@app.route('/api/orders/table/<int:table_number>', methods=['GET'])
def get_table_orders(table_number):
    return proxy_request(
        'order_service',
        f'/api/orders/table/{table_number}'
    )

@app.route('/api/users/<int:user_id>', methods=['PUT'])
def proxy_update_user(user_id):
    return proxy_request('user_service', f'/api/users/{user_id}', method='PUT', data=request.json)

# DELETE /api/users/<user_id>
@app.route('/api/users/<int:user_id>', methods=['DELETE'])
def proxy_delete_user(user_id):
    return proxy_request('user_service', f'/api/users/{user_id}', method='DELETE')

# POST /api/users
@app.route('/api/users', methods=['POST'])
def proxy_create_user():
    return proxy_request('user_service', '/api/users', method='POST', data=request.json)

@app.route('/api/users', methods=['GET'])
def proxy_get_users():
    try:
        user_service_url = SERVICE_REGISTRY.get('user_service')
        if not user_service_url:
            return jsonify({"error": "User service not found"}), 404

        # Proxy the request
        url = f"{user_service_url}/api/users"
        logger.info(f"🔁 Forwarding GET /api/users to {url}")
        
        response = requests.get(url)

        return (response.content, response.status_code, response.headers.items())
    
    except Exception as e:
        logger.error(f"Error proxying /api/users: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/translations/ensure-assets', methods=['POST'])
def ensure_translation_assets():
    return proxy_request('translation_service', '/api/translations/ensure-assets', method='POST', data=request.json)


# User/Auth Service Routes
@app.route('/api/auth/login', methods=['POST'])
def login():
    return proxy_request('user_service', '/api/auth/login', method='POST', data=request.json)



@app.route('/api/auth/table', methods=['POST'])
def table_auth():
    return proxy_request('user_service', '/api/auth/table', method='POST', data=request.json)

# GET /api/users/<user_id>
@app.route('/api/users/<int:user_id>', methods=['GET'])
def proxy_get_user(user_id):
    return proxy_request('user_service', f'/api/users/{user_id}', method='GET')

@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login_page():
    """Handle admin login page and form submission"""
    if request.method == 'GET':
        return send_from_directory('templates', 'admin_login.html')
    else:
        # For POST requests, proxy to the user service
        try:
            # Get form data
            form_data = {}
            if request.form:
                form_data = {
                    'username': request.form.get('username'),
                    'password': request.form.get('password')
                }
            else:
                form_data = request.json or {}
            
            # Forward the data to user service
            service_url = SERVICE_REGISTRY.get('user_service')
            if not service_url:
                return jsonify({"error": "User service not found"}), 404
                
            url = f"{service_url}/api/admin/auth"
            
            # Log the request - careful not to log actual passwords in production
            logger.info(f"🔁 Forwarding admin login to user_service: {{'username': '{form_data.get('username')}'}}") 
            
            # Forward the request
            response = requests.post(url, json=form_data)
            
            # If successful, set cookie and redirect to dashboard
            if response.status_code == 200:
                result = response.json()
                # Create a session for the admin
                response_obj = redirect('/admin/dashboard')
                response_obj.set_cookie('admin_token', result.get('token'), httponly=True)
                return response_obj
            else:
                # Just return the error response from the user service
                return jsonify(response.json()), response.status_code
                
        except Exception as e:
            logger.error(f"Error during admin login: {str(e)}")
            return jsonify({"error": str(e)}), 500

@app.route('/api/translations/import', methods=['POST'])
def api_import_translations():
    try:
        # Check if file exists in request
        if 'file' not in request.files:
            return jsonify({"error": "No file part in request"}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400
        
        # Get form data
        update_existing = request.form.get('update_existing', 'true') 
        import_type = request.form.get('type', 'ui')
        
        # Forward the file and form data to translation service
        service_url = SERVICE_REGISTRY.get('translation_service')
        if not service_url:
            return jsonify({"error": "Translation service not found"}), 404
            
        url = f"{service_url}/api/translations/import"
        
        # Create multipart form-data with file and form fields
        files = {'file': (file.filename, file.stream, file.content_type)}
        data = {
            'update_existing': update_existing,
            'type': import_type
        }
        
        # Debug logging
        logger.info(f"Forwarding translation file {file.filename} to {service_url}")
        
        # Forward the request
        response = requests.post(url, files=files, data=data)
        
        return Response(
            response.content,
            status=response.status_code,
            content_type=response.headers.get('Content-Type', 'application/json')
        )
        
    except Exception as e:
        logger.error(f"Error forwarding translation import: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/admin/logout')
def admin_logout():
    # Clear the session and redirect to login
    return send_from_directory('templates', 'admin_login.html')

@app.route('/admin/dashboard')
def admin_dashboard():
    return send_from_directory('templates', 'admin_dashboard.html')

# Payment Service Routes
@app.route('/api/payment/process', methods=['POST'])
def process_payment():
    return proxy_request('payment_service', '/api/payment/process', method='POST', 
                         data=request.json, headers={'X-Table-Auth': request.headers.get('X-Table-Auth')})

# Chatbot Service Routes
@app.route('/api/chatbot', methods=['POST'])
def chatbot_api():
    return proxy_request('chatbot_service', '/api/chatbot', method='POST', data=request.json)

@app.route('/api/chatbot/clear', methods=['POST'])
def clear_chat():
    return proxy_request('chatbot_service', '/api/chatbot/clear', method='POST', data=request.json)

@app.route('/api/chatbot-status', methods=['GET'])
def check_chatbot_status():
    return proxy_request('chatbot_service', '/api/chatbot-status')

# Translation Service Routes
@app.route('/api/translations', methods=['GET'])
def get_translations():
    return proxy_request('translation_service', '/api/translations')

@app.route('/api/translations/ui', methods=['GET', 'POST'])
def ui_translations():
    if request.method == 'GET':
        return proxy_request('translation_service', '/api/translations/ui')
    else:
        return proxy_request('translation_service', '/api/translations/ui', method='POST', data=request.json)

@app.route('/api/translations/menu', methods=['GET', 'POST'])
def menu_translations():
    if request.method == 'GET':
        return proxy_request('translation_service', '/api/translations/menu')
    else:
        return proxy_request('translation_service', '/api/translations/menu', method='POST', data=request.json)

# Reporting Service Routes
@app.route('/api/reports/<report_type>', methods=['GET'])
def get_report(report_type):
    return proxy_request('reporting_service', f'/api/reports/{report_type}', params=request.args)

@app.route('/api/reports/export', methods=['GET'])
def export_report():
    return proxy_request('reporting_service', '/api/reports/export', params=request.args)

# Content Service Routes (promotions, etc.)
@app.route('/api/promo/current', methods=['GET'])
def get_current_promo():
    return proxy_request('content_service', '/api/promo/current')

@app.route('/api/promo/upload', methods=['POST'])
def upload_promo():
    try:
        service_url = SERVICE_REGISTRY.get('content_service')
        if not service_url:
            logger.error("Content service not found in SERVICE_REGISTRY")
            return jsonify({'error': 'Content service not found'}), 404

        url = f"{service_url}/api/promo/upload"
        
        logger.info(f"Forwarding promo upload to {url}")
        logger.info(f"Request files: {list(request.files.keys())}")
        
        # Check if file exists in request
        if 'file' not in request.files:
            logger.error("No file in request to forward")
            return jsonify({'error': 'No file provided'}), 400
            
        file = request.files['file']
        
        # Create multipart form-data with file
        files = {'file': (file.filename, file.stream, file.content_type)}
        
        # Include any other form data
        form_data = {}
        if request.form:
            form_data = request.form.to_dict()
            
        # Get headers but remove ones that would conflict
        headers = {key: value for key, value in request.headers.items()
                  if key.lower() not in ['host', 'content-length', 'content-type']}
        
        # Forward the request
        response = requests.post(
            url,
            files=files,
            data=form_data,
            headers=headers
        )
        
        logger.info(f"Response status: {response.status_code}")
        
        return Response(
            response.content,
            status=response.status_code,
            content_type=response.headers.get('Content-Type', 'application/json')
        )
            
    except Exception as e:
        logger.error(f"Gateway error: {str(e)}")
        return jsonify({'error': f'Gateway error: {str(e)}'}), 500
@app.route('/uploads/promo/<path:filename>')
def serve_promo_image(filename):
    # Define the path to your uploads directory relative to your app
    uploads_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads/promo')
    return send_from_directory(uploads_dir, filename)
# Error handler
@app.errorhandler(Exception)
def handle_error(e):
    code = 500
    message = str(e)
    
    if isinstance(e, HTTPException):
        code = e.code
    
    logger.error(f"Error: {message}")
    return jsonify(error=message), code

# Socket.IO event handlers
@sio.event
def connect(sid, environ):
    """Handle client connection"""
    # Get device information
    ip = environ.get('REMOTE_ADDR', 'Unknown')
    user_agent = environ.get('HTTP_USER_AGENT', 'Unknown')
    
    # Store device in connected devices
    connected_devices[sid] = {
        "ip_address": ip,
        "user_agent": user_agent,
        "last_active": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "role": "Unknown"
    }
    
    logger.info(f'Client connected: {sid}')

@sio.event
def disconnect(sid):
    """Handle client disconnection"""
    if sid in connected_devices:
        del connected_devices[sid]
    logger.info(f'Client disconnected: {sid}')

@sio.event
def register_device(sid, data):
    """Register device information"""
    if sid in connected_devices:
        connected_devices[sid].update({
            "role": data.get('role', 'Unknown'),
            "table_number": data.get('table_number'),
            "last_active": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })
        logger.info(f'Device registered: {sid} as {data.get("role")} for table {data.get("table_number")}')

# Socket.IO events to forward to clients
def forward_event_to_clients(event_name, data=None):
    """Forward events to connected clients"""
    sio.emit(event_name, data)

# Event forwarding functions
def forward_menu_updated():
    forward_event_to_clients('menu_updated')

def forward_menu_item_availability_updated(data):
    forward_event_to_clients('menu_item_availability_updated', data)

def forward_new_order(data):
    forward_event_to_clients('new_order', data)

def forward_order_updated(data):
    forward_event_to_clients('order_updated', data)

def forward_promo_updated():
    forward_event_to_clients('promo_updated')

def reset_device(sid):
    """Send reset command to specific device"""
    if sid in connected_devices:
        sio.emit('reset_device', room=sid)
        return True
    return False

# Admin API for device management
@app.route('/api/admin/devices', methods=['GET'])
def get_devices():
    devices = []
    for sid, device in connected_devices.items():
        devices.append({
            "id": sid,
            "ip_address": device.get("ip_address", "Unknown"),
            "user_agent": device.get("user_agent", "Unknown"),
            "table_number": device.get("table_number"),
            "role": device.get("role", "Unknown"),
            "last_active": device.get("last_active", "Unknown")
        })
    
    return jsonify(devices)

@app.route('/api/admin/devices/<device_id>/reset', methods=['POST'])
def reset_device_api(device_id):
    success = reset_device(device_id)
    if success:
        return jsonify({"success": True, "message": "Device reset command sent"})
    else:
        return jsonify({"error": "Device not found"}), 404

# Subscribe to the Notification Service for events
def connect_to_notification_service():
    """Connect to notification service to receive events"""
    # In a real implementation, this would use a WebSocket connection
    # to the notification service or directly subscribe to the message bus
    pass
@app.route('/debug-auth/<int:table_number>', methods=['GET'])
def debug_auth(table_number):
    auth = request.headers.get('X-Table-Auth')
    if not auth:
        return jsonify({"error": "Missing X-Table-Auth"}), 400

    try:
        import base64
        decoded = base64.b64decode(auth).decode('utf-8')
        parts = decoded.split(":")
        return jsonify({
            "raw": auth,
            "decoded": decoded,
            "parsed_parts": parts,
            "match_table": parts[1] == str(table_number)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

if __name__ == '__main__':
    # Use eventlet's WSGI server with WebSocket support
    eventlet.wsgi.server(eventlet.listen(('0.0.0.0', 5000)), app)