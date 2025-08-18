import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  standalone: true,
  imports: [CommonModule, MatIconModule, ReactiveFormsModule]
})
export class SettingsComponent implements OnInit {
  activeTab: string = 'general';
  
  generalSettingsForm!: FormGroup;
  notificationSettingsForm!: FormGroup;
  databaseSettingsForm!: FormGroup;
  cameraSettingsForm!: FormGroup;
  
  notificationTypes = [
    { id: 'email', label: 'Email Notifications' },
    { id: 'push', label: 'Push Notifications' },
    { id: 'sms', label: 'SMS Notifications' }
  ];
  
  backupFrequencies = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' }
  ];
  
  constructor(private fb: FormBuilder) { }

  ngOnInit(): void {
    this.initForms();
  }
  
  initForms(): void {
    // General Settings Form
    this.generalSettingsForm = this.fb.group({
      siteName: ['Vehicle Monitor', Validators.required],
      language: ['en', Validators.required],
      timeZone: ['UTC+7', Validators.required],
      dateFormat: ['MM/DD/YYYY', Validators.required]
    });
    
    // Notification Settings Form
    this.notificationSettingsForm = this.fb.group({
      emailNotifications: [true],
      pushNotifications: [false],
      smsNotifications: [false],
      alertOnUnknownVehicle: [true],
      alertOnSystemIssues: [true],
      notificationEmail: ['admin@example.com', [Validators.email]]
    });
    
    // Database Settings Form
    this.databaseSettingsForm = this.fb.group({
      backupEnabled: [true],
      backupFrequency: ['weekly'],
      retentionPeriod: [30, [Validators.required, Validators.min(1)]],
      backupLocation: ['cloud-storage', Validators.required]
    });
    
    // Camera Settings Form
    this.cameraSettingsForm = this.fb.group({
      defaultRecordingQuality: ['720p'],
      motionDetection: [true],
      recordingRetention: [14, [Validators.required, Validators.min(1)]],
      nightMode: [true]
    });
  }
  
  setActiveTab(tab: string): void {
    this.activeTab = tab;
  }
  
  saveSettings(formType: string): void {
    let formValue;
    
    switch(formType) {
      case 'general':
        formValue = this.generalSettingsForm.value;
        break;
      case 'notifications':
        formValue = this.notificationSettingsForm.value;
        break;
      case 'database':
        formValue = this.databaseSettingsForm.value;
        break;
      case 'camera':
        formValue = this.cameraSettingsForm.value;
        break;
      default:
        return;
    }
    
    // In a real app, this would save to Firebase
    console.log(`Saving ${formType} settings:`, formValue);
    alert(`${formType.charAt(0).toUpperCase() + formType.slice(1)} settings saved successfully!`);
  }
  
  runDatabaseBackup(): void {
    // In a real app, this would trigger a database backup
    console.log('Manual database backup initiated');
    alert('Database backup started. You will be notified when it completes.');
  }
  
  resetSettings(formType: string): void {
    switch(formType) {
      case 'general':
        this.generalSettingsForm.reset({
          siteName: 'Vehicle Monitor',
          language: 'en',
          timeZone: 'UTC+7',
          dateFormat: 'MM/DD/YYYY'
        });
        break;
      case 'notifications':
        this.notificationSettingsForm.reset({
          emailNotifications: true,
          pushNotifications: false,
          smsNotifications: false,
          alertOnUnknownVehicle: true,
          alertOnSystemIssues: true,
          notificationEmail: 'admin@example.com'
        });
        break;
      case 'database':
        this.databaseSettingsForm.reset({
          backupEnabled: true,
          backupFrequency: 'weekly',
          retentionPeriod: 30,
          backupLocation: 'cloud-storage'
        });
        break;
      case 'camera':
        this.cameraSettingsForm.reset({
          defaultRecordingQuality: '720p',
          motionDetection: true,
          recordingRetention: 14,
          nightMode: true
        });
        break;
    }
  }
}
