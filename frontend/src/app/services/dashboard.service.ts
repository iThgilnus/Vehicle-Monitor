// dashboard.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { tap, catchError, timeout } from 'rxjs/operators';
import { Vehicle, Camera, Gate, ActivityLog } from '../shared/models/database.models';
import { CacheService } from './cache.service';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private baseUrl = 'http://localhost:8000/api';
  private timeoutDuration = 10000; // 10 seconds timeout

  constructor(private http: HttpClient, private cacheService: CacheService) {
    console.log('DashboardService initialized');
  }

  // Lấy phương tiện với các trường được chỉ định
  getVehicles(fields?: string[]): Observable<Vehicle[]> {
    const cacheKey = `vehicles-${fields?.join(',') || 'all'}`;
    const cachedData = this.cacheService.get(cacheKey);
    
    if (cachedData) {
      console.log('Using cached vehicles data');
      return of(cachedData);
    }
    
    console.log('Fetching vehicles from API');
    let params = new HttpParams();
    if (fields && fields.length > 0) {
      params = params.append('fields', fields.join(','));
    }
    
    return this.http.get<Vehicle[]>(`${this.baseUrl}/vehicles/`, { params }).pipe(
      timeout(this.timeoutDuration),
      tap(data => {
        console.log(`Received ${data.length} vehicles from API`);
        this.cacheService.set(cacheKey, data);
      }),
      catchError(error => {
        console.error('Error fetching vehicles:', error);
        // Complete mock data matching the Vehicle interface
        const mockData: Vehicle[] = [
          { 
            vehicle_id: 'mock1', 
            license_plate: '29-123.45', 
            vehicle_type: 'Car', 
            status: 'Active',
            entry_time: new Date(),
            exit_time: null,
            location: 'Main Entrance',
            image_url: '/assets/images/mock-vehicle.jpg',
            created_at: new Date(),
            updated_at: new Date()
          },
          { 
            vehicle_id: 'mock2', 
            license_plate: '30-456.78', 
            vehicle_type: 'Motorcycle', 
            status: 'Active',
            entry_time: new Date(),
            exit_time: null,
            location: 'Main Entrance',
            image_url: '/assets/images/mock-vehicle.jpg',
            created_at: new Date(),
            updated_at: new Date()
          }
        ];
        return of(mockData);
      })
    );
  }

  /**
   * Get gates with filtering options
   */
  getGates(fields: string[] = []): Observable<Gate[]> {
    let params = new HttpParams();
    if (fields.length > 0) {
      params = params.set('fields', fields.join(','));
    }
    
    return this.http.get<Gate[]>(`${this.baseUrl}/gates/`, { params })
      .pipe(
        catchError(this.handleError<Gate[]>('getGates', []))
      );
  }

  /**
   * Get cameras with filtering options
   */
  getCameras(fields: string[] = []): Observable<Camera[]> {
    let params = new HttpParams();
    if (fields.length > 0) {
      params = params.set('fields', fields.join(','));
    }
    
    return this.http.get<Camera[]>(`${this.baseUrl}/cameras/`, { params })
      .pipe(
        catchError(this.handleError<Camera[]>('getCameras', []))
      );
  }

  // Lấy nhật ký hoạt động theo ngày với các trường được chỉ định
  getLogsByDate(startDate: string, endDate: string, fields?: string[]): Observable<ActivityLog[]> {
    const cacheKey = `logs-${startDate}-${endDate}-${fields?.join(',') || 'all'}`;
    const cachedData = this.cacheService.get(cacheKey);
    
    if (cachedData) {
      return of(cachedData);
    }
    
    let params = new HttpParams()
      .append('start_date', startDate)
      .append('end_date', endDate);
    
    if (fields && fields.length > 0) {
      params = params.append('fields', fields.join(','));
    }
    
    return this.http.get<ActivityLog[]>(`${this.baseUrl}/logs/by-date/`, { params }).pipe(
      timeout(this.timeoutDuration),
      tap(data => this.cacheService.set(cacheKey, data)),
      catchError(error => {
        console.error('Error fetching logs:', error);
        // Complete mock data matching the ActivityLog interface
        const mockData: ActivityLog[] = [
          { 
            log_id: 'log1', 
            event_type: 'Vehicle Entered', 
            camera_id: 'cam1', 
            description: 'Vehicle 29-123.45 entered', 
            timestamp: new Date(),
            vehicle_id: 'mock1',
            created_at: new Date()
          },
          { 
            log_id: 'log2', 
            event_type: 'Vehicle Exited', 
            camera_id: 'cam2', 
            description: 'Vehicle 30-456.78 exited', 
            timestamp: new Date(),
            vehicle_id: 'mock2',
            created_at: new Date()
          }
        ];
        return of(mockData);
      })
    );
  }

  /**
   * Handle Http operation that failed.
   * Let the app continue.
   * @param operation - name of the operation that failed
   * @param result - optional value to return as the observable result
   */
  private handleError<T>(operation = 'operation', result: T = [] as unknown as T) {
    return (error: any): Observable<T> => {
      console.error(`${operation} failed: ${error.message}`);
      
      // Return mock data or empty result so the app keeps running
      return of(result);
    };
  }
}

export {};