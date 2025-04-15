from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import json
import logging
import sys
import time
from werkzeug.utils import secure_filename

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
logger = logging.getLogger("main")
# Configuration
PROMO_FOLDER = 'static/images/promo'
PROMO_CONFIG_FILE = 'promo_config.json'
STATIC_CONTENT_FOLDER = 'static/content'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

# Create required directories
os.makedirs(PROMO_FOLDER, exist_ok=True)
os.makedirs(STATIC_CONTENT_FOLDER, exist_ok=True)

# Default promo config
DEFAULT_PROMO_CONFIG = {
    'current_promo': '/static/images/promo/default_promo.jpg',
    'active': True,
    'description': 'Welcome to Saigon Nouveau!'
}
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_promo_config():
    # Implement this based on your actual storage mechanism
    # This is just a placeholder
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config/promo.json')
    try:
        import json
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                return json.load(f)
        return {}
    except Exception as e:
        logger.error(f"Error reading promo config: {e}")
        return {}

def save_promo_config(config):
    # Implement this based on your actual storage mechanism
    # This is just a placeholder
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config/promo.json')
    try:
        import json
        os.makedirs(os.path.dirname(config_path), exist_ok=True)
        with open(config_path, 'w') as f:
            json.dump(config, f)
    except Exception as e:
        logger.error(f"Error saving promo config: {e}")

def publish_event(event_type, data):
    # Implement your event publishing logic here
    # This is just a placeholder
    logger.info(f"Event published: {event_type} - {data}")

@app.route('/api/promo/upload', methods=['POST'])
def upload_promo_banner():
    """Upload a new promotional banner"""
    logger.info("Received promo upload request")
    
    # Check if the post request has the file part
    if 'file' not in request.files:
        logger.error("No file part in request")
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    logger.info(f"Received file: {file.filename}")
    
    # If the user does not select a file, browser submits an empty file
    if file.filename == '':
        logger.error("No selected file")
        return jsonify({"error": "No selected file"}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        # Add timestamp to ensure uniqueness
        filename = f"promo_{int(time.time())}_{filename}"
        
        # Make sure promo folder exists
        upload_folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads/promo')
        os.makedirs(upload_folder, exist_ok=True)
        
        file_path = os.path.join(upload_folder, filename)
        file.save(file_path)
        
        # Get the relative path for the database
        relative_path = f"/uploads/promo/{filename}"
        
        # Update the config
        config = get_promo_config()
        config['current_promo'] = relative_path
        
        # Get optional description
        if 'description' in request.form:
            config['description'] = request.form['description']
        
        save_promo_config(config)
        
        # Publish promo updated event
        publish_event('promo_updated', {
            'image_path': relative_path,
            'description': config.get('description', '')
        })
        
        return jsonify({
            "success": True,
            "path": relative_path,
            "description": config.get('description', '')
        })
    
    logger.error(f"File type not allowed: {file.filename}")
    return jsonify({"error": "File type not allowed"}), 400
# Helper functions
def get_promo_config():
    """Get the current promo configuration"""
    if os.path.exists(PROMO_CONFIG_FILE):
        try:
            with open(PROMO_CONFIG_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading promo config: {e}")
    
    # If file doesn't exist or has an error, return default config and save it
    config = DEFAULT_PROMO_CONFIG.copy()
    save_promo_config(config)
    return config

def save_promo_config(config):
    """Save the promo configuration to file"""
    try:
        with open(PROMO_CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
        return True
    except Exception as e:
        logger.error(f"Error saving promo config: {e}")
        return False

def allowed_file(filename):
    """Check if file has an allowed extension"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Create a default promo image if none exists
def ensure_default_promo():
    """Create a default promo image if none exists"""
    default_promo_path = DEFAULT_PROMO_CONFIG['current_promo'].lstrip('/')
    
    if not os.path.exists(default_promo_path):
        try:
            from PIL import Image, ImageDraw, ImageFont
            
            # Create a simple promo image with text
            img = Image.new('RGB', (800, 400), color=(33, 150, 243))
            draw = ImageDraw.Draw(img)
            
            # Try to use a font if available, otherwise use default
            try:
                font = ImageFont.truetype("arial.ttf", 36)
            except:
                font = None
            
            # Add text
            draw.text((400, 200), "Welcome to Saigon Nouveau!", 
                      fill=(255, 255, 255), font=font, anchor="mm")
            
            # Save image
            os.makedirs(os.path.dirname(default_promo_path), exist_ok=True)
            img.save(default_promo_path)
            logger.info(f"Created default promo image at {default_promo_path}")
            
        except Exception as e:
            logger.error(f"Error creating default promo image: {e}")
            
            # Create an empty file as fallback
            os.makedirs(os.path.dirname(default_promo_path), exist_ok=True)
            with open(default_promo_path, 'wb') as f:
                f.write(b'')

# Create default assets
ensure_default_promo()

# API Routes
@app.route('/api/promo/current', methods=['GET'])
def get_current_promo():
    """Get the current promotional banner"""
    config = get_promo_config()
    
    # Check if promos are active
    if not config.get('active', True):
        return jsonify({'active': False})
    
    # Check if the file actually exists
    promo_path = config.get('current_promo', DEFAULT_PROMO_CONFIG['current_promo'])
    actual_path = os.path.join(os.getcwd(), promo_path.lstrip('/'))
    
    if not os.path.exists(actual_path):
        # Fallback to default if file doesn't exist
        promo_path = DEFAULT_PROMO_CONFIG['current_promo']
    
    return jsonify({
        'active': True,
        'image_path': promo_path,
        'description': config.get('description', '')
    })

# Make sure these configuration settings are at the top of your file
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static/images/promo')
PROMO_FOLDER = app.config['UPLOAD_FOLDER']
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static/images/promo')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Define allowed file extensions
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

@app.route('/api/promo/toggle', methods=['POST'])
def toggle_promo():
    """Toggle promotional banner active status"""
    data = request.json
    
    if not data or 'active' not in data:
        return jsonify({"error": "Missing 'active' field"}), 400
    
    # Update the config
    config = get_promo_config()
    config['active'] = bool(data['active'])
    save_promo_config(config)
    
    # Publish promo updated event
    publish_event('promo_updated', {
        'active': config['active'],
        'image_path': config.get('current_promo', DEFAULT_PROMO_CONFIG['current_promo']),
        'description': config.get('description', '')
    })
    
    return jsonify({
        "success": True,
        "active": config['active']
    })

@app.route('/api/promo/update', methods=['POST'])
def update_promo_info():
    """Update promo information (description, etc.)"""
    data = request.json
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    # Update the config
    config = get_promo_config()
    
    if 'description' in data:
        config['description'] = data['description']
    
    if 'active' in data:
        config['active'] = bool(data['active'])
    
    save_promo_config(config)
    
    # Publish promo updated event
    publish_event('promo_updated', {
        'active': config['active'],
        'image_path': config.get('current_promo', DEFAULT_PROMO_CONFIG['current_promo']),
        'description': config.get('description', '')
    })
    
    return jsonify({
        "success": True,
        "config": config
    })

@app.route('/api/content/<path:filename>', methods=['GET'])
def get_static_content(filename):
    """Get static content file"""
    return send_file(os.path.join(STATIC_CONTENT_FOLDER, filename))

@app.route('/api/content/upload', methods=['POST'])
def upload_content():
    """Upload static content file"""
    # Check if the post request has the file part
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    
    # If the user does not select a file, browser submits an empty file
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    # Save file
    filename = secure_filename(file.filename)
    
    # Get optional path from form
    subfolder = request.form.get('path', '')
    if subfolder:
        # Create subfolder if it doesn't exist
        folder_path = os.path.join(STATIC_CONTENT_FOLDER, subfolder)
        os.makedirs(folder_path, exist_ok=True)
        file_path = os.path.join(folder_path, filename)
    else:
        file_path = os.path.join(STATIC_CONTENT_FOLDER, filename)
    
    file.save(file_path)
    
    # Get the relative path
    if subfolder:
        relative_path = f"/static/content/{subfolder}/{filename}"
    else:
        relative_path = f"/static/content/{filename}"
    
    return jsonify({
        "success": True,
        "path": relative_path
    })

@app.route('/api/content/list', methods=['GET'])
def list_content():
    """List all static content files"""
    content_files = []
    
    # Walk through the static content directory
    for root, dirs, files in os.walk(STATIC_CONTENT_FOLDER):
        for file in files:
            # Get the relative path
            rel_path = os.path.relpath(os.path.join(root, file), os.getcwd())
            # Convert to web path
            web_path = '/' + rel_path.replace('\\', '/')
            
            content_files.append({
                'path': web_path,
                'filename': file,
                'directory': os.path.relpath(root, STATIC_CONTENT_FOLDER) if root != STATIC_CONTENT_FOLDER else ''
            })
    
    return jsonify(content_files)

# Event handlers
def handle_order_created(payload):
    """Handle order_created event"""
    # Nothing to do here for now
    pass

# Register event handlers
register_event_handler('order_created', handle_order_created)

# Setup consumer
setup_consumer(['order_created'])

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5009)