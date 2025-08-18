import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

export interface TrafficData {
  date: string;
  entries: number;
  exits: number;
}

export interface VehicleTypeDistribution {
  type: string;
  count: number;
}

export interface PeakHourData {
  hour: number;
  count: number;
}

export interface GateTraffic {
  gate: string;
  entries: number;
}

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  constructor() { }

  getDailyTraffic(days: number = 7): Observable<TrafficData[]> {
    const data: TrafficData[] = [];
    const today = new Date();
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(today.getDate() - i);
      
      data.push({
        date: date.toISOString().split('T')[0],
        entries: Math.floor(Math.random() * 50) + 20,
        exits: Math.floor(Math.random() * 45) + 15
      });
    }
    
    return of(data.reverse());
  }

  getVehicleTypeDistribution(): Observable<VehicleTypeDistribution[]> {
    return of([
      { type: 'Motorcycle', count: 145 },
      { type: 'Car', count: 87 },
      { type: 'Truck', count: 12 },
      { type: 'Other', count: 8 }
    ]);
  }

  getPeakHours(): Observable<PeakHourData[]> {
    const data: PeakHourData[] = [];
    
    for (let hour = 0; hour < 24; hour++) {
      let count: number;
      
      // Simulate peak hours in the morning and evening
      if (hour >= 7 && hour <= 9) {
        count = Math.floor(Math.random() * 20) + 30; // Morning peak
      } else if (hour >= 17 && hour <= 19) {
        count = Math.floor(Math.random() * 25) + 35; // Evening peak
      } else if (hour >= 0 && hour <= 5) {
        count = Math.floor(Math.random() * 5) + 2; // Night (very low)
      } else {
        count = Math.floor(Math.random() * 15) + 10; // Regular hours
      }
      
      data.push({ hour, count });
    }
    
    return of(data);
  }

  getGateTraffic(): Observable<GateTraffic[]> {
    return of([
      { gate: 'Main Gate', entries: 68 },
      { gate: 'East Gate', entries: 42 },
      { gate: 'West Gate', entries: 23 },
      { gate: 'South Gate', entries: 12 }
    ]);
  }

  getUnauthorizedAttempts(days: number = 30): Observable<number> {
    return of(Math.floor(Math.random() * 15) + 5);
  }
}
