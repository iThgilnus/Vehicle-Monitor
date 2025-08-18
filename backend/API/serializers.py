from rest_framework import serializers
from datetime import datetime

# Serializer cho collection 'vehicles'
class VehicleSerializer(serializers.Serializer):
    vehicle_id = serializers.CharField(max_length=100, read_only=True)
    license_plate = serializers.CharField(max_length=20)
    vehicle_type = serializers.CharField(max_length=50)
    entry_time = serializers.DateTimeField()
    exit_time = serializers.DateTimeField(allow_null=True)
    location = serializers.CharField(max_length=100)
    status = serializers.CharField(max_length=50)
    image_url = serializers.CharField(max_length=500, allow_null=True)
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()

    def create(self, validated_data):
        validated_data['created_at'] = datetime.now()
        validated_data['updated_at'] = datetime.now()
        return validated_data

    def update(self, instance, validated_data):
        instance['updated_at'] = datetime.now()
        instance.update(validated_data)
        return instance

# Serializer cho collection 'gates'
class GateSerializer(serializers.Serializer):
    gate_id = serializers.CharField(max_length=100, read_only=True)
    gate_name = serializers.CharField(max_length=100)
    location = serializers.CharField(max_length=100)
    camera_id = serializers.CharField(max_length=100, allow_null=True)
    status = serializers.CharField(max_length=50)
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()

    def create(self, validated_data):
        validated_data['created_at'] = datetime.now()
        validated_data['updated_at'] = datetime.now()
        return validated_data

    def update(self, instance, validated_data):
        instance['updated_at'] = datetime.now()
        instance.update(validated_data)
        return instance

# Serializer cho collection 'cameras'
class CameraSerializer(serializers.Serializer):
    camera_id = serializers.CharField(max_length=100, read_only=True)
    camera_name = serializers.CharField(max_length=100)
    gate_id = serializers.CharField(max_length=100, allow_null=True)
    ip_address = serializers.CharField(max_length=50)
    status = serializers.CharField(max_length=50)
    last_sync = serializers.DateTimeField()
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()

    def create(self, validated_data):
        validated_data['created_at'] = datetime.now()
        validated_data['updated_at'] = datetime.now()
        return validated_data

    def update(self, instance, validated_data):
        instance['updated_at'] = datetime.now()
        instance.update(validated_data)
        return instance

# Serializer cho collection 'logs'
class LogSerializer(serializers.Serializer):
    log_id = serializers.CharField(max_length=100, read_only=True)
    event_type = serializers.CharField(max_length=100)
    vehicle_id = serializers.CharField(max_length=100, allow_null=True)
    camera_id = serializers.CharField(max_length=100, allow_null=True)
    description = serializers.CharField(max_length=500)
    timestamp = serializers.DateTimeField()
    created_at = serializers.DateTimeField()

    def create(self, validated_data):
        validated_data['created_at'] = datetime.now()
        return validated_data

import datetime
from rest_framework import serializers

class ReportSerializer(serializers.Serializer):
    report_id = serializers.CharField(max_length=100, read_only=True)
    report_type = serializers.CharField(max_length=50)
    date_range = serializers.DictField(
        child=serializers.DateTimeField(),
        required=True
    )
    vehicle_count = serializers.IntegerField()
    entry_count = serializers.IntegerField()
    details = serializers.ListField(
        child=serializers.DictField(
            child=serializers.CharField()  # Định nghĩa rõ ràng hơn cho các giá trị trong từ điển
        ),
        allow_empty=True
    )
    created_at = serializers.DateTimeField()

    def to_representation(self, instance):
        # Ghi đè để xử lý dữ liệu không mong muốn
        ret = super().to_representation(instance)

        # Xử lý date_range
        if 'date_range' not in ret or not isinstance(ret['date_range'], dict):
            ret['date_range'] = {"start": None, "end": None}
        else:
            for key in ['start', 'end']:
                if not ret['date_range'].get(key):
                    ret['date_range'][key] = None

        # Xử lý details
        if 'details' not in ret or not isinstance(ret['details'], list):
            ret['details'] = []
        else:
            # Lọc và sửa các phần tử không phải từ điển
            ret['details'] = [
                item if isinstance(item, dict) and all(k in item for k in ['license_plate', 'time']) else {}
                for item in ret['details']
            ]

        return ret

    def create(self, validated_data):
        validated_data['created_at'] = datetime.now()
        return validated_data

    def update(self, instance, validated_data):
        instance['created_at'] = instance.get('created_at', datetime.now())
        instance.update(validated_data)
        return instance
    
# Serializer cho  'system_health'
class SystemHealthSerializer(serializers.Serializer):
    cpu_usage = serializers.DictField(child=serializers.FloatField())
    memory_usage = serializers.DictField(child=serializers.FloatField())
    disk_space = serializers.DictField(child=serializers.FloatField())
    network_latency = serializers.DictField(child=serializers.FloatField())
    services_status = serializers.DictField(child=serializers.DictField())
    recent_issues = serializers.ListField(child=serializers.DictField())
    last_updated = serializers.DateTimeField()


# Serializer cho collection 'blacklists'
class BlacklistSerializer(serializers.Serializer):
    blacklist_id = serializers.CharField(max_length=50, required=False)
    vehicle_type = serializers.ChoiceField(choices=[('Car', 'Car'), ('Motorcycle', 'Motorcycle'), ('Truck', 'Truck'), ('Bus', 'Bus'), ('Other', 'Other')])
    vehicle_id = serializers.CharField(max_length=50, allow_null=True, required=False)
    license_plate = serializers.CharField(max_length=20, required=True)
    ban_start_date = serializers.DateTimeField()
    ban_expiry = serializers.DateTimeField(allow_null=True)
    updated_at = serializers.DateTimeField(required=False)
    notes = serializers.CharField(max_length=500, allow_blank=True, required=False)
    ban_level = serializers.ChoiceField(choices=[('Warning', 'Warning'), ('Ban', 'Ban')])

