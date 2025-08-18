# Hướng dẫn triển khai hệ thống nhận diện video thời gian thực với Django và Angular

## Tổng quan hệ thống

Hệ thống này sử dụng WebRTC để truyền video từ server (Django) đến client (Angular) và thực hiện nhận diện đối tượng theo thời gian thực bằng mô hình YOLO. Kết quả nhận diện được gửi về client thông qua WebSocket.

Các công nghệ chính:
- **Backend**: Django + Django Channels + aiortc + YOLO
- **Frontend**: Angular
- **Giao thức kết nối**: WebRTC, WebSocket

## Yêu cầu hệ thống

### Server (Backend)
- Python 3.8+ 
- Django 5.1+
- Channels
- Daphne
- aiortc
- OpenCV-Python
- Ultralytics YOLO

### Client (Frontend)
- Node.js 14+
- Angular 16+
- TypeScript 4.9+

## 1. Cài đặt môi trường

### 1.1. Cài đặt Backend (Django)

```bash
# Tạo môi trường ảo Python
python -m venv venv
source venv/bin/activate   # Trên Linux/Mac
# hoặc
venv\Scripts\activate      # Trên Windows

# Cài đặt các thư viện cần thiết
pip install django djangorestframework channels daphne django-cors-headers
pip install aiortc opencv-python numpy ultralytics
```

### 1.2. Cài đặt Frontend (Angular)

```bash
# Cài đặt Angular CLI
npm install -g @angular/cli

# Tạo dự án Angular
ng new frontend
cd frontend

# Cài đặt các thư viện cần thiết
npm install
```

## 2. Thiết lập Backend

### 2.1. Tạo dự án Django

```bash
django-admin startproject backend
cd backend
```

### 2.2. Cấu hình Django Settings

Chỉnh sửa file `settings.py` để thêm:
- Django Channels
- CORS Headers
- WebSocket và ASGI routing

### 2.3. Tạo module xử lý WebRTC và YOLO

Tạo file `consumers.py` để xử lý:
- Kết nối WebRTC
- Luồng video từ camera
- Phát hiện đối tượng với YOLO
- Gửi kết quả qua WebSocket

### 2.4. Thiết lập mô hình YOLO

```python
# Tạo file config/settings.py để lưu cấu hình mô hình
from ultralytics import YOLO

# Tải mô hình YOLO để phát hiện người
people_model = YOLO('yolov8n.pt')  # hoặc bạn có thể sử dụng mô hình đã được huấn luyện
```

### 2.5. Thiết lập WebSocket Routing

```python
# Tạo file routing.py để định nghĩa các endpoint WebSocket
from django.urls import re_path
from backend.consumers.consumers import SignalingConsumer

websocket_urlpatterns = [
    re_path(r"ws/signaling/$", SignalingConsumer.as_asgi()),
]
```

### 2.6. Cấu hình ASGI cho Django Channels

```python
# Tạo file asgi.py
import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
import routing

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

application = ProtocolTypeRouter({
    'http': get_asgi_application(),
    'websocket': AuthMiddlewareStack(
        URLRouter(
            routing.websocket_urlpatterns
        )
    ),
})
```

## 3. Thiết lập Frontend

### 3.1. Tạo component video

```bash
ng generate component video
```

### 3.2. Chi tiết triển khai Video Component

#### 3.2.1. Cấu trúc của Video Component

Tạo file `video.component.ts` với nội dung:

```typescript
import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Detection {
  label: string;
  confidence: number;
  box: number[];
}

@Component({
  selector: 'app-video',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="video-container">
      <video #videoElement autoplay playsinline muted></video>
      <div *ngIf="isLoading" class="loading-overlay">
        <p>Đang kết nối tới luồng video...</p>
      </div>
      <div *ngIf="errorMessage" class="error-overlay">
        <p>{{ errorMessage }}</p>
        <button (click)="reconnect()">Thử lại</button>
      </div>
      <div *ngIf="detections.length > 0" class="detections-container">
        <h3>Phát hiện ({{ lastUpdated | date:'mediumTime' }}):</h3>
        <ul>
          <li *ngFor="let detection of detections">
            {{ detection.label }} ({{ detection.confidence | number:'1.2-2' }})
            tại [{{ detection.box.join(', ') }}]
          </li>
        </ul>
      </div>
    </div>
  `,
  styles: [
    `.video-container { position: relative; max-width: 800px; margin: 0 auto; }
     video { width: 100%; border: 1px solid #ccc; }
     .loading-overlay, .error-overlay { 
       position: absolute; top: 0; left: 0; right: 0; bottom: 0; 
       background: rgba(0, 0, 0, 0.7); color: white; 
       display: flex; align-items: center; justify-content: center; 
       flex-direction: column; 
     }
     .error-overlay button { margin-top: 10px; padding: 5px 10px; }
     .detections-container { margin-top: 1rem; padding: 1rem; border: 1px solid #eee; }`
  ]
})
export class VideoComponent implements OnInit, OnDestroy {
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;

  private pc!: RTCPeerConnection;
  private ws!: WebSocket;
  private pingInterval: any;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 3000; // 3 seconds

  detections: Detection[] = [];
  lastUpdated: Date = new Date();
  errorMessage = '';
  isLoading = true;

  ngOnInit() {
    this.initializeConnection();
  }

  ngOnDestroy() {
    this.cleanup();
  }

  // Các phương thức chính sẽ được triển khai bên dưới
}
```

#### 3.2.2. Triển khai phương thức kết nối WebRTC

Triển khai các phương thức kết nối WebRTC và WebSocket trong `VideoComponent`:

```typescript
private initializeConnection() {
  this.setupWebRTC();
  this.connectWebSocket();
}

private setupWebRTC() {
  console.log('Thiết lập kết nối WebRTC');
  this.pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  });

  // Lắng nghe track từ server
  this.pc.ontrack = (event) => {
    console.log('Đã nhận track:', event.track.kind);
    this.handleTrackEvent(event);
  };
  
  this.pc.onicecandidate = (event) => this.handleIceCandidate(event);
  this.pc.oniceconnectionstatechange = () => this.handleIceStateChange();
  
  // Thêm transceiver để yêu cầu video
  console.log('Thêm video transceiver');
  this.pc.addTransceiver('video', { direction: 'recvonly' });
}

private connectWebSocket() {
  console.log('Kết nối đến WebSocket');
  this.ws = new WebSocket('ws://localhost:8000/ws/signaling/');

  this.ws.onopen = () => {
    console.log('WebSocket đã kết nối, tạo offer');
    this.reconnectAttempts = 0;
    this.isLoading = false;
    this.startPingInterval();
    this.createOffer();
  };

  this.ws.onmessage = (event) => this.handleWebSocketMessage(event);
  this.ws.onerror = (error) => this.handleError('Lỗi WebSocket', error);
  this.ws.onclose = () => this.handleWebSocketClose();
}
```

#### 3.2.3. Triển khai xử lý WebRTC Signaling

```typescript
private async createOffer() {
  try {
    console.log('Tạo offer');
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    console.log('Gửi offer tới server');
    this.ws.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }));
  } catch (error) {
    this.handleError('Không thể tạo offer', error);
  }
}

private handleTrackEvent(event: RTCTrackEvent) {
  if (!this.videoElement?.nativeElement) {
    console.error('Không tìm thấy phần tử video');
    return;
  }

  const [stream] = event.streams;
  if (!stream) {
    console.error('Không có stream trong track event');
    return;
  }
  
  console.log('Đặt stream cho phần tử video');
  this.videoElement.nativeElement.srcObject = stream;
  this.videoElement.nativeElement.onloadedmetadata = () => {
    console.log('Video metadata đã tải, bắt đầu phát');
    this.videoElement.nativeElement.play().catch(error => {
      this.handleError('Phát video thất bại', error);
    });
  };
}

private async handleWebSocketMessage(event: MessageEvent) {
  try {
    const data = JSON.parse(event.data);
    console.log('Đã nhận tin nhắn:', data.type);

    switch (data.type) {
      case 'answer':
        console.log('Đã nhận answer từ server');
        await this.pc.setRemoteDescription(
          new RTCSessionDescription({ type: 'answer', sdp: data.sdp })
        );
        break;

      case 'candidate':
        console.log('Đã nhận ICE candidate từ server');
        if (data.candidate) {
          try {
            await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (e) {
            console.error('Lỗi khi thêm ICE candidate:', e);
          }
        }
        break;

      case 'detection':
        this.detections = data.detections;
        this.lastUpdated = new Date();
        break;

      case 'error':
        this.handleError('Lỗi server', data.message);
        break;
    }
  } catch (error) {
    this.handleError('Xử lý tin nhắn thất bại', error);
  }
}
```

#### 3.2.4. Triển khai các phương thức hỗ trợ

```typescript
private handleIceCandidate(event: RTCPeerConnectionIceEvent) {
  if (event.candidate && this.ws.readyState === WebSocket.OPEN) {
    console.log('Gửi ICE candidate tới server');
    this.ws.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
  }
}

private handleIceStateChange() {
  console.log('Trạng thái kết nối ICE:', this.pc.iceConnectionState);
  if (this.pc.iceConnectionState === 'connected' || 
      this.pc.iceConnectionState === 'completed') {
    console.log('Kết nối ICE đã thiết lập');
    this.isLoading = false;
  } else if (this.pc.iceConnectionState === 'failed') {
    this.handleError('Kết nối ICE', 'Kết nối ICE thất bại');
  }
}

private startPingInterval() {
  this.pingInterval = setInterval(() => {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 5000);
}

private handleWebSocketClose() {
  console.log('WebSocket đã đóng');
  clearInterval(this.pingInterval);
  if (this.reconnectAttempts < this.maxReconnectAttempts) {
    setTimeout(() => {
      this.reconnectAttempts++;
      this.connectWebSocket();
    }, this.reconnectDelay);
  } else {
    this.handleError('Kết nối thất bại', 'Đã đạt số lần thử kết nối tối đa');
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
```

### 3.3. Cập nhật AppModule

Cập nhật file `app.module.ts` để thêm Video Component:

```typescript
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { VideoComponent } from './video/video.component';

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, VideoComponent],
  bootstrap: [AppComponent]
})
export class AppModule {}
```

### 3.4. Sử dụng Video Component trong app.component.html

```html
<div class="app-container">
  <header>
    <h1>Hệ thống nhận diện video thời gian thực</h1>
  </header>

  <main>
    <app-video></app-video>
  </main>

  <footer>
    <p>Được phát triển với Django + Angular + WebRTC + YOLO</p>
  </footer>
</div>
```

## 4. Triển khai WebRTC Consumer

Class `SignalingConsumer` trong `consumers.py` giúp:
1. Kết nối WebSocket
2. Mở camera 
3. Xử lý tín hiệu WebRTC (offers, answers, ICE candidates)
4. Thực hiện nhận dạng với YOLO
5. Gửi kết quả nhận dạng về client

### 4.1. Cài đặt file config YOLO

Tạo file `config/settings.py` trong thư mục backend:

```python
from ultralytics import YOLO

# Tải mô hình YOLO
people_model = YOLO('yolov8n.pt')

# Cấu hình các tham số phát hiện
confidence_threshold = 0.5  # Ngưỡng độ tin cậy
```

### 4.2. Chi tiết triển khai CameraTrack

```python
class CameraTrack(VideoStreamTrack):
    def __init__(self, cap):
        super().__init__()
        self.cap = cap
        self.kind = "video"
        self.lock = asyncio.Lock()
        self.latest_detections = []

    async def recv(self):
        pts, time_base = await self.next_timestamp()
        
        try:
            # Đọc frame từ camera một cách bất đồng bộ
            ret, frame = await asyncio.get_event_loop().run_in_executor(None, self.cap.read)
            if not ret:
                print("❌ Không thể đọc frame từ camera")
                # Trả về frame trống thay vì None để tránh crash
                blank_frame = np.zeros((480, 640, 3), np.uint8)
                video_frame = VideoFrame.from_ndarray(blank_frame, format='bgr24')
                video_frame.pts = pts
                video_frame.time_base = time_base
                return video_frame
                
            # Xử lý frame với YOLO một cách bất đồng bộ
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = await asyncio.get_event_loop().run_in_executor(None, people_model, frame_rgb)
            
            # Cập nhật kết quả phát hiện và vẽ lên frame
            async with self.lock:
                self.latest_detections = []
                if results and len(results) > 0:
                    result = results[0]
                    # Vẽ hộp giới hạn và nhãn lên frame
                    annotated_frame = result.plot()
                    frame = cv2.cvtColor(annotated_frame, cv2.COLOR_RGB2BGR)
                    # Lưu thông tin phát hiện để gửi qua WebSocket
                    self.latest_detections = [{
                        'label': result.names[int(cls)],
                        'confidence': float(conf),
                        'box': box.xyxy[0].tolist()
                    } for box, cls, conf in zip(result.boxes, result.boxes.cls, result.boxes.conf)]
            
            # Chuyển frame thành VideoFrame để gửi qua WebRTC
            video_frame = VideoFrame.from_ndarray(frame, format='bgr24')
            video_frame.pts = pts
            video_frame.time_base = time_base
            return video_frame
            
        except Exception as e:
            print(f"❌ Lỗi khi tạo video frame: {e}")
            # Trả về frame trống khi có lỗi
            blank_frame = np.zeros((480, 640, 3), np.uint8)
            video_frame = VideoFrame.from_ndarray(blank_frame, format='bgr24')
            video_frame.pts = pts
            video_frame.time_base = time_base
            return video_frame
```

### 4.3. Chi tiết triển khai SignalingConsumer

```python
class SignalingConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Chấp nhận kết nối WebSocket
        await self.accept()
        print("✅ WebSocket signaling đã kết nối")

        # Khởi tạo camera
        self.cap = cv2.VideoCapture(0)  # Sử dụng webcam, có thể thay đổi thành địa chỉ RTSP nếu cần
        if not self.cap.isOpened():
            print("❌ Không thể mở camera")
            await self.send(json.dumps({"type": "error", "message": "Khởi tạo camera thất bại"}))
            await self.close()
            return
        
        print("📷 Camera mở thành công")
        # Cấu hình độ phân giải camera
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

        # Cấu hình kết nối WebRTC
        config = RTCConfiguration(
            iceServers=[RTCIceServer(urls=["stun:stun.l.google.com:19302"])]
        )
        self.pc = RTCPeerConnection(config)
        pcs.add(self.pc)  # Lưu vào tập hợp để quản lý toàn cầu

        # Thêm track video với cấu hình phù hợp
        self.track = CameraTrack(self.cap)
        sender = self.pc.addTrack(self.track)
        
        # Theo dõi thay đổi trạng thái kết nối ICE
        @self.pc.on("iceconnectionstatechange")
        async def on_iceconnectionstatechange():
            print(f"Trạng thái kết nối ICE thay đổi thành: {self.pc.iceConnectionState}")
            if self.pc.iceConnectionState == "failed":
                await self.send(json.dumps({
                    "type": "error", 
                    "message": "Kết nối ICE thất bại"
                }))

        # Xử lý ICE candidate
        self.pc.onicecandidate = self.send_ice_candidate

        # Bắt đầu gửi thông tin phát hiện định kỳ
        self.running = True
        asyncio.create_task(self.send_detection_info())
```

### 4.4. Chi tiết triển khai xử lý tín hiệu WebRTC

```python
async def receive(self, text_data):
    data = json.loads(text_data)
    print(f"📥 Đã nhận: {data.get('type')}")

    if data.get('type') == 'offer':
        try:
            # Nhận và xử lý offer từ client
            description = RTCSessionDescription(
                sdp=data['sdp'],
                type=data['type']
            )
            print("📝 Thiết lập remote description")
            await self.pc.setRemoteDescription(description)

            # Tạo answer và gửi lại client
            answer = await self.pc.createAnswer()
            if answer:
                await self.pc.setLocalDescription(answer)
                print("📤 Gửi answer")
                await self.send(json.dumps({
                    'type': 'answer', 
                    'sdp': self.pc.localDescription.sdp
                }))
            else:
                print("❌ Không thể tạo answer")
        except Exception as e:
            print(f"❌ Lỗi khi xử lý offer: {e}")
            import traceback
            print(traceback.format_exc())
            await self.send(json.dumps({"type": "error", "message": str(e)}))

    elif data.get('type') == 'candidate':
        try:
            # Xử lý ICE candidate từ client
            candidate_data = data['candidate']
            candidate = RTCIceCandidate(
                candidate=candidate_data['candidate'],
                sdpMid=candidate_data.get('sdpMid'),
                sdpMLineIndex=candidate_data.get('sdpMLineIndex')
            )
            print(f"📍 Thêm ICE candidate: {candidate_data['candidate'][:30]}...")
            await self.pc.addIceCandidate(candidate)
        except Exception as e:
            print(f"❌ Lỗi khi thêm ICE candidate: {e}")
            import traceback
            print(traceback.format_exc())

    elif data.get('type') == 'ping':
        # Phản hồi ping để giữ kết nối
        await self.send(json.dumps({"type": "pong"}))
```

### 4.5. Chi tiết triển khai gửi kết quả phát hiện

```python
async def send_detection_info(self):
    while self.running:
        try:
            if hasattr(self, 'track'):
                # Truy cập an toàn vào kết quả phát hiện gần đây nhất
                async with self.track.lock:
                    detections = self.track.latest_detections
                
                # Gửi thông tin phát hiện nếu có
                if detections:
                    response = {
                        "type": "detection",
                        "detections": detections
                    }
                    await self.send(json.dumps(response))
            
            # Gửi kết quả mỗi 500ms
            await asyncio.sleep(0.5)
        except Exception as e:
            print(f"❌ Lỗi trong send_detection_info: {e}")
            import traceback
            print(traceback.format_exc())
```

### 4.6. Chi tiết triển khai hàm xuất ICE candidate và thoát

```python
async def send_ice_candidate(self, event):
    """Gửi ICE candidate tới client."""
    if event.candidate:
        print(f"📤 Gửi ICE candidate: {event.candidate.candidate[:30]}...")
        await self.send(json.dumps({
            'type': 'candidate',
            'candidate': {
                'candidate': event.candidate.candidate,
                'sdpMid': event.candidate.sdpMid,
                'sdpMLineIndex': event.candidate.sdpMLineIndex
            }
        }))

async def disconnect(self, close_code):
    """Dọn dẹp tài nguyên khi ngắt kết nối."""
    print(f"❌ WebSocket ngắt kết nối với mã: {close_code}")
    self.running = False
    if hasattr(self, 'cap') and self.cap:
        self.cap.release()
        print("📷 Giải phóng camera")
    if hasattr(self, 'pc'):
        pcs.discard(self.pc)
        await self.pc.close()
        print("🔌 PeerConnection đã đóng")
```

## 5. Thiết lập ASGI và URL

### 5.1. Tạo file asgi.py

Tạo file `asgi.py` trong thư mục backend:

```python
import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
import routing

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

application = ProtocolTypeRouter({
    'http': get_asgi_application(),
    'websocket': AuthMiddlewareStack(
        URLRouter(
            routing.websocket_urlpatterns
        )
    ),
})
```

### 5.2. Tạo file urls.py

```python
from django.contrib import admin
from django.urls import path
from django.http import HttpResponse

def index(request):
    return HttpResponse("Server running. Kết nối từ ứng dụng Angular.")

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', index),
]
```

## 6. Chạy ứng dụng

### 6.1. Chuẩn bị môi trường

Đảm bảo bạn đã cài đặt tất cả các thư viện cần thiết:

```bash
# Django backend
pip install django djangorestframework channels daphne django-cors-headers aiortc opencv-python numpy ultralytics

# Angular frontend (trong thư mục frontend)
npm install
```

### 6.2. Khởi động Backend

```bash
# Chạy với Python (chỉ có HTTP, không có WebSocket)
python manage.py runserver

# Chạy với Daphne (hỗ trợ đầy đủ ASGI - WebSocket và HTTP)
daphne -p 8000 asgi:application
```

### 6.3. Khởi động Frontend

```bash
cd frontend
ng serve
```

Sau khi khởi động, truy cập frontend tại: http://localhost:4200

## 7. Cách hoạt động của hệ thống

1. **Kết nối ban đầu**:
   - Client kết nối WebSocket đến server
   - Client tạo RTCPeerConnection và gửi offer đến server
   - Server xử lý offer và gửi lại answer

2. **Truyền video**:
   - Server mở camera và tạo video track
   - Video được truyền qua kết nối WebRTC đến client
   - Client hiển thị video stream

3. **Nhận diện đối tượng**:
   - Server xử lý mỗi frame với YOLO model
   - Phát hiện đối tượng được đánh dấu trên video
   - Thông tin phát hiện được gửi qua WebSocket

4. **Hiển thị kết quả**:
   - Client nhận và hiển thị video đã được xử lý
   - Thông tin phát hiện được hiển thị dưới dạng danh sách

## 8. Xử lý sự cố

### 8.1. Vấn đề kết nối WebSocket
- Kiểm tra CORS settings trong Django
- Kiểm tra đường dẫn WebSocket URL
- Đảm bảo Daphne đang chạy đúng cách

### 8.2. Vấn đề WebRTC
- Kiểm tra ICE servers trong cấu hình
- Xem log để tìm lỗi kết nối
- Đảm bảo camera đã được mở thành công

### 8.3. Vấn đề YOLO
- Kiểm tra model được tải thành công
- Có thể test riêng model với ảnh tĩnh

### 8.4. Vấn đề hiệu năng
- Giảm độ phân giải video nếu cần
- Điều chỉnh tần suất nhận dạng
- Tối ưu hóa mô hình YOLO

## 9. Nâng cao

- Thêm chức năng xác thực người dùng
- Lưu lại lịch sử phát hiện
- Triển khai nhiều loại model khác nhau
- Thêm chức năng gửi thông báo khi phát hiện đối tượng cụ thể

### 9.1. Lưu lại lịch sử phát hiện

Tạo model Django để lưu lại kết quả phát hiện:

```python
# models.py
from django.db import models

class Detection(models.Model):
    label = models.CharField(max_length=100)
    confidence = models.FloatField()
    bbox_x = models.FloatField()
    bbox_y = models.FloatField()
    bbox_width = models.FloatField()
    bbox_height = models.FloatField()
    timestamp = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.label} ({self.confidence:.2f}) at {self.timestamp}"
```

### 9.2. Thêm chức năng thông báo

```python
# Thêm vào send_detection_info trong SignalingConsumer
async def send_detection_info(self):
    while self.running:
        try:
            if hasattr(self, 'track'):
                async with self.track.lock:
                    detections = self.track.latest_detections
                
                if detections:
                    # Kiểm tra nếu có phát hiện quan trọng
                    important_detections = [d for d in detections 
                                           if d['label'] in ['person', 'car'] and d['confidence'] > 0.7]
                    
                    # Gửi thông báo nếu có phát hiện quan trọng
                    if important_detections:
                        response = {
                            "type": "detection",
                            "detections": detections,
                            "alert": True,
                            "message": f"Phát hiện {len(important_detections)} đối tượng quan trọng!"
                        }
                    else:
                        response = {
                            "type": "detection",
                            "detections": detections
                        }
                    
                    await self.send(json.dumps(response))
            
            await asyncio.sleep(0.5)
        except Exception as e:
            print(f"❌ Lỗi trong send_detection_info: {e}")
```

## 10. Tài liệu tham khảo

- [aiortc Documentation](https://aiortc.readthedocs.io/)
- [Django Channels Documentation](https://channels.readthedocs.io/)
- [Ultralytics YOLO Documentation](https://docs.ultralytics.com/)
- [WebRTC API - MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Angular Documentation](https://angular.io/docs)
