import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CacheService {
  private cache: Map<string, { data: any, timestamp: number }> = new Map();
  private readonly DEFAULT_CACHE_TIME = 15 * 60 * 1000;

  constructor() {
    console.log('CacheService initialized');
  }

  get(key: string): any | null {
    try {
      if (!this.cache.has(key)) {
        return null;
      }
      
      const cachedItem = this.cache.get(key);
      if (cachedItem && Date.now() - cachedItem.timestamp < this.DEFAULT_CACHE_TIME) {
        return cachedItem.data;
      }
      
      // Cache expired, remove it
      this.cache.delete(key);
      return null;
    } catch (error) {
      console.error('Cache retrieval error:', error);
      return null;
    }
  }

  set(key: string, data: any, expirationTime: number = this.DEFAULT_CACHE_TIME): void {
    try {
      // Don't cache null or undefined data
      if (data === null || data === undefined) {
        console.warn('Attempted to cache null/undefined data for key:', key);
        return;
      }
      
      this.cache.set(key, {
        data,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  clear(): void {
    try {
      this.cache.clear();
      console.log('Cache cleared');
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }
  
  // Debug methods
  getCacheInfo(): {size: number, keys: string[]} {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}
