from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
import os
from datetime import datetime
from bson import ObjectId
import logging

# Cấu hình logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Cấu hình MongoDB
MONGODB_URL = os.getenv('MONGODB_URL', 'mongodb://127.0.0.1:27017')
DATABASE_NAME = os.getenv('DATABASE_NAME', 'vehicle_monitor')

class MongoDBConnection:
    _instance = None
    _client = None
    _db = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(MongoDBConnection, cls).__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._client is None:
            self.connect()
    
    def connect(self):
        """Kết nối tới MongoDB"""
        try:
            self._client = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=5000)
            # Test connection
            self._client.admin.command('ismaster')
            self._db = self._client[DATABASE_NAME]
            logger.info("✅ Kết nối MongoDB thành công!")
            
            # Tạo indexes
            self.create_indexes()
            
        except ConnectionFailure as e:
            logger.error(f"❌ Lỗi kết nối MongoDB: {e}")
            raise
        except Exception as e:
            logger.error(f"❌ Lỗi không xác định: {e}")
            raise
    
    def create_indexes(self):
        """Tạo các indexes cho hiệu suất tốt hơn"""
        try:
            # Vehicles collection indexes
            self._db.vehicles.create_index("license_plate")
            self._db.vehicles.create_index("status")
            self._db.vehicles.create_index("entry_time")
            self._db.vehicles.create_index("created_at")
            
            # Gates collection indexes
            self._db.gates.create_index("gate_name")
            self._db.gates.create_index("status")
            
            # Cameras collection indexes
            self._db.cameras.create_index("camera_name")
            self._db.cameras.create_index("gate_id")
            self._db.cameras.create_index("status")
            
            # Logs collection indexes
            self._db.logs.create_index("event_type")
            self._db.logs.create_index("timestamp")
            self._db.logs.create_index("vehicle_id")
            self._db.logs.create_index("camera_id")
            
            # Blacklists collection indexes
            self._db.blacklists.create_index("license_plate", unique=True)
            self._db.blacklists.create_index("ban_start_date")
            self._db.blacklists.create_index("ban_expiry")
            
            logger.info("✅ Đã tạo indexes thành công!")
            
        except Exception as e:
            logger.warning(f"⚠️  Không thể tạo một số indexes: {e}")
    
    def get_database(self):
        """Lấy database instance"""
        if self._db is None:
            self.connect()
        return self._db
    
    def get_collection(self, collection_name):
        """Lấy collection instance"""
        return self.get_database()[collection_name]
    
    def close_connection(self):
        """Đóng kết nối"""
        if self._client:
            self._client.close()
            self._client = None
            self._db = None
            logger.info("🔒 Đã đóng kết nối MongoDB")

# Tạo instance singleton
mongo_connection = MongoDBConnection()
db = mongo_connection.get_database()

# Helper functions để tương thích với Firestore API
class MongoDocument:
    """Wrapper class để tương thích với Firestore document"""
    
    def __init__(self, doc_data, doc_id=None):
        self.data = doc_data
        self.id = str(doc_id) if doc_id else str(doc_data.get('_id', ''))
    
    def to_dict(self):
        """Convert to dictionary, tương tự Firestore"""
        data = dict(self.data)
        # Loại bỏ _id của MongoDB
        if '_id' in data:
            del data['_id']
        return data
    
    @property
    def exists(self):
        """Check if document exists"""
        return self.data is not None and bool(self.data)

class MongoCollection:
    """Wrapper class để tương thích với Firestore collection"""
    
    def __init__(self, collection):
        self.collection = collection
    
    def document(self, doc_id=None):
        """Get document reference"""
        return MongoDocumentReference(self.collection, doc_id)
    
    def stream(self):
        """Stream all documents, tương tự Firestore"""
        try:
            cursor = self.collection.find()
            for doc in cursor:
                yield MongoDocument(doc, doc['_id'])
        except Exception as e:
            logger.error(f"Error streaming collection: {e}")
            return iter([])
    
    def where(self, field, operator, value):
        """Filter documents, tương tự Firestore"""
        query = {}
        
        if operator == "==":
            query[field] = value
        elif operator == "!=":
            query[field] = {"$ne": value}
        elif operator == ">":
            query[field] = {"$gt": value}
        elif operator == ">=":
            query[field] = {"$gte": value}
        elif operator == "<":
            query[field] = {"$lt": value}
        elif operator == "<=":
            query[field] = {"$lte": value}
        elif operator == "in":
            query[field] = {"$in": value}
        elif operator == "not-in":
            query[field] = {"$nin": value}
        
        return MongoQuery(self.collection, query)
    
    def order_by(self, field, direction='asc'):
        """Order documents"""
        sort_direction = 1 if direction == 'asc' else -1
        return MongoQuery(self.collection, {}, [(field, sort_direction)])
    
    def limit(self, count):
        """Limit results"""
        return MongoQuery(self.collection, {}, [], count)
    
    def add(self, data):
        """Add new document"""
        try:
            data['created_at'] = datetime.now()
            data['updated_at'] = datetime.now()
            result = self.collection.insert_one(data)
            return MongoDocumentReference(self.collection, result.inserted_id)
        except Exception as e:
            logger.error(f"Error adding document: {e}")
            raise

class MongoDocumentReference:
    """Wrapper class để tương thích với Firestore document reference"""
    
    def __init__(self, collection, doc_id=None):
        self.collection = collection
        self.id = str(doc_id) if doc_id else None
    
    def get(self):
        """Get document, tương tự Firestore"""
        try:
            if self.id:
                doc = self.collection.find_one({"_id": ObjectId(self.id)})
            else:
                doc = None
            return MongoDocument(doc, doc.get('_id') if doc else None)
        except Exception as e:
            logger.error(f"Error getting document: {e}")
            return MongoDocument(None)
    
    def set(self, data):
        """Set document data"""
        try:
            data['updated_at'] = datetime.now()
            if not data.get('created_at'):
                data['created_at'] = datetime.now()
                
            if self.id:
                # Update existing
                self.collection.update_one(
                    {"_id": ObjectId(self.id)}, 
                    {"$set": data}
                )
            else:
                # Create new
                result = self.collection.insert_one(data)
                self.id = str(result.inserted_id)
        except Exception as e:
            logger.error(f"Error setting document: {e}")
            raise
    
    def update(self, data):
        """Update document data"""
        try:
            data['updated_at'] = datetime.now()
            if self.id:
                self.collection.update_one(
                    {"_id": ObjectId(self.id)}, 
                    {"$set": data}
                )
        except Exception as e:
            logger.error(f"Error updating document: {e}")
            raise
    
    def delete(self):
        """Delete document"""
        try:
            if self.id:
                self.collection.delete_one({"_id": ObjectId(self.id)})
        except Exception as e:
            logger.error(f"Error deleting document: {e}")
            raise

class MongoQuery:
    """Query builder for MongoDB"""
    
    def __init__(self, collection, query_filter=None, sort_params=None, limit_count=None):
        self.collection = collection
        self.query_filter = query_filter or {}
        self.sort_params = sort_params or []
        self.limit_count = limit_count
    
    def where(self, field, operator, value):
        """Add where condition"""
        new_filter = dict(self.query_filter)
        
        if operator == "==":
            new_filter[field] = value
        elif operator == "!=":
            new_filter[field] = {"$ne": value}
        elif operator == ">":
            new_filter[field] = {"$gt": value}
        elif operator == ">=":
            new_filter[field] = {"$gte": value}
        elif operator == "<":
            new_filter[field] = {"$lt": value}
        elif operator == "<=":
            new_filter[field] = {"$lte": value}
        elif operator == "in":
            new_filter[field] = {"$in": value}
        elif operator == "not-in":
            new_filter[field] = {"$nin": value}
        
        return MongoQuery(self.collection, new_filter, self.sort_params, self.limit_count)
    
    def order_by(self, field, direction='asc'):
        """Add order by"""
        sort_direction = 1 if direction == 'asc' else -1
        new_sort = list(self.sort_params)
        new_sort.append((field, sort_direction))
        return MongoQuery(self.collection, self.query_filter, new_sort, self.limit_count)
    
    def limit(self, count):
        """Add limit"""
        return MongoQuery(self.collection, self.query_filter, self.sort_params, count)
    
    def stream(self):
        """Execute query and stream results"""
        try:
            cursor = self.collection.find(self.query_filter)
            
            if self.sort_params:
                cursor = cursor.sort(self.sort_params)
            
            if self.limit_count:
                cursor = cursor.limit(self.limit_count)
            
            for doc in cursor:
                yield MongoDocument(doc, doc['_id'])
                
        except Exception as e:
            logger.error(f"Error executing query: {e}")
            return iter([])
    
    def get(self):
        """Execute query and get results as list"""
        return list(self.stream())

# Database interface tương thích với Firestore
class MongoDatabase:
    """Main database interface"""
    
    def __init__(self):
        self.db = db
    
    def collection(self, collection_name):
        """Get collection, tương tự Firestore"""
        mongo_collection = self.db[collection_name]
        return MongoCollection(mongo_collection)

# Tạo instance database để sử dụng
mongodb = MongoDatabase() 