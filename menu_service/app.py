from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import os
import time
from werkzeug.utils import secure_filename
import logging
import sys
import pandas
import openpyxl
# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create a dummy event producer for now
def publish_event(event_type, payload):
    logger.info(f"Would publish event {event_type}: {payload}")
    return True

# Configuration
DATABASE = os.getenv('DATABASE_FILE', 'menu.db')
UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', 'static/images/menu')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload

# Database setup
def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def create_tables():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create menu items table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS menu_items (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        category TEXT NOT NULL,
        image_path TEXT,
        best_seller BOOLEAN DEFAULT 0,
        discount_percentage INTEGER DEFAULT 0,
        available BOOLEAN DEFAULT 1
    )
    ''')
    
    conn.commit()
    conn.close()
    logger.info("Database tables created or confirmed")

# Create tables on startup
create_tables()

# Insert sample menu items if none exist
def insert_sample_data():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if menu items exist
    cursor.execute("SELECT COUNT(*) FROM menu_items")
    if cursor.fetchone()[0] == 0:
        # Insert sample data
        menu_items = [
            ('Phở Bò', 'Traditional Vietnamese beef noodle soup', 12.99, 'Main', ''),
            ('Gỏi Cuốn', 'Fresh spring rolls with shrimp and herbs', 7.99, 'Appetizer', ''),
            ('Bánh Mì', 'Vietnamese sandwich with grilled pork', 9.99, 'Main', ''),
            ('Cà Phê Sữa Đá', 'Vietnamese iced coffee with condensed milk', 4.99, 'Beverage', ''),
            ('Chả Giò', 'Crispy Vietnamese egg rolls', 6.99, 'Appetizer', ''),
            ('Bún Chả', 'Grilled pork with rice noodles and herbs', 13.99, 'Main', ''),
            ('Cơm Tấm', 'Broken rice with grilled pork chop', 11.99, 'Main', ''),
            ('Sinh Tố', 'Vietnamese fruit smoothie', 5.99, 'Beverage', '')
        ]
        
        cursor.executemany(
            "INSERT INTO menu_items (name, description, price, category, image_path) VALUES (?, ?, ?, ?, ?)",
            menu_items
        )
        
        conn.commit()
        logger.info(f"Inserted {len(menu_items)} sample menu items")
    
    conn.close()

# Insert sample data on startup
insert_sample_data()

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
@app.route('/api/menu/import', methods=['POST'])
def import_menu():
    # Check if file is present
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    # Check if update_existing flag is set
    update_existing = request.form.get('update_existing') == 'true'
    
    try:
        # Determine file type by extension
        file_ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
        
        if file_ext in ['xlsx', 'xls']:
            # Handle Excel files
            try:
                import pandas as pd
                
                # Save file temporarily
                temp_path = '/tmp/temp_import.' + file_ext
                file.save(temp_path)
                
                # Read Excel file
                df = pd.read_excel(temp_path)
                
                # Map column names (convert to lowercase and handle Price($))
                column_mapping = {
                    'ID': 'id',
                    'Name': 'name',
                    'Price($)': 'price',
                    'Type': 'category',
                    'Description': 'description',
                    'Image Path': 'image_path'
                }
                
                # Rename columns if they exist
                for old_name, new_name in column_mapping.items():
                    if old_name in df.columns:
                        df = df.rename(columns={old_name: new_name})
                
                # Convert to list of dictionaries
                records = df.to_dict('records')
                
                # Process the records
                return process_excel_import(records, update_existing)
                
            except ImportError:
                return jsonify({"error": "Excel support requires pandas and openpyxl libraries"}), 500
            except Exception as e:
                return jsonify({"error": f"Error processing Excel file: {str(e)}"}), 500
        
        elif file_ext == 'csv':
            # Handle CSV files (with column mapping)
            content = file.read().decode('utf-8-sig')  # Try with UTF-8 BOM
            return process_csv_import(content, update_existing)
        
        else:
            return jsonify({"error": f"Unsupported file format: {file_ext}"}), 400
            
    except Exception as e:
        return jsonify({"error": f"Import error: {str(e)}"}), 500

def process_excel_import(records, update_existing):
    imported_count = 0
    updated_count = 0
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    for row in records:
        # Extract values with appropriate handling of missing/null values
        name = str(row.get('name', '')) if row.get('name') is not None else ''
        description = str(row.get('description', '')) if row.get('description') is not None else ''
        
        # Handle price conversion safely
        try:
            price = float(row.get('price', 0))
        except (ValueError, TypeError):
            price = 0.0
            
        category = str(row.get('category', '')) if row.get('category') is not None else ''
        image_path = str(row.get('image_path', '')) if row.get('image_path') is not None else ''
        
        # Check if item exists by ID or name
        item_id = row.get('id')
        if item_id and update_existing:
            # Check if ID exists
            cursor.execute("SELECT id FROM menu_items WHERE id = ?", (item_id,))
            existing_item = cursor.fetchone()
            
            if existing_item:
                # Update existing item by ID
                cursor.execute(
                    """
                    UPDATE menu_items 
                    SET name = ?, description = ?, price = ?, category = ?, image_path = ?
                    WHERE id = ?
                    """,
                    (name, description, price, category, image_path, item_id)
                )
                updated_count += 1
                continue
        
        # If not updating by ID or ID not found, check by name
        if name:
            cursor.execute("SELECT id FROM menu_items WHERE name = ?", (name,))
            existing_item = cursor.fetchone()
            
            if existing_item and update_existing:
                # Update existing item by name
                cursor.execute(
                    """
                    UPDATE menu_items 
                    SET description = ?, price = ?, category = ?, image_path = ?
                    WHERE id = ?
                    """,
                    (description, price, category, image_path, existing_item['id'])
                )
                updated_count += 1
            elif not existing_item:
                # Insert new item
                cursor.execute(
                    """
                    INSERT INTO menu_items 
                    (name, description, price, category, image_path) 
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (name, description, price, category, image_path)
                )
                imported_count += 1
    
    conn.commit()
    conn.close()
    
    # Publish event for menu update
    publish_event('menu_updated', {})
    
    return jsonify({
        "success": True,
        "imported": imported_count,
        "updated": updated_count
    })

def process_dict_import(records, update_existing):
    # Process import with database operations
    imported_count = 0
    updated_count = 0
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    for row in records:
        # Check if item already exists
        cursor.execute("SELECT id FROM menu_items WHERE name = ?", (row.get('name'),))
        existing_item = cursor.fetchone()
        
        if existing_item and update_existing:
            # Update existing item
            update_fields = []
            values = []
            
            if 'description' in row:
                update_fields.append("description = ?")
                values.append(row['description'])
            
            if 'price' in row:
                update_fields.append("price = ?")
                try:
                    values.append(float(row['price']))
                except (ValueError, TypeError):
                    values.append(0.0)
            
            if 'category' in row:
                update_fields.append("category = ?")
                values.append(row['category'])
            
            if 'best_seller' in row:
                update_fields.append("best_seller = ?")
                values.append(1 if str(row['best_seller']).lower() in ['true', 'yes', '1'] else 0)
            
            if 'discount_percentage' in row:
                update_fields.append("discount_percentage = ?")
                try:
                    values.append(int(row['discount_percentage']))
                except (ValueError, TypeError):
                    values.append(0)
            
            if update_fields:
                values.append(existing_item['id'])
                cursor.execute(
                    f"UPDATE menu_items SET {', '.join(update_fields)} WHERE id = ?",
                    tuple(values)
                )
                updated_count += 1
        
        elif not existing_item:
            # Insert new item
            try:
                cursor.execute(
                    """
                    INSERT INTO menu_items 
                    (name, description, price, category, best_seller, discount_percentage) 
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        row.get('name', ''),
                        row.get('description', ''),
                        float(row.get('price', 0)),
                        row.get('category', ''),
                        1 if str(row.get('best_seller', '')).lower() in ['true', 'yes', '1'] else 0,
                        int(row.get('discount_percentage', 0))
                    )
                )
                imported_count += 1
            except (ValueError, TypeError) as e:
                # Log the error but continue with other records
                print(f"Error inserting row {row}: {str(e)}")
    
    conn.commit()
    conn.close()
    
    # Publish event for menu update
    publish_event('menu_updated', {})
    
    return jsonify({
        "success": True,
        "imported": imported_count,
        "updated": updated_count
    })
# API Routes
@app.route('/api/menu', methods=['GET'])
def get_menu():
    category = request.args.get('category', 'All')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if category == 'All':
        cursor.execute("SELECT * FROM menu_items ORDER BY category, name")
    else:
        cursor.execute("SELECT * FROM menu_items WHERE category = ? ORDER BY name", (category,))
    
    menu_items = cursor.fetchall()
    conn.close()
    
    # Convert to list of dictionaries and ensure 'available' is properly set
    result = []
    for item in menu_items:
        item_dict = dict(item)
        # Make sure available is explicitly set to a boolean for JSON
        item_dict['available'] = bool(item_dict['available'])
        item_dict['best_seller'] = bool(item_dict['best_seller'])
        result.append(item_dict)
    
    return jsonify(result)

@app.route('/api/menu/<int:item_id>', methods=['GET'])
def get_menu_item(item_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM menu_items WHERE id = ?", (item_id,))
    item = cursor.fetchone()
    
    conn.close()
    
    if item is None:
        return jsonify({"error": "Item not found"}), 404
    
    item_dict = dict(item)
    item_dict['available'] = bool(item_dict['available'])
    item_dict['best_seller'] = bool(item_dict['best_seller'])
    
    return jsonify(item_dict)

@app.route('/api/menu', methods=['POST'])
def add_menu_item():
    data = request.json
    
    if not data or not all(k in data for k in ('name', 'category', 'price')):
        return jsonify({"error": "Missing required fields"}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Extract the new fields with default values
    best_seller = 1 if data.get('best_seller', False) else 0
    discount_percentage = max(0, min(100, int(data.get('discount_percentage', 0))))
    
    cursor.execute(
        """
        INSERT INTO menu_items 
        (name, description, price, category, image_path, best_seller, discount_percentage) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data['name'], 
            data.get('description', ''), 
            data['price'],
            data['category'], 
            data.get('image_path', ''),
            best_seller,
            discount_percentage
        )
    )
    
    item_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    # Publish event
    publish_event('menu_item_created', {
        'item_id': item_id,
        'name': data['name'],
        'category': data['category']
    })
    
    return jsonify({"id": item_id, "message": "Menu item added successfully"})

@app.route('/api/menu/<int:item_id>', methods=['PUT'])
def update_menu_item(item_id):
    data = request.json
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if item exists
    cursor.execute("SELECT id FROM menu_items WHERE id = ?", (item_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"error": "Item not found"}), 404
    
    # Update fields that are provided
    updates = []
    values = []
    
    if 'name' in data:
        updates.append("name = ?")
        values.append(data['name'])
    
    if 'description' in data:
        updates.append("description = ?")
        values.append(data['description'])
    
    if 'price' in data:
        updates.append("price = ?")
        values.append(data['price'])
    
    if 'category' in data:
        updates.append("category = ?")
        values.append(data['category'])
    
    if 'image_path' in data:
        updates.append("image_path = ?")
        values.append(data['image_path'])
    
    # Add the new fields
    if 'best_seller' in data:
        updates.append("best_seller = ?")
        values.append(1 if data['best_seller'] else 0)
    
    if 'discount_percentage' in data:
        # Ensure discount is between 0 and 100
        discount = max(0, min(100, int(data['discount_percentage'])))
        updates.append("discount_percentage = ?")
        values.append(discount)

    if 'available' in data:
        updates.append("available = ?")
        values.append(1 if data['available'] else 0)
    
    if not updates:
        conn.close()
        return jsonify({"message": "No changes made"})
    
    values.append(item_id)
    
    cursor.execute(
        f"UPDATE menu_items SET {', '.join(updates)} WHERE id = ?",
        tuple(values)
    )
    
    conn.commit()
    conn.close()
    
    # Publish event
    publish_event('menu_item_updated', {
        'item_id': item_id,
        'updated_fields': list(data.keys())
    })
    
    # Publish availability event if that was updated
    if 'available' in data:
        publish_event('menu_item_availability_updated', {
            'item_id': item_id,
            'available': bool(data['available'])
        })
    
    return jsonify({"message": "Menu item updated successfully"})

@app.route('/api/menu/<int:item_id>', methods=['DELETE'])
def delete_menu_item(item_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if item exists
    cursor.execute("SELECT id FROM menu_items WHERE id = ?", (item_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"error": "Item not found"}), 404
    
    cursor.execute("DELETE FROM menu_items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()
    
    # Publish event
    publish_event('menu_item_deleted', {
        'item_id': item_id
    })
    
    return jsonify({"message": "Menu item deleted successfully"})

@app.route('/api/menu/<int:item_id>/availability', methods=['PUT'])
def update_item_availability(item_id):
    data = request.json
    
    if not data or 'available' not in data:
        return jsonify({"error": "Missing required field 'available'"}), 400
    
    # Convert to integer for SQLite (it stores booleans as 0/1)
    is_available = 1 if data['available'] else 0
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if item exists
    cursor.execute("SELECT id FROM menu_items WHERE id = ?", (item_id,))
    if not cursor.fetchone():
        conn.close()
        return jsonify({"error": "Item not found"}), 404
    
    # Update availability
    cursor.execute(
        "UPDATE menu_items SET available = ? WHERE id = ?",
        (is_available, item_id)
    )
    
    conn.commit()
    conn.close()
    
    # Publish event
    publish_event('menu_item_availability_updated', {
        'item_id': item_id,
        'available': bool(is_available)
    })
    
    return jsonify({
        "message": f"Item availability updated successfully to {'available' if is_available else 'unavailable'}",
        "item_id": item_id,
        "available": bool(is_available)
    })

@app.route('/api/upload-image', methods=['POST'])
def upload_image():
    # Check if the post request has the file part
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        # Add timestamp to ensure uniqueness
        filename = f"{int(time.time())}_{filename}"
        
        # Ensure upload directory exists
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
        
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        print(f"Saving file to: {os.path.abspath(file_path)}")
        file.save(file_path)
        
        # Return the relative path to be stored in the database
        relative_path = f"/static/images/menu/{filename}"
        return jsonify({"path": relative_path})
    
    return jsonify({"error": "File type not allowed"}), 400

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)