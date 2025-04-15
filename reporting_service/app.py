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
    
    # Calculate date range
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    
    # Check cache first if enabled
    if use_cache:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT data_json FROM aggregated_sales 
            WHERE period = 'daily' AND date >= ? AND date <= ?
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
                logger.error(f"Error parsing cached daily report: {e}")
                # Fallback to fresh data if cache parsing fails
    
    try:
        # Get daily sales data from Order Service
        params = {
            'period': 'daily',
            'days': days
        }
        
        response = requests.get(
            f"{ORDER_SERVICE_URL}/api/reports/daily",
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
                logger.error(f"Error caching daily report: {e}")
            
            return jsonify(report_data)
        else:
            # Fallback to local calculation if Order Service is unavailable
            logger.warning(f"Order Service returned status {response.status_code}, falling back to local calculation")
            return calculate_daily_sales_locally(start_date, end_date)
    
    except requests.RequestException as e:
        logger.error(f"Error connecting to Order Service: {e}")
        return calculate_daily_sales_locally(start_date, end_date)

def calculate_daily_sales_locally(start_date, end_date):
    """Calculate daily sales data locally (fallback if Order Service is unavailable)"""
    # This would normally fetch from a local database
    # For now, return empty data
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
            return jsonify([])
    
    except requests.RequestException as e:
        logger.error(f"Error connecting to Order Service: {e}")
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
            return jsonify([])
    
    except requests.RequestException as e:
        logger.error(f"Error connecting to Order Service: {e}")
        return jsonify([])

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
            return jsonify([])
    
    except requests.RequestException as e:
        logger.error(f"Error connecting to Order Service: {e}")
        return jsonify([])

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
            return jsonify([])
    
    except requests.RequestException as e:
        logger.error(f"Error connecting to Order Service: {e}")
        return jsonify([])

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