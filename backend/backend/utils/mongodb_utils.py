import time
import uuid
import queue
import threading
import logging
from datetime import datetime
import sys
import os

# Add backend root to path để import từ API
backend_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

# Import mongodb config
from API.mongodb_config import mongodb

# Configure logging
logger = logging.getLogger('mongodb_worker')

# Create a thread-safe queue for MongoDB operations
operation_queue = queue.Queue()
worker_running = False
worker_thread = None

class MongoDBOperation:
    """Base class for MongoDB operations to be queued"""
    def execute(self):
        raise NotImplementedError("Subclasses must implement execute()")

class SaveVehicleOperation(MongoDBOperation):
    """Operation to save a new vehicle to MongoDB"""
    def __init__(self, vehicle_type, license_plate, image_url=None, gate_id=None, location=None):
        self.vehicle_type = vehicle_type
        self.license_plate = license_plate
        self.image_url = image_url
        self.gate_id = gate_id or "QBGp25pgkcvRIrt9YDbU"  # Default gate ID
        self.location = location or "Secondary Parking Lot"
        self.doc_id = get_next_vehicle_id()  # Generate ID ahead of time
        
    def execute(self):
        try:
            # Current timestamp
            now = datetime.now()
            
            # Create document data
            vehicle_data = {
                'created_at': now,
                'updated_at': now,
                'entry_time': now,
                'exit_time': None,
                'gate_id': self.gate_id,
                'license_plate': self.license_plate,
                'vehicle_type': self.vehicle_type,
                'status': 'Inside',
                'location': self.location,
                'image_url': self.image_url or ''
            }
            
            # Save to MongoDB with predetermined ID
            vehicles_collection = mongodb.collection('vehicles')
            doc_ref = vehicles_collection.document(self.doc_id)
            doc_ref.set(vehicle_data)
            
            logger.info(f"Vehicle entry saved with ID: {self.doc_id}")
            return self.doc_id
        except Exception as e:
            logger.error(f"Error saving vehicle entry: {e}")
            return None

class UpdateVehicleExitOperation(MongoDBOperation):
    """Operation to update a vehicle's exit status"""
    def __init__(self, license_plate):
        self.license_plate = license_plate
        
    def execute(self):
        try:
            # Find vehicle by license plate
            vehicles_collection = mongodb.collection('vehicles')
            query = vehicles_collection.where('license_plate', '==', self.license_plate)\
                                     .where('status', '==', 'Inside')\
                                     .order_by('entry_time', 'desc')\
                                     .limit(1)
            
            docs = list(query.stream())
            
            for doc in docs:
                # Update the document with exit time and status
                vehicles_collection.document(doc.id).update({
                    'exit_time': datetime.now(),
                    'updated_at': datetime.now(),
                    'status': 'Exited'
                })
                logger.info(f"Vehicle exit updated for license: {self.license_plate}, document ID: {doc.id}")
                return True
            
            # No matching vehicle found
            logger.warning(f"No active vehicle found for license: {self.license_plate}")
            return False
        except Exception as e:
            logger.error(f"Error updating vehicle exit: {e}")
            return False

def worker_function():
    """Background worker function that processes the operation queue"""
    global worker_running
    logger.info("MongoDB worker thread started")
    
    while worker_running:
        try:
            # Get operation from queue with timeout to allow for clean shutdown
            try:
                operation = operation_queue.get(timeout=1.0)
            except queue.Empty:
                continue
                
            # Execute the operation
            operation.execute()
            
            # Mark task as done
            operation_queue.task_done()
            
        except Exception as e:
            logger.error(f"Error in MongoDB worker: {e}")
    
    logger.info("MongoDB worker thread stopped")

def start_worker():
    """Start the background worker thread if not already running"""
    global worker_running, worker_thread
    
    if not worker_running:
        worker_running = True
        worker_thread = threading.Thread(target=worker_function, daemon=True)
        worker_thread.start()
        logger.info("Started MongoDB background worker thread")

def stop_worker():
    """Stop the background worker thread"""
    global worker_running, worker_thread
    
    if worker_running and worker_thread:
        worker_running = False
        worker_thread.join(timeout=2.0)
        logger.info("Stopped MongoDB background worker thread")

def get_next_vehicle_id():
    """Generate next vehicle ID with format v001-[uuid]"""
    try:
        # Get the vehicles collection
        vehicles_collection = mongodb.collection('vehicles')
        
        # Try to find the highest current numeric ID
        docs = list(vehicles_collection.order_by('created_at', 'desc').limit(10).stream())
        
        # Start with 1 if no docs exist
        latest_num = 0
        
        for doc in docs:
            doc_id = doc.id
            if doc_id.startswith('v'):
                # Extract numeric portion from ID like v001-...
                try:
                    num_part = doc_id.split('-')[0][1:]  # Skip 'v' and get numeric part
                    current_num = int(num_part)
                    if current_num > latest_num:
                        latest_num = current_num
                except (ValueError, IndexError):
                    pass
        
        # Increment number and format with leading zeros
        next_num = latest_num + 1
        formatted_num = f"v{next_num:03d}"  # Format as v001, v002, etc.
        
        # Add a UUID for uniqueness
        unique_id = str(uuid.uuid4())[:8]  # Use first 8 chars of UUID
        
        return f"{formatted_num}-{unique_id}"
    except Exception as e:
        logger.error(f"Error generating vehicle ID: {e}")
        # Fallback to random ID if there's an error
        return f"v999-{str(uuid.uuid4())[:8]}"

def save_vehicle_entry(vehicle_type, license_plate, image_url=None, gate_id=None, location=None):
    """
    Non-blocking function to save a new vehicle entry to MongoDB with custom ID
    
    Args:
        vehicle_type (str): Type of vehicle (car, motorcycle, etc.)
        license_plate (str): License plate number
        image_url (str, optional): URL to vehicle image
        gate_id (str, optional): ID of the entry gate
        location (str, optional): Location description
    
    Returns:
        str: The document ID of the new vehicle record
    """
    # Make sure the worker is running
    if not worker_running:
        start_worker()
    
    # Create and queue the operation
    operation = SaveVehicleOperation(vehicle_type, license_plate, image_url, gate_id, location)
    operation_queue.put(operation)
    
    # Return the pre-generated document ID
    return operation.doc_id

def update_vehicle_exit(license_plate):
    """
    Non-blocking function to update a vehicle record when it exits
    
    Args:
        license_plate (str): License plate to look up
        
    Returns:
        bool: Always returns True as the operation is queued
    """
    # Make sure the worker is running
    if not worker_running:
        start_worker()
    
    # Create and queue the operation
    operation = UpdateVehicleExitOperation(license_plate)
    operation_queue.put(operation)
    
    # Return True since we successfully queued the operation
    return True

# Start the worker thread when the module is imported
start_worker() 