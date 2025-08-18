import { Component, OnInit, OnDestroy, Inject, PLATFORM_ID, ViewChild, ElementRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';

interface Detection {
  id?: string | number;
  camera_id?: string;
  label: string;
  display_type?: string;  // New property for friendly display name
  confidence: number;
  box: number[];
  path?: [number, number][];
}

interface CrossingEvent {
  id: string;
  track_id: number;
  type: 'entry' | 'exit';
  camera_id: string;
  position: [number, number];
  time: number;
  bbox: number[];
  image?: string;
  has_image: boolean;
  license_plate?: string;
  vehicle_type?: string;  // Add vehicle type field to events
  display_type?: string;  // Add friendly display name
}

interface CrossingStats {
  entry_count: number;
  exit_count: number;
  line?: {
    start: [number, number];
    end: [number, number];
  };
  events?: CrossingEvent[];
}

@Component({
  selector: 'app-video',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="video-container" [style.maxWidth.px]="maxVideoWidth">
      <video #videoElement autoplay playsinline muted [ngClass]="{'low-latency': true}"></video>
      <div *ngIf="isLoading" class="loading-overlay">
        <p>Connecting to video stream...</p>
      </div>
      <div *ngIf="errorMessage" class="error-overlay">
        <p>{{ errorMessage }}</p>
        <button (click)="reconnect()">Retry</button>
      </div>
      
      <!-- New Video Ended Overlay with Replay Button -->
      <div *ngIf="videoEnded" class="video-ended-overlay">
        <h2>Video Playback Ended</h2>
        <button (click)="replayVideo()" class="replay-button">
          <span class="replay-icon">↻</span> Replay Video
        </button>
      </div>
      
      <!-- Status display with metrics (no bounding boxes) -->
      <div class="status-container" *ngIf="!isLoading && !errorMessage && !videoEnded">
        <div class="fps-counter" *ngIf="currentFps > 0">FPS: {{ currentFps.toFixed(1) }}</div>
        <div class="detections-info">
          <h3>Vehicles: {{ detections.length }} <span *ngIf="detections.length > 0">({{ lastUpdated | date:'mediumTime' }})</span></h3>
          <div class="vehicle-types" *ngIf="detections.length > 0">
            <div *ngFor="let type of getUniqueVehicleTypes()" 
                 [ngClass]="'vehicle-type-'+type.toLowerCase()">
              {{ type }}: {{ countVehiclesByType(type) }}
            </div>
          </div>
          <div class="crossing-stats" *ngIf="crossingStats">
            <div class="entry">IN: {{ crossingStats.entry_count }}</div>
            <div class="exit">OUT: {{ crossingStats.exit_count }}</div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Object Crops Display Section -->
    <div class="object-crops-container" *ngIf="crossingStats?.events && (crossingStats?.events?.length ?? 0) > 0">
      <div class="section-title">Recent Crossings</div>
      <div class="crops-grid">
        <div class="event-group entry-events">
          <h4>Entries</h4>
          <div class="crops-row">
            <div class="object-crop" *ngFor="let event of getEventsByType('entry')"
                 [ngClass]="'vehicle-type-'+(event.vehicle_type?.toLowerCase() || 'unknown')">
              <img *ngIf="event.image" [src]="'data:image/jpeg;base64,' + event.image" 
                   [alt]="'Object ' + event.track_id + ' entered'">
              <div class="crop-info">
                <div class="crop-label">{{ event.display_type || event.vehicle_type || 'Unknown' }} ID:{{ event.track_id }}</div>
                <div class="crop-time">{{ formatTimestamp(event.time) }}</div>
                <div class="license-plate" *ngIf="event.license_plate">
                  {{ event.license_plate }}
                </div>
              </div>
            </div>
            <div class="no-events" *ngIf="getEventsByType('entry').length === 0">
              No recent entries
            </div>
          </div>
        </div>
        <div class="event-group exit-events">
          <h4>Exits</h4>
          <div class="crops-row">
            <div class="object-crop" *ngFor="let event of getEventsByType('exit')"
                 [ngClass]="'vehicle-type-'+(event.vehicle_type?.toLowerCase() || 'unknown')">
              <img *ngIf="event.image" [src]="'data:image/jpeg;base64,' + event.image" 
                   [alt]="'Object ' + event.track_id + ' exited'">
              <div class="crop-info">
                <div class="crop-label">{{ event.display_type || event.vehicle_type || 'Unknown' }} ID:{{ event.track_id }}</div>
                <div class="crop-time">{{ formatTimestamp(event.time) }}</div>
                <div class="license-plate" *ngIf="event.license_plate">
                  {{ event.license_plate }}
                </div>
              </div>
            </div>
            <div class="no-events" *ngIf="getEventsByType('exit').length === 0">
              No recent exits
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .video-container { 
      position: relative; 
      margin: 0 auto;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      border-radius: 4px;
      overflow: hidden;
      background-color: #000;
    }
    
    video { 
      width: 100%; 
      display: block;
      object-fit: contain;
    }
    
    .low-latency {
      will-change: transform;
      backface-visibility: hidden;
      transform: translateZ(0);
    }
    
    .loading-overlay, .error-overlay { 
      position: absolute; 
      top: 0; left: 0; right: 0; bottom: 0; 
      background: rgba(0, 0, 0, 0.7); 
      color: white; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      flex-direction: column; 
      z-index: 100;
    }
    
    .error-overlay button { 
      margin-top: 10px; 
      padding: 8px 16px; 
      background: #3498db; 
      color: white; 
      border: none; 
      border-radius: 4px; 
      cursor: pointer; 
      transition: background 0.3s;
    }
    
    .error-overlay button:hover {
      background: #2980b9;
    }
    
    .status-container {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%);
      color: white;
      padding: 8px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    
    .fps-counter {
      background: rgba(0,0,0,0.5);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
    }
    
    .detections-info {
      text-align: right;
    }
    
    .detections-info h3 {
      margin: 0;
      font-size: 14px;
      text-shadow: 1px 1px 1px rgba(0,0,0,0.5);
    }
    
    .crossing-stats {
      display: flex;
      justify-content: flex-end;
      gap: 15px;
      margin-top: 5px;
    }
    
    .entry {
      color: #2ecc71;
      font-weight: bold;
    }
    
    .exit {
      color: #e74c3c;
      font-weight: bold;
    }
    
    .object-crops-container {
      margin-top: 20px;
      padding: 15px;
      background-color: #f5f5f5;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      height: 48%;
    }
    
    .section-title {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 15px;
      color: #333;
    }
    
    .crops-grid {
      display: flex;
      flex-direction: row; /* Changed from column to row for 2-column layout */
      gap: 15px;
    }
    
    .event-group {
      flex: 1; /* Make each column take equal width */
      margin-bottom: 10px;
    }
    
    .event-group h4 {
      margin: 0 0 10px 0;
      font-size: 16px;
      color: #333;
      padding-bottom: 5px;
      border-bottom: 1px solid #ddd;
    }
    
    .crops-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      height: 100%; /* Ensure rows take full height in their column */
    }
    
    .object-crop {
      width: 120px;
      border-radius: 4px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      background-color: #fff;
      height: 400px;
    }
    
    .object-crop img {
      max-width: 140px;
      height: 80%;
      object-fit: cover;
      border-bottom: 1px solid #eee;
    }
    
    .crop-info {
      padding: 5px;
      font-size: 12px;
      text-align: center;
      color: #333;
    }
    
    .no-events {
      font-style: italic;
      color: #999;
      padding: 10px;
    }
    
    .entry-events h4 {
      color: #27ae60;
    }
    
    .exit-events h4 {
      color: #e74c3c;
    }

    .crop-id {
      font-weight: bold;
      margin-bottom: 2px;
    }
    
    .crop-time {
      font-size: 10px;
      color: #666;
    }

    .license-plate {
      font-weight: bold;
      background-color: rgba(255, 255, 0, 0.7);
      color: #000;
      padding: 2px 5px;
      border-radius: 3px;
      margin-top: 3px;
      font-family: monospace;
      font-size: 12px;
      text-align: center;
    }

    @media (max-width: 768px) {
      /* Responsive layout - stack columns on small screens */
      .crops-grid {
        flex-direction: column;
      }
    }

    .vehicle-types {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 5px;
      font-size: 12px;
    }
    
    .vehicle-type {
      font-weight: bold;
      margin-bottom: 3px;
      color: #333;
    }
    
    /* Vehicle type color indicators */
    .vehicle-type-motorcycle {
      color: #e67e22;
      border-left: 3px solid #e67e22;
      padding-left: 4px;
    }
    
    .vehicle-type-car {
      color: #3498db;
      border-left: 3px solid #3498db;
      padding-left: 4px;
    }
    
    .vehicle-type-truck {
      color: #9b59b6;
      border-left: 3px solid #9b59b6;
      padding-left: 4px;
    }
    
    .vehicle-type-bus {
      color: #e74c3c;
      border-left: 3px solid #e74c3c;
      padding-left: 4px;
    }
    
    .vehicle-type-bicycle {
      color: #2ecc71;
      border-left: 3px solid #2ecc71;
      padding-left: 4px;
    }
    
    .vehicle-type-pedestrian, .vehicle-type-person {
      color: #f39c12;
      border-left: 3px solid #f39c12;
      padding-left: 4px;
    }
    
    .vehicle-type-unknown {
      color: #7f8c8d;
      border-left: 3px solid #7f8c8d;
      padding-left: 4px;
    }

    .video-ended-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      background: linear-gradient(to bottom, rgba(0, 0, 0, 0.9), rgba(20, 20, 40, 0.85));
      color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 110;
    }
    
    .replay-button {
      margin-top: 20px;
      padding: 12px 24px;
      font-size: 16px;
      font-weight: bold;
      background-color: #e74c3c;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.3s;
      display: flex;
      align-items: center;
    }
    
    .replay-button:hover {
      background-color: #c0392b;
      transform: scale(1.05);
    }
    
    .replay-icon {
      font-size: 20px;
      margin-right: 8px;
    }
  `]
})
export class VideoComponent implements OnInit, OnDestroy {
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;

  private pc!: RTCPeerConnection;
  private ws!: WebSocket;
  private pingInterval: any;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 3000; // 3 seconds
  private reconnectionTimeout: any;
  private videoStallCheckInterval: any;
  private lastFrameTimestamp = 0;
  private colorMap: {[key: string]: string} = {};
  
  // Video settings for higher resolution
  public maxVideoWidth = 1280;
  videoWidth = 300;
  videoHeight = 400;
  currentFps = 0;

  detections: Detection[] = [];
  crossingStats: CrossingStats | null = null;
  lastUpdated: Date = new Date();
  errorMessage = '';
  isLoading = true;

  // New property to track which camera is active in the UI
  activeCamera: 'in' | 'out' = 'in';

  // Add new property to track video playback state
  videoEnded = false;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.initializeConnection();
    }
  }

  ngOnDestroy() {
    if (this.videoStallCheckInterval) {
      clearInterval(this.videoStallCheckInterval);
    }
    if (this.reconnectionTimeout) {
      clearTimeout(this.reconnectionTimeout);
    }
    this.cleanup();
  }

  // Keep color generation for potential future use but remove path generation
  getColorForType(type: string, alpha: number = 1): string {
    if (!this.colorMap[type]) {
      // Define colors for different detection types
      const typeColors: {[key: string]: string} = {
        person: 'rgb(46, 204, 113)', // Green
        car: 'rgb(52, 152, 219)',    // Blue
        truck: 'rgb(155, 89, 182)',  // Purple
        bicycle: 'rgb(241, 196, 15)', // Yellow
        motorcycle: 'rgb(230, 126, 34)', // Orange
        bus: 'rgb(231, 76, 60)'      // Red
      };
      
      this.colorMap[type] = typeColors[type.toLowerCase()] || 'rgb(26, 188, 156)'; // Default to turquoise
    }
    if (alpha === 1) {
      return this.colorMap[type];
    } else {
      // Add alpha for semi-transparency
      return this.colorMap[type].replace('rgb', 'rgba').replace(')', `, ${alpha})`);
    }
  }

  private initializeConnection() {
    this.setupWebRTC();
    this.connectWebSocket();
  }

  private setupWebRTC() {
    console.log('Setting up WebRTC connection with low-latency config');
    
    // WebRTC configuration with low latency settings
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      // Low latency settings
      iceTransportPolicy: 'all',
      iceCandidatePoolSize: 0
    });

    // Listen for tracks from server
    this.pc.ontrack = (event) => {
      console.log('Track received:', event.track.kind);
      this.handleTrackEvent(event);
    };
    
    this.pc.onicecandidate = (event) => this.handleIceCandidate(event);
    this.pc.oniceconnectionstatechange = () => this.handleIceStateChange();
    
    // Add transceiver with low-latency settings
    console.log('Adding video transceiver with low-latency settings');
    this.pc.addTransceiver('video', { 
      direction: 'recvonly',
      streams: []
    });
  }

  private connectWebSocket() {
    console.log('Connecting to WebSocket');
    this.ws = new WebSocket('ws://localhost:8000/ws/signaling/');

    this.ws.onopen = () => {
      console.log('WebSocket connected, creating offer');
      this.reconnectAttempts = 0;
      this.isLoading = false;
      this.startPingInterval();
      this.createOffer();
    };

    this.ws.onmessage = (event) => this.handleWebSocketMessage(event);
    this.ws.onerror = (error) => this.handleError('WebSocket error', error);
    this.ws.onclose = () => this.handleWebSocketClose();
  }

  private async createOffer() {
    try {
      console.log('Creating offer with real-time parameters');
      
      // Create offer with real-time constraints for lower latency
      const offerOptions = {
        offerToReceiveVideo: true,
        offerToReceiveAudio: false,
        voiceActivityDetection: false
      };
      
      const offer = await this.pc.createOffer(offerOptions);
      
      // Add real-time media priority to SDP
      let sdp = offer.sdp || '';
      if (!sdp.includes('a=content:main')) {
        sdp = sdp.replace('m=video', 'a=content:main\r\nm=video');
      }
      
      // Add additional real-time optimizations
      if (!sdp.includes('a=rtcp-fb:* nack')) {
        // Add NACK for lost packet recovery
        sdp = sdp.replace('a=rtpmap', 'a=rtcp-fb:* nack\r\na=rtpmap');
      }
      
      const modifiedOffer = new RTCSessionDescription({
        type: 'offer',
        sdp: sdp
      });
      
      await this.pc.setLocalDescription(modifiedOffer);
      console.log('Sending optimized offer to server');
      this.ws.send(JSON.stringify({ 
        type: 'offer', 
        sdp: this.pc.localDescription?.sdp 
      }));
    } catch (error) {
      this.handleError('Failed to create offer', error);
    }
  }

  private handleTrackEvent(event: RTCTrackEvent) {
    console.log('Handling track event');
    if (!this.videoElement?.nativeElement) {
      console.error('Video element not found');
      return;
    }

    const [stream] = event.streams;
    if (!stream) {
      console.error('No stream in track event');
      return;
    }
    
    console.log('Setting stream to video element with low latency settings');
    const videoEl = this.videoElement.nativeElement;
    videoEl.srcObject = stream;
    
    // Set properties for low latency playback
    videoEl.autoplay = true;
    videoEl.muted = true;
    videoEl.playsInline = true;
    
    // Modern browsers support these properties for lower latency
    if ('latencyHint' in videoEl) {
      (videoEl as any).latencyHint = 'realtime';
    }
    
    // Smallest possible buffer
    if ('bufferHint' in videoEl) {
      (videoEl as any).bufferHint = 0;
    }
    
    // Add event listeners for video dimensions
    videoEl.onloadedmetadata = () => {
      console.log('Video metadata loaded, playing with minimal latency');
      
      // Set playback rate slightly faster (1.01) to catch up if needed
      videoEl.playbackRate = 1.01;
      
      // Update video dimensions
      this.videoWidth = videoEl.videoWidth;
      this.videoHeight = videoEl.videoHeight;
      
      // Ensure video doesn't exceed max width
      if (this.videoWidth > this.maxVideoWidth) {
        const scale = this.maxVideoWidth / this.videoWidth;
        this.videoWidth = this.maxVideoWidth;
        this.videoHeight = Math.floor(this.videoHeight * scale);
      }
      
      videoEl.play().catch(error => {
        this.handleError('Video playback failed', error);
      });
    };
    
    videoEl.onresize = () => {
      // Update video dimensions when resized
      this.videoWidth = videoEl.videoWidth;
      this.videoHeight = videoEl.videoHeight;
      
      // Ensure video doesn't exceed max width
      if (this.videoWidth > this.maxVideoWidth) {
        const scale = this.maxVideoWidth / this.videoWidth;
        this.videoWidth = this.maxVideoWidth;
        this.videoHeight = Math.floor(this.videoHeight * scale);
      }
    };
    
    this.videoElement.nativeElement.onloadeddata = () => {
      console.log('Video data loaded');
    };
    
    this.videoElement.nativeElement.onerror = (e) => {
      console.error('Video element error:', e);
    };

    // Setup video stall detection
    this.setupVideoStallDetection(videoEl);
  }
  
  private setupVideoStallDetection(videoEl: HTMLVideoElement) {
    // Clear existing interval if any
    if (this.videoStallCheckInterval) {
      clearInterval(this.videoStallCheckInterval);
    }
    
    // Track when frames are received
    this.lastFrameTimestamp = Date.now();
    
    videoEl.addEventListener('timeupdate', () => {
      this.lastFrameTimestamp = Date.now();
    });
    
    // Check for stalled video every 2 seconds
    this.videoStallCheckInterval = setInterval(() => {
      const now = Date.now();
      // If no frame updates for more than 5 seconds, consider the stream stalled
      if (now - this.lastFrameTimestamp > 5000 && !videoEl.paused) {
        console.warn('Video appears to be stalled, attempting recovery');
        this.recoverStalledStream(videoEl);
      }
    }, 2000);
  }
  
  private recoverStalledStream(videoEl: HTMLVideoElement) {
    // Don't attempt recovery if we're already in error state
    if (this.errorMessage) {
      return;
    }
    
    console.log('Attempting to recover stalled stream');
    
    // First try: Force a play() call
    videoEl.play().catch(error => {
      console.error('Failed to restart playback:', error);
      
      // If play() fails, try more aggressive recovery
      if (this.pc && this.pc.connectionState !== 'closed') {
        console.log('Attempting WebRTC connection restart');
        // Clear existing timeout to prevent multiple reconnections
        if (this.reconnectionTimeout) {
          clearTimeout(this.reconnectionTimeout);
        }
        
        // Force reconnection after a short delay
        this.reconnectionTimeout = setTimeout(() => {
          this.reconnect();
        }, 1000);
      }
    });
  }

  private async handleWebSocketMessage(event: MessageEvent) {
    try {
      const data = JSON.parse(event.data);
      console.log('Received message type:', data.type);

      switch (data.type) {
        case 'answer':
          console.log('Received answer from server');
          await this.pc.setRemoteDescription(
            new RTCSessionDescription({ type: 'answer', sdp: data.sdp })
          );
          break;

        case 'candidate':
          console.log('Received ICE candidate from server');
          if (data.candidate) {
            try {
              await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
              console.error('Error adding ICE candidate:', e);
            }
          }
          break;

        case 'detection':
          // Check if video has ended
          if (data.video_ended) {
            console.log('Video has ended, showing replay button');
            this.videoEnded = true;
            // Reset detections since video has ended
            this.detections = [];
            break;
          }
          
          // Otherwise process detection data as normal
          // Update FPS if provided - now it's an object keyed by camera_id
          if (data.fps && data.fps[this.activeCamera]) {
            this.currentFps = data.fps[this.activeCamera];
          }
          
          // Update crossing stats
          if (data.crossing) {
            // Process crossing events to handle license plates
            if (data.crossing.events) {
              // Convert event type field to match our frontend types
              data.crossing.events = data.crossing.events.map((event: any) => ({
                ...event,
                // Ensure we use the proper event type
                type: event.type || 'unknown'
              }));
            }
            
            this.crossingStats = {
              entry_count: data.crossing.entry_count || 0,
              exit_count: data.crossing.exit_count || 0,
              events: data.crossing.events || []
            };
          }
          
          // Process detections, adding vehicle type data
          this.detections = data.detections.map((det: any) => ({
            id: det.id || undefined,
            camera_id: det.camera_id || 'unknown',
            label: det.type || 'unknown',
            display_type: det.display_type || this.capitalizeFirstLetter(det.type) || 'Unknown',
            confidence: det.confidence || 0.9,
            box: det.bbox,
          }));
          
          // No longer filtering only motorcycles
          // this.detections = this.detections.filter(detection => 
          //   detection.label.toLowerCase() === 'motorcycle' && detection.confidence > 0.6
          // );
          
          // Filter based on minimum confidence instead
          this.detections = this.detections.filter(detection => detection.confidence > 0.4);
          
          this.lastUpdated = new Date();
          break;

        case 'replay_status':
          if (data.status === 'success') {
            console.log('Video successfully restarted');
            // Reset ended flag when replay starts
            this.videoEnded = false;
          } else {
            this.handleError('Replay failed', data.message || 'Unknown error restarting video');
          }
          break;

        case 'error':
          this.handleError('Server error', data.message);
          break;
      }
    } catch (error) {
      this.handleError('Message handling failed', error);
    }
  }

  private handleWebSocketClose() {
    console.log('WebSocket closed');
    clearInterval(this.pingInterval);
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        this.reconnectAttempts++;
        this.connectWebSocket();
      }, this.reconnectDelay);
    } else {
      this.handleError('Connection failed', 'Max reconnection attempts reached');
    }
  }

  private startPingInterval() {
    this.pingInterval = setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 5000);
  }

  private handleIceCandidate(event: RTCPeerConnectionIceEvent) {
    if (event.candidate && this.ws.readyState === WebSocket.OPEN) {
      console.log('Sending ICE candidate to server');
      this.ws.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
    }
  }

  private handleIceStateChange() {
    console.log('ICE connection state:', this.pc.iceConnectionState);
    if (this.pc.iceConnectionState === 'connected' || 
        this.pc.iceConnectionState === 'completed') {
      console.log('ICE connection established');
      this.isLoading = false;
    } else if (this.pc.iceConnectionState === 'failed') {
      this.handleError('ICE Connection', 'ICE connection failed');
    } else if (this.pc.iceConnectionState === 'disconnected') {
      console.log('ICE connection disconnected, attempting to recover');
    }
  }

  private handleError(context: string, error: any) {
    console.error(`${context}:`, error);
    this.errorMessage = `${context}: ${error.message || error}`;
    this.isLoading = false;
  }

  private cleanup() {
    clearInterval(this.pingInterval);
    this.ws?.close();
    this.pc?.close();
  }

  reconnect() {
    this.errorMessage = '';
    this.isLoading = true;
    this.initializeConnection();
  }

  // Switch between camera views in the UI
  switchCamera(camera: 'in' | 'out') {
    this.activeCamera = camera;
    // Note: We're not actually switching the WebRTC video stream
    // This just filters the displayed data based on camera ID
  }
  
  // Get detections filtered by active camera
  getDetectionsByCamera(cameraId: string): Detection[] {
    return this.detections.filter(d => d.camera_id === cameraId);
  }
  
  // Helper method to filter events by type with null safety
  getEventsByType(type: 'entry' | 'exit'): CrossingEvent[] {
    if (!this.crossingStats?.events) return [];
    
    return this.crossingStats.events
      .filter(event => event.type === type && event.has_image)
      .sort((a, b) => b.time - a.time) // Sort by time descending (newest first)
      .slice(0, 6); // Limit to 6 most recent events
  }

  // Get all events sorted by time (most recent first)
  getAllEvents(): CrossingEvent[] {
    if (!this.crossingStats?.events) return [];
    
    return this.crossingStats.events
      .filter(event => event.has_image && (event.type === 'entry' || event.type === 'exit'))
      .sort((a, b) => b.time - a.time);
  }

  // Format timestamp to a readable format
  formatTimestamp(timestamp: number): string {
    if (!timestamp) return '';
    
    const date = new Date(timestamp * 1000); // Convert to milliseconds if in seconds
    
    // If timestamp is today, just show time
    const now = new Date();
    const isToday = date.getDate() === now.getDate() && 
                    date.getMonth() === now.getMonth() && 
                    date.getFullYear() === now.getFullYear();
                    
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } else {
      return date.toLocaleString([], { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit'
      });
    }
  }

  // Helper methods for vehicle types
  getUniqueVehicleTypes(): string[] {
    const types = new Set<string>();
    this.detections.forEach(d => {
      if (d.display_type) {
        types.add(d.display_type);
      }
    });
    return Array.from(types);
  }
  
  countVehiclesByType(type: string): number {
    return this.detections.filter(d => d.display_type === type).length;
  }
  
  capitalizeFirstLetter(str?: string): string {
    if (!str) return 'Unknown';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  // Add new method to send replay command
  replayVideo() {
    console.log('Requesting video replay');
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'replay' }));
    } else {
      this.handleError('Replay failed', 'WebSocket connection is not open');
    }
  }
}
