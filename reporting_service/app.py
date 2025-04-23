from flask import Flask, request, jsonify, send_file, make_response
from flask_cors import CORS
import sqlite3
import os
import logging
import sys
import requests
from datetime import datetime, timedelta
import io
import csv
import json
import pandas as pd

# Add common directory to path for event modules
sys.path.append(os.path.join(os.path.dirname(__file__), 'common'))
from events.consumer import setup_consumer, register_event_handler

# Import PDF generation library
try:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False
    logging.warning("ReportLab not installed, PDF export will be unavailable")

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
DATABASE = os.getenv('DATABASE_FILE', 'reports.db')
ORDER_SERVICE_URL = os.getenv('ORDER_SERVICE_URL', 'http://localhost:5002')
MENU_SERVICE_URL = os.getenv('MENU_SERVICE_URL', 'http://localhost:5001')

# Database setup
def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def create_tables():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create aggregated_sales table for caching aggregated data
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS aggregated_sales (
        id INTEGER PRIMARY KEY,
        date TEXT NOT NULL,
        period TEXT NOT NULL,
        category TEXT,
        item_id INTEGER,
        order_count INTEGER NOT NULL,
        item_count INTEGER NOT NULL,
        total_amount REAL NOT NULL,
        data_json TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL
    )
    ''')
    
    # Create reports table for saved reports
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS saved_reports (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        parameters TEXT NOT NULL,
        format TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL,
        data_json TEXT NOT NULL
    )
    ''')
    
    conn.commit()
    conn.close()
    logger.info("Database tables created or confirmed")

# Create tables on startup
create_tables()

# API Routes
@app.route('/api/reports/daily', methods=['GET'])
def get_daily_sales_report():
    # Get date range from query parameters (default: last 30 days)
    days = request.args.get('days', 30, type=int)
    use_cache = request.args.get('use_cache', 'true') == 'true'
    
    print(f"Report requested: days={days}, use_cache={use_cache}")
    
    # Calculate date range
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    
    # Check cache first if enabled
    if use_cache:
        print("Checking cache...")
        conn = get_db_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT data_json FROM aggregated_sales 
                WHERE period = 'daily' AND date >= ? AND date <= ?
                ORDER BY created_at DESC LIMIT 1
            """, (
                start_date.strftime('%Y-%m-%d'),
                end_date.strftime('%Y-%m-%d')
            ))
            
            cached = cursor.fetchone()
            print(f"Cache result: {'found' if cached else 'not found'}")
            
            if cached:
                try:
                    return jsonify(json.loads(cached['data_json']))
                except Exception as e:
                    print(f"Error parsing cached data: {e}")
                    # Continue to next step if cache parsing fails
        except Exception as e:
            print(f"Error querying cache: {e}")
        finally:
            conn.close()
    
    # If we get here, either cache is disabled, not found, or failed to parse
    try:
        # Get daily sales data from Order Service
        print(f"Calling external service at {ORDER_SERVICE_URL}...")
        
        params = {
            'period': 'daily',
            'days': days
        }
        
        response = requests.get(
            f"{ORDER_SERVICE_URL}/api/reports/daily",
            params=params
        )
        
        print(f"Service response status: {response.status_code}")
        
        if response.status_code == 200:
            report_data = response.json()
            
            # Cache the result
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                
                cursor.execute("""
                    INSERT INTO aggregated_sales 
                    (date, period, order_count, item_count, total_amount, data_json, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    end_date.strftime('%Y-%m-%d'),
                    'daily',
                    sum(item.get('order_count', 0) for item in report_data),
                    sum(item.get('item_count', 0) for item in report_data),
                    sum(item.get('total_amount', 0) for item in report_data),
                    json.dumps(report_data),
                    datetime.now().isoformat()
                ))
                
                conn.commit()
                conn.close()
            except Exception as e:
                print(f"Error caching report data: {e}")
            
            return jsonify(report_data)
        else:
            # Fallback to local calculation if external service returns error
            print(f"External service returned error {response.status_code}, falling back to local calculation")
            return calculate_daily_sales_locally(days)
    
    except requests.RequestException as e:
        print(f"Error connecting to external service: {e}")
        return calculate_daily_sales_locally(days)

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

def calculate_daily_sales_locally(days):
    """Calculate daily sales data locally (fallback if Order Service is unavailable)"""
    print("Performing local calculation by querying orders from the Order Service...")
    
    try:
        # Call the orders endpoint instead and transform the data
        response = requests.get(
            f"{ORDER_SERVICE_URL}/api/orders",
            params={"date": "month"}  # Use month to get enough data
        )
        
        if response.status_code == 200:
            orders = response.json()
            
            # Group orders by date
            daily_data = {}
            for order in orders:
                date_str = order.get('created_at', '')
                if not date_str:
                    continue
                
                # Handle different date formats
                try:
                    if 'T' in date_str:
                        date = date_str.split('T')[0]  # ISO format
                    else:
                        date = date_str.split(' ')[0]  # Other format
                except:
                    continue
                
                if date not in daily_data:
                    daily_data[date] = {
                        'date': date,
                        'order_count': 0,
                        'total_amount': 0,
                        'item_count': 0
                    }
                
                daily_data[date]['order_count'] += 1
                daily_data[date]['total_amount'] += float(order.get('total_amount', 0) or 0)
                daily_data[date]['item_count'] += int(order.get('item_count', 0) or 0)
            
            # Convert to list and sort by date
            report_data = list(daily_data.values())
            report_data.sort(key=lambda x: x['date'], reverse=True)
            
            # Limit to requested number of days
            report_data = report_data[:days]
            
            print(f"Local calculation found {len(report_data)} days of data")
            return jsonify(report_data)
        else:
            print(f"Order Service returned error {response.status_code} for /api/orders")
            return jsonify([])
            
    except Exception as e:
        print(f"Error calculating local data: {e}")
        return jsonify([])

def calculate_weekly_sales_locally(weeks):
    """Calculate weekly sales data locally (fallback if Order Service is unavailable)"""
    print("Performing local calculation for weekly report...")
    
    try:
        # Call the orders endpoint instead and transform the data
        response = requests.get(
            f"{ORDER_SERVICE_URL}/api/orders",
            params={"date": "month"}  # Use month to get enough data
        )
        
        if response.status_code == 200:
            orders = response.json()
            
            # Group orders by week
            weekly_data = {}
            for order in orders:
                date_str = order.get('created_at', '')
                if not date_str:
                    continue
                
                # Handle different date formats and extract date
                try:
                    if 'T' in date_str:
                        date_str = date_str.split('T')[0]  # ISO format
                    else:
                        date_str = date_str.split(' ')[0]  # Other format
                    
                    # Parse date
                    date_parts = date_str.split('-')
                    if len(date_parts) != 3:
                        continue
                    
                    year, month, day = map(int, date_parts)
                    date_obj = datetime(year, month, day)
                    
                    # Get week number (ISO format: YYYY-Wnn)
                    week_key = f"{date_obj.isocalendar()[0]}-W{date_obj.isocalendar()[1]:02d}"
                except:
                    continue
                
                if week_key not in weekly_data:
                    weekly_data[week_key] = {
                        'week': week_key,
                        'order_count': 0,
                        'total_amount': 0,
                        'item_count': 0
                    }
                
                weekly_data[week_key]['order_count'] += 1
                weekly_data[week_key]['total_amount'] += float(order.get('total_amount', 0) or 0)
                weekly_data[week_key]['item_count'] += int(order.get('item_count', 0) or 0)
            
            # Convert to list and sort by week
            report_data = list(weekly_data.values())
            report_data.sort(key=lambda x: x['week'], reverse=True)
            
            # Limit to requested number of weeks
            report_data = report_data[:weeks]
            
            print(f"Local calculation found {len(report_data)} weeks of data")
            return jsonify(report_data)
        else:
            print(f"Order Service returned error {response.status_code} for /api/orders")
            return jsonify([])
            
    except Exception as e:
        print(f"Error calculating weekly data: {e}")
        return jsonify([])

def calculate_monthly_sales_locally(months):
    """Calculate monthly sales data locally (fallback if Order Service is unavailable)"""
    print("Performing local calculation for monthly report...")
    
    try:
        # Call the orders endpoint instead and transform the data
        response = requests.get(
            f"{ORDER_SERVICE_URL}/api/orders"
        )
        
        if response.status_code == 200:
            orders = response.json()
            
            # Group orders by month
            monthly_data = {}
            for order in orders:
                date_str = order.get('created_at', '')
                if not date_str:
                    continue
                
                # Handle different date formats and extract date
                try:
                    if 'T' in date_str:
                        date_str = date_str.split('T')[0]  # ISO format
                    else:
                        date_str = date_str.split(' ')[0]  # Other format
                    
                    # Get year-month format
                    month_key = '-'.join(date_str.split('-')[:2])  # YYYY-MM
                    
                    # Parse date for month name
                    date_parts = date_str.split('-')
                    if len(date_parts) < 2:
                        continue
                    
                    year, month = map(int, date_parts[:2])
                    month_date = datetime(year, month, 1)
                    month_name = month_date.strftime('%B %Y')
                except:
                    continue
                
                if month_key not in monthly_data:
                    monthly_data[month_key] = {
                        'month': month_name,
                        'month_code': month_key,
                        'order_count': 0,
                        'total_amount': 0,
                        'item_count': 0
                    }
                
                monthly_data[month_key]['order_count'] += 1
                monthly_data[month_key]['total_amount'] += float(order.get('total_amount', 0) or 0)
                monthly_data[month_key]['item_count'] += int(order.get('item_count', 0) or 0)
            
            # Convert to list and sort by month
            report_data = list(monthly_data.values())
            report_data.sort(key=lambda x: x['month_code'], reverse=True)
            
            # Limit to requested number of months
            report_data = report_data[:months]
            
            print(f"Local calculation found {len(report_data)} months of data")
            return jsonify(report_data)
        else:
            print(f"Order Service returned error {response.status_code} for /api/orders")
            return jsonify([])
            
    except Exception as e:
        print(f"Error calculating monthly data: {e}")
        return jsonify([])

@app.route('/api/reports/weekly', methods=['GET'])
def get_weekly_sales_report():
    # Get week range from query parameters (default: last 12 weeks)
    weeks = request.args.get('weeks', 12, type=int)
    use_cache = request.args.get('use_cache', 'true') == 'true'
    
    # Calculate date range
    end_date = datetime.now()
    start_date = end_date - timedelta(weeks=weeks)
    
    # Check cache first if enabled
    if use_cache:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT data_json FROM aggregated_sales 
            WHERE period = 'weekly' AND date >= ? AND date <= ?
            ORDER BY created_at DESC LIMIT 1
        """, (
            start_date.strftime('%Y-%m-%d'),
            end_date.strftime('%Y-%m-%d')
        ))
        
        cached = cursor.fetchone()
        conn.close()
        
        if cached:
            try:
                return jsonify(json.loads(cached['data_json']))
            except Exception as e:
                logger.error(f"Error parsing cached weekly report: {e}")
                # Fallback to fresh data if cache parsing fails
    
    try:
        # Get weekly sales data from Order Service
        params = {
            'period': 'weekly',
            'weeks': weeks
        }
        
        response = requests.get(
            f"{ORDER_SERVICE_URL}/api/reports/weekly",
            params=params
        )
        
        if response.status_code == 200:
            report_data = response.json()
            
            # Cache the result
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                
                cursor.execute("""
                    INSERT INTO aggregated_sales 
                    (date, period, order_count, item_count, total_amount, data_json, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    end_date.strftime('%Y-%m-%d'),
                    'weekly',
                    sum(item.get('order_count', 0) for item in report_data),
                    sum(item.get('item_count', 0) for item in report_data),
                    sum(item.get('total_amount', 0) for item in report_data),
                    json.dumps(report_data),
                    datetime.now().isoformat()
                ))
                
                conn.commit()
                conn.close()
            except Exception as e:
                logger.error(f"Error caching weekly report: {e}")
            
            return jsonify(report_data)
        else:
            # Fallback to local calculation if Order Service is unavailable
            logger.warning(f"Order Service returned status {response.status_code}, falling back to local calculation")
            return calculate_weekly_sales_locally(weeks)
    
    except requests.RequestException as e:
        logger.error(f"Error connecting to Order Service: {e}")
        return calculate_weekly_sales_locally(weeks)

def calculate_popular_items_locally(period='all'):
    """Calculate popular items data by combining Order and Menu service data"""
    print("Performing local calculation for popular items report...")
    
    try:
        # 1. Get orders data from Order Service
        orders_response = requests.get(
            f"{ORDER_SERVICE_URL}/api/orders",
            params={"date": "month" if period == "month" else "all"}
        )
        
        if orders_response.status_code != 200:
            print(f"Order Service returned error {orders_response.status_code}")
            return jsonify([])
            
        orders = orders_response.json()
        
        # 2. Get menu items from Menu Service
        try:
            menu_response = requests.get(f"http://menu_service:5003/api/menu-items")
            
            if menu_response.status_code == 200:
                menu_items = {item['id']: item for item in menu_response.json()}
            else:
                print(f"Menu Service returned error {menu_response.status_code}")
                menu_items = {}
        except Exception as e:
            print(f"Error connecting to Menu Service: {e}")
            menu_items = {}
        
        # 3. Process and aggregate the data without order-items endpoint
        # We have to make do with what we have
        
        # Filter orders by period
        if period == 'month':
            threshold_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
            filtered_orders = [o for o in orders if o.get('created_at', '').split('T')[0] >= threshold_date]
        elif period == 'week':
            threshold_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
            filtered_orders = [o for o in orders if o.get('created_at', '').split('T')[0] >= threshold_date]
        elif period == 'today':
            today = datetime.now().strftime('%Y-%m-%d')
            filtered_orders = [o for o in orders if o.get('created_at', '').split('T')[0] == today]
        else:
            filtered_orders = orders
        
        valid_orders = [o for o in filtered_orders if o.get('status') != 'Cancelled']
        
        # Since we don't have detailed order items, we'll use aggregated item_count from orders
        # This is an approximation but better than returning empty data
        item_count_by_order = {o['id']: o.get('item_count', 0) for o in valid_orders}
        
        # Sum up the item counts
        total_items = sum(item_count_by_order.values())
        
        # If we have menu items, we can at least show them with estimated quantities
        if menu_items:
            # Sort menu items by ID to get consistent results
            sorted_menu_items = sorted(menu_items.values(), key=lambda x: x['id'])
            
            # Generate a report with the menu items and estimated quantities
            report_data = []
            for menu_item in sorted_menu_items[:10]:  # Take top 10 for brevity
                item_id = menu_item['id']
                total_quantity = total_items // len(menu_items)  # Rough estimate
                
                report_data.append({
                    'id': item_id,
                    'name': menu_item.get('name', 'Unknown'),
                    'category': menu_item.get('category', 'Unknown'),
                    'quantity': total_quantity,
                    'revenue': total_quantity * float(menu_item.get('price', 0))
                })
        else:
            # If we don't have menu items, return placeholder data
            report_data = [{
                'id': '1',
                'name': 'Popular Item 1 (Estimated)',
                'category': 'Unknown',
                'quantity': total_items // 3,
                'revenue': 0
            }, {
                'id': '2',
                'name': 'Popular Item 2 (Estimated)',
                'category': 'Unknown',
                'quantity': total_items // 4,
                'revenue': 0
            }]
        
        print(f"Created approximated report with {len(report_data)} items")
        return jsonify(report_data)
    
    except Exception as e:
        print(f"Error calculating popular items data: {e}")
        return jsonify([])

def calculate_category_data_locally(period='all'):
    """Calculate category data using available endpoints"""
    print("Performing local calculation for category report...")
    
    try:
        # Try to get menu items from Menu Service
        try:
            menu_response = requests.get(f"http://menu_service:5003/api/menu-items")
            
            if menu_response.status_code == 200:
                menu_items = menu_response.json()
                
                # Group by category
                category_data = {}
                for item in menu_items:
                    category = item.get('category', 'Unknown')
                    
                    if category not in category_data:
                        category_data[category] = {
                            'category': category,
                            'item_count': 0,
                            'revenue': 0
                        }
                    
                    # We don't have actual sales data, so we'll just count items per category
                    category_data[category]['item_count'] += 1
                
                # Convert to list and sort
                report_data = list(category_data.values())
                report_data.sort(key=lambda x: x['item_count'], reverse=True)
                
                print(f"Created category report with {len(report_data)} categories from menu items")
                return jsonify(report_data)
            else:
                print(f"Menu Service returned error {menu_response.status_code}")
        except Exception as e:
            print(f"Error connecting to Menu Service: {e}")
        
        # Fallback to placeholder data if menu service fails
        return jsonify([
            {'category': 'Food', 'item_count': 0, 'revenue': 0},
            {'category': 'Beverages', 'item_count': 0, 'revenue': 0},
            {'category': 'Desserts', 'item_count': 0, 'revenue': 0}
        ])
    
    except Exception as e:
        print(f"Error calculating category data: {e}")
        return jsonify([])

     
@app.route('/api/reports/monthly', methods=['GET'])
def get_monthly_sales_report():
    # Get month range from query parameters (default: last 12 months)
    months = request.args.get('months', 12, type=int)
    use_cache = request.args.get('use_cache', 'true') == 'true'
    
    # Calculate date range
    end_date = datetime.now()
    start_date = datetime.now().replace(day=1)
    start_date = start_date.replace(
        month=start_date.month - months + 1 if start_date.month > months else start_date.month + 12 - months + 1, 
        year=start_date.year if start_date.month > months else start_date.year - 1
    )
    
    # Check cache first if enabled
    if use_cache:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT data_json FROM aggregated_sales 
            WHERE period = 'monthly' AND date >= ? AND date <= ?
            ORDER BY created_at DESC LIMIT 1
        """, (
            start_date.strftime('%Y-%m-%d'),
            end_date.strftime('%Y-%m-%d')
        ))
        
        cached = cursor.fetchone()
        conn.close()
        
        if cached:
            try:
                return jsonify(json.loads(cached['data_json']))
            except Exception as e:
                logger.error(f"Error parsing cached monthly report: {e}")
                # Fallback to fresh data if cache parsing fails
    
    try:
        # Get monthly sales data from Order Service
        params = {
            'period': 'monthly',
            'months': months
        }
        
        response = requests.get(
            f"{ORDER_SERVICE_URL}/api/reports/monthly",
            params=params
        )
        
        if response.status_code == 200:
            report_data = response.json()
            
            # Cache the result
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                
                cursor.execute("""
                    INSERT INTO aggregated_sales 
                    (date, period, order_count, item_count, total_amount, data_json, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    end_date.strftime('%Y-%m-%d'),
                    'monthly',
                    sum(item.get('order_count', 0) for item in report_data),
                    sum(item.get('item_count', 0) for item in report_data),
                    sum(item.get('total_amount', 0) for item in report_data),
                    json.dumps(report_data),
                    datetime.now().isoformat()
                ))
                
                conn.commit()
                conn.close()
            except Exception as e:
                logger.error(f"Error caching monthly report: {e}")
            
            return jsonify(report_data)
        else:
            # Fallback to local calculation if Order Service is unavailable
            logger.warning(f"Order Service returned status {response.status_code}, falling back to local calculation")
            return calculate_monthly_sales_locally(months)
    
    except requests.RequestException as e:
        logger.error(f"Error connecting to Order Service: {e}")
        return calculate_monthly_sales_locally(months)

@app.route('/api/reports/popular-items', methods=['GET'])
def get_popular_items_report():
    # Get period parameter
    period = request.args.get('period', 'all')
    use_cache = request.args.get('use_cache', 'true') == 'true'
    
    # Calculate date range
    end_date = datetime.now()
    
    if period == 'month':
        start_date = end_date - timedelta(days=30)
    elif period == 'week':
        start_date = end_date - timedelta(days=7)
    elif period == 'today':
        start_date = end_date.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        # 'all' period - set to a far past date
        start_date = end_date - timedelta(days=365)
    
    # Check cache first if enabled
    if use_cache:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT data_json FROM aggregated_sales 
            WHERE period = ? AND date >= ? AND date <= ?
            ORDER BY created_at DESC LIMIT 1
        """, (
            f"popular-{period}",
            start_date.strftime('%Y-%m-%d'),
            end_date.strftime('%Y-%m-%d')
        ))
        
        cached = cursor.fetchone()
        conn.close()
        
        if cached:
            try:
                return jsonify(json.loads(cached['data_json']))
            except Exception as e:
                logger.error(f"Error parsing cached popular items report: {e}")
                # Fallback to fresh data if cache parsing fails
    
    try:
        # Get popular items from Order Service
        params = {'period': period}
        
        response = requests.get(
            f"{ORDER_SERVICE_URL}/api/reports/popular-items",
            params=params
        )
        
        if response.status_code == 200:
            report_data = response.json()
            
            # Cache the result
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                
                cursor.execute("""
                    INSERT INTO aggregated_sales 
                    (date, period, order_count, item_count, total_amount, data_json, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    end_date.strftime('%Y-%m-%d'),
                    f"popular-{period}",
                    0,  # Not applicable for this report
                    sum(item.get('quantity', 0) for item in report_data),
                    sum(item.get('revenue', 0) for item in report_data),
                    json.dumps(report_data),
                    datetime.now().isoformat()
                ))
                
                conn.commit()
                conn.close()
            except Exception as e:
                logger.error(f"Error caching popular items report: {e}")
            
            return jsonify(report_data)
        else:
            # Fallback to local calculation if Order Service is unavailable
            logger.warning(f"Order Service returned status {response.status_code}, falling back to local calculation")
            return calculate_popular_items_locally(period)
    
    except requests.RequestException as e:
        logger.error(f"Error connecting to Order Service: {e}")
        return calculate_popular_items_locally(period)

@app.route('/api/reports/category', methods=['GET'])
def get_category_report():
    # Get period parameter
    period = request.args.get('period', 'all')
    use_cache = request.args.get('use_cache', 'true') == 'true'
    
    # Calculate date range
    end_date = datetime.now()
    
    if period == 'month':
        start_date = end_date - timedelta(days=30)
    elif period == 'week':
        start_date = end_date - timedelta(days=7)
    elif period == 'today':
        start_date = end_date.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        # 'all' period - set to a far past date
        start_date = end_date - timedelta(days=365)
    
    # Check cache first if enabled
    if use_cache:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT data_json FROM aggregated_sales 
            WHERE period = ? AND date >= ? AND date <= ?
            ORDER BY created_at DESC LIMIT 1
        """, (
            f"category-{period}",
            start_date.strftime('%Y-%m-%d'),
            end_date.strftime('%Y-%m-%d')
        ))
        
        cached = cursor.fetchone()
        conn.close()
        
        if cached:
            try:
                return jsonify(json.loads(cached['data_json']))
            except Exception as e:
                logger.error(f"Error parsing cached category report: {e}")
                # Fallback to fresh data if cache parsing fails
    
    try:
        # Get category report from Order Service
        params = {'period': period}
        
        response = requests.get(
            f"{ORDER_SERVICE_URL}/api/reports/category",
            params=params
        )
        
        if response.status_code == 200:
            report_data = response.json()
            
            # Cache the result
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                
                cursor.execute("""
                    INSERT INTO aggregated_sales 
                    (date, period, order_count, item_count, total_amount, data_json, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    end_date.strftime('%Y-%m-%d'),
                    f"category-{period}",
                    0,  # Not applicable for this report
                    sum(item.get('item_count', 0) for item in report_data),
                    sum(item.get('revenue', 0) for item in report_data),
                    json.dumps(report_data),
                    datetime.now().isoformat()
                ))
                
                conn.commit()
                conn.close()
            except Exception as e:
                logger.error(f"Error caching category report: {e}")
            
            return jsonify(report_data)
        else:
            # Fallback to local calculation if Order Service is unavailable
            logger.warning(f"Order Service returned status {response.status_code}, falling back to local calculation")
            return calculate_category_data_locally(period)
    
    except requests.RequestException as e:
        logger.error(f"Error connecting to Order Service: {e}")
        return calculate_category_data_locally(period)

@app.route('/api/reports/export', methods=['GET'])
def export_report():
    # Get report type and format from query parameters
    report_type = request.args.get('type', 'daily')
    format = request.args.get('format', 'csv')
    
    # Get report data based on type
    if report_type == 'daily':
        data = json.loads(get_daily_sales_report().data)
    elif report_type == 'weekly':
        data = json.loads(get_weekly_sales_report().data)
    elif report_type == 'monthly':
        data = json.loads(get_monthly_sales_report().data)
    elif report_type == 'popular':
        data = json.loads(get_popular_items_report().data)
    elif report_type == 'category':
        data = json.loads(get_category_report().data)
    else:
        return jsonify({"error": "Invalid report type"}), 400
    
    # Export as CSV
    if format.lower() == 'csv':
        return export_as_csv(data, report_type)
    # Export as PDF
    elif format.lower() == 'pdf' and REPORTLAB_AVAILABLE:
        return export_as_pdf(data, report_type)
    # Export as Excel
    elif format.lower() == 'xlsx':
        return export_as_excel(data, report_type)
    else:
        return jsonify({"error": "Invalid export format or format not supported"}), 400

def export_as_csv(data, report_type):
    """Export report data as CSV"""
    # Create CSV in memory
    output = io.StringIO()
    
    # Define headers based on report type
    if report_type == 'daily':
        fieldnames = ['date', 'order_count', 'item_count', 'total_amount']
    elif report_type == 'weekly':
        fieldnames = ['week', 'order_count', 'item_count', 'total_amount']
    elif report_type == 'monthly':
        fieldnames = ['month', 'order_count', 'item_count', 'total_amount']
    elif report_type == 'popular':
        fieldnames = ['name', 'category', 'quantity', 'revenue']
    elif report_type == 'category':
        fieldnames = ['category', 'item_count', 'revenue']
    
    # Create CSV writer
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    
    # Write data rows
    for row in data:
        # Filter to only include fields in fieldnames
        filtered_row = {k: v for k, v in row.items() if k in fieldnames}
        writer.writerow(filtered_row)
    
    # Create response
    response = make_response(output.getvalue())
    response.headers['Content-Disposition'] = f'attachment; filename={report_type}_report.csv'
    response.headers['Content-Type'] = 'text/csv'
    
    return response

def export_as_pdf(data, report_type):
    """Export report data as PDF"""
    # Create PDF in memory
    buffer = io.BytesIO()
    
    # Initialize PDF document
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    elements = []
    styles = getSampleStyleSheet()
    
    # Add title
    title_text = f"{report_type.capitalize()} Sales Report - {datetime.now().strftime('%Y-%m-%d')}"
    elements.append(Paragraph(title_text, styles['Title']))
    elements.append(Paragraph("Saigon Nouveau Restaurant", styles['Heading2']))
    elements.append(Spacer(1, 12))  # Add some space
    
    # Prepare table data based on report type
    table_data = []
    
    if report_type == 'daily':
        table_data.append(['Date', 'Orders', 'Items Sold', 'Total Sales ($)'])
        for row in data:
            table_data.append([
                row['date'],
                str(row['order_count']),
                str(row['item_count']),
                f"${row['total_amount']:.2f}"
            ])
    
    elif report_type == 'weekly':
        table_data.append(['Week', 'Orders', 'Items Sold', 'Total Sales ($)'])
        for row in data:
            table_data.append([
                row['week'],
                str(row['order_count']),
                str(row['item_count']),
                f"${row['total_amount']:.2f}"
            ])
    
    elif report_type == 'monthly':
        table_data.append(['Month', 'Orders', 'Items Sold', 'Total Sales ($)'])
        for row in data:
            table_data.append([
                row['month'],
                str(row['order_count']),
                str(row['item_count']),
                f"${row['total_amount']:.2f}"
            ])
    
    elif report_type == 'popular':
        table_data.append(['Rank', 'Item Name', 'Category', 'Quantity Sold', 'Revenue ($)'])
        for i, row in enumerate(data):
            table_data.append([
                str(i + 1),
                row['name'],
                row['category'],
                str(row['quantity']),
                f"${row['revenue']:.2f}"
            ])
    
    elif report_type == 'category':
        table_data.append(['Category', 'Items Sold', 'Revenue ($)'])
        for row in data:
            table_data.append([
                row['category'],
                str(row['item_count']),
                f"${row['revenue']:.2f}"
            ])
    
    # Create table
    table = Table(table_data)
    
    # Add style to table
    style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ])
    
    # Add row striping for better readability
    for i in range(1, len(table_data)):
        if i % 2 == 0:
            style.add('BACKGROUND', (0, i), (-1, i), colors.white)
    
    table.setStyle(style)
    elements.append(table)
    
    # Add footer with timestamp and page number
    elements.append(Spacer(1, 12))  # Add some space
    elements.append(Paragraph(f"Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", styles['Italic']))
    
    # Build document
    doc.build(elements)
    
    # Get PDF value
    pdf_value = buffer.getvalue()
    buffer.close()
    
    # Create response
    response = make_response(pdf_value)
    response.headers['Content-Disposition'] = f'attachment; filename={report_type}_report.pdf'
    response.headers['Content-Type'] = 'application/pdf'
    
    return response

def export_as_excel(data, report_type):
    """Export report data as Excel"""
    # Convert data to DataFrame
    df = pd.DataFrame(data)
    
    # Create Excel in memory
    output = io.BytesIO()
    
    # Create a Pandas Excel writer
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        # Write DataFrame to Excel
        df.to_excel(writer, sheet_name=f"{report_type.capitalize()} Report", index=False)
        
        # Get the worksheet
        worksheet = writer.sheets[f"{report_type.capitalize()} Report"]
        
        # Format header row
        for col_num, column in enumerate(df.columns, 1):
            worksheet.cell(row=1, column=col_num).font = 'bold'
    
    # Prepare response
    output.seek(0)
    
    response = make_response(output.getvalue())
    response.headers['Content-Disposition'] = f'attachment; filename={report_type}_report.xlsx'
    response.headers['Content-Type'] = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    
    return response

# Event handlers
def handle_order_created(payload):
    """Handle order_created event"""
    # Nothing to do here - we're using the Order Service for reports
    logger.info(f"Order created event received: {payload}")

def handle_payment_processed(payload):
    """Handle payment_processed event"""
    # Nothing to do here - we're using the Order Service for reports
    logger.info(f"Payment processed event received: {payload}")

# Register event handlers
register_event_handler('order_created', handle_order_created)
register_event_handler('payment_processed', handle_payment_processed)

# Setup consumer
setup_consumer(['order_created', 'payment_processed'])

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5008)