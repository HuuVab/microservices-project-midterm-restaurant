from flask import Flask, request, jsonify
from flask_cors import CORS
import socketio
import eventlet
import logging
import os
import sys
import json
import datetime

# Add common directory to path for event modules
sys.path.append(os.path.join(os.path.dirname(__file__), 'common'))
from events.consumer import setup_consumer, register_event_handler

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Initialize Socket.IO server
sio = socketio.Server(cors_allowed_origins="*", async_mode='eventlet')
app.wsgi_app = socketio.WSGIApp(sio, app.wsgi_app)

# Connected clients
connected_devices = {}

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
        "last_active": eventlet.time.strftime("%Y-%m-%d %H:%M:%S", eventlet.time.localtime()),
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
            "last_active": eventlet.time.strftime("%Y-%m-%d %H:%M:%S", eventlet.time.localtime())
        })
        logger.info(f'Device registered: {sid} as {data.get("role")} for table {data.get("table_number")}')

# Event handlers for different microservice events
def handle_menu_updated(payload):
    """Handle menu_updated event"""
    logger.info("Menu updated, notifying clients")
    sio.emit('menu_updated')

def handle_menu_item_availability_updated(payload):
    """Handle menu_item_availability_updated event"""
    item_id = payload.get('item_id')
    available = payload.get('available')
    
    logger.info(f"Menu item {item_id} availability updated to {available}")
    sio.emit('menu_item_availability_updated', {
        'item_id': item_id,
        'available': available
    })

def handle_order_created(payload):
    """Handle order_created event"""
    order_id = payload.get('order_id')
    table_number = payload.get('table_number')
    
    logger.info(f"New order {order_id} created for table {table_number}")
    
    # Notify all staff devices
    sio.emit('new_order', {'order_id': order_id})
    
    # Notify the specific table if connected
    for sid, device in connected_devices.items():
        if device.get('role') == 'customer' and device.get('table_number') == table_number:
            sio.emit('order_updated', {'order_id': order_id}, room=sid)

def handle_order_updated(payload):
    """Handle order_updated event"""
    order_id = payload.get('order_id')
    status = payload.get('status')
    
    logger.info(f"Order {order_id} updated, status: {status}")
    sio.emit('order_updated', {'order_id': order_id})

def handle_order_item_updated(payload):
    """Handle order_item_updated event"""
    order_id = payload.get('order_id')
    item_id = payload.get('item_id')
    
    logger.info(f"Order item {item_id} in order {order_id} updated")
    sio.emit('order_updated', {'order_id': order_id})

def handle_payment_processed(payload):
    """Handle payment_processed event"""
    order_id = payload.get('order_id')
    table_number = payload.get('table_number')
    
    logger.info(f"Payment processed for order {order_id}, table {table_number}")
    
    # Notify all staff devices
    sio.emit('order_updated', {'order_id': order_id})
    
    # Notify specific table
    for sid, device in connected_devices.items():
        if device.get('role') == 'customer' and device.get('table_number') == table_number:
            sio.emit('payment_completed', {
                'order_id': order_id,
                'receipt_number': payload.get('receipt_number')
            }, room=sid)

def handle_promo_updated(payload):
    """Handle promo_updated event"""
    logger.info("Promotional content updated")
    sio.emit('promo_updated')

# API Routes (for health check and monitoring)
@app.route('/api/health', methods=['GET'])
def health_check():
    """API endpoint for health checking"""
    return jsonify({
        "status": "ok",
        "connected_clients": len(connected_devices),
        "service": "notification_service"
    })

@app.route('/api/broadcast', methods=['POST'])
def broadcast_message():
    """API endpoint to broadcast a message to all clients"""
    data = request.json
    
    if not data or 'event' not in data or 'payload' not in data:
        return jsonify({"error": "Event and payload are required"}), 400
    
    event = data['event']
    payload = data['payload']
    
    # Broadcast the message
    sio.emit(event, payload)
    
    return jsonify({
        "success": True,
        "message": f"Broadcast {event} sent to {len(connected_devices)} clients"
    })

@app.route('/api/notify/table/<int:table_number>', methods=['POST'])
def notify_table(table_number):
    """API endpoint to send a notification to a specific table"""
    data = request.json
    
    if not data or 'event' not in data or 'payload' not in data:
        return jsonify({"error": "Event and payload are required"}), 400
    
    event = data['event']
    payload = data['payload']
    
    # Find devices for this table
    target_sids = []
    for sid, device in connected_devices.items():
        if device.get('role') == 'customer' and device.get('table_number') == table_number:
            target_sids.append(sid)
    
    if not target_sids:
        return jsonify({"message": f"No devices found for table {table_number}"}), 404
    
    # Send notification to each device
    for sid in target_sids:
        sio.emit(event, payload, room=sid)
    
    return jsonify({
        "success": True,
        "message": f"Notification sent to {len(target_sids)} devices at table {table_number}"
    })

@app.route('/api/notify/role/<role>', methods=['POST'])
def notify_role(role):
    """API endpoint to send a notification to all devices with a specific role"""
    data = request.json
    
    if not data or 'event' not in data or 'payload' not in data:
        return jsonify({"error": "Event and payload are required"}), 400
    
    event = data['event']
    payload = data['payload']
    
    # Find devices with this role
    target_sids = []
    for sid, device in connected_devices.items():
        if device.get('role') == role:
            target_sids.append(sid)
    
    if not target_sids:
        return jsonify({"message": f"No devices found with role {role}"}), 404
    
    # Send notification to each device
    for sid in target_sids:
        sio.emit(event, payload, room=sid)
    
    return jsonify({
        "success": True,
        "message": f"Notification sent to {len(target_sids)} devices with role {role}"
    })

# Register event handlers
register_event_handler('menu_updated', handle_menu_updated)
register_event_handler('menu_item_availability_updated', handle_menu_item_availability_updated)
register_event_handler('order_created', handle_order_created)
register_event_handler('order_updated', handle_order_updated)
register_event_handler('order_item_updated', handle_order_item_updated)
register_event_handler('payment_processed', handle_payment_processed)
register_event_handler('promo_updated', handle_promo_updated)

# Setup consumer for all events
setup_consumer([
    'menu_updated',
    'menu_item_availability_updated',
    'order_created',
    'order_updated',
    'order_item_updated',
    'payment_processed',
    'promo_updated'
])

if __name__ == '__main__':
    # Use eventlet's WSGI server with WebSocket support
    eventlet.wsgi.server(eventlet.listen(('0.0.0.0', 5005)), app)