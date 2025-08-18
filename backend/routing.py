
'''
from django.urls import re_path
from backend.consumers import consumers

websocket_urlpatterns = [
    re_path(r'ws/detection/$', consumers.DetectionConsumer.as_asgi()),
    #re_path(r'ws/image-detection/$', consumers.ImageDetectionConsumer.as_asgi()),  # Thêm WebSocket mới
    re_path(r'ws/image-detection/$', consumers.DetectionConsumer.as_asgi()),
]
'''
'''
from django.urls import re_path
from backend.consumers.consumers import SignalingConsumer

websocket_urlpatterns = [
    re_path(r"ws/signaling/$", SignalingConsumer.as_asgi()),
]
'''

from django.urls import re_path
from backend.consumers.consumers import VideoConsumer

websocket_urlpatterns = [
    re_path(r"ws/signaling/$", VideoConsumer.as_asgi()),
]