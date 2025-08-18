import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Router } from '@angular/router';

export interface User {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'operator' | 'viewer';
  lastLogin: Date;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject: BehaviorSubject<User | null> = new BehaviorSubject<User | null>(null);
  public currentUser$: Observable<User | null> = this.currentUserSubject.asObservable();

  constructor(private router: Router) {
    // Check for stored credentials on startup
    this.checkStoredAuth();
  }

  private checkStoredAuth(): void {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      this.currentUserSubject.next(JSON.parse(storedUser));
    }
  }

  login(email: string, password: string): Promise<boolean> {
    // In a real app, this would connect to Firebase Authentication
    return new Promise((resolve) => {
      // Mock login for demo purposes
      if (email === 'admin@example.com' && password === 'password') {
        const user: User = {
          uid: 'user123',
          email: email,
          displayName: 'Admin User',
          role: 'admin',
          lastLogin: new Date()
        };
        localStorage.setItem('user', JSON.stringify(user));
        this.currentUserSubject.next(user);
        resolve(true);
      } else {
        resolve(false);
      }
    });
  }

  logout(): void {
    localStorage.removeItem('user');
    this.currentUserSubject.next(null);
    this.router.navigate(['/login']);
  }

  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  hasPermission(requiredRole: 'admin' | 'operator' | 'viewer'): boolean {
    const user = this.currentUser;
    if (!user) return false;
    
    const roles = {
      'admin': 3,
      'operator': 2,
      'viewer': 1
    };
    
    return roles[user.role] >= roles[requiredRole];
  }
}
