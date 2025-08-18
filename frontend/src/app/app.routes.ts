import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { VideoComponent } from './video/video.component';
import { DashboardHomeComponent } from './dashboard/dashboard-home/dashboard-home.component';
import { VehiclesComponent } from './dashboard/vehicles/vehicles.component';
import { CamerasComponent } from './dashboard/cameras/cameras.component';
import { LogsComponent } from './dashboard/logs/logs.component';
import { ReportsComponent } from './dashboard/reports/reports.component';
import { SettingsComponent } from './dashboard/settings/settings.component';
import { BlacklistComponent } from './dashboard/blacklists/blacklists.component';
import { SystemHealthComponent } from './dashboard/system-health/system-health.component';
import { ChatComponent } from './dashboard/chat/chat.component';

export const routes: Routes = [
  { path: '', redirectTo: 'video', pathMatch: 'full' },
  { 
    path: 'dashboard', 
    component: DashboardComponent,
    children: [
      { path: '', component: DashboardHomeComponent },
      { path: 'vehicles', component: VehiclesComponent },
      { path: 'cameras', component: CamerasComponent },
      { path: 'logs', component: LogsComponent },
      { path: 'reports', component: ReportsComponent },
      { path: 'settings', component: SettingsComponent },
      { path: 'blacklists', component: BlacklistComponent },
      { path: 'system-health', component: SystemHealthComponent },
      { path: 'chat', component: ChatComponent }
    ]
  },
  { path: 'video', component: VideoComponent },
];
