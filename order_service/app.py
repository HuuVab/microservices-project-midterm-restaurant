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
from datetime import datetime, timedelta
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
DATABASE = os.getenv('DATABASE_FILE', 'orders.db')
MENU_SERVICE_URL = os.getenv('MENU_SERVICE_URL', 'http://localhost:5001')

# Database setup
def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def create_tables():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create orders table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        table_number INTEGER,
        status TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        completed_at TIMESTAMP,
        payment_status TEXT NOT NULL,
        total_amount REAL DEFAULT 0
    )
    ''')
    
    # Create order items table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY,
        order_id TEXT NOT NULL,
        menu_item_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        notes TEXT,
        status TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders (id)
    )
    ''')
    
    conn.commit()
    conn.close()
    logger.info("Database tables created or confirmed")

# Create tables on startup
create_tables()

# Helper function to validate table authentication


# API Routes
@app.route('/api/orders', methods=['GET'])
def get_orders():
    status = request.args.get('status', None)
    date_filter = request.args.get('date', 'all')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
        SELECT o.id, o.table_number, o.status, o.created_at, o.completed_at, o.total_amount,
               COUNT(oi.id) as item_count
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
    """
    
    conditions = []
    params = []
    
    if status:
        conditions.append("o.status = ?")
        params.append(status)
    
    if date_filter == 'today':
        conditions.append("DATE(o.created_at) = DATE('now')")
    elif date_filter == 'yesterday':
        conditions.append("DATE(o.created_at) = DATE('now', '-1 day')")
    elif date_filter == 'week':
        conditions.append("DATE(o.created_at) >= DATE('now', '-7 days')")
    elif date_filter == 'month':
        conditions.append("strftime('%Y-%m', o.created_at) = strftime('%Y-%m', 'now')")
    
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    
    query += " GROUP BY o.id ORDER BY o.created_at DESC"
    
    cursor.execute(query, params)
    orders = cursor.fetchall()
    
    conn.close()
    
    return jsonify([dict(order) for order in orders])

@app.route('/api/orders/<order_id>', methods=['GET'])
def get_order(order_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Get order details
        cursor.execute("""
            SELECT id, table_number, status, created_at, completed_at, total_amount, payment_status
            FROM orders
            WHERE id = ?
        """, (order_id,))
    
        order_row = cursor.fetchone()
    
        if order_row is None:
            return jsonify({"error": "Order not found"}), 404
            
        # Convert sqlite3.Row to dict for JSON serialization
        order = dict(order_row)
    
        # Get order items
        cursor.execute("""
            SELECT id, menu_item_id, quantity, notes, status
            FROM order_items 
            WHERE order_id = ?
        """, (order_id,))
    
        items_rows = cursor.fetchall()
        items = [dict(row) for row in items_rows]
        
        # For each item, get menu item details from the Menu Service
        enriched_items = []
        for item in items:
            try:
                menu_item_response = requests.get(
                    f"{MENU_SERVICE_URL}/api/menu/{item['menu_item_id']}"
                )
                if menu_item_response.status_code == 200:
                    menu_item = menu_item_response.json()
                    item.update({
                        'name': menu_item.get('name', 'Unknown Item'),
                        'price': menu_item.get('price', 0),
                        'image_path': menu_item.get('image_path', '')
                    })
                else:
                    logger.warning(f"Menu item {item['menu_item_id']} not found")
                    item.update({
                        'name': 'Unknown Item',
                        'price': 0,
                        'image_path': ''
                    })
            except requests.RequestException as e:
                logger.error(f"Error fetching menu item {item['menu_item_id']}: {e}")
                item.update({
                    'name': 'Unknown Item',
                    'price': 0,
                    'image_path': ''
                })
            
            enriched_items.append(item)
        
        order['items'] = enriched_items
        
        return jsonify(order)

    except Exception as e:
        logger.error(f"Error fetching order {order_id}: {e}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500
    
    finally:
        conn.close()
def get_daily_sales_data(days=30):
    """
    Get daily sales data for the specified number of days
    """
    # Calculate date range
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get daily sales data
    query = """
        SELECT 
            DATE(o.created_at) as date,
            COUNT(o.id) as order_count,
            SUM(o.total_amount) as total_amount,
            COUNT(oi.id) as item_count
        FROM 
            orders o
        LEFT JOIN 
            order_items oi ON o.id = oi.order_id
        WHERE 
            o.created_at >= ? AND o.created_at <= ?
            AND o.status != 'Cancelled'
        GROUP BY 
            DATE(o.created_at)
        ORDER BY 
            DATE(o.created_at) DESC
    """
    
    cursor.execute(query, (start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')))
    results = cursor.fetchall()
    
    conn.close()
    
    # Format results
    report_data = []
    for row in results:
        report_data.append({
            'date': row['date'],
            'order_count': row['order_count'],
            'total_amount': float(row['total_amount']) if row['total_amount'] else 0,
            'item_count': row['item_count']
        })
    
    return report_data
def get_weekly_sales_data(weeks=12):
    """
    Get weekly sales data for the specified number of weeks
    """
    # Calculate date range
    end_date = datetime.now()
    start_date = end_date - timedelta(weeks=weeks)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get weekly sales data using SQLite's strftime function
    query = """
        SELECT 
            strftime('%Y-W%W', o.created_at) as week,
            COUNT(o.id) as order_count,
            SUM(o.total_amount) as total_amount,
            COUNT(oi.id) as item_count
        FROM 
            orders o
        LEFT JOIN 
            order_items oi ON o.id = oi.order_id
        WHERE 
            o.created_at >= ? AND o.created_at <= ?
            AND o.status != 'Cancelled'
        GROUP BY 
            strftime('%Y-W%W', o.created_at)
        ORDER BY 
            strftime('%Y-W%W', o.created_at) DESC
    """
    
    cursor.execute(query, (start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')))
    results = cursor.fetchall()
    
    conn.close()
    
    # Format results
    report_data = []
    for row in results:
        report_data.append({
            'week': row['week'],
            'order_count': row['order_count'],
            'total_amount': float(row['total_amount']) if row['total_amount'] else 0,
            'item_count': row['item_count']
        })
    
    return report_data

def get_monthly_sales_data(months=12):
    """
    Get monthly sales data for the specified number of months
    """
    # Calculate date range
    end_date = datetime.now()
    start_date = datetime.now().replace(day=1)
    start_date = start_date.replace(month=start_date.month - months + 1 if start_date.month > months else start_date.month + 12 - months + 1, 
                                    year=start_date.year if start_date.month > months else start_date.year - 1)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get monthly sales data using SQLite's strftime function
    query = """
        SELECT 
            strftime('%Y-%m', o.created_at) as month,
            COUNT(o.id) as order_count,
            SUM(o.total_amount) as total_amount,
            COUNT(oi.id) as item_count
        FROM 
            orders o
        LEFT JOIN 
            order_items oi ON o.id = oi.order_id
        WHERE 
            o.created_at >= ? AND o.created_at <= ?
            AND o.status != 'Cancelled'
        GROUP BY 
            strftime('%Y-%m', o.created_at)
        ORDER BY 
            strftime('%Y-%m', o.created_at) DESC
    """
    
    cursor.execute(query, (start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')))
    results = cursor.fetchall()
    
    conn.close()
    
    # Format results
    report_data = []
    for row in results:
        # Format month name for display
        month_date = datetime.strptime(row['month'], '%Y-%m')
        month_name = month_date.strftime('%B %Y')
        
        report_data.append({
            'month': month_name,
            'month_code': row['month'],
            'order_count': row['order_count'],
            'total_amount': float(row['total_amount']) if row['total_amount'] else 0,
            'item_count': row['item_count']
        })
    
    return report_data

def get_popular_items_data(period='all'):
    """
    Get popular items data for the specified period by combining
    data from order_items table and Menu Service API
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # First, get order items with quantities grouped by menu_item_id
        query = """
            SELECT 
                oi.menu_item_id,
                SUM(oi.quantity) as quantity
            FROM 
                order_items oi
            JOIN 
                orders o ON oi.order_id = o.id
            WHERE 
                o.status != 'Cancelled'
        """
        
        # Add time period filter
        params = []
        if period == 'month':
            query += " AND o.created_at >= date('now', '-1 month')"
        elif period == 'week':
            query += " AND o.created_at >= date('now', '-7 days')"
        elif period == 'today':
            query += " AND DATE(o.created_at) = DATE('now')"
        
        # Group and order by
        query += """
            GROUP BY 
                oi.menu_item_id
            ORDER BY 
                quantity DESC
        """
        
        cursor.execute(query, params)
        results = cursor.fetchall()
        
        # Format results by getting item details from Menu Service
        report_data = []
        for row in results:
            menu_item_id = row['menu_item_id']
            quantity = row['quantity']
            
            try:
                # Get item details from Menu Service
                menu_response = requests.get(f"{MENU_SERVICE_URL}/api/menu/{menu_item_id}")
                
                if menu_response.status_code == 200:
                    menu_item = menu_response.json()
                    price = float(menu_item.get('price', 0))
                    
                    report_data.append({
                        'id': menu_item_id,
                        'name': menu_item.get('name', 'Unknown Item'),
                        'category': menu_item.get('category', 'Uncategorized'),
                        'quantity': quantity,
                        'revenue': quantity * price
                    })
                else:
                    logger.warning(f"Could not get details for menu item {menu_item_id}")
                    
                    # Include the item anyway with limited info
                    report_data.append({
                        'id': menu_item_id,
                        'name': f'Item #{menu_item_id}',
                        'category': 'Unknown',
                        'quantity': quantity,
                        'revenue': 0
                    })
                    
            except requests.RequestException as e:
                logger.error(f"Error connecting to Menu Service: {e}")
                
                # Include the item anyway with limited info
                report_data.append({
                    'id': menu_item_id,
                    'name': f'Item #{menu_item_id}',
                    'category': 'Unknown',
                    'quantity': quantity,
                    'revenue': 0
                })
                
        return report_data
    
    except Exception as e:
        logger.error(f"Error getting popular items data: {e}")
        return []
    
    finally:
        conn.close()

def get_category_data(period='all'):
    """
    Get category sales data for the specified period by first getting
    popular items then grouping them by category
    """
    try:
        # First get the popular items data which includes category info
        items_data = get_popular_items_data(period)
        
        # Group by category
        category_data = {}
        for item in items_data:
            category = item.get('category', 'Unknown')
            
            if category not in category_data:
                category_data[category] = {
                    'category': category,
                    'item_count': 0,
                    'revenue': 0
                }
            
            category_data[category]['item_count'] += item.get('quantity', 0)
            category_data[category]['revenue'] += item.get('revenue', 0)
        
        # Convert to list and sort by revenue
        report_data = list(category_data.values())
        report_data.sort(key=lambda x: x['revenue'], reverse=True)
        
        return report_data
        
    except Exception as e:
        logger.error(f"Error getting category data: {e}")
        return []

        
@app.route('/api/reports/daily', methods=['GET'])
def get_daily_sales_report():
    days = request.args.get('days', 30, type=int)
    report_data = get_daily_sales_data(days=days)
    return jsonify(report_data)

@app.route('/api/reports/weekly', methods=['GET'])
def get_weekly_sales_report():
    weeks = request.args.get('weeks', 12, type=int)
    report_data = get_weekly_sales_data(weeks=weeks)
    return jsonify(report_data)

@app.route('/api/reports/monthly', methods=['GET'])
def get_monthly_sales_report():
    months = request.args.get('months', 12, type=int)
    report_data = get_monthly_sales_data(months=months)
    return jsonify(report_data)

@app.route('/api/reports/popular-items', methods=['GET'])
def get_popular_items_report():
    period = request.args.get('period', 'all')
    report_data = get_popular_items_data(period=period)
    return jsonify(report_data)

@app.route('/api/reports/category', methods=['GET'])
def get_category_report():
    period = request.args.get('period', 'all')
    report_data = get_category_data(period=period)
    return jsonify(report_data)

@app.route('/api/orders', methods=['POST'])
def create_order():
    data = request.json
    table_number = data.get('table_number')
    items = data.get('items', [])
    payment_status = data.get('payment_status', 'unpaid')
    
    if not table_number or not items:
        return jsonify({"error": "Table number and items are required"}), 400
    
    # Validate items with Menu Service
    validated_items = []
    total_amount = 0
    
    for item in items:
        menu_item_id = item.get('menu_item_id')
        try:
            # Verify item exists and get current price
            menu_item_response = requests.get(
                f"{MENU_SERVICE_URL}/api/menu/{menu_item_id}"
            )
            if menu_item_response.status_code == 200:
                menu_item = menu_item_response.json()
                if not menu_item.get('available', True):
                    return jsonify({
                        "error": f"Item {menu_item.get('name', 'Unknown')} is not available"
                    }), 400
                
                # Use current price from menu service
                validated_item = {
                    'menu_item_id': menu_item_id,
                    'quantity': item.get('quantity', 1),
                    'notes': item.get('notes', ''),
                    'price': menu_item.get('price', 0)
                }
                validated_items.append(validated_item)
                total_amount += validated_item['price'] * validated_item['quantity']
            else:
                return jsonify({
                    "error": f"Menu item {menu_item_id} not found"
                }), 400
        except requests.RequestException as e:
            logger.error(f"Error validating menu item {menu_item_id}: {e}")
            return jsonify({
                "error": f"Could not validate menu item {menu_item_id}"
            }), 500
    
    # Generate a unique order ID
    order_id = str(uuid.uuid4())
    
    # Always start with 'Pending' status for order workflow
    order_status = 'Pending'
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Insert the order
        cursor.execute("""
            INSERT INTO orders (id, table_number, status, created_at, total_amount, payment_status)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (order_id, table_number, order_status, datetime.now().isoformat(), total_amount, payment_status))
        
        # Insert order items
        for item in validated_items:
            cursor.execute("""
                INSERT INTO order_items (order_id, menu_item_id, quantity, notes, status)
                VALUES (?, ?, ?, ?, ?)
            """, (order_id, item['menu_item_id'], item['quantity'], 
                item.get('notes', ''), 'Pending'))
        
        conn.commit()
        
        # Publish event for new order
        publish_event('order_created', {
            'order_id': order_id,
            'table_number': table_number,
            'status': order_status,
            'total_amount': total_amount,
            'items_count': len(validated_items)
        })
        
        return jsonify({"id": order_id, "message": "Order created successfully"})
    
    except Exception as e:
        conn.rollback()
        logger.error(f"Error creating order: {e}")
        return jsonify({"error": str(e)}), 500
    
    finally:
        conn.close()

@app.route('/api/orders/<order_id>', methods=['PUT'])
def update_order(order_id):
    data = request.json
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Check if order exists
        cursor.execute("SELECT id FROM orders WHERE id = ?", (order_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({"error": "Order not found"}), 404
        
        # Build update query
        updates = []
        values = []
        
        # Update order status if provided
        if 'status' in data:
            updates.append("status = ?")
            values.append(data['status'])
            
            # If order is completed, set completed_at timestamp
            if data['status'] == 'Completed':
                updates.append("completed_at = ?")
                values.append(datetime.now().isoformat())
        
        # Update payment status if provided
        if 'payment_status' in data:
            updates.append("payment_status = ?")
            values.append(data['payment_status'])
        
        if not updates:
            conn.close()
            return jsonify({"message": "No changes made"})
        
        # Execute update
        values.append(order_id)  # Add order_id for WHERE clause
        cursor.execute(
            f"UPDATE orders SET {', '.join(updates)} WHERE id = ?",
            tuple(values)
        )
        
        conn.commit()
        
        # Publish event for order update
        event_data = {
            'order_id': order_id
        }
        if 'status' in data:
            event_data['status'] = data['status']
        if 'payment_status' in data:
            event_data['payment_status'] = data['payment_status']
            
        publish_event('order_updated', event_data)
        
        return jsonify({"message": "Order updated successfully"})
    
    except Exception as e:
        conn.rollback()
        logger.error(f"Error updating order {order_id}: {e}")
        return jsonify({"error": str(e)}), 500
    
    finally:
        conn.close()

@app.route('/api/order-items', methods=['GET'])
def get_order_items():
    order_id = request.args.get('order_id', None)
    status = request.args.get('status', None)
    date_filter = request.args.get('date', 'all')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
        SELECT oi.id, oi.order_id, oi.menu_item_id, oi.quantity, oi.notes, oi.status,
               o.created_at, o.table_number
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
    """
    
    conditions = []
    params = []
    
    if order_id:
        conditions.append("oi.order_id = ?")
        params.append(order_id)
    
    if status:
        conditions.append("oi.status = ?")
        params.append(status)
    
    if date_filter == 'today':
        conditions.append("DATE(o.created_at) = DATE('now')")
    elif date_filter == 'yesterday':
        conditions.append("DATE(o.created_at) = DATE('now', '-1 day')")
    elif date_filter == 'week':
        conditions.append("DATE(o.created_at) >= DATE('now', '-7 days')")
    elif date_filter == 'month':
        conditions.append("strftime('%Y-%m', o.created_at) = strftime('%Y-%m', 'now')")
    
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    
    query += " ORDER BY o.created_at DESC, oi.id ASC"
    
    cursor.execute(query, params)
    items = cursor.fetchall()
    
    conn.close()
    
    # Convert to list of dictionaries for JSON serialization
    result = []
    for item in items:
        item_dict = dict(item)
        # Try to get menu item details for each order item
        try:
            menu_item_response = requests.get(
                f"{MENU_SERVICE_URL}/api/menu/{item['menu_item_id']}"
            )
            if menu_item_response.status_code == 200:
                menu_item = menu_item_response.json()
                item_dict.update({
                    'name': menu_item.get('name', 'Unknown Item'),
                    'price': menu_item.get('price', 0),
                    'category': menu_item.get('category', 'Uncategorized')
                })
            else:
                item_dict.update({
                    'name': 'Unknown Item',
                    'price': 0,
                    'category': 'Uncategorized'
                })
        except requests.RequestException:
            # If we can't reach the Menu Service, add placeholder data
            item_dict.update({
                'name': 'Unknown Item',
                'price': 0,
                'category': 'Uncategorized'
            })
        
        result.append(item_dict)
    
    return jsonify(result)

@app.route('/api/order-items/<item_id>', methods=['PUT'])
def update_order_item(item_id):
    data = request.json
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Check if item exists and get order_id
        cursor.execute("SELECT order_id FROM order_items WHERE id = ?", (item_id,))
        result = cursor.fetchone()
        
        if not result:
            conn.close()
            return jsonify({"error": "Order item not found"}), 404
        
        order_id = result['order_id']
        
        # Build update query
        updates = []
        values = []
        
        # Update status if provided
        if 'status' in data:
            updates.append("status = ?")
            values.append(data['status'])
        
        # Update notes if provided
        if 'notes' in data:
            updates.append("notes = ?")
            values.append(data['notes'])
        
        # Update quantity if provided
        if 'quantity' in data:
            updates.append("quantity = ?")
            values.append(data['quantity'])
        
        if not updates:
            conn.close()
            return jsonify({"message": "No changes made"})
        
        # Execute update
        values.append(item_id)  # Add item_id for WHERE clause
        cursor.execute(
            f"UPDATE order_items SET {', '.join(updates)} WHERE id = ?",
            tuple(values)
        )
        
        # Update total amount if quantity changed
        if 'quantity' in data:
            # Recalculate order total
            cursor.execute("""
                SELECT oi.menu_item_id, oi.quantity 
                FROM order_items oi 
                WHERE oi.order_id = ?
            """, (order_id,))
            
            items = cursor.fetchall()
            total_amount = 0
            
            for item in items:
                try:
                    # Get current price from menu service
                    menu_item_response = requests.get(
                        f"{MENU_SERVICE_URL}/api/menu/{item['menu_item_id']}"
                    )
                    if menu_item_response.status_code == 200:
                        menu_item = menu_item_response.json()
                        price = menu_item.get('price', 0)
                        total_amount += price * item['quantity']
                except:
                    # If we can't get the price, just continue with what we have
                    pass
            
            # Update order total
            cursor.execute(
                "UPDATE orders SET total_amount = ? WHERE id = ?",
                (total_amount, order_id)
            )
        
        conn.commit()
        
        # Publish event for order item update
        publish_event('order_item_updated', {
            'order_id': order_id,
            'item_id': item_id,
            'updated_fields': list(data.keys())
        })
        
        return jsonify({"message": "Order item updated successfully"})
    
    except Exception as e:
        conn.rollback()
        logger.error(f"Error updating order item {item_id}: {e}")
        return jsonify({"error": str(e)}), 500
    
    finally:
        conn.close()

@app.route('/api/orders/table/<int:table_number>', methods=['GET'])
def get_table_orders(table_number):
    # Validate table authentication
    table_auth = request.headers.get('X-Table-Auth')
    if not validate_table_auth(table_auth, table_number):
        return jsonify({"error": "Invalid table authentication"}), 403
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Get orders for this table that are active
        cursor.execute("""
            SELECT id, table_number, status, created_at, total_amount, payment_status
            FROM orders
            WHERE table_number = ? AND status NOT IN ('Completed', 'Cancelled')
            ORDER BY created_at DESC
        """, (table_number,))
        
        orders = cursor.fetchall()
        orders_list = []
        
        for order in orders:
            order_dict = dict(order)
            
            # Get order items
            cursor.execute("""
                SELECT id, menu_item_id, quantity, notes, status
                FROM order_items
                WHERE order_id = ?
            """, (order['id'],))
            
            items = cursor.fetchall()
            items_list = []
            
            # Get menu item details for each order item
            for item in items:
                item_dict = dict(item)
                try:
                    # Get item details from menu service
                    menu_item_response = requests.get(
                        f"{MENU_SERVICE_URL}/api/menu/{item['menu_item_id']}"
                    )
                    if menu_item_response.status_code == 200:
                        menu_item = menu_item_response.json()
                        item_dict.update({
                            'name': menu_item.get('name', 'Unknown Item'),
                            'price': menu_item.get('price', 0),
                            'image_path': menu_item.get('image_path', '')
                        })
                    else:
                        item_dict.update({
                            'name': 'Unknown Item',
                            'price': 0,
                            'image_path': ''
                        })
                except requests.RequestException:
                    item_dict.update({
                        'name': 'Unknown Item',
                        'price': 0,
                        'image_path': ''
                    })
                
                items_list.append(item_dict)
            
            order_dict['items'] = items_list
            orders_list.append(order_dict)
        
        return jsonify(orders_list)
    
    except Exception as e:
        logger.error(f"Error fetching orders for table {table_number}: {e}")
        return jsonify({"error": str(e)}), 500
    
    finally:
        conn.close()
def validate_table_auth(auth_header, table_number):
    if not auth_header:
        print("❌ Missing auth header")
        return False
    
    try:
        decoded = base64.b64decode(auth_header).decode('utf-8')
        print("🔓 Decoded:", decoded)

        parts = decoded.split(':')
        if len(parts) != 4:
            print("❌ Invalid token format:", parts)
            return False

        if parts[0] != 'table' or parts[2] != 'time':
            print("❌ Invalid token structure")
            return False

        if int(parts[1]) != int(table_number):
            print(f"❌ Table mismatch: token={parts[1]}, expected={table_number}")
            return False

        timestamp = int(parts[3])
        current_time = int(time.time() * 1000)
        print(f"⏰ Time diff: {current_time - timestamp}ms")

        if current_time - timestamp > 86400000:
            print("❌ Token expired")
            return False

        print("✅ Token valid")
        return True
    except Exception as e:
        print("❌ Exception during validation:", e)
        return False


# Event Handlers
def handle_payment_processed(payload):
    """Handle payment_processed event"""
    try:
        order_id = payload.get('order_id')
        if not order_id:
            logger.error("Payment processed event missing order_id")
            return
            
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Update order status to Completed and payment status to paid
        cursor.execute("""
            UPDATE orders 
            SET status = 'Completed', payment_status = 'paid', completed_at = ?
            WHERE id = ?
        """, (datetime.now().isoformat(), order_id))
        
        # Update all order items to Completed
        cursor.execute("""
            UPDATE order_items
            SET status = 'Completed'
            WHERE order_id = ?
        """, (order_id,))
        
        conn.commit()
        conn.close()
        
        # Publish order updated event
        publish_event('order_updated', {
            'order_id': order_id,
            'status': 'Completed',
            'payment_status': 'paid'
        })
        
        logger.info(f"Order {order_id} marked as completed after payment")
        
    except Exception as e:
        logger.error(f"Error handling payment_processed event: {e}")

def handle_menu_item_availability_updated(payload):
    """Handle menu_item_availability_updated event"""
    # In a real implementation, we might need to cancel pending orders with unavailable items
    logger.info(f"Menu item availability updated: {payload}")

# Register event handlers
register_event_handler('payment_processed', handle_payment_processed)
register_event_handler('menu_item_availability_updated', handle_menu_item_availability_updated)

# Setup consumer
setup_consumer(['payment_processed', 'menu_item_availability_updated'])

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002)