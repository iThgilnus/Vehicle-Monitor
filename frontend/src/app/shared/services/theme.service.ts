import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type ThemeMode = 'dark' | 'light';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private themeSubject: BehaviorSubject<ThemeMode>;
  public theme$: Observable<ThemeMode>;

  constructor() {
    // Check if user has a saved preference
    const savedTheme = localStorage.getItem('theme') as ThemeMode;
    
    // Default to dark theme or use saved preference
    this.themeSubject = new BehaviorSubject<ThemeMode>(
      savedTheme || this.detectPreferredTheme() || 'dark'
    );
    
    this.theme$ = this.themeSubject.asObservable();
    
    // Apply the theme immediately
    this.applyTheme(this.themeSubject.value);
    
    // Listen for system preference changes
    this.listenForPreferenceChanges();
  }

  private detectPreferredTheme(): ThemeMode | null {
    if (window.matchMedia) {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      } else {
        return 'light';
      }
    }
    return null;
  }

  private listenForPreferenceChanges(): void {
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', e => {
          // Only update if user hasn't explicitly set a preference
          if (!localStorage.getItem('theme')) {
            const newTheme: ThemeMode = e.matches ? 'dark' : 'light';
            this.themeSubject.next(newTheme);
            this.applyTheme(newTheme);
          }
        });
    }
  }

  setTheme(theme: ThemeMode): void {
    localStorage.setItem('theme', theme);
    this.themeSubject.next(theme);
    this.applyTheme(theme);
  }

  toggleTheme(): void {
    const newTheme: ThemeMode = this.themeSubject.value === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
  }

  private applyTheme(theme: ThemeMode): void {
    document.documentElement.setAttribute('data-theme', theme);
    
    // Also set the meta theme-color for mobile browser UI
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute(
        'content', 
        theme === 'dark' ? '#151921' : '#ffffff'
      );
    }
  }
}
