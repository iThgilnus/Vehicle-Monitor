import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

interface SystemMetric {
  name: string;
  value: number;
  unit: string;
  status: 'good' | 'warning' | 'critical';
  icon: string;
}

interface ServiceStatus {
  name: string;
  status: 'online' | 'degraded' | 'offline';
  lastUpdated: Date;
  uptime: number;
}

interface SystemHealthResponse {
  cpu_usage: { value: number; status: string };
  memory_usage: { value: number; status: string };
  disk_space: { value: number; status: string };
  network_latency: { value: number; status: string };
  gpu_info: {
    name: string;
    usage: { value: number; status: string };
    memory: { total: number; used: number; usage_percent: number; status: string };
    temperature: { value: number; status: string };
  }[];
  services_status: { service: string; status: string; uptime: string; last_updated: string }[];
  recent_issues: { message: string; timestamp: string }[];
  last_updated: string;
}

@Injectable({
  providedIn: 'root'
})
export class SystemHealthService {
  private apiUrl = 'http://localhost:8000/api/system-health/';

  constructor(private http: HttpClient) {}

  getSystemHealth(): Observable<SystemHealthResponse> {
    return this.http.get<SystemHealthResponse>(this.apiUrl);
  }
}