import cv2
import numpy as np

def process_frame(image):
    # Tiền xử lý ảnh
    img = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    return img

def draw_tracking_info(img, x1, y1, x2, y2, track_id, vehicle_type, color):
    # Vẽ bounding box
    cv2.rectangle(img, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)
    
    # Vẽ label
    label = f"{vehicle_type} ID:{track_id}"
    (w, h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)
    cv2.rectangle(img, (int(x1), int(y1) - 20), (int(x1) + w, int(y1)), color, -1)
    cv2.putText(img, label, (int(x1), int(y1) - 5),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

def iou(box1, box2):
    # Tính toán IoU
    x1_min = max(box1[0], box2[0])
    y1_min = max(box1[1], box2[1])
    x2_max = min(box1[2], box2[2])
    y2_max = min(box1[3], box2[3])
    
    intersection = max(0, x2_max - x1_min) * max(0, y2_max - y1_min)
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    
    return intersection / (area1 + area2 - intersection + 1e-6)