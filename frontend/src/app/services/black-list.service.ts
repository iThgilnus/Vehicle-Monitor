import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CacheService } from './cache.service';

export interface BlacklistEntry {
  blacklist_id?: string;
  vehicle_type: string;
  vehicle_id?: string | null;
  license_plate: string;
  ban_start_date: Date;
  ban_expiry: Date | null;
  updated_at?: Date;
  notes: string;
  ban_level: 'Warning' | 'Ban';
}

@Injectable({
  providedIn: 'root'
})
export class BlacklistService {
  private apiUrl = 'http://localhost:8000/api/blacklists/';
  private CACHE_KEY = 'blacklists-data';

  constructor(private http: HttpClient, private cacheService: CacheService) {}

  getBlacklists(): Observable<BlacklistEntry[]> {
    const cachedData = this.cacheService.get(this.CACHE_KEY);
    
    if (cachedData) {
      return of(cachedData);
    }
    
    return this.http.get<BlacklistEntry[]>(this.apiUrl).pipe(
      tap(data => this.cacheService.set(this.CACHE_KEY, data))
    );
  }

  createBlacklist(entry: BlacklistEntry): Observable<any> {
    return this.http.post(this.apiUrl, entry).pipe(
      tap(() => this.clearCache())
    );
  }

  updateBlacklist(blacklistId: string, entry: Partial<BlacklistEntry>): Observable<any> {
    return this.http.put(`${this.apiUrl}${blacklistId}/`, entry).pipe(
      tap(() => this.clearCache())
    );
  }

  deleteBlacklist(blacklistId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}${blacklistId}/`).pipe(
      tap(() => this.clearCache())
    );
  }
  
  private clearCache(): void {
    this.cacheService.clear();
  }
}