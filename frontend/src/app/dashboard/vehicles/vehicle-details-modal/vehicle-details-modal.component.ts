import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Vehicle } from '../../../shared/models/database.models';

@Component({
  selector: 'app-vehicle-details-modal',
  templateUrl: './vehicle-details-modal.component.html',
  styleUrls: ['./vehicle-details-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule]
})
export class VehicleDetailsModalComponent {
  // Default image to use if no image_url is provided
  defaultImageUrl = 'assets/images/default-vehicle.jpg';

  constructor(
    public dialogRef: MatDialogRef<VehicleDetailsModalComponent>,
    @Inject(MAT_DIALOG_DATA) public vehicle: Vehicle
  ) {}

  closeDialog(): void {
    this.dialogRef.close();
  }

  // Format date with Vietnamese locale
  formatDate(date: Date | null): string {
    if (!date) return '-';
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  // Format time with 24-hour format (Vietnamese standard)
  formatTime(date: Date | null): string {
    if (!date) return '-';
    return date.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  // Format date and time together in Vietnamese format
  formatDateTime(date: Date | null): string {
    if (!date) return '-';
    return date.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }
}
