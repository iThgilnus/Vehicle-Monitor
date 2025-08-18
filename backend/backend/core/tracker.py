import numpy as np
import torch
import sys
from collections import defaultdict
import argparse
from yolox.tracker.byte_tracker import BYTETracker, STrack

class Args:
    """Improved parameters for ByteTracker to enhance accuracy"""
    def __init__(self):
        self.track_thresh = 0.45  # Lowered from 0.5 to track more objects
        self.track_buffer = 40   # Increased from 30 to keep tracks longer
        self.match_thresh = 0.85  # Increased from 0.8 for better matching
        self.mot20 = False
        self.aspect_ratio_thresh = 1.6  # Filter out unrealistic aspect ratios
        self.min_box_area = 10    # Minimum detection area to consider

class Tracker:
    """Wrapper class for ByteTrack with improved accuracy settings"""
    
    def __init__(self):
        # Create args object for ByteTrack
        args = Args()
        # Initialize ByteTrack
        self.byte_tracker = BYTETracker(args, frame_rate=30)
        self.tracks = []
        # Store history for smoother tracks
        self.track_history = {}
        self.max_history_len = 10
        
    def update(self, image, detections):
        """Update the tracker with new detections with improved accuracy
        
        Args:
            image: Current frame (not used for ByteTrack but kept for API compatibility)
            detections: List of detections, each is [x1, y1, x2, y2, score, class_id(optional)]
        """
        if len(detections) == 0:
            self.tracks = []
            return self.tracks
            
        # Format the detections for ByteTrack
        dets_with_cls = np.array(detections, dtype=np.float64)
        
        # Extract scores
        scores = dets_with_cls[:, 4]
        
        # Check if class_id is provided (6th element)
        if dets_with_cls.shape[1] > 5:
            class_ids = dets_with_cls[:, 5].astype(int)
        else:
            class_ids = np.zeros(len(detections), dtype=int)
        
        # Apply additional filtering for better accuracy
        valid_indices = []
        for i, box in enumerate(dets_with_cls[:, :4]):
            # Calculate aspect ratio
            width = box[2] - box[0]
            height = box[3] - box[1]
            if width <= 0 or height <= 0:
                continue
                
            aspect_ratio = width / height
            area = width * height
            
            # Filter out detections with extreme aspect ratios or tiny areas
            if (aspect_ratio < self.byte_tracker.args.aspect_ratio_thresh and 
                area >= self.byte_tracker.args.min_box_area):
                valid_indices.append(i)
                
        if not valid_indices:
            self.tracks = []
            return self.tracks
            
        # Filter detections by valid indices
        filtered_dets = dets_with_cls[valid_indices]
        filtered_scores = scores[valid_indices]
        filtered_class_ids = class_ids[valid_indices] if len(class_ids) > 0 else np.zeros(len(valid_indices), dtype=int)
        
        # Create a dummy img_info and img_size
        height, width = image.shape[:2]
        img_info = [height, width]
        img_size = [height, width]  # No scaling
        
        # Create output results expected by ByteTrack
        output_results = np.zeros((len(filtered_dets), 5), dtype=np.float64)
        output_results[:, :4] = filtered_dets[:, :4]  # bbox coordinates
        output_results[:, 4] = filtered_scores  # scores
        
        # Update tracker
        online_targets = self.byte_tracker.update(output_results, img_info, img_size)
        
        # Convert ByteTrack results to our expected format
        self.tracks = []
        for target in online_targets:
            if not target.is_activated:
                continue
                
            # Create a track object compatible with our system
            track = type('Track', (), {})()
            track.track_id = target.track_id
            track.bbox = target.tlbr  # [x1, y1, x2, y2]
            track.score = target.score
            
            # Smooth the track using history if available
            if track.track_id in self.track_history:
                history = self.track_history[track.track_id]
                # Apply exponential smoothing to reduce jitter
                alpha = 0.6  # Smoothing factor
                smoothed_bbox = alpha * np.array(track.bbox) + (1-alpha) * np.array(history[-1])
                track.bbox = smoothed_bbox.tolist()
                
            # Update track history
            if track.track_id not in self.track_history:
                self.track_history[track.track_id] = []
            history = self.track_history[track.track_id]
            history.append(track.bbox)
            if len(history) > self.max_history_len:
                history.pop(0)
            
            # Add class_id if we have it
            if len(filtered_class_ids) > 0:
                # Find the closest detection to this track
                track_center = [(target.tlbr[0] + target.tlbr[2]) / 2,
                               (target.tlbr[1] + target.tlbr[3]) / 2]
                
                min_dist = float('inf')
                closest_det_idx = 0
                
                for i, det in enumerate(filtered_dets):
                    det_center = [(det[0] + det[2]) / 2, (det[1] + det[3]) / 2]
                    dist = ((track_center[0] - det_center[0]) ** 2 + 
                            (track_center[1] - det_center[1]) ** 2) ** 0.5
                    if dist < min_dist:
                        min_dist = dist
                        closest_det_idx = i
                
                # Assign the class from the closest detection
                track.cls_id = int(filtered_class_ids[closest_det_idx])
            else:
                track.cls_id = 0  # Default class id
                
            self.tracks.append(track)
        
        # Clean up track history for tracks that no longer exist
        current_track_ids = {track.track_id for track in self.tracks}
        for track_id in list(self.track_history.keys()):
            if track_id not in current_track_ids:
                if len(self.track_history[track_id]) >= self.max_history_len:
                    # Only remove if we have enough history
                    del self.track_history[track_id]
            
        return self.tracks

class Track:
    track_id = None
    bbox = None

    def __init__(self, id, bbox):
        self.track_id = id
        self.bbox = bbox