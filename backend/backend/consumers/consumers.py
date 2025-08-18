import json
import asyncio
import logging
import numpy as np
import cv2
from av import VideoFrame
from channels.generic.websocket import AsyncWebsocketConsumer
from aiortc import (
    RTCConfiguration,
    RTCPeerConnection,
    VideoStreamTrack,
    RTCSessionDescription,
    RTCIceServer,
    RTCIceCandidate,
)
import time
from aiortc.sdp import candidate_from_sdp
from aiortc.contrib.media import MediaPlayer, MediaRelay
from backend.core.vehicle_detection import VehicleDetector
from backend.core.line_crossing import LineCrossingDetector

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('video_consumer')

pcs = set()

# RTSP URL with low-latency parameters
RTSP_URL = "rtsp://admin:admin@10.10.10.10:554/cam/realmonitor?channel=1&subtype=0&transport=tcp&timeout=0&rtsp_timeout=0" # Example RTSP URL, replace with actual camera URL

# Frame processing settings optimized for accuracy-performance balance
MIN_DETECTION_INTERVAL = 0.1    # Slightly faster for more responsive updates
FRAME_SKIP = 1                  # Process every other frame for better accuracy
MAX_RESOLUTION = 2560           # Higher display resolution
DETECTION_RESOLUTION = 1080     # Resolution for detection processing
MAX_CONSECUTIVE_ERRORS = 10     # Maximum consecutive errors before reconnecting

# Create a media relay for WebRTC
relay = MediaRelay()

class RTSPVideoStreamTrack(VideoStreamTrack):
    def __init__(self):
        super().__init__()
        self.kind = "video"
        self.lock = asyncio.Lock()
        self.latest_detections = []
        self.frame_count = 0
        self.last_detection_time = 0
        self.running = True
        self.vehicle_detector = VehicleDetector(draw_boxes=True, draw_paths=True)
        self.annotated_frame = None
        self.detection_task = None
        self.fps_stats = []
        self.last_frame_time = time.time()
        self.current_fps = 0
        self.display_fps = True
        self.player = None
        self.track = None
        self.reconnect_attempts = 0
        self.max_reconnect_attempts = 5
        self.error_count = 0
        self.last_frame = None
        
        # Initialize default dimensions for the video frame (will be updated with actual frame)
        self.orig_width = 1280  # Default width
        self.orig_height = 720  # Default height
        
        # Initialize line crossing detector
        # Default line position (horizontal line in the middle of the frame)
        self.line_crossing_detector = LineCrossingDetector()
        self.crossing_stats = {"entry_count": 0, "exit_count": 0, "recent_events": []}
        self.line_set = False

        # Initialize RTSP stream
        self.start_video()
        
        # Note: Default line will be set in detect_async when we get the first frame
        # This ensures line is always full width based on actual frame dimensions

        # Add flag to track if video has ended
        self.video_ended = False

    def create_player(self):
        try:
            logger.info(f"Creating RTSP player for {RTSP_URL}")
            # Use MediaPlayer with RTSP stream directly
            options = {
                "rtsp_transport": "tcp",  # Force TCP for reliability
                "stimeout": "5000000",    # Socket timeout in microseconds (5 sec)
                "reconnect": "1",         # Auto reconnect
                "reconnect_streamed": "1", # Reconnect if stream is lost
                "reconnect_delay_max": "2", # Max 2 seconds between reconnect attempts
                "buffer_size": "1024",    # Small buffer for lower latency
                "fflags": "nobuffer",     # Disable input buffering
            }
            
            self.player = MediaPlayer(RTSP_URL, format="rtsp", options=options)
            if self.player and self.player.video:
                self.track = relay.subscribe(self.player.video)
                self.reconnect_attempts = 0
                logger.info("RTSP player created successfully")
                return True
            else:
                logger.error("RTSP player created but no video track available")
                return False
        except Exception as e:
            logger.error(f"Error creating RTSP player: {e}")
            self.reconnect_attempts += 1
            return False

    def start_video(self):
        """Initialize RTSP stream"""
        try:
            self.reconnect_attempts = 0
            return self.create_player()
        except Exception as e:
            logger.error(f"Failed to start RTSP stream: {e}")
            return False

    def restart_video(self):
        """Reconnect to RTSP stream"""
        try:
            # For RTSP streams, we need to reconnect rather than restart
            self.start_video()
            if self.player and self.track:
                self.video_ended = False
                logger.info("RTSP stream reconnected successfully")
                return True
            else:
                logger.error("Failed to reconnect to RTSP stream")
                return False
        except Exception as e:
            logger.error(f"Error reconnecting to RTSP stream: {e}")
            return False

    async def stop(self):
        """Stop video streaming and release resources"""
        self.running = False
        if self.player:
            try:
                if self.track:
                    self.track = None
                self.player.video.stop()
                self.player = None
            except:
                pass
        logger.info("📷 RTSP stream stopped")

    async def detect_async(self, frame):
        """Run vehicle detection with ByteTrack asynchronously"""
        try:
            start_time = time.time()
            
            # Update actual frame dimensions and set default line if not set yet
            if not self.line_set and frame is not None:
                actual_height, actual_width = frame.shape[:2]
                self.orig_width = actual_width
                self.orig_height = actual_height
                
                # Update LineCrossingDetector with actual frame dimensions
                self.line_crossing_detector.frame_width = actual_width
                self.line_crossing_detector.frame_height = actual_height
                
                default_line_y = int(actual_height * 0.525)
                self.line_crossing_detector.set_line(
                    (0, default_line_y),
                    (actual_width, default_line_y)
                )
                self.line_set = True
                logger.info(f"✅ Set default crossing line: (0, {default_line_y}) → ({actual_width}, {default_line_y}) on frame {actual_width}x{actual_height}")
                logger.info(f"📏 Line spans full width: {actual_width} pixels")
            
            detections, annotated_frame_bytes = await self.vehicle_detector.detect_vehicle(frame)
            
            if annotated_frame_bytes:
                try:
                    nparr = np.frombuffer(annotated_frame_bytes, np.uint8)
                    self.annotated_frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                    
                    # Get the scale factors between original frame and annotated frame
                    orig_h, orig_w = frame.shape[:2]
                    ann_h, ann_w = self.annotated_frame.shape[:2]
                    scale_x = ann_w / orig_w
                    scale_y = ann_h / orig_h
                    
                    # Draw the crossing line on the annotated frame
                    if self.line_set:
                        line_start = self.line_crossing_detector.line_start
                        line_end = self.line_crossing_detector.line_end
                        
                        # Scale the line coordinates to match the annotated frame size
                        start_x = int(line_start[0] * scale_x)
                        start_y = int(line_start[1] * scale_y)
                        end_x = int(line_end[0] * scale_x)
                        end_y = int(line_end[1] * scale_y)
                        
                        # Debug logging every 300 frames to track line drawing
                        if self.frame_count % 300 == 0:
                            logger.info(f"🎨 Drawing line: Original ({line_start[0]}, {line_start[1]}) → ({line_end[0]}, {line_end[1]})")
                            logger.info(f"🎨 Scaled for display: ({start_x}, {start_y}) → ({end_x}, {end_y})")
                            logger.info(f"🎨 Scale factors: x={scale_x:.3f}, y={scale_y:.3f}")
                            logger.info(f"🎨 Annotated frame size: {ann_w}x{ann_h}")
                        
                        # Draw the crossing line (full width)
                        cv2.line(
                            self.annotated_frame, 
                            (start_x, start_y), 
                            (end_x, end_y), 
                            (0, 255, 255),  # Yellow color
                            3, 
                            cv2.LINE_AA
                        )
                        
                        # Draw line endpoints for better visibility
                        cv2.circle(self.annotated_frame, (start_x, start_y), 5, (0, 255, 0), -1)  # Green start point
                        cv2.circle(self.annotated_frame, (end_x, end_y), 5, (0, 0, 255), -1)    # Red end point
                    
                except Exception as e:
                    logger.error(f"Error drawing crossing line: {e}")
            
            async with self.lock:
                self.latest_detections = detections
                
                # Process line crossings using raw detections with consistent coordinates
                if detections and self.line_set:
                    # Debug logging for coordinate verification
                    if len(detections) > 0 and self.frame_count % 100 == 0:
                        first_det = detections[0] 
                        logger.info(f"🔍 COORD CHECK - Frame: {frame.shape[:2]}, Bbox: {first_det.get('bbox')}, Line: {self.line_crossing_detector.line_start}→{self.line_crossing_detector.line_end}")
                    
                    # Create Track objects for the line crossing detector
                    # IMPORTANT: Both bbox and line coordinates are in original frame coordinates
                    tracks = []
                    for det in detections:
                        track = type('Track', (), {})()
                        track.track_id = det.get("track_id", 0)
                        # detections bbox is already in original coordinates - this is correct
                        track.bbox = det.get("bbox", [0, 0, 0, 0])
                        track.type = det.get("type", "unknown")
                        track.display_type = det.get("display_type", None)
                        tracks.append(track)
                    
                    # Pass the original frame to update the line crossing detector
                    # This ensures coordinates are consistent: original frame + original bbox + original line
                    self.crossing_stats = self.line_crossing_detector.update(
                        tracks, 
                        timestamp=time.time(),
                        frame=frame  # Use original frame, not annotated frame
                    )
                
            detection_time = time.time() - start_time
            if len(detections) > 0 and self.frame_count % 100 == 0:
                logger.info(f"ByteTrack detected {len(detections)} objects in {detection_time:.3f}s")
                
            # No additional drawing here - let VehicleDetector handle all drawing
            # This eliminates duplicate labels and ensures consistent formatting
            
        except Exception as e:
            logger.error(f"Error in ByteTrack detection: {e}")

    async def recv(self):
        """Read frame from RTSP stream and send via WebRTC"""
        pts, time_base = await self.next_timestamp()

        try:
            # Check if RTSP player and track are available
            if not self.track or not self.player:
                if self.reconnect_attempts < self.max_reconnect_attempts:
                    logger.warning("RTSP track not available, attempting to reconnect")
                    self.create_player()

                # Return blank frame if we couldn't create a track
                if not self.track:
                    blank_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                    cv2.putText(
                        blank_frame, "Reconnecting to RTSP...",
                        (50, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2
                    )
                    video_frame = VideoFrame.from_ndarray(blank_frame, format='bgr24')
                    video_frame.pts = pts
                    video_frame.time_base = time_base
                    return video_frame

            # Get frame from RTSP stream
            frame = await self.track.recv()
            self.frame_count += 1
            self.error_count = 0  # Reset error count on successful frame
            self.last_frame = frame  # Store last successful frame
            
            # Calculate FPS
            current_time = time.time()
            frame_time = current_time - self.last_frame_time
            self.last_frame_time = current_time
            
            # Update FPS calculation
            self.fps_stats.append(1.0 / max(frame_time, 0.001))
            if len(self.fps_stats) > 30:  # Average over last 30 frames
                self.fps_stats.pop(0)
            self.current_fps = sum(self.fps_stats) / len(self.fps_stats)

            # Run detection asynchronously based on timing
            current_time = time.time()
            if (current_time - self.last_detection_time >= MIN_DETECTION_INTERVAL and 
                self.frame_count % FRAME_SKIP == 0):
                self.last_detection_time = current_time
                
                if self.detection_task and not self.detection_task.done():
                    # Don't create new task if previous is still running
                    pass
                else:
                    # Convert PyAV frame to NumPy array for processing
                    frame_np = frame.to_ndarray(format="bgr24")
                    # Create new async detection task
                    self.detection_task = asyncio.create_task(self.detect_async(frame_np.copy()))

            # Use annotated frame if available, otherwise use original
            if self.annotated_frame is not None:
                # Add FPS counter to the frame (for performance monitoring)
                if self.display_fps and self.current_fps > 0:
                    cv2.putText(
                        self.annotated_frame,
                        f"FPS: {self.current_fps:.1f}",
                        (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.7,
                        (255, 255, 255),
                        2,
                        cv2.LINE_AA
                    )
                
                # Create a new VideoFrame from our annotated numpy array
                display_frame = VideoFrame.from_ndarray(self.annotated_frame, format='bgr24')
                display_frame.pts = pts
                display_frame.time_base = time_base
                return display_frame
            else:
                # Return the original frame
                return frame

        except Exception as e:
            logger.error(f"❌ Error processing RTSP frame: {e}")
            self.error_count += 1
            
            # If too many errors, try to recreate player
            if self.error_count > MAX_CONSECUTIVE_ERRORS and self.reconnect_attempts < self.max_reconnect_attempts:
                logger.warning(f"Too many errors ({self.error_count}), recreating RTSP player")
                if self.player:
                    try:
                        self.track = None
                        self.player.video.stop()
                        self.player = None
                    except:
                        pass
                self.create_player()
            
            # Return last good frame or blank frame
            if self.last_frame:
                return self.last_frame
            else:
                # Return blank frame with error message
                blank_frame = np.zeros((480, 640, 3), dtype=np.uint8)
                cv2.putText(
                    blank_frame, f"Error: {str(e)[:30]}",
                    (30, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2
                )
                video_frame = VideoFrame.from_ndarray(blank_frame, format='bgr24')
                video_frame.pts = pts
                video_frame.time_base = time_base
                return video_frame

class VideoConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()
        logger.info("✅ WebSocket signaling connected")

        # Initialize RTSP video stream
        self.track = RTSPVideoStreamTrack()
        if not self.track.player or not self.track.track:
            logger.error("❌ Failed to initialize RTSP stream")
            await self.send(json.dumps({"type": "error", "message": "Failed to connect to RTSP stream"}))
            await self.close()
            return

        # Configure WebRTC
        config = RTCConfiguration(
            iceServers=[RTCIceServer(urls=["stun:stun.l.google.com:19302"])]
        )
        
        self.pc = RTCPeerConnection(config)
        pcs.add(self.pc)
        
        # Add track video
        self.pc.addTrack(self.track)

        # Handle ICE events
        @self.pc.on("iceconnectionstatechange")
        async def on_iceconnectionstatechange():
            logger.info(f"ICE connection state changed to: {self.pc.iceConnectionState}")
            if self.pc.iceConnectionState == "failed":
                await self.send(json.dumps({
                    "type": "error",
                    "message": "ICE connection failed"
                }))
                
        # Optimize SDP for low latency
        def optimize_sdp(sdp):
            # Add SDP parameters for low latency
            lines = sdp.split("\r\n")
            optimized_lines = []
            
            for line in lines:
                optimized_lines.append(line)
                
                # Add optimized parameters to media section
                if line.startswith("m=video"):
                    optimized_lines.append("a=rtcp-fb:* nack")
                    optimized_lines.append("a=rtcp-fb:* nack pli")
                    optimized_lines.append("a=rtcp-fb:* ccm fir")
                    optimized_lines.append("a=rtcp-fb:* goog-remb")
                    optimized_lines.append("a=content:main")
                    optimized_lines.append("a=x-google-max-bitrate:5000")
                    optimized_lines.append("a=x-google-min-bitrate:2000")
                    optimized_lines.append("a=x-google-start-bitrate:3000")
                    
            return "\r\n".join(optimized_lines)
        
        self.pc.onicecandidate = self.send_ice_candidate
        self.optimize_sdp = optimize_sdp

        self.running = True
        asyncio.create_task(self.send_detection_info())

    async def disconnect(self, close_code):
        logger.error(f"❌ WebSocket disconnected with code: {close_code}")
        self.running = False
        if hasattr(self, 'track'):
            await self.track.stop()
        if hasattr(self, 'pc'):
            pcs.discard(self.pc)
            await self.pc.close()
            logger.info("🔌 PeerConnection closed")

    async def receive(self, text_data):
        data = json.loads(text_data)
        logger.info(f"📥 Received: {data.get('type')}")

        if data.get('type') == 'offer':
            try:
                description = RTCSessionDescription(
                    sdp=data['sdp'],
                    type=data['type']
                )
                logger.info("📝 Setting remote description")
                await self.pc.setRemoteDescription(description)

                answer = await self.pc.createAnswer()
                if answer:
                    # Optimize SDP for low latency
                    answer_sdp = self.optimize_sdp(answer.sdp)
                    optimized_answer = RTCSessionDescription(sdp=answer_sdp, type="answer")
                    
                    await self.pc.setLocalDescription(optimized_answer)
                    logger.info("📤 Sending answer with low-latency optimizations")
                    await self.send(json.dumps({
                        'type': 'answer', 
                        'sdp': self.pc.localDescription.sdp
                    }))
                else:
                    logger.error("❌ Failed to create answer")
            except Exception as e:
                logger.error(f"❌ Error in handling offer: {e}")
                await self.send(json.dumps({"type": "error", "message": str(e)}))

        elif data.get('type') == 'candidate':
            try:
                candidate_data = data['candidate']
                candidate_str = candidate_data.get('candidate')
                sdpMid = candidate_data.get('sdpMid')
                sdpMLineIndex = candidate_data.get('sdpMLineIndex')

                logger.info(f"📍 Processing ICE candidate: {candidate_str[:30]}...")
                if candidate_str:
                    if candidate_str.startswith("candidate:"):
                        candidate_str = candidate_str[10:]
                    candidate_obj = candidate_from_sdp(candidate_str)
                    candidate_obj.sdpMid = sdpMid
                    candidate_obj.sdpMLineIndex = sdpMLineIndex
                    await self.pc.addIceCandidate(candidate_obj)
                    logger.info("✅ ICE candidate added successfully")
            except Exception as e:
                logger.error(f"❌ Error adding ICE candidate: {e}")

        elif data.get('type') == 'ping':
            await self.send(json.dumps({"type": "pong"}))
        
        elif data.get('type') == 'replay' or data.get('type') == 'reconnect':
            # Handle reconnect command (keeping 'replay' for backward compatibility)
            logger.info("Received reconnect command")
            if hasattr(self, 'track') and self.track.restart_video():
                # Send success response
                await self.send(json.dumps({
                    "type": "reconnect_status",
                    "status": "success",
                    "message": "RTSP stream reconnected successfully"
                }))
            else:
                # Send error response
                await self.send(json.dumps({
                    "type": "reconnect_status",
                    "status": "error",
                    "message": "Failed to reconnect to RTSP stream"
                }))

    async def send_ice_candidate(self, event):
        if event.candidate:
            logger.info(f"📤 Sending ICE candidate: {event.candidate.candidate[:30]}...")
            await self.send(json.dumps({
                'type': 'candidate',
                'candidate': {
                    'candidate': event.candidate.candidate,
                    'sdpMid': event.candidate.sdpMid,
                    'sdpMLineIndex': event.candidate.sdpMLineIndex
                }
            }))

    async def send_detection_info(self):
        last_sent_time = 0
        min_interval = 0.15  # Slightly faster update rate - 6.7 fps
        
        while self.running:
            try:
                current_time = time.time()
                if current_time - last_sent_time >= min_interval:
                    last_sent_time = current_time
                    
                    async with self.track.lock:
                        detections = self.track.latest_detections
                        crossing_stats = self.track.crossing_stats

                    if detections:
                        # Optimize data by sending only necessary information
                        simplified_detections = [
                            {
                                "id": detection.get("track_id", "unknown"),
                                "type": detection.get("type", "vehicle"),
                                "confidence": detection.get("confidence", 1.0),
                                "bbox": detection.get("bbox", []),
                                # Only send important path points
                                "path": [point for i, point in enumerate(detection.get("path", [])) 
                                        if i % 3 == 0 or i == len(detection.get("path", [])) - 1]
                            }
                            for detection in detections
                        ]
                        
                        # Prepare crossing data with object crops
                        crossing_data = {
                            "entry_count": crossing_stats.get("entry_count", 0),
                            "exit_count": crossing_stats.get("exit_count", 0),
                            "line": crossing_stats.get("line", {"start": (0, 0), "end": (0, 0)}),
                            "events": crossing_stats.get("recent_events", [])
                        }
                        
                        # Match vehicle type for crossing events
                        if crossing_stats and 'recent_events' in crossing_stats:
                            for event in crossing_stats['recent_events']:
                                if not event.get('vehicle_type'):
                                    # Try to find a match if we don't already have the information
                                    for det in detections:
                                        if det.get('track_id') == event.get('track_id'):
                                            event['vehicle_type'] = det.get('type', 'unknown')
                                            break
                        
                        response = {
                            "type": "detection",
                            "detections": simplified_detections,
                            "fps": self.track.current_fps,
                            # Add line crossing stats with images
                            "crossing": crossing_data
                        }
                        await self.send(json.dumps(response))

                # Shorter sleep time for more responsive updates
                await asyncio.sleep(0.03)
            except Exception as e:
                logger.error(f"❌ Error in send_detection_info: {e}")
                await asyncio.sleep(0.1)
