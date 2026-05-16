"""
Aegis.ei — Configuration

Centralises all file paths and constants so they are easy to change.
"""

import os

# Base directory of the project (folder that contains index.html, backend/, etc.)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Folder to store the SQLite database file
DATA_DIR = os.path.join(BASE_DIR, "data")

# Folder to store trained ML models
MODELS_DIR = os.path.join(BASE_DIR, "models")

# Path to the SQLite database file
DB_PATH = os.path.join(DATA_DIR, "aegis.db")

# Default enterprise id used by the prototype
DEFAULT_ENTERPRISE_ID = "aegis_demo_1"

# Make sure the folders exist when this module is imported
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)
