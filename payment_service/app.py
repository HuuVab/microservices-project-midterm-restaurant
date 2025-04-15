from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import os
import uuid
from datetime import datetime
import logging
import requests
import sys
import base64
import time

# Add common directory to path for event modules
sys.path.append(os.path.join(os.path.dirname(__file__), 'common'))
from events.producer import publish_event
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

# Configuration
DATABASE = os.getenv('DATABASE_FILE', 'payments.db')
ORDER_SERVICE_URL = os.getenv('ORDER_SERVICE_URL', 'http://localhost:5002')

# Database setup
def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def create_tables():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create payments table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        amount REAL NOT NULL,
        method TEXT NOT NULL,
        status TEXT NOT NULL,
        transaction_id TEXT,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP
    )
    ''')
    
    # Create receipts table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS receipts (
        id TEXT PRIMARY KEY,
        payment_id TEXT NOT NULL,
        receipt_number TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        FOREIGN KEY (payment_id) REFERENCES payments (id)
    )
    ''')
    
    conn.commit()
    conn.close()
    logger.info("Database tables created or confirmed")

# Create tables on startup
create_tables()

# Helper function to validate table authentication
def validate_table_auth(auth_header, table_number):
    if not auth_header:
        return False
    
    try:
        # Decode the auth header
        decoded = base64.b64decode(auth_header).decode('utf-8')
        parts = decoded.split(':')
        
        if len(parts) != 4:
            return False
        
        if parts[0] != 'table' or parts[2] != 'time':
            return False
        
        # Check that the table number matches
        if int(parts[1]) != int(table_number):
            return False
        
        # Check timestamp (valid for 1 hour)
        timestamp = int(parts[3])
        current_time = int(time.time() * 1000)
        
        if current_time - timestamp > 3600000:
            return False
            
        return True
    except Exception as e:
        logger.error(f"Table auth validation error: {e}")
        return False

# Helper function to generate receipt number
def generate_receipt_number():
    timestamp = int(time.time())
    random_suffix = uuid.uuid4().hex[:6]
    return f"REC-{timestamp}-{random_suffix}"

# API Routes
@app.route('/api/payment/process', methods=['POST'])
def process_payment():
    data = request.json
    
    if not data or 'table_number' not in data or 'method' not in data:
        return jsonify({"error": "Missing required fields"}), 400
    
    table_number = data['table_number']
    payment_method = data['method']
    
    # Validate table authentication
    table_auth = request.headers.get('X-Table-Auth')
    if not validate_table_auth(table_auth, table_number):
        return jsonify({"error": "Invalid table authentication"}), 403
    
    try:
        # 1. Get all active orders for this table from Order Service
        orders_response = requests.get(
            f"{ORDER_SERVICE_URL}/api/orders/table/{table_number}",
            headers={'X-Table-Auth': table_auth}
        )
        
        if orders_response.status_code != 200:
            return jsonify({"error": "Failed to retrieve orders"}), 500
        
        orders = orders_response.json()
        
        if not orders:
            return jsonify({"error": "No active orders found for this table"}), 404
        
        # 2. Process payment for each order
        processed_orders = []
        total_amount = 0
        
        for order in orders:
            order_id = order['id']
            amount = order['total_amount']
            total_amount += amount
            
            # 3. Create payment record
            payment_id = str(uuid.uuid4())
            transaction_id = str(uuid.uuid4())
            
            conn = get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO payments 
                (id, order_id, amount, method, status, transaction_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                payment_id,
                order_id,
                amount,
                payment_method,
                'completed',
                transaction_id,
                datetime.now().isoformat()
            ))
            
            # 4. Update order status in Order Service
            update_response = requests.put(
                f"{ORDER_SERVICE_URL}/api/orders/{order_id}",
                json={
                    'status': 'Completed',
                    'payment_status': 'paid'
                }
            )
            
            if update_response.status_code != 200:
                logger.error(f"Failed to update order {order_id} status")
            
            processed_orders.append({
                'order_id': order_id,
                'amount': amount,
                'payment_id': payment_id
            })
            
            # 5. Publish payment processed event
            publish_event('payment_processed', {
                'payment_id': payment_id,
                'order_id': order_id,
                'amount': amount,
                'method': payment_method,
                'transaction_id': transaction_id,
                'table_number': table_number
            })
            
            conn.commit()
            conn.close()
        
        # 6. Generate receipt
        receipt_number = generate_receipt_number()
        
        # Store receipt
        conn = get_db_connection()
        cursor = conn.cursor()
        
        for order in processed_orders:
            cursor.execute("""
                INSERT INTO receipts
                (id, payment_id, receipt_number, created_at)
                VALUES (?, ?, ?, ?)
            """, (
                str(uuid.uuid4()),
                order['payment_id'],
                receipt_number,
                datetime.now().isoformat()
            ))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            "success": True,
            "message": f"Payment processed successfully with {payment_method}",
            "receipt_number": receipt_number,
            "total_amount": total_amount,
            "orders_processed": len(processed_orders)
        })
    
    except requests.RequestException as e:
        logger.error(f"Error communicating with Order Service: {e}")
        return jsonify({"error": "Communication error with Order Service"}), 500
    except Exception as e:
        logger.error(f"Error processing payment: {e}")
        return jsonify({"error": f"Payment processing failed: {str(e)}"}), 500

@app.route('/api/payment/receipts/<receipt_number>', methods=['GET'])
def get_receipt(receipt_number):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get receipt and payment details
    cursor.execute("""
        SELECT r.receipt_number, r.created_at, p.order_id, p.amount, p.method, p.transaction_id
        FROM receipts r
        JOIN payments p ON r.payment_id = p.id
        WHERE r.receipt_number = ?
    """, (receipt_number,))
    
    receipt_items = cursor.fetchall()
    conn.close()
    
    if not receipt_items:
        return jsonify({"error": "Receipt not found"}), 404
    
    # Format receipt data
    receipt_data = {
        "receipt_number": receipt_number,
        "created_at": receipt_items[0]['created_at'],
        "payment_method": receipt_items[0]['method'],
        "items": [],
        "total_amount": sum(item['amount'] for item in receipt_items)
    }
    
    # Get order details for each payment
    for item in receipt_items:
        try:
            order_response = requests.get(f"{ORDER_SERVICE_URL}/api/orders/{item['order_id']}")
            if order_response.status_code == 200:
                order = order_response.json()
                receipt_data["items"].append({
                    "order_id": item['order_id'],
                    "amount": item['amount'],
                    "items": order.get('items', [])
                })
        except:
            # If we can't get order details, just include basic info
            receipt_data["items"].append({
                "order_id": item['order_id'],
                "amount": item['amount']
            })
    
    return jsonify(receipt_data)

# Event Handlers
def handle_order_created(payload):
    """Handle order_created event"""
    logger.info(f"New order created: {payload}")
    # This service doesn't need to take action on new orders,
    # but could track them for financial reporting

# Register event handlers
register_event_handler('order_created', handle_order_created)

# Setup consumer
setup_consumer(['order_created'])

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5004)