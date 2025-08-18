import { Component, OnInit, HostListener } from '@angular/core';
import { Router, RouterOutlet, ActivatedRoute, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { filter } from 'rxjs/operators';
import { SidebarComponent } from './sidebar/sidebar.component';

interface MenuItem {
  title: string;
  icon: string;
  route: string;
  badge?: {
    count: number;
    type: string;
  };
}

interface Vehicle {
  id: string;
  license_plate: string;
  vehicle_type: string;
  entry_time: Date;
  status: string;
  image_url: string | null;
  gate: string;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, RouterOutlet, MatIconModule, SidebarComponent]
})
export class DashboardComponent implements OnInit {
  isSidebarCollapsed = false;
  selectedMenuItem = 'Dashboard';
  screenWidth: number = 0;

  // Mock data - sẽ được lấy từ Firestore trong môi trường production
  vehicleCount = 145;
  gateCount = 2;
  cameraCount = 2;

  // Mock data cho hoạt động gần đây
  recentActivity: Vehicle[] = [
    { id: 'VEH001', license_plate: 'ABC123', vehicle_type: 'Motorcycle', entry_time: this.getVietnamDate(), status: 'approved', image_url: null, gate: 'Main Gate' },
    { id: 'VEH002', license_plate: 'XYZ789', vehicle_type: 'Motorcycle', entry_time: this.getVietnamDate(25), status: 'warning', image_url: null, gate: 'East Gate' },
    { id: 'VEH003', license_plate: 'DEF456', vehicle_type: 'Motorcycle', entry_time: this.getVietnamDate(45), status: 'approved', image_url: null, gate: 'West Gate' },
    { id: 'VEH004', license_plate: 'GHI789', vehicle_type: 'Car', entry_time: this.getVietnamDate(60), status: 'approved', image_url: null, gate: 'South Gate' },
  ];

  // Các mục menu
  menuSections = [
    {
      title: 'MAIN MENU',
      items: [
        { title: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
        { title: 'Vehicles', icon: 'directions_car', route: '/dashboard/vehicles', badge: { count: 145, type: '' } },
        { title: 'Gates', icon: 'door_front', route: '/dashboard/gates', badge: { count: 2, type: '' } },
        { title: 'Cameras', icon: 'videocam', route: '/dashboard/cameras', badge: { count: 3, type: '' } },
        { title: 'Blacklist', icon: 'list', route: '/dashboard/blacklist' }
      ] as MenuItem[]
    },
    {
      title: 'MANAGEMENT',
      items: [
        { title: 'Activity Logs', icon: 'history', route: '/dashboard/logs' },
        { title: 'Reports', icon: 'bar_chart', route: '/dashboard/reports' },
        { title: 'Settings', icon: 'settings', route: '/dashboard/settings' }
      ] as MenuItem[]
    }
  ];

  constructor(
    private router: Router, 
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      this.screenWidth = window.innerWidth;
      this.isSidebarCollapsed = this.screenWidth < 1024; // Default collapse on mobile
    }

    // Update selected menu item based on current route
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      const currentUrl = this.router.url;
      if (currentUrl.includes('/dashboard/vehicles')) {
        this.selectedMenuItem = 'Vehicles';
      } else if (currentUrl.includes('/dashboard/gates')) { // Added Gates
        this.selectedMenuItem = 'Gates';
      } else if (currentUrl.includes('/dashboard/cameras')) {
        this.selectedMenuItem = 'Cameras';
      } else if (currentUrl.includes('/dashboard/blacklists')) {
        this.selectedMenuItem = 'Blacklist';
      } else if (currentUrl.includes('/dashboard/logs')) {
        this.selectedMenuItem = 'Activity Logs';
      } else if (currentUrl.includes('/dashboard/reports')) {
        this.selectedMenuItem = 'Reports';
      } else if (currentUrl.includes('/dashboard/settings')) {
        this.selectedMenuItem = 'Settings';
      } else {
        this.selectedMenuItem = 'Dashboard';
      }
    });

  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    if (typeof window !== 'undefined') {
      this.screenWidth = window.innerWidth;
      this.isSidebarCollapsed = this.screenWidth < 1024; // Responsive based on size
    }
  }

  toggleSidebar() {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  selectMenuItem(item: MenuItem) {
    this.selectedMenuItem = item.title;
    this.router.navigate([item.route]).then(success => {
      if (!success) {
        console.error(`Navigation to ${item.route} failed`);
      }
    });

    // On mobile, close sidebar after selecting menu
    if (this.screenWidth < 1024) {
      this.isSidebarCollapsed = true;
    }
  }

  // Helper method to get current date in Vietnam timezone
  getVietnamDate(minutesAgo: number = 0): Date {
    const vietnamTime = new Date();
    // Set timezone offset to Vietnam (UTC+7)
    vietnamTime.setHours(vietnamTime.getHours() + 7 + vietnamTime.getTimezoneOffset() / 60);
    if (minutesAgo > 0) {
      vietnamTime.setMinutes(vietnamTime.getMinutes() - minutesAgo);
    }
    return vietnamTime;
  }

  // Updated format function to display date and time according to Vietnamese standards
  formatTime(date: Date): string {
    return date.toLocaleString('vi-VN', { 
      timeZone: 'Asia/Ho_Chi_Minh', 
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false
    });
  }
}