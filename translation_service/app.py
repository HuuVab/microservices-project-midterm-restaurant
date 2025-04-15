from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import json
import logging
import sys
import csv
import io
import pandas as pd
from datetime import datetime
from werkzeug.utils import secure_filename
from PIL import Image

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

# Configuration
TRANSLATIONS_DIR = 'translations'
UI_TRANSLATIONS_FILE = os.path.join(TRANSLATIONS_DIR, 'ui_translations.json')
MENU_TRANSLATIONS_FILE = os.path.join(TRANSLATIONS_DIR, 'menu_translations.json')
FLAGS_DIR = os.path.join('static', 'images', 'flags')

# Ensure directories exist
def ensure_translation_directories():
    """Make sure translation directories and default files exist"""
    os.makedirs(TRANSLATIONS_DIR, exist_ok=True)
    os.makedirs(FLAGS_DIR, exist_ok=True)
    
    # Create default translation files if they don't exist
    if not os.path.exists(UI_TRANSLATIONS_FILE):
        default_ui_translations = {
            "en": {
                "your_order": "Your Order",
                "total": "Total",
                "clear": "Clear",
                "place_order": "Place Order",
                "your_orders": "Your Orders",
                "no_active_orders": "No active orders",
                "add_to_order": "Add",
                "welcome": "Welcome to our Restaurant",
                "search_placeholder": "Search menu...",
                "all_categories": "All Categories",
                "appetizers": "Appetizers",
                "side_dishes": "Side Dishes",
                "main_courses": "Main Courses",
                "beverages": "Beverages",
                "desserts": "Desserts",
                "add_notes": "Add notes..."
            }
        }
        with open(UI_TRANSLATIONS_FILE, 'w', encoding='utf-8') as f:
            json.dump(default_ui_translations, f, ensure_ascii=False, indent=2)
    
    if not os.path.exists(MENU_TRANSLATIONS_FILE):
        default_menu_translations = {
            "items": {}
        }
        with open(MENU_TRANSLATIONS_FILE, 'w', encoding='utf-8') as f:
            json.dump(default_menu_translations, f, ensure_ascii=False, indent=2)
    
    # Create sample flag images if they don't exist
    create_sample_flags()

def create_sample_flags():
    """Create basic placeholder flag images for each language"""
    # The flags should ideally be actual country flag images,
    # but for this example, we'll create simple colored squares
    flag_colors = {
        'en': (255, 0, 0),     # Red for English
        'vi': (255, 255, 0),   # Yellow for Vietnamese
        'ko': (0, 0, 255),     # Blue for Korean
        'zh': (255, 165, 0),   # Orange for Chinese
        'fr': (0, 255, 0)      # Green for French
    }
    
    for lang, color in flag_colors.items():
        flag_path = os.path.join(FLAGS_DIR, f"{lang}.png")
        if not os.path.exists(flag_path):
            try:
                create_flag_image(flag_path, color)
            except Exception as e:
                logger.error(f"Could not create flag image for {lang}: {e}")
                
@app.route('/api/translations/ensure-assets', methods=['POST'])
def ensure_assets():
    return jsonify({"message": "Translation assets ensured"}), 200

def create_flag_image(path, color):
    """Create a simple colored square as a flag placeholder"""
    try:
        # Create a 30x30 pixel image
        img = Image.new('RGB', (30, 30), color)
        img.save(path)
    except Exception as e:
        logger.error(f"Error creating flag image: {e}")
        # Create an empty file as fallback
        with open(path, 'wb') as f:
            f.write(b'')

# Ensure translation assets on startup
ensure_translation_directories()

# Helper functions
def load_ui_translations():
    """Load UI translations from file"""
    if not os.path.exists(UI_TRANSLATIONS_FILE):
        ensure_translation_directories()
    
    try:
        with open(UI_TRANSLATIONS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading UI translations: {e}")
        return {"en": {}}

def load_menu_translations():
    """Load menu translations from file"""
    if not os.path.exists(MENU_TRANSLATIONS_FILE):
        ensure_translation_directories()
    
    try:
        with open(MENU_TRANSLATIONS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading menu translations: {e}")
        return {"items": {}}

def save_ui_translations(translations):
    """Save UI translations to file"""
    ensure_translation_directories()
    
    try:
        with open(UI_TRANSLATIONS_FILE, 'w', encoding='utf-8') as f:
            json.dump(translations, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"Error saving UI translations: {e}")
        return False

def save_menu_translations(translations):
    """Save menu translations to file"""
    ensure_translation_directories()
    
    try:
        with open(MENU_TRANSLATIONS_FILE, 'w', encoding='utf-8') as f:
            json.dump(translations, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"Error saving menu translations: {e}")
        return False

# API Routes
@app.route('/api/translations', methods=['GET'])
def get_translations():
    """Get all translations for the client"""
    ui_translations = load_ui_translations()
    menu_translations = load_menu_translations()
    
    # Transform menu translations to format easier for client to use
    client_menu_translations = {}
    
    for item_id, item_data in menu_translations['items'].items():
        for field in item_data:
            for lang, translation in item_data[field].items():
                if lang not in client_menu_translations:
                    client_menu_translations[lang] = {}
                
                key = f"item_{item_id}_{field}"
                client_menu_translations[lang][key] = translation
    
    # Combine translations
    all_translations = {}
    
    for lang in set(list(ui_translations.keys()) + list(client_menu_translations.keys())):
        all_translations[lang] = {}
        
        if lang in ui_translations:
            all_translations[lang].update(ui_translations[lang])
        
        if lang in client_menu_translations:
            all_translations[lang].update(client_menu_translations[lang])
    
    return jsonify(all_translations)

@app.route('/api/translations/ui', methods=['GET'])
def get_ui_translations():
    """Get UI translations for management"""
    return jsonify(load_ui_translations())

@app.route('/api/translations/menu', methods=['GET'])
def get_menu_translations():
    """Get menu translations for management"""
    return jsonify(load_menu_translations())

@app.route('/api/translations/ui', methods=['POST'])
def update_ui_translation():
    """Update a UI translation"""
    data = request.json
    
    if not data or 'key' not in data or 'translations' not in data:
        return jsonify({"error": "Missing required data"}), 400
    
    key = data['key']
    translations_data = data['translations']
    
    # Load current translations
    ui_translations = load_ui_translations()
    
    # Update translations
    for lang, translation in translations_data.items():
        if lang not in ui_translations:
            ui_translations[lang] = {}
        
        ui_translations[lang][key] = translation
    
    # Save updated translations
    if save_ui_translations(ui_translations):
        return jsonify({"success": True})
    else:
        return jsonify({"error": "Failed to save translations"}), 500

@app.route('/api/translations/menu', methods=['POST'])
def update_menu_translation():
    """Update a menu item translation"""
    data = request.json
    
    if not data or 'key' not in data or 'field' not in data or 'translations' not in data:
        return jsonify({"error": "Missing required data"}), 400
    
    item_id = data['key']
    field = data['field']
    translations_data = data['translations']
    
    # Load current translations
    menu_translations = load_menu_translations()
    
    # Ensure item exists
    if item_id not in menu_translations['items']:
        menu_translations['items'][item_id] = {}
    
    # Ensure field exists
    if field not in menu_translations['items'][item_id]:
        # Initialize with empty English translation
        menu_translations['items'][item_id][field] = {'en': ''}
    
    # Update translations
    for lang, translation in translations_data.items():
        menu_translations['items'][item_id][field][lang] = translation
    
    # Save updated translations
    if save_menu_translations(menu_translations):
        return jsonify({"success": True})
    else:
        return jsonify({"error": "Failed to save translations"}), 500

@app.route('/api/translations/import', methods=['POST'])
def import_translations():
    """Import translations from a file"""
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    if not file.filename:
        return jsonify({"error": "No file selected"}), 400
    
    file_ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if file_ext not in ['csv', 'xlsx']:
        return jsonify({"error": "File must be CSV or Excel format"}), 400
    
    update_existing = request.form.get('update_existing', 'true') == 'true'
    import_type = request.form.get('type', 'ui')
    
    try:
        # Parse file
        if file_ext == 'csv':
            df = pd.read_csv(file)
        else:
            df = pd.read_excel(file)
        
        # Process based on import type
        if import_type == 'ui':
            count = import_ui_translations(df, update_existing)
        else:
            count = import_menu_translations(df, update_existing)
        
        return jsonify({
            "success": True,
            "count": count,
            "type": import_type
        })
    
    except Exception as e:
        logger.error(f"Error importing translations: {e}")
        return jsonify({"error": str(e)}), 500
        
def import_ui_translations(df, update_existing):
    """Import UI translations from DataFrame"""
    # Validate required columns
    required_columns = ['Key', 'English']
    missing_columns = [col for col in required_columns if col not in df.columns]
    
    if missing_columns:
        raise ValueError(f"Missing required columns: {', '.join(missing_columns)}")
    
    # Load current translations
    ui_translations = load_ui_translations()
    
    # Initialize count
    count = 0
    
    # Process each row
    for _, row in df.iterrows():
        key = row['Key']
        
        # Skip if key is empty
        if not key or pd.isna(key):
            continue
        
        # Add translations for each language
        for lang in ['English', 'Vietnamese', 'Korean', 'Chinese', 'French']:
            if lang in df.columns and not pd.isna(row[lang]) and row[lang]:
                lang_code = {
                    'English': 'en', 
                    'Vietnamese': 'vi', 
                    'Korean': 'ko', 
                    'Chinese': 'zh', 
                    'French': 'fr'
                }[lang]
                
                # Add language if not present
                if lang_code not in ui_translations:
                    ui_translations[lang_code] = {}
                
                # Update translation if it doesn't exist or update_existing is True
                if key not in ui_translations[lang_code] or update_existing:
                    ui_translations[lang_code][key] = row[lang]
                    count += 1
    
    # Save updated translations
    if save_ui_translations(ui_translations):
        return count
    else:
        raise Exception("Failed to save translations")

def import_menu_translations(df, update_existing):
    """Import menu translations from DataFrame"""
    # Validate required columns
    required_columns = ['ID', 'Field', 'English']
    missing_columns = [col for col in required_columns if col not in df.columns]
    
    if missing_columns:
        raise ValueError(f"Missing required columns: {', '.join(missing_columns)}")
    
    # Load current translations
    menu_translations = load_menu_translations()
    
    # Initialize count
    count = 0
    
    # Process each row
    for _, row in df.iterrows():
        item_id = str(row['ID'])
        field = row['Field']
        
        # Skip if ID or field is empty
        if not item_id or pd.isna(item_id) or not field or pd.isna(field):
            continue
        
        # Ensure item exists
        if item_id not in menu_translations['items']:
            menu_translations['items'][item_id] = {}
        
        # Ensure field exists
        if field not in menu_translations['items'][item_id]:
            menu_translations['items'][item_id][field] = {}
        
        # Add translations for each language
        for lang in ['English', 'Vietnamese', 'Korean', 'Chinese', 'French']:
            if lang in df.columns and not pd.isna(row[lang]) and row[lang]:
                lang_code = {
                    'English': 'en', 
                    'Vietnamese': 'vi', 
                    'Korean': 'ko', 
                    'Chinese': 'zh', 
                    'French': 'fr'
                }[lang]
                
                # Update translation if it doesn't exist or update_existing is True
                if lang_code not in menu_translations['items'][item_id][field] or update_existing:
                    menu_translations['items'][item_id][field][lang_code] = row[lang]
                    count += 1
    
    # Save updated translations
    if save_menu_translations(menu_translations):
        return count
    else:
        raise Exception("Failed to save translations")

@app.route('/api/translations/export', methods=['GET'])
def export_translations():
    """Export translations to CSV"""
    language = request.args.get('language', 'all')
    
    # Load translations
    ui_translations = load_ui_translations()
    menu_translations = load_menu_translations()
    
    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow(['Type', 'ID', 'Field', 'English', 'Vietnamese', 'Korean', 'Chinese', 'French'])
    
    # Write UI translations
    for key in ui_translations.get('en', {}):
        row = ['UI', key, '', ui_translations.get('en', {}).get(key, '')]
        
        # Add translations for other languages
        for lang in ['vi', 'ko', 'zh', 'fr']:
            row.append(ui_translations.get(lang, {}).get(key, ''))
        
        writer.writerow(row)
    
    # Write menu translations
    for item_id, item_data in menu_translations['items'].items():
        for field, translations in item_data.items():
            row = ['Menu', item_id, field, translations.get('en', '')]
            
            # Add translations for other languages
            for lang in ['vi', 'ko', 'zh', 'fr']:
                row.append(translations.get(lang, ''))
            
            writer.writerow(row)
    
    # Prepare response
    output.seek(0)
    return send_file(
        io.BytesIO(output.getvalue().encode('utf-8-sig')),
        mimetype='text/csv',
        as_attachment=True,
        download_name='translations.csv'
    )

@app.route('/api/translations/ensure-assets', methods=['POST'])
def ensure_translation_assets_api():
    """API endpoint to ensure translation assets exist"""
    ensure_translation_directories()
    return jsonify({"success": True})

# Event handlers
def handle_menu_item_created(payload):
    """Handle menu_item_created event to add translation entries"""
    item_id = payload.get('item_id')
    name = payload.get('name')
    
    if not item_id:
        logger.error("Missing item_id in menu_item_created event")
        return
    
    # Load current translations
    menu_translations = load_menu_translations()
    
    # Create translation entry for new menu item
    item_id_str = str(item_id)
    if item_id_str not in menu_translations['items']:
        menu_translations['items'][item_id_str] = {
            'name': {'en': name or ''},
            'description': {'en': ''}
        }
        
        # Save updated translations
        if save_menu_translations(menu_translations):
            logger.info(f"Added translation entries for new menu item {item_id}")
        else:
            logger.error(f"Failed to save translations for new menu item {item_id}")

def handle_menu_item_deleted(payload):
    """Handle menu_item_deleted event to remove translation entries"""
    item_id = payload.get('item_id')
    
    if not item_id:
        logger.error("Missing item_id in menu_item_deleted event")
        return
    
    # Load current translations
    menu_translations = load_menu_translations()
    
    # Remove translation entry for deleted menu item
    item_id_str = str(item_id)
    if item_id_str in menu_translations['items']:
        del menu_translations['items'][item_id_str]
        
        # Save updated translations
        if save_menu_translations(menu_translations):
            logger.info(f"Removed translation entries for deleted menu item {item_id}")
        else:
            logger.error(f"Failed to save translations after removing menu item {item_id}")

# Register event handlers
register_event_handler('menu_item_created', handle_menu_item_created)
register_event_handler('menu_item_deleted', handle_menu_item_deleted)

# Setup consumer
setup_consumer(['menu_item_created', 'menu_item_deleted'])

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5007)