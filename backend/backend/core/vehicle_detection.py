import numpy as np
import cv2
import io
from collections import deque
from backend.config.settings import vehicle_model
from backend.core.tracker import Tracker
from backend.utils.utils import process_frame, draw_tracking_info

class VehicleDetector:
    def __init__(self, draw_boxes=False, draw_paths=False):
        # Initialize ByteTrack-based tracker
        self.tracker = Tracker()
        self.track_history = {}
        self.color_map = {}
        
        # Drawing flags
        self.draw_boxes = draw_boxes
        self.draw_paths = draw_paths
        
        # Dual resolution approach settings
        self.processing_resolution = 384  # Slightly higher than 320 for better detection
        self.display_resolution = 800     # Higher resolution for display
        
        # Improved tracking parameters
        self.max_path_points = 30
        self.conf_threshold = 0.20  # Lower threshold to maintain detection consistency
        self.min_detection_area = 80  # Smaller area threshold
        
        # Track smoothing parameters
        self.smooth_factor = 0.7
        
        # Higher model confidence for more stable tracks
        self.model_confidence = 0.25
        
        # Track vehicle types across frames (prevent flickering)
        self.vehicle_type_memory = {}
        
        # Add vehicle type mapping for friendly display names
        self.vehicle_type_map = {
            "motorbike": "Motorcycle",
            "bicycle": "Bicycle",
            "car": "Car",
            "bus": "Bus",
            "truck": "Truck",
            "person": "Pedestrian"
        }
        
        # Frame counter for cleanup
        self.frame_count = 0

    def get_color(self, track_id):
        if track_id not in self.color_map:
            # Choose from a predefined color palette for better visualization
            colors = [
                (0, 255, 0),   # Green
                (255, 0, 0),   # Blue
                (0, 0, 255),   # Red
                (255, 255, 0), # Cyan
                (0, 255, 255), # Yellow
                (255, 0, 255), # Magenta
                (128, 0, 255), # Purple
                (255, 128, 0), # Orange
                (0, 128, 255), # Light Blue
                (128, 255, 0)  # Light Green
            ]
            self.color_map[track_id] = colors[track_id % len(colors)]
        return self.color_map[track_id]

    async def detect_vehicle(self, image):
        try:
            # Increment frame counter
            self.frame_count += 1
            
            # Get original image dimensions
            orig_h, orig_w = image.shape[:2]
            
            # Create two versions: one for processing, one for display
            if max(orig_h, orig_w) > self.processing_resolution:
                # Processing image (lower resolution)
                scale_proc = self.processing_resolution / max(orig_h, orig_w)
                proc_w, proc_h = int(orig_w * scale_proc), int(orig_h * scale_proc)
                image_for_processing = cv2.resize(image, (proc_w, proc_h))
                scale_factor_proc = 1.0 / scale_proc
            else:
                image_for_processing = image
                scale_factor_proc = 1.0
                
            # Display image (higher resolution but still scale down if too large)
            if max(orig_h, orig_w) > self.display_resolution:
                scale_disp = self.display_resolution / max(orig_h, orig_w)
                disp_w, disp_h = int(orig_w * scale_disp), int(orig_h * scale_disp)
                display_img = cv2.resize(image, (disp_w, disp_h))
                scale_factor_disp = scale_factor_proc * (scale_proc / scale_disp)
            else:
                display_img = image.copy()
                scale_factor_disp = scale_factor_proc
            
            # Preprocess frame for model
            processed_img = cv2.cvtColor(image_for_processing, cv2.COLOR_BGR2RGB)
            
            # Run detection with model
            results = vehicle_model(
                processed_img, 
                imgsz=self.processing_resolution, 
                conf=self.model_confidence,  # Lower confidence for ByteTrack
                iou=0.45  # Lower IOU threshold for NMS to keep more potential detections
            )
            
            detections = []
            for result in results:
                boxes = result.boxes.xyxy.cpu().numpy()
                confs = result.boxes.conf.cpu().numpy()
                cls_ids = result.boxes.cls.cpu().numpy().astype(int)
                
                for i, (box, conf) in enumerate(zip(boxes, confs)):
                    x1, y1, x2, y2 = box
                    cls_id = cls_ids[i]
                    vehicle_type = vehicle_model.names[cls_id]

                    # Allow all vehicle types, not just motorcycles
                    # Skip if confidence is too low
                    if conf < self.conf_threshold:
                        continue

                    # Scale back to original size
                    x1, y1, x2, y2 = [float(coord * scale_factor_proc) for coord in [x1, y1, x2, y2]]
                    
                    # Skip small detections (helps reduce false positives)
                    area = (x2 - x1) * (y2 - y1)
                    if area < self.min_detection_area:
                        continue
                        
                    # Include class ID for better tracking
                    detections.append([float(x1), float(y1), float(x2), float(y2), float(conf), int(cls_id)])
            
            # Update tracker with all detections
            self.tracker.update(image, detections)

            detections_out = []
            # Visualization image is the display image
            vis_img = display_img.copy()
            
            for track in self.tracker.tracks:
                # Get the bounding box in original coordinates
                x1, y1, x2, y2 = track.bbox
                
                # Scale bbox for display image
                disp_x1 = int(x1 / scale_factor_disp)
                disp_y1 = int(y1 / scale_factor_disp)
                disp_x2 = int(x2 / scale_factor_disp)
                disp_y2 = int(y2 / scale_factor_disp)
                
                track_id = track.track_id

                # Calculate center for path tracking
                center = ((x1 + x2) / 2, (y1 + y2) / 2)
                disp_center = (int(center[0] / scale_factor_disp), int(center[1] / scale_factor_disp))
                
                if track_id not in self.track_history:
                    self.track_history[track_id] = deque(maxlen=self.max_path_points)
                
                # Add to track history in display coordinates
                self.track_history[track_id].append(disp_center)

                # Get vehicle type
                cls_id = int(track.cls_id if hasattr(track, 'cls_id') else 0)
                vehicle_type = vehicle_model.names[cls_id] if cls_id < len(vehicle_model.names) else "unknown"

                # Store last known vehicle type for this track ID (persistence)
                if track_id not in self.vehicle_type_memory:
                    self.vehicle_type_memory[track_id] = vehicle_type
                # Only update type if confidence is good (avoids flickering)
                elif track.score > 0.3:  # Higher threshold for changing type
                    self.vehicle_type_memory[track_id] = vehicle_type
                # Use stored type for consistency
                vehicle_type = self.vehicle_type_memory[track_id]

                # Display friendly name if available
                display_type = self.vehicle_type_map.get(vehicle_type.lower(), vehicle_type)

                # Get consistent color for this track ID
                color = self.get_color(track_id)
                
                # Draw on display image only if drawing is enabled
                if self.draw_boxes:
                    draw_tracking_info(vis_img, disp_x1, disp_y1, disp_x2, disp_y2, track_id, display_type, color)

                # Draw path with smoother lines only if path drawing is enabled
                if self.draw_paths and len(self.track_history[track_id]) > 1:
                    points = np.array(self.track_history[track_id], dtype=np.int32)
                    
                    # Draw smoother path with anti-aliasing
                    cv2.polylines(vis_img, [points], False, color, 2, cv2.LINE_AA)
                    
                    # Draw direction arrow at the end of path
                    if len(points) >= 2:
                        end_pt = points[-1]
                        prev_pt = points[-2]
                        # Calculate angle for arrow
                        angle = np.arctan2(end_pt[1] - prev_pt[1], end_pt[0] - prev_pt[0])
                        # Draw arrow head
                        arrow_len = 15
                        arrow_x = int(end_pt[0] + arrow_len * np.cos(angle))
                        arrow_y = int(end_pt[1] + arrow_len * np.sin(angle))
                        cv2.arrowedLine(vis_img, tuple(end_pt), (arrow_x, arrow_y), color, 2, cv2.LINE_AA, tipLength=0.5)

                # Add to output detections (in original coordinates for consistency)
                detections_out.append({
                    "track_id": track_id,
                    "type": vehicle_type,
                    "display_type": display_type,  # Add friendly display name
                    "confidence": float(track.score),
                    "bbox": [int(x1), int(y1), int(x2), int(y2)],
                    "path": [(int(x / scale_factor_disp), int(y / scale_factor_disp)) for x, y in self.track_history[track_id]]
                })

            # Clean up old tracks
            current_track_ids = {track.track_id for track in self.tracker.tracks}
            for track_id in list(self.track_history.keys()):
                if track_id not in current_track_ids:
                    if len(self.track_history[track_id]) < 2:  # Remove short tracks
                        self.track_history.pop(track_id, None)
            
            # Clean vehicle_type_memory (only periodically to maintain stability)
            if self.frame_count % 60 == 0:  # Clean every 60 frames instead of 30 for better performance
                for track_id in list(self.vehicle_type_memory.keys()):
                    if track_id not in current_track_ids:
                        self.vehicle_type_memory.pop(track_id, None)

            # Encode with optimized parameters for quality vs. speed
            encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), 90]  # Higher quality for better visibility
            _, buffer = cv2.imencode(".jpg", vis_img, encode_params)
            image_bytes = buffer.tobytes()
            return detections_out, image_bytes

        except Exception as e:
            print(f"Error in vehicle detection: {e}")
            import traceback
            traceback.print_exc()
            return [], None

    def reset(self):
        self.track_history.clear()
        self.color_map.clear()
        self.vehicle_type_memory.clear()