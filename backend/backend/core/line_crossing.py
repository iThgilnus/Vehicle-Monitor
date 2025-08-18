import time
import numpy as np
import cv2
import base64
import logging
from typing import List, Tuple, Dict, Optional, Any
from backend.core.plate_recognition import detect_license_plate
from backend.utils.mongodb_utils import save_vehicle_entry, update_vehicle_exit

# Configure logging
logger = logging.getLogger(__name__)

class LineCrossingDetector:
    """
    Detects when tracked objects cross a user-defined line segment (supports diagonal, vertical, horizontal).
    Uses vector math for direction and robust intersection calculation.
    Records intersection points and provides event history with optional cropped images.
    """

    def __init__(
        self,
        frame_width: int = 1280,
        frame_height: int = 720,
        max_events: int = 20,
        cooldown: int = 10
    ):
        self.frame_width = frame_width
        self.frame_height = frame_height
        self.line_start: Tuple[int, int] = (500, 0)
        self.line_end: Tuple[int, int] = (1280, 720)
        self._update_line()
        self.entry_count = 0
        self.exit_count = 0
        self.track_last_pos: Dict[Any, Tuple[float, float]] = {}
        self.track_cooldown: Dict[Any, int] = {}
        self.cooldown = cooldown
        self.events: List[Dict] = []
        self.max_events = max_events
        self.event_images: Dict[str, str] = {}
        self.plate_cache: Dict[int, Dict] = {}  # Cache for license plate detection results by track_id
        self.saved_vehicles = {}  # Track saved vehicles to avoid duplicates

    def set_line(self, start: Tuple[int, int], end: Tuple[int, int]) -> None:
        """Set the crossing line and reset all state."""
        self.line_start = tuple(start)
        self.line_end = tuple(end)
        self._update_line()
        self.track_last_pos.clear()
        self.track_cooldown.clear()
        self.events.clear()
        self.event_images.clear()
        self.entry_count = 0
        self.exit_count = 0

    def _update_line(self) -> None:
        """Update cached line vector and normal."""
        x1, y1 = self.line_start
        x2, y2 = self.line_end
        dx = x2 - x1
        dy = y2 - y1
        norm = np.hypot(dx, dy)
        self.line_vec = (dx, dy)
        self.line_len = norm
        self.normal = (dy / norm, -dx / norm) if norm > 1e-6 else (0, 0)

    def _crop(self, frame: np.ndarray, bbox: List[float], pad: int = 20) -> Optional[np.ndarray]:
        """Crop the region around the bbox from the frame, with optional padding."""
        if frame is None or bbox is None:
            return None
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = map(int, bbox)
        x1 = max(0, x1 - pad)
        y1 = max(0, y1 - pad)
        x2 = min(w, x2 + pad)
        y2 = min(h, y2 + pad)
        if x2 <= x1 or y2 <= y1:
            return None
        crop = frame[y1:y2, x1:x2]
        return crop if crop.size > 0 else None

    def _encode(self, img: np.ndarray) -> Optional[str]:
        """Encode an image as base64 JPEG."""
        if img is None:
            return None
        _, buf = cv2.imencode('.jpg', img, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        return base64.b64encode(buf).decode('utf-8')

    def _segment_intersection(
        self,
        p1: Tuple[float, float],
        p2: Tuple[float, float],
        q1: Tuple[float, float],
        q2: Tuple[float, float]
    ) -> Optional[Tuple[float, float]]:
        """
        Returns intersection point of segments p1-p2 and q1-q2, or None if no intersection.
        """
        def ccw(a, b, c):
            return (c[1]-a[1])*(b[0]-a[0]) > (b[1]-a[1])*(c[0]-a[0])
        if (ccw(p1, q1, q2) != ccw(p2, q1, q2)) and (ccw(p1, p2, q1) != ccw(p1, p2, q2)):
            xdiff = (p1[0] - p2[0], q1[0] - q2[0])
            ydiff = (p1[1] - p2[1], q1[1] - q2[1])
            def det(a, b):
                return a[0] * b[1] - a[1] * b[0]
            div = det(xdiff, ydiff)
            if abs(div) < 1e-8:
                return None
            d = (det(p1, p2), det(q1, q2))
            x = det(d, xdiff) / div
            y = det(d, ydiff) / div
            return (x, y)
        return None

    def _movement_direction(
        self,
        prev: Tuple[float, float],
        curr: Tuple[float, float]
    ) -> Tuple[float, float]:
        dx = curr[0] - prev[0]
        dy = curr[1] - prev[1]
        norm = np.hypot(dx, dy)
        if norm < 1e-6:
            return (0, 0)
        return (dx / norm, dy / norm)

    def update(
        self,
        tracks: List[Any],
        timestamp: Optional[float] = None,
        frame: Optional[np.ndarray] = None
    ) -> Dict:
        """
        Update the detector with current tracks and frame.
        Returns a dictionary with entry/exit counts, recent events, and line info.
        """
        now = time.time() if timestamp is None else timestamp
        
        # Get frame dimensions for bbox validation
        frame_height, frame_width = (frame.shape[:2] if frame is not None 
                                   else (self.frame_height, self.frame_width))
        
        # Decrement cooldowns
        for tid in list(self.track_cooldown):
            self.track_cooldown[tid] -= 1
            if self.track_cooldown[tid] <= 0:
                del self.track_cooldown[tid]
                
        # Process tracks
        for track in tracks:
            tid = getattr(track, "track_id", None)
            bbox = getattr(track, "bbox", None)
            # Get vehicle type if available
            vehicle_type = getattr(track, "type", "unknown") if hasattr(track, "type") else "unknown"
            display_type = getattr(track, "display_type", None) if hasattr(track, "display_type") else None
            
            if bbox is None or tid is None:
                continue
                
            # Enhanced bbox validation - ensure coordinates are valid and within frame bounds
            x1, y1, x2, y2 = bbox
            if (x1 < 0 or y1 < 0 or x2 <= x1 or y2 <= y1 or 
                x1 >= frame_width or y1 >= frame_height or 
                x2 > frame_width or y2 > frame_height):
                logger.warning(f"Invalid bbox for track {tid}: {bbox} (frame: {frame_width}x{frame_height}), skipping")
                continue
                
            center = ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)
            prev_pos = self.track_last_pos.get(tid)
            self.track_last_pos[tid] = center
            if tid in self.track_cooldown or prev_pos is None:
                continue
                
            intersection = self._segment_intersection(prev_pos, center, self.line_start, self.line_end)
            if intersection is not None:
                move_dir = self._movement_direction(prev_pos, center)
                dot = move_dir[0] * self.normal[0] + move_dir[1] * self.normal[1]
                if dot < 0:
                    event_type = "exit"
                    self.exit_count += 1
                else:
                    event_type = "entry"
                    self.entry_count += 1
                    
                event_id = f"{event_type}_{tid}_{int(now*1000)}"
                # Crop image using validated bbox coordinates 
                crop_img = self._crop(frame, bbox) if frame is not None else None
                
                # Process license plate and handle database operations
                license_plate = None
                if crop_img is not None:
                    # Try to recognize license plate
                    if tid in self.plate_cache:
                        # Use cached license plate if available
                        license_plate = self.plate_cache[tid]
                    elif frame is not None:
                        # Get a larger crop for license plate detection
                        vehicle_crop = self._crop(frame, bbox, pad=40)
                        if vehicle_crop is not None:
                            plate_result = detect_license_plate(vehicle_crop)
                            if plate_result:
                                license_plate = plate_result["text"]
                                self.plate_cache[tid] = license_plate
                
                # Save vehicle image
                image_url = None
                if crop_img is not None:
                    # For now, we'll just store the base64 encoded image
                    # In a production environment, you'd upload this to storage
                    # and store the URL instead
                    image_data = self._encode(crop_img)
                    image_url = f"data:image/jpeg;base64,{image_data}" if image_data else None
                
                # Handle database operations based on event type
                mongodb_id = None
                # Use display_type as primary vehicle type, fallback to vehicle_type if needed
                final_vehicle_type = display_type or vehicle_type.capitalize()
                
                if event_type == "entry" and license_plate and final_vehicle_type:
                    # Check if we've already saved this vehicle to avoid duplicates
                    plate_key = f"{license_plate}_{final_vehicle_type}"
                    if plate_key not in self.saved_vehicles:
                        # Save to MongoDB (non-blocking) and get pre-generated ID
                        mongodb_id = save_vehicle_entry(
                            vehicle_type=final_vehicle_type,
                            license_plate=license_plate,
                            image_url=image_url,
                            gate_id="QBGp25pgkcvRIrt9YDbU",  # Default gate ID
                            location="Secondary Parking Lot"
                        )
                        if mongodb_id:
                            self.saved_vehicles[plate_key] = mongodb_id
                elif event_type == "exit" and license_plate:
                    # Update exit time in MongoDB (non-blocking)
                    update_vehicle_exit(license_plate)
                
                if crop_img is not None:
                    self.event_images[event_id] = self._encode(crop_img)
                
                self.events.append({
                    "id": event_id,
                    "track_id": tid,
                    "type": event_type,
                    "position": intersection,  # Always in original frame coordinates
                    "time": now,
                    "bbox": bbox,
                    "has_image": crop_img is not None,
                    "frame_shape": frame.shape[:2] if frame is not None else (self.frame_height, self.frame_width),
                    "license_plate": license_plate,
                    "vehicle_type": display_type or vehicle_type,  # Use display_type if available, fallback to vehicle_type
                    "display_type": display_type,   # Add display type information
                    "mongodb_id": mongodb_id    # Add MongoDB document ID if saved
                })
                
                if len(self.events) > self.max_events:
                    old = self.events.pop(0)
                    self.event_images.pop(old["id"], None)
                
                self.track_cooldown[tid] = self.cooldown
        
        # Remove stale tracks
        current_ids = {getattr(t, "track_id", None) for t in tracks}
        for tid in list(self.track_last_pos):
            if tid not in current_ids:
                self.track_last_pos.pop(tid)
                # Also clear plate cache for removed tracks
                self.plate_cache.pop(tid, None)
        
        # Prepare output - sort events by time (newest first)
        events_with_img = []
        for e in self.events:
            ev = dict(e)
            if ev["has_image"]:
                ev["image"] = self.event_images.get(ev["id"])
            events_with_img.append(ev)
        
        # Sort events by time descending (newest first)
        events_with_img.sort(key=lambda x: x.get("time", 0), reverse=True)
        
        return {
            "entry_count": self.entry_count,
            "exit_count": self.exit_count,
            "recent_events": events_with_img,
            "line": {
                "start": self.line_start,
                "end": self.line_end,
                "normal": self.normal,
            }
        }
