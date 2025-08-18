import torch
from ultralytics import YOLO
import os
from django.conf import settings

# Thiết bị sử dụng
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"🔥 Đang sử dụng: {device}")

# Đường dẫn tới file mô hình
vehicle_model_path = os.path.join(settings.BASE_DIR, "backend", "backend" , "models", "vehicle_detector.pt")
vehicle_model = YOLO(vehicle_model_path).to(device)

plate_detector_model_path = os.path.join(settings.BASE_DIR, "backend", "backend" , "models", "plate_detector.pt")
plate_detector_model = YOLO(plate_detector_model_path).to(device)

plate_recognizer_model_path = os.path.join(settings.BASE_DIR, "backend", "backend" , "models", "plate_recognizer.pt")
plate_recognizer_model = YOLO(plate_recognizer_model_path).to(device)
