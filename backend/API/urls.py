from django.urls import path
from .views import (
    VehicleListAPIView, VehicleDetailAPIView, VehicleByStatusAPIView,
    GateListAPIView, CameraListAPIView, LogsByDateRangeAPIView, ReportListAPIView,
    SystemHealthAPIView, BlacklistListAPIView, BlacklistDetailAPIView,
    AIChatAPIView
)

urlpatterns = [
    # Vehicles
    path('vehicles/', VehicleListAPIView.as_view(), name='vehicle-list'),
    path('vehicles/<str:vehicle_id>/', VehicleDetailAPIView.as_view(), name='vehicle-detail'),
    path('vehicles/by-status/', VehicleByStatusAPIView.as_view(), name='vehicle-by-status'),
    
    # Gates
    path('gates/', GateListAPIView.as_view(), name='gate-list'),
    
    # Cameras
    path('cameras/', CameraListAPIView.as_view(), name='camera-list'),
    
    # Logs
    path('logs/by-date/', LogsByDateRangeAPIView.as_view(), name='logs-by-date'),
    
    # Reports
    path('reports/', ReportListAPIView.as_view(), name='report-list'),

    # System health
    path('system-health/', SystemHealthAPIView.as_view(), name='system-health'),

    # Black lists
    path('blacklists/', BlacklistListAPIView.as_view(), name='blacklist-list'),
    path('blacklists/<str:blacklist_id>/', BlacklistDetailAPIView.as_view(), name='blacklist-detail'),
    
    # AI Chat
    path('chat/', AIChatAPIView.as_view(), name='ai-chat'),
]