import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { DashboardService } from '../../services/dashboard.service';
import { Vehicle, Camera, Gate, ActivityLog } from '../../shared/models/database.models';
import { Color, ScaleType } from '@swimlane/ngx-charts';
import { Subscription, forkJoin, finalize } from 'rxjs';

@Component({
  selector: 'app-dashboard-home',
  templateUrl: './dashboard-home.component.html',
  styleUrls: ['./dashboard-home.component.scss'],
  standalone: true,
  imports: [CommonModule, MatIconModule, NgxChartsModule, HttpClientModule, FormsModule]
})
export class DashboardHomeComponent implements OnInit, OnDestroy {
  vehicleCount = 0;
  activeGatesCount = 0;
  activeCamerasCount = 0;
  todaysTraffic = 0;
  vehiclesInside = 0;
  vehiclesLeft = 0;

  recentActivity: any[] = [];
  recentLogs: ActivityLog[] = [];

  entryChartData: any[] = [];
  exitChartData: any[] = [];
  selectedDate: string = new Date().toISOString().split('T')[0];
  maxDate: string = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });

  entryColorScheme: Color = {
    name: 'entryScheme',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: ['#34d399', '#22d3ee']
  };
  exitColorScheme: Color = {
    name: 'exitScheme',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: ['#f87171', '#fbbf24']
  };
  chartWidth = 700;

  private vehiclesMap: Map<string, Vehicle> = new Map();
  private cameraLocationMap: Map<string, string> = new Map();
  private subscription: Subscription | undefined;
  private logsCache: { [date: string]: ActivityLog[] } = {};

  // Add loading and error states
  isLoading = true;
  loadingError = false;
  errorMessage = '';

  // New variables for gate-specific charts
  mainGateInChartData: any[] = [];
  mainGateLeftChartData: any[] = [];
  secondaryGateInChartData: any[] = [];
  secondaryGateLeftChartData: any[] = [];
  
  // Gates statistics
  mainGateStats = { in: 0, out: 0 };
  secondaryGateStats = { in: 0, out: 0 };
  
  // Camera chart width
  cameraChartWidth = 650;
  
  // Camera and gate mapping
  private cameraMap: Map<string, { gateId: string, direction: string }> = new Map();
  private gateMap: Map<string, string> = new Map();

  constructor(private dashboardService: DashboardService) {
    console.log('DashboardHomeComponent initialized');
  }

  ngOnInit(): void {
    console.log('DashboardHomeComponent ngOnInit');
    this.isLoading = true;
    this.loadingError = false;
    this.initCameraAndGateMaps();
    this.fetchDashboardData();
  }

  ngOnDestroy(): void {
    console.log('DashboardHomeComponent ngOnDestroy');
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  fetchDashboardData(): void {
    console.log('Fetching dashboard data...');
    this.isLoading = true;
    this.loadingError = false;
    
    // Đồng bộ các API trước khi xử lý logs
    forkJoin([
      this.dashboardService.getVehicles(['vehicle_id', 'license_plate', 'vehicle_type', 'status']),
      this.dashboardService.getGates(['gate_id', 'status']),
      this.dashboardService.getCameras(['camera_id', 'camera_name', 'status'])
    ]).pipe(
      finalize(() => {
        console.log('API calls completed');
        this.isLoading = false;
      })
    ).subscribe({
      next: ([vehicles, gates, cameras]) => {
        try {
          console.log('Processing dashboard data...');
          this.vehicleCount = vehicles.length;
          this.vehiclesMap = new Map(vehicles.map(vehicle => [vehicle.license_plate, vehicle]));
          this.activeGatesCount = gates.filter(gate => gate.status === 'Active').length;
          this.activeCamerasCount = cameras.filter(camera => camera.status === 'Active').length;
          this.cameraLocationMap = new Map(cameras.map(camera => [camera.camera_id, camera.camera_name]));
          
          // Fetch logs once and process for both stats and charts
          this.fetchAndProcessLogs();
        } catch (err) {
          console.error('Error processing dashboard data:', err);
          this.handleError('Error processing data: ' + (err instanceof Error ? err.message : 'Unknown error'));
        }
      },
      error: (err) => {
        console.error('Error fetching dashboard data:', err);
        this.handleError('Failed to load dashboard data. Please try again.');
      }
    });
  }
  
  fetchAndProcessLogs(): void {
    console.log('Fetching logs for date:', this.selectedDate);
    
    // Use locally cached logs if available
    if (this.logsCache[this.selectedDate]) {
      console.log('Using cached logs for date:', this.selectedDate);
      this.processLogs(this.logsCache[this.selectedDate]);
      return;
    }
    
    // All fields needed for both stats and charts
    const logFields = ['log_id', 'event_type', 'camera_id', 'description', 'timestamp'];
    
    this.subscription = this.dashboardService.getLogsByDate(
      this.selectedDate, 
      this.selectedDate,
      logFields
    ).pipe(
      finalize(() => console.log('Log fetch completed'))
    ).subscribe({
      next: (logs) => {
        // Cache the logs for this date locally
        this.logsCache[this.selectedDate] = logs;
        
        // Process logs for both stats and charts
        this.processLogs(logs);
      },
      error: (err) => {
        console.error('Error fetching logs:', err);
        this.handleError('Failed to load logs. Using empty dataset.');
        // Process with empty logs to avoid UI breaking
        this.processLogs([]);
      }
    });
  }
  
  processLogs(logs: ActivityLog[]): void {
    // Reset all counts
    this.todaysTraffic = logs.length;
    this.vehiclesInside = logs.filter(log => log.event_type === 'Vehicle Entered').length;
    this.vehiclesLeft = logs.filter(log => log.event_type === 'Vehicle Exited').length;
    
    // Reset gate-specific stats
    this.mainGateStats = { in: 0, out: 0 };
    this.secondaryGateStats = { in: 0, out: 0 };
    
    // Process logs for UI display
    this.recentLogs = logs
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);
    
    this.recentActivity = this.recentLogs.map(log => {
      const licensePlateMatch = log.description.match(/[0-9A-Z]{2,3}-[0-9]{3}\.[0-9]{2}/);
      const licensePlate = licensePlateMatch ? licensePlateMatch[0] : 'Unknown';
      let vehicleType = 'Unknown';

      const vehicle = this.vehiclesMap.get(licensePlate);
      if (vehicle && vehicle.vehicle_type) {
        vehicleType = vehicle.vehicle_type;
      } else {
        vehicleType = licensePlateMatch && (licensePlate.startsWith('29') || licensePlate.startsWith('30')) ? 'Motorcycle' : 'Car';
      }

      const cameraId = log.camera_id || 'unknown';
      return {
        license_plate: licensePlate,
        vehicle_type: vehicleType,
        entry_time: log.timestamp,
        location: this.getLocationName(cameraId),
        status: log.event_type === 'Vehicle Entered' ? 'In' : 'Left'
      };
    });
    
    // Initialize the hourly data structure for each camera
    const hourlyData: { [hour: string]: { 
      mainGateIn: { car: number, motorcycle: number },
      mainGateLeft: { car: number, motorcycle: number },
      secondaryGateIn: { car: number, motorcycle: number },
      secondaryGateLeft: { car: number, motorcycle: number }
    } } = {};
    
    // Initialize hourly data for all hours in the day
    for (let hour = 0; hour < 24; hour++) {
      const hourKey = `${this.selectedDate} ${hour.toString().padStart(2, '0')}:00:00`;
      hourlyData[hourKey] = {
        mainGateIn: { car: 0, motorcycle: 0 },
        mainGateLeft: { car: 0, motorcycle: 0 },
        secondaryGateIn: { car: 0, motorcycle: 0 },
        secondaryGateLeft: { car: 0, motorcycle: 0 }
      };
    }

    // Process each log
    logs.forEach(log => {
      const time = new Date(log.timestamp);
      const hourKey = `${this.selectedDate} ${time.getUTCHours().toString().padStart(2, '0')}:00:00`;
      const licensePlateMatch = log.description.match(/[0-9A-Z]{2,3}-[0-9]{3}\.[0-9]{2}/);
      const licensePlate = licensePlateMatch ? licensePlateMatch[0] : 'Unknown';
      
      // Determine vehicle type
      let vehicleType = 'Unknown';
      const vehicle = this.vehiclesMap.get(licensePlate);
      if (vehicle && vehicle.vehicle_type) {
        vehicleType = vehicle.vehicle_type;
      } else {
        vehicleType = licensePlateMatch && (licensePlate.startsWith('29') || licensePlate.startsWith('30')) 
          ? 'Motorcycle' : 'Car';
      }
      
      // Get the camera info
      const cameraId = log.camera_id || '';
      const cameraInfo = this.cameraMap.get(cameraId);
      
      if (cameraInfo) {
        // Determine which gate and camera this log belongs to
        if (cameraInfo.gateId === 'RwL0hreWWQluj1Ln1caa') { // Main Gate
          if (cameraInfo.direction === 'IN') {
            if (log.event_type === 'Vehicle Entered') {
              hourlyData[hourKey].mainGateIn[vehicleType.toLowerCase() === 'motorcycle' ? 'motorcycle' : 'car']++;
              this.mainGateStats.in++;
            }
          } else if (cameraInfo.direction === 'LEFT') {
            if (log.event_type === 'Vehicle Exited') {
              hourlyData[hourKey].mainGateLeft[vehicleType.toLowerCase() === 'motorcycle' ? 'motorcycle' : 'car']++;
              this.mainGateStats.out++;
            }
          }
        } else if (cameraInfo.gateId === 'QBGp25pgkcvRIrt9YDbU') { // Secondary Gate
          if (cameraInfo.direction === 'IN') {
            if (log.event_type === 'Vehicle Entered') {
              hourlyData[hourKey].secondaryGateIn[vehicleType.toLowerCase() === 'motorcycle' ? 'motorcycle' : 'car']++;
              this.secondaryGateStats.in++;
            }
          } else if (cameraInfo.direction === 'LEFT') {
            if (log.event_type === 'Vehicle Exited') {
              hourlyData[hourKey].secondaryGateLeft[vehicleType.toLowerCase() === 'motorcycle' ? 'motorcycle' : 'car']++;
              this.secondaryGateStats.out++;
            }
          }
        }
      }
    });

    // Format the data for each chart
    const prepareChartData = (data: any, property: string) => {
      const carData = Object.keys(data).map(hour => ({
        name: hour.split(' ')[1],
        value: data[hour][property].car
      }));
      const motorcycleData = Object.keys(data).map(hour => ({
        name: hour.split(' ')[1],
        value: data[hour][property].motorcycle
      }));
      
      return [
        { name: 'Car', series: carData },
        { name: 'Motorcycle', series: motorcycleData }
      ];
    };
    
    // Generate chart data for each camera
    this.mainGateInChartData = prepareChartData(hourlyData, 'mainGateIn');
    this.mainGateLeftChartData = prepareChartData(hourlyData, 'mainGateLeft');
    this.secondaryGateInChartData = prepareChartData(hourlyData, 'secondaryGateIn');
    this.secondaryGateLeftChartData = prepareChartData(hourlyData, 'secondaryGateLeft');
  }

  onDateChange(): void {
    console.log('Date changed to:', this.selectedDate);
    // Just call fetchAndProcessLogs which will check the cache first
    this.fetchAndProcessLogs();
  }

  formatTime(date: Date | string): string {
    return new Date(date).toLocaleTimeString('vi-VN', { 
      timeZone: 'Asia/Ho_Chi_Minh', 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: true 
    });
  }

  formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString('vi-VN', { 
      timeZone: 'Asia/Ho_Chi_Minh', 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  }

  onResize(event: any): void {
    // Calculate chart width based on container
    const containerWidth = event.target.innerWidth;
    this.chartWidth = containerWidth > 700 ? 700 : containerWidth - 50;
    
    // For camera charts, make them smaller
    this.cameraChartWidth = containerWidth > 1200 
      ? 500 
      : (containerWidth > 768 ? 400 : containerWidth - 80);
  }

  private getLocationName(cameraId: string): string {
    return this.cameraLocationMap.get(cameraId) || 'Unknown Location';
  }

  // Add error handling method
  private handleError(message: string): void {
    this.loadingError = true;
    this.errorMessage = message;
    console.error(message);
  }

  private initCameraAndGateMaps() {
    // Hard-code the camera to gate mappings based on provided data
    this.cameraMap.set('iJKJYAreXtNZBfEPfBSt', { gateId: 'RwL0hreWWQluj1Ln1caa', direction: 'IN' });
    this.cameraMap.set('N5mPFXYLl7NsdEtxoy8r', { gateId: 'RwL0hreWWQluj1Ln1caa', direction: 'LEFT' });
    this.cameraMap.set('xxZVauFjWWkAKgeES0Y3', { gateId: 'QBGp25pgkcvRIrt9YDbU', direction: 'IN' });
    this.cameraMap.set('ggu6hlUdVQOXWIS48tTN', { gateId: 'QBGp25pgkcvRIrt9YDbU', direction: 'LEFT' });
    
    // Gate name mappings
    this.gateMap.set('RwL0hreWWQluj1Ln1caa', 'Main Gate');
    this.gateMap.set('QBGp25pgkcvRIrt9YDbU', 'Secondary Gate');
  }
}