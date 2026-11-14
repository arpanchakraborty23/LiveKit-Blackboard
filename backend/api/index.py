import os
import sys

# Ensure backend root is on Python module search path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

try:
    from backend.main import app
except ImportError:
    from main import app

# Export app for Vercel Serverless Function
