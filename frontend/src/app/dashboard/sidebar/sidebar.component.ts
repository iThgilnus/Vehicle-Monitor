import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

interface MenuItem {
  title: string;
  icon: string;
  route: string;
  badge?: {
    count: number;
    type: string;
  };
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule]
})
export class SidebarComponent {
  @Input() isSidebarCollapsed = false;
  @Input() selectedMenuItem = 'Dashboard';
  @Output() menuItemSelected = new EventEmitter<MenuItem>();
  @Output() sidebarToggled = new EventEmitter<void>();

  // Menu sections
  menuSections = [
    {
      title: 'MAIN MENU',
      items: [
        { title: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
        { title: 'Vehicles', icon: 'directions_car', route: '/dashboard/vehicles' },
        { title: 'Cameras', icon: 'videocam', route: '/dashboard/cameras', badge: { count: 5, type: '' } },
        { title: 'Blacklists', icon: 'playlist_add_check', route: '/dashboard/blacklists' }
      ] as MenuItem[]
    },
    {
      title: 'MANAGEMENT',
      items: [
        { title: 'Activity Logs', icon: 'history', route: '/dashboard/logs' },
        { title: 'Reports', icon: 'bar_chart', route: '/dashboard/reports' },
        { title: 'System Health', icon: 'monitoring', route: '/dashboard/system-health' },
        { title: 'Chat Assistant', icon: 'smart_toy', route: '/dashboard/chat' },
        { title: 'Settings', icon: 'settings', route: '/dashboard/settings' }
      ] as MenuItem[]
    }
  ];

  selectMenuItem(item: MenuItem) {
    this.menuItemSelected.emit(item);
  }

}
