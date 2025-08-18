import cv2
import numpy as np
from ultralytics import YOLO
import logging
from backend.config.settings import plate_detector_model, plate_recognizer_model

# Configure logging
logger = logging.getLogger(__name__)

# Use models from settings (already loaded with GPU support)
try:
    plate_model = plate_detector_model
    char_model = plate_recognizer_model
    logger.info("License plate models loaded successfully from settings with GPU support")
except Exception as e:
    logger.error(f"Failed to load license plate models from settings: {e}")
    plate_model = None
    char_model = None

# Character class names
class_names = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 
               'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'K', 
               'L', 'N', 'N', 'P', 'S', 'T', 'U', 'V', 'X', 
               'Y', 'Z', '0', 'I', 'Q', 'W', 'R', 'J', 'O']

def changeContrast(img):
    """Enhance contrast using CLAHE"""
    if img is None or img.size == 0:
        return None
    try:
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l_channel, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
        cl = clahe.apply(l_channel)
        limg = cv2.merge((cl, a, b))
        return cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)
    except Exception as e:
        logger.error(f"Error in changeContrast: {e}")
        return img

def rotate_image(image, angle):
    """Rotate image by given angle"""
    if image is None or image.size == 0:
        return None
    try:
        image_center = tuple(np.array(image.shape[1::-1]) / 2)
        rot_mat = cv2.getRotationMatrix2D(image_center, angle, 1.0)
        return cv2.warpAffine(image, rot_mat, image.shape[1::-1], flags=cv2.INTER_LINEAR)
    except Exception as e:
        logger.error(f"Error in rotate_image: {e}")
        return image

def compute_skew(src_img):
    """Compute skew angle of the image"""
    if src_img is None or src_img.size == 0:
        return 0.0
    try:
        h, w = src_img.shape[:2]
        img = cv2.medianBlur(src_img, 3)
        edges = cv2.Canny(img, 30, 100, apertureSize=3, L2gradient=True)
        lines = cv2.HoughLinesP(edges, 1, np.pi/180, 30, minLineLength=w/1.5, maxLineGap=h/3.0)
        
        if lines is None:
            return 0.0

        angles = [np.arctan2(y2 - y1, x2 - x1) for x1, y1, x2, y2 in lines[:, 0]]
        angles = [a for a in angles if abs(a) <= np.radians(30)]
        return np.degrees(np.mean(angles)) if angles else 0.0
    except Exception as e:
        logger.error(f"Error in compute_skew: {e}")
        return 0.0

def deskew(src_img):
    """Deskew the image"""
    if src_img is None or src_img.size == 0:
        return None
    try:
        img = changeContrast(src_img)
        if img is None:
            return src_img
        return rotate_image(img, compute_skew(img))
    except Exception as e:
        logger.error(f"Error in deskew: {e}")
        return src_img

def determine_plate_type(center_list, y_mean, threshold=5):
    """Determine if plate is 1 or 2 line type"""
    above_mean = sum(1 for c in center_list if c[1] < y_mean)
    below_mean = sum(1 for c in center_list if c[1] > y_mean)
    if abs(above_mean - below_mean) <= threshold:
        return "2"
    return "1"

def read_plate(model, plate_img, conf=0.5):
    """Read text from license plate image"""
    if plate_img is None or plate_img.size == 0 or model is None:
        return ""
    
    try:
        plate_img = deskew(plate_img)
        if plate_img is None:
            return ""
            
        results = model(plate_img, conf=conf)
        bb_list = results[0].boxes.data.cpu().numpy()

        if len(bb_list) == 0 or len(bb_list) < 7 or len(bb_list) > 10:
            return ""

        center_list = [[(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2, int(bb[-1])] for bb in bb_list]
        y_mean = np.mean([c[1] for c in center_list])
        LP_type = determine_plate_type(center_list, y_mean)

        line_1, line_2 = [], []
        license_plate = ""

        if LP_type == "2":
            for c in center_list:
                (line_2 if c[1] > y_mean else line_1).append(c)
            for l1 in sorted(line_1, key=lambda x: x[0]):
                license_plate += class_names[l1[2]]
            license_plate += "-"  # Add separator for 2-line plates
            for l2 in sorted(line_2, key=lambda x: x[0]):
                license_plate += class_names[l2[2]]
        else:
            for l in sorted(center_list, key=lambda x: x[0]):
                license_plate += class_names[l[2]]

        return license_plate
    except Exception as e:
        logger.error(f"Error in read_plate: {e}")
        return ""

def detect_license_plate(frame):
    """Detect and recognize license plate in the image"""
    if frame is None or frame.size == 0 or plate_model is None:
        return None
    
    try:
        # Detect plates
        plate_results = plate_model(frame, conf=0.4)
        plate_boxes = plate_results[0].boxes.data.cpu().numpy()

        if len(plate_boxes) == 0:
            return None

        # Process the most confident plate
        best_plate = {"text": "", "confidence": 0}
        
        for plate_box in plate_boxes:
            x1, y1, x2, y2, conf, cls = plate_box
            x1, y1, x2, y2 = map(int, [x1, y1, x2, y2])
            
            # Skip if box dimensions are invalid
            if y2 <= y1 or x2 <= x1 or y1 < 0 or x1 < 0 or y2 >= frame.shape[0] or x2 >= frame.shape[1]:
                continue
                
            plate_crop = frame[y1:y2, x1:x2]
            
            if plate_crop.shape[0] == 0 or plate_crop.shape[1] == 0:
                continue

            plate_number = read_plate(char_model, plate_crop)
            
            # Consider only plates with reasonable text length
            if len(plate_number) >= 7 and conf > best_plate["confidence"]:
                best_plate = {
                    "text": plate_number,
                    "confidence": float(conf),
                    "bbox": [int(x1), int(y1), int(x2), int(y2)]
                }
        
        return best_plate if best_plate["text"] else None
    
    except Exception as e:
        logger.error(f"Error in detect_license_plate: {e}")
        return None
