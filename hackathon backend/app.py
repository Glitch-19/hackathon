import os
from flask import Flask, render_template, url_for, request, redirect, flash, jsonify
from werkzeug.utils import secure_filename
import uuid

# Initialize the Flask application
app = Flask(__name__)
app.secret_key = 'your-secret-key-here'  # Change this to a secure secret key

# Define the path to your video directory
VIDEO_DIR = os.path.join('static', 'videos')
UPLOAD_FOLDER = os.path.join('static', 'videos')

# Allowed file extensions
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'jpg', 'jpeg', 'png', 'gif'}

# Configure upload settings
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    """
    This is the main route for our web application.
    It handles requests to the root URL ('/').
    """
    try:
        # --- 1. Get the list of video filenames ---
        # os.listdir() gets all files in the specified directory.
        # We sort them to ensure a consistent order.
        video_files = sorted([f for f in os.listdir(VIDEO_DIR) if allowed_file(f)])
        
        # --- 2. Create full URLs for each video ---
        # We create a list of URLs that the HTML template can use.
        # url_for('static', filename=...) generates the correct path 
        # to the file in the 'static' folder.
        video_urls = [url_for('static', filename=f'videos/{filename}') for filename in video_files]

        # --- 3. Render the HTML template ---
        # We pass the list of video URLs to the index.html template.
        # The template can then use this list to create the video elements.
        return render_template('index.html', video_sources=video_urls)

    except FileNotFoundError:
        # Handle the case where the video directory doesn't exist
        print(f"Error: The directory '{VIDEO_DIR}' was not found.")
        return "Error: Video directory not found. Please create it and add videos.", 500

@app.route('/upload', methods=['POST'])
def upload_file():
    """
    Handle file uploads from users
    """
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file selected'})
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'success': False, 'message': 'No file selected'})
    
    if file and allowed_file(file.filename):
        # Generate a unique filename to avoid conflicts
        original_filename = secure_filename(file.filename)
        filename = f"{uuid.uuid4()}_{original_filename}"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        # Create the upload directory if it doesn't exist
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
        
        try:
            file.save(file_path)
            return jsonify({'success': True, 'message': 'File uploaded successfully!'})
        except Exception as e:
            return jsonify({'success': False, 'message': f'Upload failed: {str(e)}'})
    
    return jsonify({'success': False, 'message': 'Invalid file type. Please upload videos (mp4, avi, mov, etc.) or images (jpg, png, etc.)'})

@app.route('/api/videos')
def get_videos():
    """
    API endpoint to get the latest list of videos
    """
    try:
        video_files = sorted([f for f in os.listdir(VIDEO_DIR) if allowed_file(f)])
        video_urls = [url_for('static', filename=f'videos/{filename}') for filename in video_files]
        return jsonify({'videos': video_urls})
    except FileNotFoundError:
        return jsonify({'videos': []})


if __name__ == '__main__':
    # This allows you to run the app directly using 'python app.py'
    app.run(debug=True)
    # The debug=True flag enables auto-reloading when you save changes.
    app.run(debug=True)
