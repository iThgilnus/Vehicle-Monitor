import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionRequired: boolean;
  link?: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notifications: BehaviorSubject<Notification[]> = new BehaviorSubject<Notification[]>([]);
  public notifications$: Observable<Notification[]> = this.notifications.asObservable();
  
  constructor() {
    // Mock notifications for demonstration
    this.addMockNotifications();
  }
  
  private addMockNotifications(): void {
    const mockNotifications: Notification[] = [
      {
        id: 'not1',
        type: 'warning',
        title: 'Unknown vehicle detected',
        message: 'License plate XYZ-123.45 not in database. Verify at East Gate.',
        timestamp: new Date(Date.now() - 15 * 60000),
        read: false,
        actionRequired: true,
        link: '/dashboard/vehicles'
      },
      {
        id: 'not2',
        type: 'info',
        title: 'System backup complete',
        message: 'Daily backup completed successfully',
        timestamp: new Date(Date.now() - 120 * 60000),
        read: false,
        actionRequired: false
      },
      {
        id: 'not3',
        type: 'error',
        title: 'Camera offline',
        message: 'Main Gate camera disconnected. Check connection.',
        timestamp: new Date(Date.now() - 240 * 60000),
        read: true,
        actionRequired: true,
        link: '/dashboard/cameras'
      }
    ];
    
    this.notifications.next(mockNotifications);
  }
  
  getNotifications(): Notification[] {
    return this.notifications.value;
  }
  
  getUnreadCount(): number {
    return this.notifications.value.filter(n => !n.read).length;
  }
  
  addNotification(notification: Omit<Notification, 'id' | 'timestamp' | 'read'>): void {
    const newNotification: Notification = {
      ...notification,
      id: 'not' + Date.now(),
      timestamp: new Date(),
      read: false
    };
    
    const current = this.notifications.value;
    this.notifications.next([newNotification, ...current]);
    
    // Display browser notification if available
    this.showBrowserNotification(newNotification);
  }
  
  markAsRead(id: string): void {
    const updated = this.notifications.value.map(n => 
      n.id === id ? { ...n, read: true } : n
    );
    this.notifications.next(updated);
  }
  
  markAllAsRead(): void {
    const updated = this.notifications.value.map(n => ({ ...n, read: true }));
    this.notifications.next(updated);
  }
  
  removeNotification(id: string): void {
    const updated = this.notifications.value.filter(n => n.id !== id);
    this.notifications.next(updated);
  }
  
  clearAll(): void {
    this.notifications.next([]);
  }
  
  private showBrowserNotification(notification: Notification): void {
    // Check if browser notifications are supported and permitted
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/assets/logo.png'
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }
  }
}
