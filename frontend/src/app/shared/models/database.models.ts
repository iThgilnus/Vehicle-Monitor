export interface Vehicle {
  vehicle_id: string;
  license_plate: string;
  vehicle_type: string;
  entry_time: Date;
  exit_time: Date | null;
  location: string;
  status: string;
  image_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Gate {
  gate_id: string;
  gate_name: string;
  location: string;
  camera_id: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface Camera {
  camera_id: string;
  camera_name: string;
  gate_id: string | null;
  ip_address: string;
  status: string;
  last_sync: Date;
  created_at: Date;
  updated_at: Date;
}

export interface ActivityLog {
  log_id: string;
  event_type: string;
  vehicle_id: string | null;
  camera_id: string | null;
  license_plate?: string; // Added for blacklist checking
  description: string;
  timestamp: Date;
  created_at: Date;
  is_blacklisted?: boolean; // Flag to mark blacklisted vehicles
}

export interface Report {
  report_id: string;
  report_type: string;
  date_range: {
    start: Date;
    end: Date;
  };
  vehicle_count: number;
  entry_count: number;
  details: any[];
  created_at: Date;
}
