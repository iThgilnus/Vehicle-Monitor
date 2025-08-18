from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from API.serializers import VehicleSerializer, GateSerializer, CameraSerializer, LogSerializer, ReportSerializer, BlacklistSerializer
from .mongodb_config import mongodb
from datetime import datetime
import pytz
import psutil
import pynvml
import requests
import json
from bson import ObjectId

# API cho vehicles
class VehicleListAPIView(APIView):
    def get(self, request):
        vehicles_ref = mongodb.collection('vehicles')
        vehicles = vehicles_ref.stream()

        vehicle_list = []
        for vehicle in vehicles:
            vehicle_data = vehicle.to_dict()
            vehicle_data['vehicle_id'] = vehicle.id
            vehicle_list.append(vehicle_data)

        serializer = VehicleSerializer(vehicle_list, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = VehicleSerializer(data=request.data)
        if serializer.is_valid():
            vehicle_data = serializer.validated_data
            vehicles_ref = mongodb.collection('vehicles')
            new_vehicle_ref = vehicles_ref.document()
            new_vehicle_ref.set(vehicle_data)
            return Response({"message": "Vehicle created", "vehicle_id": new_vehicle_ref.id}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class VehicleDetailAPIView(APIView):
    def get(self, request, vehicle_id):
        vehicle_ref = mongodb.collection('vehicles').document(vehicle_id)
        vehicle = vehicle_ref.get()

        if vehicle.exists:
            vehicle_data = vehicle.to_dict()
            vehicle_data['vehicle_id'] = vehicle.id
            serializer = VehicleSerializer(vehicle_data)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response({"error": "Vehicle not found"}, status=status.HTTP_404_NOT_FOUND)

    def put(self, request, vehicle_id):
        vehicle_ref = mongodb.collection('vehicles').document(vehicle_id)
        if not vehicle_ref.get().exists:
            return Response({"error": "Vehicle not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = VehicleSerializer(data=request.data, partial=True)
        if serializer.is_valid():
            vehicle_data = serializer.validated_data
            vehicle_ref.update(vehicle_data)
            return Response({"message": "Vehicle updated"}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, vehicle_id):
        vehicle_ref = mongodb.collection('vehicles').document(vehicle_id)
        if vehicle_ref.get().exists:
            vehicle_ref.delete()
            return Response({"message": "Vehicle deleted"}, status=status.HTTP_204_NO_CONTENT)
        return Response({"error": "Vehicle not found"}, status=status.HTTP_404_NOT_FOUND)

class VehicleByStatusAPIView(APIView):
    def get(self, request):
        status_param = request.query_params.get('status', None)
        if not status_param:
            return Response({"error": "Status parameter is required"}, status=status.HTTP_400_BAD_REQUEST)

        vehicles_ref = mongodb.collection('vehicles').where('status', '==', status_param)
        vehicles = vehicles_ref.stream()

        vehicle_list = []
        for vehicle in vehicles:
            vehicle_data = vehicle.to_dict()
            vehicle_data['vehicle_id'] = vehicle.id
            vehicle_list.append(vehicle_data)

        serializer = VehicleSerializer(vehicle_list, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

# API cho gates
class GateListAPIView(APIView):
    def get(self, request):
        gates_ref = mongodb.collection('gates')
        gates = gates_ref.stream()

        gate_list = []
        for gate in gates:
            gate_data = gate.to_dict()
            gate_data['gate_id'] = gate.id
            gate_list.append(gate_data)

        serializer = GateSerializer(gate_list, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = GateSerializer(data=request.data)
        if serializer.is_valid():
            gate_data = serializer.validated_data
            gates_ref = mongodb.collection('gates')
            new_gate_ref = gates_ref.document()
            new_gate_ref.set(gate_data)
            return Response({"message": "Gate created", "gate_id": new_gate_ref.id}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

# API cho cameras
class CameraListAPIView(APIView):
    def get(self, request):
        cameras_ref = mongodb.collection('cameras')
        cameras = cameras_ref.stream()

        camera_list = []
        for camera in cameras:
            camera_data = camera.to_dict()
            camera_data['camera_id'] = camera.id
            camera_list.append(camera_data)

        serializer = CameraSerializer(camera_list, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = CameraSerializer(data=request.data)
        if serializer.is_valid():
            camera_data = serializer.validated_data
            cameras_ref = mongodb.collection('cameras')
            new_camera_ref = cameras_ref.document()
            new_camera_ref.set(camera_data)
            return Response({"message": "Camera created", "camera_id": new_camera_ref.id}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

# API cho logs
class LogsByDateRangeAPIView(APIView):
    def get(self, request):
        start_date = request.query_params.get('start_date', None)
        end_date = request.query_params.get('end_date', None)

        if not start_date or not end_date:
            return Response({"error": "Both start_date and end_date are required"}, status=status.HTTP_400_BAD_REQUEST)

        # Xử lý lỗi định dạng ngày tháng
        try:
            start = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=pytz.UTC)
            end = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=pytz.UTC)
        except ValueError:
            return Response({"error": "Invalid date format, use YYYY-MM-DD"}, status=status.HTTP_400_BAD_REQUEST)

        # Truy vấn MongoDB với bộ lọc theo timestamp
        logs_ref = mongodb.collection('logs').where('timestamp', '>=', start).where('timestamp', '<=', end)
        logs = logs_ref.stream()

        log_list = []
        for log in logs:
            log_data = log.to_dict()
            log_data['log_id'] = log.id  # Gán ID từ MongoDB vào dữ liệu
            log_list.append(log_data)

        return Response(log_list, status=status.HTTP_200_OK)

# API cho reports
class ReportListAPIView(APIView):
    def get(self, request):
        reports_ref = mongodb.collection('reports')
        reports = reports_ref.stream()

        report_list = []
        for report in reports:
            report_data = report.to_dict()
            report_data['report_id'] = report.id
            # Kiểm tra và sửa details trước khi thêm vào danh sách
            if 'details' in report_data and isinstance(report_data['details'], list):
                report_data['details'] = [
                    item if isinstance(item, dict) and all(k in item for k in ['license_plate', 'time']) else {}
                    for item in report_data['details']
                ]
            print(f"Report ID: {report.id}, Details: {report_data.get('details', 'Missing')}, Date Range: {report_data.get('date_range', 'Missing')}")
            report_list.append(report_data)

        serializer = ReportSerializer(report_list, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
# API cho System Health
class SystemHealthAPIView(APIView):
    def get(self, request):
        # Thu thập dữ liệu phần cứng
        cpu_usage = psutil.cpu_percent(interval=1)  # CPU usage trong 1 giây
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        network_latency = self._measure_network_latency()  # Đo độ trễ mạng
        
        # Thu thập thông tin GPU
        gpu_info = self._get_gpu_info()

        # Lấy thông tin thực tế về các dịch vụ
        services_status = self._get_services_status()
        
        # Lấy thông tin thực tế về các vấn đề gần đây
        recent_issues = self._get_recent_issues(cpu_usage, memory.percent)

        # Chuẩn bị dữ liệu trả về
        system_health = {
            'cpu_usage': {
                'value': round(cpu_usage, 1),
                'status': 'Good' if cpu_usage < 80 else 'Warning'
            },
            'memory_usage': {
                'value': round(memory.percent, 1),
                'status': 'Good' if memory.percent < 80 else 'Warning'
            },
            'disk_space': {
                'value': round(disk.percent, 1),
                'status': 'Warning' if disk.percent > 80 else 'Good'
            },
            'network_latency': {
                'value': network_latency,
                'status': 'Warning' if network_latency > 100 else 'Good'
            },
            'gpu_info': gpu_info,
            'services_status': services_status,
            'recent_issues': recent_issues,
            'last_updated': datetime.utcnow().isoformat()
        }

        return Response(system_health, status=status.HTTP_200_OK)

    def _get_gpu_info(self):
        """Thu thập thông tin về GPU trong hệ thống"""
        try:
            pynvml.nvmlInit()
            
            device_count = pynvml.nvmlDeviceGetCount()
            if device_count > 0:
                gpu_metrics = []
                
                for i in range(device_count):
                    handle = pynvml.nvmlDeviceGetHandleByIndex(i)
                    name = pynvml.nvmlDeviceGetName(handle)
                    
                    # Lấy thông tin sử dụng
                    util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                    gpu_util = util.gpu
                    
                    # Lấy thông tin bộ nhớ
                    mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
                    mem_total = mem_info.total / 1024 / 1024  # Convert to MB
                    mem_used = mem_info.used / 1024 / 1024
                    mem_percent = (mem_used / mem_total) * 100
                    
                    # Lấy nhiệt độ
                    temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
                    
                    gpu_data = {
                        'name': name.decode('utf-8') if isinstance(name, bytes) else name,
                        'usage': {
                            'value': round(gpu_util, 1),
                            'status': 'Good' if gpu_util < 80 else 'Warning'
                        },
                        'memory': {
                            'total': round(mem_total),
                            'used': round(mem_used),
                            'usage_percent': round(mem_percent, 1),
                            'status': 'Good' if mem_percent < 80 else 'Warning'
                        },
                        'temperature': {
                            'value': temp,
                            'status': 'Good' if temp < 80 else 'Warning'
                        }
                    }
                    gpu_metrics.append(gpu_data)
                
                pynvml.nvmlShutdown()
                return gpu_metrics
        except (ImportError, Exception) as e:
            pass
        
        # Dự phòng: Trả về thông tin rỗng nếu không có GPU hoặc không lấy được thông tin
        return []
    
    def _get_services_status(self):
        """Kiểm tra trạng thái thực tế của các dịch vụ hệ thống"""
        services_status = []
        
        # Lấy danh sách tất cả các tiến trình đang chạy
        running_processes = {p.name(): p for p in psutil.process_iter(['name', 'create_time', 'status'])}
        
        # Kiểm tra dịch vụ nhận diện biển số (giả sử là tiến trình Python)
        lpr_service = self._check_service(running_processes, 
                                        ['python', 'recognition'], 
                                        'License Plate Recognition')
        services_status.append(lpr_service)
        
        # Kiểm tra dịch vụ điều khiển cổng
        gate_service = self._check_service(running_processes, 
                                          ['gate', 'barrier'], 
                                          'Gate Control System')
        services_status.append(gate_service)
        
        # Kiểm tra dịch vụ video streaming
        video_service = self._check_service(running_processes, 
                                          ['stream', 'video', 'rtsp'], 
                                          'Video Streaming')
        services_status.append(video_service)
        
        # Kiểm tra dịch vụ cơ sở dữ liệu
        db_service = self._check_service(running_processes, 
                                       ['mysql', 'postgres', 'mongodb', 'firebird', 'firebase'], 
                                       'Vehicle Database')
        services_status.append(db_service)
        
        # Kiểm tra dịch vụ thông báo
        alert_service = self._check_service(running_processes, 
                                         ['notification', 'alert'], 
                                         'Alert Notification')
        services_status.append(alert_service)
        
        # Kiểm tra dịch vụ Django (API Backend)
        django_service = self._check_service(running_processes, 
                                           ['python', 'django'], 
                                           'API Backend')
        services_status.append(django_service)
        
        return services_status

    def _check_service(self, processes, keywords, service_name):
        """Kiểm tra xem một dịch vụ có đang chạy không dựa trên từ khóa"""
        is_running = False
        create_time = None
        
        # Tìm tiến trình phù hợp với từ khóa
        for proc_name, process in processes.items():
            if any(keyword in proc_name.lower() for keyword in keywords):
                is_running = True
                create_time = process.info['create_time']
                break
        
        # Tính uptime nếu tiến trình đang chạy
        uptime = '0d 0h'
        if create_time:
            uptime_seconds = datetime.now().timestamp() - create_time
            uptime_days = int(uptime_seconds // (24 * 3600))
            uptime_hours = int((uptime_seconds % (24 * 3600)) // 3600)
            uptime = f"{uptime_days}d {uptime_hours}h"
        
        return {
            'service': service_name,
            'status': 'Online' if is_running else 'Offline',
            'uptime': uptime,
            'last_updated': datetime.utcnow().isoformat()
        }
    
    def _get_recent_issues(self, cpu_usage, memory_usage):
        """Thu thập các vấn đề thực tế của hệ thống"""
        issues = []
        
        # Kiểm tra CPU cao
        if cpu_usage > 85:
            issues.append({
                'message': f'High CPU usage detected: {cpu_usage}%',
                'timestamp': datetime.now().isoformat()
            })
        
        # Kiểm tra bộ nhớ cao
        if memory_usage > 80:
            issues.append({
                'message': f'High memory usage detected: {memory_usage}%',
                'timestamp': datetime.now().isoformat()
            })
        
        # Kiểm tra độ trễ mạng
        latency = self._measure_network_latency()
        if latency > 200:
            issues.append({
                'message': f'Network latency is critically high: {latency}ms',
                'timestamp': datetime.now().isoformat()
            })
        elif latency > 100:
            issues.append({
                'message': f'Network latency is elevated: {latency}ms',
                'timestamp': datetime.now().isoformat()
            })
        
        # Kiểm tra dung lượng đĩa
        disk = psutil.disk_usage('/')
        if disk.percent > 90:
            issues.append({
                'message': f'Critically low disk space: {100-disk.percent}% remaining',
                'timestamp': datetime.now().isoformat()
            })
        elif disk.percent > 80:
            issues.append({
                'message': f'Low disk space warning: {100-disk.percent}% remaining',
                'timestamp': datetime.now().isoformat()
            })
        
        # Kiểm tra các kết nối mạng
        try:
            net_connections = len(psutil.net_connections())
            if net_connections > 1000:
                issues.append({
                    'message': f'High number of network connections: {net_connections}',
                    'timestamp': datetime.now().isoformat()
                })
        except:
            pass
        
        # Thêm bản ghi mẫu nếu không tìm thấy vấn đề gì
        if len(issues) == 0:
            issues.append({
                'message': 'All systems operating normally',
                'timestamp': datetime.now().isoformat()
            })
        
        return issues

    def _measure_network_latency(self):
        # Hàm đo độ trễ mạng (ping đến Google DNS)
        try:
            import time
            import socket
            host = "8.8.8.8"  # Google DNS
            start = time.time()
            socket.create_connection((host, 53), timeout=2)
            end = time.time()
            return round((end - start) * 1000, 2)  # Trả về độ trễ tính bằng ms
        except:
            return 999  # Giá trị mặc định nếu lỗi
        
# API cho Blacklists
class BlacklistListAPIView(APIView):
    def get(self, request):
        blacklists_ref = mongodb.collection('blacklists')
        blacklists = blacklists_ref.stream()

        blacklist_list = []
        for blacklist in blacklists:
            blacklist_data = blacklist.to_dict()
            blacklist_data['blacklist_id'] = blacklist.id
            blacklist_list.append(blacklist_data)

        serializer = BlacklistSerializer(blacklist_list, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = BlacklistSerializer(data=request.data)
        if serializer.is_valid():
            blacklist_data = serializer.validated_data
            blacklist_data['updated_at'] = datetime.now()
            blacklist_data['ban_start_date'] = blacklist_data.get('ban_start_date', datetime.now())

            # Kiểm tra xem license_plate đã tồn tại trong blacklist chưa
            license_plate = blacklist_data['license_plate']
            existing = mongodb.collection('blacklists').where('license_plate', '==', license_plate).limit(1).stream()
            if any(existing):
                return Response({"error": "License plate already exists in blacklist"}, status=status.HTTP_400_BAD_REQUEST)

            blacklists_ref = mongodb.collection('blacklists')
            new_blacklist_ref = blacklists_ref.document()
            new_blacklist_ref.set(blacklist_data)
            return Response({"message": "Blacklist created", "blacklist_id": new_blacklist_ref.id}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class BlacklistDetailAPIView(APIView):
    def get(self, request, blacklist_id):
        blacklist_ref = mongodb.collection('blacklists').document(blacklist_id)
        blacklist = blacklist_ref.get()

        if blacklist.exists:
            blacklist_data = blacklist.to_dict()
            blacklist_data['blacklist_id'] = blacklist.id
            serializer = BlacklistSerializer(blacklist_data)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response({"error": "Blacklist not found"}, status=status.HTTP_404_NOT_FOUND)

    def put(self, request, blacklist_id):
        blacklist_ref = mongodb.collection('blacklists').document(blacklist_id)
        if not blacklist_ref.get().exists:
            return Response({"error": "Blacklist not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = BlacklistSerializer(data=request.data, partial=True)
        if serializer.is_valid():
            blacklist_data = serializer.validated_data
            blacklist_data['updated_at'] = datetime.utcnow()
            blacklist_ref.update(blacklist_data)
            return Response({"message": "Blacklist updated"}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, blacklist_id):
        blacklist_ref = mongodb.collection('blacklists').document(blacklist_id)
        if blacklist_ref.get().exists:
            blacklist_ref.delete()
            return Response({"message": "Blacklist deleted"}, status=status.HTTP_204_NO_CONTENT)
        return Response({"error": "Blacklist not found"}, status=status.HTTP_404_NOT_FOUND)

# API cho AI Chat
class AIChatAPIView(APIView):
    def post(self, request):
        question = request.data.get('question', '')
        conversation_history = request.data.get('conversation_history', [])
        
        if not question:
            return Response({"error": "No question provided"}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            # Get vehicle data from MongoDB
            vehicles_ref = mongodb.collection('vehicles')
            vehicles = vehicles_ref.stream()
            
            vehicle_list = []
            for vehicle in vehicles:
                vehicle_data = vehicle.to_dict()
                vehicle_data['vehicle_id'] = vehicle.id
                vehicle_list.append(vehicle_data)
            
            # Process the conversation with Gemini
            response = self._process_question_with_gemini(question, vehicle_list, conversation_history)
            
            return Response({
                "answer": response,
                "timestamp": datetime.now().isoformat()
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def _process_question_with_gemini(self, question, vehicle_data, conversation_history=None):
        # API key for Gemini from environment variable (with fallback)
        import os
        api_key = os.environ.get('GEMINI_API_KEY', "AIzaSyBMVIeAr_8vYQziO5eHO7VWxykuBM1rUPc")
        
        # Format vehicle data to a structured, readable format with all fields
        data_str = "Vehicle data (each record contains full vehicle information):\n"
        data_str += "Data structure: Each vehicle has the following fields - vehicle_id, license_plate, vehicle_type, entry_time, exit_time, location, status, image_url, created_at, updated_at\n\n"
        
        # Format each vehicle record in a readable JSON-like format
        if vehicle_data:
            for i, vehicle in enumerate(vehicle_data):
                # Format entry with proper indentation and field separation
                data_str += f"Vehicle {i+1}:\n"
                data_str += f"  vehicle_id: {vehicle.get('vehicle_id', 'N/A')}\n"
                data_str += f"  license_plate: {vehicle.get('license_plate', 'N/A')}\n"
                data_str += f"  vehicle_type: {vehicle.get('vehicle_type', 'N/A')}\n"
                data_str += f"  entry_time: {vehicle.get('entry_time', 'N/A')}\n"
                data_str += f"  exit_time: {vehicle.get('exit_time', 'N/A')}\n"
                data_str += f"  location: {vehicle.get('location', 'N/A')}\n"
                data_str += f"  status: {vehicle.get('status', 'N/A')}\n"
                data_str += f"  image_url: {vehicle.get('image_url', 'N/A')}\n"
                data_str += f"  created_at: {vehicle.get('created_at', 'N/A')}\n"
                data_str += f"  updated_at: {vehicle.get('updated_at', 'N/A')}\n\n"
        else:
            data_str += "No vehicle data available.\n"
        
        # Example of the exact JSON format for better understanding
        data_str += "\nExample JSON format:\n"
        data_str += """{ "vehicle_id": "sZbog27TkVjPxevzagOM", "license_plate": "51C-195.31", "vehicle_type": "Car", "entry_time": "2025-03-01T07:17:52Z", "exit_time": null, "location": "Main Parking Lot", "status": "Inside", "image_url": "https://placekitten.com/832/549", "created_at": "2025-03-12T10:15:07.875787Z", "updated_at": "2025-03-12T10:15:07.875787Z" }\n"""
        data_str += """{ "vehicle_id": "sgjFKx97i0mBdX452cAn", "license_plate": "52A-639.41", "vehicle_type": "Car", "entry_time": "2025-02-12T23:11:27Z", "exit_time": "2025-02-20T14:26:17Z", "location": "Secondary Parking Lot", "status": "Left", "image_url": null, "created_at": "2025-03-12T10:15:35.885555Z", "updated_at": "2025-03-12T10:15:35.885555Z" }\n"""
        
        # Format conversation history if provided
        history_str = ""
        if conversation_history and len(conversation_history) > 0:
            history_str = "Conversation history:\n"
            for i, item in enumerate(conversation_history):
                history_str += f"Q{i+1}: {item.get('question', '')}\nA{i+1}: {item.get('answer', '')}\n\n"
        
        # Build the complete prompt
        prompt = (
            f"{data_str}\n\n"
            f"{history_str}\n"
            f"Câu hỏi mới từ người dùng: {question}\n"
            "Hãy phân tích dữ liệu trên và trả lời câu hỏi một cách tự nhiên, thân thiện. "
            "Dựa trên các trường dữ liệu (vehicle_id, license_plate, vehicle_type, entry_time, exit_time, location, status, image_url, created_at, updated_at), "
            "thực hiện các phép tính hoặc tra cứu cần thiết (ví dụ: đếm số lượng, tìm xe theo biển số, tính thời gian, v.v.) nếu có thể. "
            "Trích xuất chính xác các thông tin từ tất cả các trường dữ liệu. "
            "Nếu câu hỏi liên quan đến ngày, hãy trích xuất ngày từ entry_time hoặc exit_time (định dạng YYYY-MM-DD). "
            "Nếu câu hỏi liên quan đến hội thoại trước đó, hãy tham khảo lịch sử hội thoại. "
            "Hãy phân tích đầy đủ tất cả thông tin xe và tất cả các trường dữ liệu. "
            "Nếu không có dữ liệu phù hợp, hãy thông báo rõ ràng. "
            "Chỉ trả lời bằng văn bản, không bao gồm code, JSON, hoặc định dạng kỹ thuật."
        )
        
        # Call the Gemini API
        url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
        headers = {"Content-Type": "application/json"}
        url_with_key = f"{url}?key={api_key}"
        
        payload = {
            "contents": [{"parts": [{"text": prompt}]}]
        }
        
        try:
            response = requests.post(url_with_key, headers=headers, json=payload, timeout=10)
            if response.status_code == 200:
                result = response.json()
                return result["candidates"][0]["content"]["parts"][0]["text"]
            else:
                return f"Error from AI service: {response.status_code} - {response.text}"
        except Exception as e:
            return f"Error calling AI service: {e}"
