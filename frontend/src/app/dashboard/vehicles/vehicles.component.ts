import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialog } from '@angular/material/dialog'; // Add this import
import { Vehicle } from '../../shared/models/database.models';
import { DashboardService } from '../../services/dashboard.service';
import { VehicleService } from '../../services/vehicle.service';
import { Subscription } from 'rxjs';
import { VehicleDetailsModalComponent } from './vehicle-details-modal/vehicle-details-modal.component'; // Add this import

@Component({
  selector: 'app-vehicles',
  templateUrl: './vehicles.component.html',
  styleUrls: ['./vehicles.component.scss'],
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule, MatDialogModule] // Add MatDialogModule
})
export class VehiclesComponent implements OnInit, OnDestroy {
  vehicles: Vehicle[] = [];
  filteredVehicles: Vehicle[] = [];
  searchTerm: string = '';
  filterStatus: string = 'all';
  private subscription: Subscription | undefined;

  // Time period filters
  startDate: string = '';
  endDate: string = '';

  // Additional filters
  selectedVehicleType: string = '';
  selectedGate: string = '';
  gateLocations: string[] = [];

  // Pagination
  currentPage: number = 1;
  itemsPerPage: number = 6;
  totalPages: number = 1;

  constructor(
    private dashboardService: DashboardService,
    private vehicleService: VehicleService,
    private dialog: MatDialog // Add dialog service
  ) {}

  ngOnInit(): void {
    this.fetchVehicles();
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private fetchVehicles(): void {
    const requiredFields = ['vehicle_id', 'license_plate', 'vehicle_type', 'entry_time', 'exit_time', 'location', 'status', 'created_at', 'updated_at'];
    
    this.subscription = this.dashboardService.getVehicles(requiredFields).subscribe({
      next: (data: Vehicle[]) => {
        this.vehicles = data.map(vehicle => ({
          ...vehicle,
          entry_time: new Date(vehicle.entry_time),
          exit_time: vehicle.exit_time ? new Date(vehicle.exit_time) : null,
          created_at: new Date(vehicle.created_at),
          updated_at: new Date(vehicle.updated_at)
        }));
        
        // Extract unique gate locations for the gate filter dropdown
        this.extractGateLocations();
        
        this.applyFiltersAndPagination();
      },
      error: (err) => {
        console.error('Error fetching vehicle data:', err);
      }
    });
  }

  private extractGateLocations(): void {
    // Get unique gate locations from vehicles
    const locations = new Set<string>();
    this.vehicles.forEach(vehicle => {
      if (vehicle.location) {
        locations.add(vehicle.location);
      }
    });
    this.gateLocations = Array.from(locations);
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  searchVehicles(event: Event): void {
    this.searchTerm = (event.target as HTMLInputElement).value.toLowerCase();
    this.currentPage = 1; // Reset to page 1 when searching
    this.applyFilters();
  }

  filterByStatus(status: string): void {
    this.filterStatus = status;
    this.currentPage = 1; // Reset to page 1 when filtering
    this.applyFilters();
  }

  clearDateFilters(): void {
    this.startDate = '';
    this.endDate = '';
    this.applyFilters();
  }

  // Add new method to clear all filters
  clearAllFilters(): void {
    this.searchTerm = '';
    this.filterStatus = 'all';
    this.startDate = '';
    this.endDate = '';
    this.selectedVehicleType = '';
    this.selectedGate = '';
    this.currentPage = 1;
    this.applyFiltersAndPagination();
  }

  applyFilters(): void {
    this.currentPage = 1; // Reset to page 1 when any filter changes
    this.applyFiltersAndPagination();
  }

  private applyFiltersAndPagination(): void {
    // Sort by entry_time from newest to oldest
    let sortedVehicles = [...this.vehicles].sort((a, b) => {
      return b.entry_time.getTime() - a.entry_time.getTime();
    });

    // Convert string date inputs to Date objects if they exist
    const startDateTime = this.startDate ? new Date(this.startDate) : null;
    const endDateTime = this.endDate ? new Date(this.endDate) : null;

    // Apply all filters
    let tempFilteredVehicles = sortedVehicles.filter(vehicle => {
      // Text search filter
      const matchesSearch = this.searchTerm === '' || 
                           vehicle.license_plate.toLowerCase().includes(this.searchTerm) || 
                           vehicle.vehicle_type.toLowerCase().includes(this.searchTerm) ||
                           vehicle.location.toLowerCase().includes(this.searchTerm);
      
      // Status filter
      const matchesStatus = this.filterStatus === 'all' || 
                           vehicle.status.toLowerCase() === this.filterStatus.toLowerCase();
      
      // Date range filter
      let withinDateRange = true;
      if (startDateTime && endDateTime) {
        withinDateRange = vehicle.entry_time >= startDateTime && 
                         (vehicle.exit_time ? vehicle.exit_time <= endDateTime : vehicle.entry_time <= endDateTime);
      } else if (startDateTime) {
        withinDateRange = vehicle.entry_time >= startDateTime;
      } else if (endDateTime) {
        withinDateRange = vehicle.exit_time ? vehicle.exit_time <= endDateTime : vehicle.entry_time <= endDateTime;
      }
      
      // Vehicle type filter
      const matchesVehicleType = this.selectedVehicleType === '' || 
                                vehicle.vehicle_type === this.selectedVehicleType;
      
      // Gate location filter
      const matchesGate = this.selectedGate === '' || 
                         vehicle.location === this.selectedGate;
      
      // Return true only if all filter conditions are satisfied
      return matchesSearch && matchesStatus && withinDateRange && matchesVehicleType && matchesGate;
    });

    // Calculate total pages
    this.totalPages = Math.ceil(tempFilteredVehicles.length / this.itemsPerPage);
    
    // Ensure current page doesn't exceed total pages
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages > 0 ? this.totalPages : 1;
    }

    // Update paginated list
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    this.filteredVehicles = tempFilteredVehicles.slice(startIndex, endIndex);
  }

  // Navigation to previous page
  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.applyFiltersAndPagination();
    }
  }

  // Navigation to next page
  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.applyFiltersAndPagination();
    }
  }

  viewVehicleDetails(vehicle: Vehicle): void {
    // Open the dialog with the vehicle details
    const dialogRef = this.dialog.open(VehicleDetailsModalComponent, {
      width: '600px', // Set appropriate width
      data: vehicle
    });

    dialogRef.afterClosed().subscribe(result => {
      console.log('Vehicle details dialog closed');
      // Handle any actions after dialog close if needed
    });
  }
}