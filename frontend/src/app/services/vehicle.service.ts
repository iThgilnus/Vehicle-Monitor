import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CacheService } from './cache.service';

@Injectable({
  providedIn: 'root'
})
export class VehicleService {
  private apiUrl = 'http://localhost:8000/api/vehicles';
  private CACHE_KEY = 'vehicles-all';

  constructor(private http: HttpClient, private cacheService: CacheService) { }

  getVehicles(): Observable<any[]> {
    const cachedData = this.cacheService.get(this.CACHE_KEY);
    
    if (cachedData) {
      return of(cachedData);
    }
    
    return this.http.get<any[]>(this.apiUrl).pipe(
      tap(data => this.cacheService.set(this.CACHE_KEY, data))
    );
  }
  
  // If you have other methods that modify vehicles, add cache invalidation
  // Example:
  // createVehicle(vehicle: any): Observable<any> {
  //   return this.http.post(this.apiUrl, vehicle).pipe(
  //     tap(() => this.cacheService.clear())
  //   );
  // }
}