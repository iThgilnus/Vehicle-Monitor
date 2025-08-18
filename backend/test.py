import cv2
import torch
from ultralytics import YOLO

# Load YOLOv8 model
model = YOLO("backend/models/yolov8x.pt")

# Địa chỉ RTSP của camera IP
RTSP_URL = "rtsp://admin:123abc789@10.10.45.251:554/cam/realmonitor?channel=1&subtype=0"

# Kết nối đến camera IP
cap = cv2.VideoCapture(RTSP_URL)

if not cap.isOpened():
    print("Không thể kết nối đến camera.")
    exit()

# Lấy danh sách class names của model
class_names = model.names

while True:
    ret, frame = cap.read()
    if not ret:
        print("Không thể nhận frame từ camera.")
        break
    
    # Dự đoán đối tượng trong frame
    results = model(frame)
    
    for result in results:
        for box in result.boxes:
            class_id = int(box.cls.item())  # Lấy ID lớp dự đoán
            if class_names[class_id] == "person":  # Chỉ nhận diện người
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                confidence = box.conf.item()
                
                # Vẽ bounding box và nhãn
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                label = f"Person: {confidence:.2f}"
                cv2.putText(frame, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
    
    cv2.imshow("Person Detection", frame)
    
    # Nhấn 'q' để thoát
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
