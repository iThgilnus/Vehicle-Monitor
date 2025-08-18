import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { BlacklistService, BlacklistEntry } from '../../services/black-list.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-blacklists',
  templateUrl: './blacklists.component.html',
  styleUrls: ['./blacklists.component.scss'],
  standalone: true,
  imports: [CommonModule, MatIconModule, ReactiveFormsModule]
})
export class BlacklistComponent implements OnInit, OnDestroy {
  blacklistEntries: BlacklistEntry[] = [];
  filteredEntries: BlacklistEntry[] = [];
  searchTerm: string = '';
  filterStatus: string = 'all';

  entryForm!: FormGroup;
  isEditing: boolean = false;
  selectedEntry: BlacklistEntry | null = null;
  
  private subscription: Subscription | undefined;
  private isDataLoaded: boolean = false;

  constructor(private fb: FormBuilder, private blacklistService: BlacklistService) {}

  ngOnInit(): void {
    this.initForm();
    this.fetchBlacklist();
  }
  
  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private initForm(): void {
    this.entryForm = this.fb.group({
      license_plate: ['', [Validators.required, Validators.pattern('[A-Z0-9\\-\\.]+')]],
      vehicle_type: ['', Validators.required],
      ban_level: ['Warning', Validators.required],
      notes: [''],
      ban_start_date: [new Date().toISOString().split('T')[0], Validators.required],
      ban_expiry: [null]
    });
  }

  private fetchBlacklist(): void {
    // Only fetch if we haven't loaded data yet (first load or after CRUD operations)
    if (!this.isDataLoaded) {
      this.subscription = this.blacklistService.getBlacklists().subscribe({
        next: (entries) => {
          this.blacklistEntries = entries.map(entry => ({
            ...entry,
            ban_start_date: new Date(entry.ban_start_date),
            ban_expiry: entry.ban_expiry ? new Date(entry.ban_expiry) : null,
            updated_at: entry.updated_at ? new Date(entry.updated_at) : undefined
          }));
          this.isDataLoaded = true;
          this.applyFilters(); // Use applyFilters to set filteredEntries
        },
        error: (error) => {
          console.error('Error fetching blacklist:', error);
          this.isDataLoaded = false;
        }
      });
    }
  }

  searchEntries(event: Event): void {
    this.searchTerm = (event.target as HTMLInputElement).value.toLowerCase();
    this.applyFilters();
  }

  filterByStatus(status: string): void {
    this.filterStatus = status;
    this.applyFilters();
  }

  private applyFilters(): void {
    this.filteredEntries = this.blacklistEntries.filter(entry => {
      const matchesSearch = entry.license_plate.toLowerCase().includes(this.searchTerm) ||
                           entry.vehicle_type.toLowerCase().includes(this.searchTerm) ||
                           (entry.notes || '').toLowerCase().includes(this.searchTerm);
      const matchesStatus = this.filterStatus === 'all' || entry.ban_level.toLowerCase() === this.filterStatus;
      return matchesSearch && matchesStatus;
    });
  }

  editEntry(entry: BlacklistEntry): void {
    this.isEditing = true;
    this.selectedEntry = entry;
    this.entryForm.patchValue({
      license_plate: entry.license_plate,
      vehicle_type: entry.vehicle_type,
      ban_level: entry.ban_level,
      notes: entry.notes,
      ban_start_date: this.formatDateForInput(entry.ban_start_date),
      ban_expiry: entry.ban_expiry ? this.formatDateForInput(entry.ban_expiry) : null
    });
  }

  submitForm(): void {
    if (this.entryForm.invalid) return;

    const formValues = this.entryForm.value;
    const entry: BlacklistEntry = {
      license_plate: formValues.license_plate,
      vehicle_type: formValues.vehicle_type,
      ban_level: formValues.ban_level,
      notes: formValues.notes,
      ban_start_date: new Date(formValues.ban_start_date),
      ban_expiry: formValues.ban_expiry ? new Date(formValues.ban_expiry) : null
    };

    if (this.isEditing && this.selectedEntry) {
      // Update existing entry
      this.blacklistService.updateBlacklist(this.selectedEntry.blacklist_id!, entry).subscribe({
        next: () => {
          this.isDataLoaded = false; // Mark data as stale
          this.fetchBlacklist();
          this.resetForm();
        },
        error: (error) => {
          console.error('Error updating blacklist:', error);
        }
      });
    } else {
      // Create new entry
      this.blacklistService.createBlacklist(entry).subscribe({
        next: () => {
          this.isDataLoaded = false; // Mark data as stale
          this.fetchBlacklist();
          this.resetForm();
        },
        error: (error) => {
          console.error('Error creating blacklist:', error);
        }
      });
    }
  }

  resetForm(): void {
    this.entryForm.reset({
      license_plate: '',
      vehicle_type: '',
      ban_level: 'Warning',
      notes: '',
      ban_start_date: new Date().toISOString().split('T')[0],
      ban_expiry: null
    });
    this.isEditing = false;
    this.selectedEntry = null;
  }

  deleteEntry(entry: BlacklistEntry): void {
    if (confirm(`Are you sure you want to delete entry for ${entry.license_plate}?`)) {
      this.blacklistService.deleteBlacklist(entry.blacklist_id!).subscribe({
        next: () => {
          this.isDataLoaded = false; // Mark data as stale
          this.fetchBlacklist();
        },
        error: (error) => {
          console.error('Error deleting blacklist:', error);
        }
      });
    }
  }

  getBanLevelClass(level: string): string {
    switch(level.toLowerCase()) {
      case 'warning': return 'warning';
      case 'ban': return 'denied';
      default: return '';
    }
  }

  formatDate(date: Date | null): string {
    if (!date) return 'Never';
    return date.toLocaleDateString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh', 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  }

  formatDateForInput(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  isExpired(date: Date | null): boolean {
    if (!date) return false;
    return date < new Date();
  }
}