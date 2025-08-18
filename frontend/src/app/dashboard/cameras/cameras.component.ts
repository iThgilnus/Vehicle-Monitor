import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Camera } from '../../shared/models/database.models';
import { DashboardService } from '../../services/dashboard.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-cameras',
  templateUrl: './cameras.component.html',
  styleUrls: ['./cameras.component.scss'],
  standalone: true,
  imports: [CommonModule, MatIconModule]
})
export class CamerasComponent implements OnInit, OnDestroy {
  cameras: Camera[] = [];
  filteredCameras: Camera[] = [];
  searchTerm: string = '';
  filterStatus: string = 'all';
  private subscription: Subscription | undefined;

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.fetchCameras();
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private fetchCameras(): void {
    const requiredFields = ['camera_id', 'camera_name', 'ip_address', 'status', 'last_sync', 'created_at', 'updated_at'];
    this.subscription = this.dashboardService.getCameras(requiredFields).subscribe({
      next: (data: Camera[]) => {
        // Gán dữ liệu từ API vào mảng cameras
        this.cameras = data.map(camera => ({
          ...camera,
          last_sync: new Date(camera.last_sync), // Chuyển đổi last_sync thành Date object
          created_at: new Date(camera.created_at),
          updated_at: new Date(camera.updated_at)
        }));
        this.filteredCameras = [...this.cameras]; // Ban đầu không lọc
      },
      error: (err) => {
        console.error('Lỗi khi lấy dữ liệu camera:', err);
      }
    });
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  searchCameras(event: Event): void {
    this.searchTerm = (event.target as HTMLInputElement).value.toLowerCase();
    this.applyFilters();
  }

  filterByStatus(status: string): void {
    this.filterStatus = status;
    this.applyFilters();
  }

  private applyFilters(): void {
    this.filteredCameras = this.cameras.filter(camera => {
      const matchesSearch = camera.camera_name.toLowerCase().includes(this.searchTerm) || 
                           camera.ip_address.toLowerCase().includes(this.searchTerm);
      
      const matchesStatus = this.filterStatus === 'all' || camera.status.toLowerCase() === this.filterStatus.toLowerCase();
      
      return matchesSearch && matchesStatus;
    });
  }

  viewCameraFeed(camera: Camera): void {
    console.log('View camera feed', camera);
    // Thêm logic để chuyển hướng hoặc mở modal
  }

  editCamera(camera: Camera): void {
    console.log('Edit camera', camera);
    // Thêm logic để mở form chỉnh sửa
  }

  deleteCamera(camera: Camera): void {
    console.log('Delete camera', camera);
    // Thêm logic để hiển thị dialog xác nhận và xóa
  }

  getLastSyncStatus(camera: Camera): string {
    const minutes = Math.floor((Date.now() - camera.last_sync.getTime()) / 60000);
    
    if (minutes < 5) return 'recent';
    if (minutes < 30) return 'warning';
    return 'error';
  }
}