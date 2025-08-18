import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { interval, Subscription } from 'rxjs';
import { SystemHealthService } from '../../services/system-health.service';

interface SystemMetric {
  name: string;
  value: number;
  unit: string;
  status: 'good' | 'warning' | 'critical';
  icon: string;
}

interface GpuInfo {
  name: string;
  usage: { value: number; status: string };
  memory: { total: number; used: number; usage_percent: number; status: string };
  temperature: { value: number; status: string };
}

interface ServiceStatus {
  name: string;
  status: 'online' | 'degraded' | 'offline';
  lastUpdated: Date;
  uptime: number; // in hours
}

@Component({
  selector: 'app-system-health',
  templateUrl: './system-health.component.html',
  styleUrls: ['./system-health.component.scss'],
  standalone: true,
  imports: [CommonModule, MatIconModule]
})
export class SystemHealthComponent implements OnInit, OnDestroy {
  metrics: SystemMetric[] = [];
  gpuInfo: GpuInfo[] = [];
  services: ServiceStatus[] = [];
  recentIssues: string[] = [];
  updateInterval: Subscription | null = null;

  constructor(private systemHealthService: SystemHealthService) {}

  ngOnInit(): void {
    this.fetchSystemStatus();

    // Update metrics every 30 seconds
    this.updateInterval = interval(30000).subscribe(() => {
      this.fetchSystemStatus(true);
    });
  }

  ngOnDestroy(): void {
    if (this.updateInterval) {
      this.updateInterval.unsubscribe();
    }
  }

  public fetchSystemStatus(updateOnly: boolean = false): void {
    this.systemHealthService.getSystemHealth().subscribe({
      next: (data) => {
        // Ánh xạ dữ liệu từ API vào metrics
        this.metrics = [
          {
            name: 'CPU Usage',
            value: data.cpu_usage.value,
            unit: '%',
            status: data.cpu_usage.status.toLowerCase() as 'good' | 'warning' | 'critical',
            icon: 'memory'
          },
          {
            name: 'Memory Usage',
            value: data.memory_usage.value,
            unit: '%',
            status: data.memory_usage.status.toLowerCase() as 'good' | 'warning' | 'critical',
            icon: 'sd_card'
          },
          {
            name: 'Disk Space',
            value: data.disk_space.value,
            unit: '%',
            status: data.disk_space.status.toLowerCase() as 'good' | 'warning' | 'critical',
            icon: 'storage'
          },
          {
            name: 'Network Latency',
            value: data.network_latency.value,
            unit: 'ms',
            status: data.network_latency.status.toLowerCase() as 'good' | 'warning' | 'critical',
            icon: 'network_check'
          }
        ];

        // Map GPU info if available
        this.gpuInfo = data.gpu_info || [];

        if (!updateOnly) {
          // Ánh xạ services_status
          this.services = data.services_status.map(service => ({
            name: service.service,
            status: service.status.toLowerCase() as 'online' | 'degraded' | 'offline',
            lastUpdated: new Date(service.last_updated),
            uptime: this.parseUptimeToHours(service.uptime) // Chuyển đổi uptime sang giờ
          }));

          // Ánh xạ recent_issues
          this.recentIssues = data.recent_issues.map(issue => 
            `${issue.message} - ${new Date(issue.timestamp).toLocaleTimeString()}`
          );
        }
      },
      error: (error) => {
        console.error('Error fetching system health:', error);
      }
    });
  }

  // Hàm chuyển đổi uptime (ví dụ "7d 0h" thành số giờ)
  private parseUptimeToHours(uptime: string): number {
    const parts = uptime.split(' ');
    let totalHours = 0;
    for (const part of parts) {
      if (part.includes('d')) {
        totalHours += parseInt(part) * 24;
      } else if (part.includes('h')) {
        totalHours += parseInt(part);
      }
    }
    return totalHours;
  }

  getStatusClass(status: string): string {
    switch(status) {
      case 'good':
      case 'online': return 'approved';
      case 'warning':
      case 'degraded': return 'warning';
      case 'critical':
      case 'offline': return 'denied';
      default: return '';
    }
  }

  formatUptime(hours: number): string {
    const days = Math.floor(hours / 24);
    const remainingHours = Math.floor(hours % 24);
    
    if (days > 0) {
      return `${days}d ${remainingHours}h`;
    } else {
      return `${remainingHours}h`;
    }
  }
}