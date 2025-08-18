#!/usr/bin/env python3
"""
Test script to verify coordinate consistency between VehicleDetector and LineCrossingDetector
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

# Setup Django
import django
from django.conf import settings

# Configure Django settings
if not settings.configured:
    settings.configure(
        DEBUG=True,
        BASE_DIR=os.path.dirname(os.path.abspath(__file__)),
        INSTALLED_APPS=[
            'django.contrib.contenttypes',
            'django.contrib.auth',
        ],
        DATABASES={
            'default': {
                'ENGINE': 'django.db.backends.sqlite3',
                'NAME': ':memory:',
            }
        }
    )
    django.setup()

import cv2
import numpy as np
from backend.core.vehicle_detection import VehicleDetector
from backend.core.line_crossing import LineCrossingDetector

def test_coordinate_consistency():
    """Test that VehicleDetector and LineCrossingDetector use consistent coordinates"""
    
    # Create a test frame
    frame = np.zeros((720, 1280, 3), dtype=np.uint8)
    
    # Initialize detectors
    vehicle_detector = VehicleDetector(draw_boxes=True, draw_paths=True)
    line_detector = LineCrossingDetector(frame_width=1280, frame_height=720)
    
    # Set a test line
    line_detector.set_line((0, 360), (1280, 360))  # Horizontal line in middle
    
    print("=== Coordinate Consistency Test ===")
    print(f"Frame shape: {frame.shape}")
    print(f"Line crossing detector line: {line_detector.line_start} → {line_detector.line_end}")
    
    # Test with a mock detection result
    # This simulates what VehicleDetector.detect_vehicle() would return
    mock_detections = [
        {
            "track_id": 1,
            "type": "motorcycle",
            "display_type": "Motorcycle",
            "confidence": 0.8,
            "bbox": [100, 300, 200, 400],  # Should be in original coordinates
            "path": [(150, 350), (150, 355), (150, 360), (150, 365)]  # Should be in original coordinates
        }
    ]
    
    print("\n=== Mock Detection ===")
    for det in mock_detections:
        print(f"Track ID: {det['track_id']}")
        print(f"Bbox: {det['bbox']}")
        print(f"Path: {det['path']}")
        
        # Create a track object for line crossing detector
        track = type('Track', (), {})()
        track.track_id = det["track_id"]
        track.bbox = det["bbox"]
        track.type = det["type"]
        track.display_type = det["display_type"]
        
        # Test line crossing
        result = line_detector.update([track], frame=frame)
        
        print(f"Line crossing result: {result}")
        
        # Check if the coordinates make sense
        bbox = det["bbox"]
        center_x = (bbox[0] + bbox[2]) / 2
        center_y = (bbox[1] + bbox[3]) / 2
        
        print(f"Calculated center: ({center_x}, {center_y})")
        print(f"Line Y position: {line_detector.line_start[1]}")
        print(f"Should cross line: {center_y > line_detector.line_start[1]}")

if __name__ == "__main__":
    test_coordinate_consistency()
