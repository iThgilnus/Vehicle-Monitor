from django.apps import AppConfig
import atexit
from backend.utils.mongodb_utils import stop_worker

class BackendConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'backend'
    
    def ready(self):
        # Register worker cleanup function
        atexit.register(stop_worker)
