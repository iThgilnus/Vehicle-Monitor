import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormControl, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidatorFn } from '@angular/forms';
import { VehicleService } from '../../services/vehicle.service';
import { Subscription } from 'rxjs';
// Add imports for export libraries
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface Report {
  report_id: string;
  report_type: string;
  date_range: { start: Date; end: Date };
  vehicle_count: number;
  entry_count: number;
  details: { vehicle_type: string; count: number }[];
  created_at: Date;
  
  // Enhanced data points
  vehicleTypeDistribution: { type: string; count: number; percentage: number }[];
  statusDistribution: { status: string; count: number; percentage: number }[];
  averageParkingDuration: number; // in hours
  peakHours: { hour: number; count: number }[];
  parkingOccupancyRate: number; // percentage
  locationDistribution: { location: string; count: number; percentage: number }[];
  dailyActivity: { date: string; entries: number; exits: number }[];
}

@Component({
  selector: 'app-reports',
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.scss'],
  standalone: true,
  imports: [CommonModule, MatIconModule, ReactiveFormsModule],
  providers: [DatePipe]
})
export class ReportsComponent implements OnInit, OnDestroy {
  // Add Math property to make it available in template
  Math = Math;
  
  vehicles: any[] = [];
  reports: Report[] = [];
  selectedReport: Report | null = null;
  isLoading: boolean = false;
  
  // Cache for generated reports to avoid recalculation
  private reportsCache: Map<string, Report> = new Map();
  private subscription: Subscription | undefined;

  reportTypes = [
    { id: 'daily', label: 'Daily Report', icon: 'today' },
    { id: 'weekly', label: 'Weekly Report', icon: 'view_week' },
    { id: 'monthly', label: 'Monthly Report', icon: 'calendar_month' },
    { id: 'custom', label: 'Custom Range', icon: 'date_range' }
  ];

  selectedReportType = 'daily';

  dateRangeForm = new FormGroup({
    startDate: new FormControl<Date | null>(null, Validators.required),
    endDate: new FormControl<Date | null>(null, Validators.required)
  }, { validators: this.dateRangeValidator() });

  // Add ViewChild to access the report container for PDF export
  @ViewChild('reportContainer') reportContainer!: ElementRef;

  constructor(private vehicleService: VehicleService, private datePipe: DatePipe) { }

  ngOnInit(): void {
    this.fetchVehicles();
  }
  
  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private fetchVehicles(): void {
    this.isLoading = true;
    this.subscription = this.vehicleService.getVehicles().subscribe({
      next: (data) => {
        this.vehicles = data;
        this.generateReports();
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching vehicles:', error);
        this.isLoading = false;
      }
    });
  }

  private generateReports(): void {
    // Replace hardcoded date with current date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let start: Date, end: Date;
    let reportKey: string;

    if (this.selectedReportType === 'daily') {
      end = new Date(today);
      end.setHours(23, 59, 59, 999);
      start = today;
      reportKey = `daily-${this.formatDateKey(start)}`;
      
      // Check if report is in cache
      if (this.reportsCache.has(reportKey)) {
        this.reports = [this.reportsCache.get(reportKey)!];
      } else {
        const report = this.generateReportForRange('Daily', start, end);
        this.reportsCache.set(reportKey, report);
        this.reports = [report];
      }
    } else if (this.selectedReportType === 'weekly') {
      start = new Date(today);
      start.setDate(today.getDate() - 6);
      end = new Date(today);
      end.setHours(23, 59, 59, 999);
      reportKey = `weekly-${this.formatDateKey(start)}-${this.formatDateKey(end)}`;
      
      // Check if report is in cache
      if (this.reportsCache.has(reportKey)) {
        this.reports = [this.reportsCache.get(reportKey)!];
      } else {
        const report = this.generateReportForRange('Weekly', start, end);
        this.reportsCache.set(reportKey, report);
        this.reports = [report];
      }
    } else if (this.selectedReportType === 'monthly') {
      start = new Date(today);
      start.setDate(today.getDate() - 29);
      end = new Date(today);
      end.setHours(23, 59, 59, 999);
      reportKey = `monthly-${this.formatDateKey(start)}-${this.formatDateKey(end)}`;
      
      // Check if report is in cache
      if (this.reportsCache.has(reportKey)) {
        this.reports = [this.reportsCache.get(reportKey)!];
      } else {
        const report = this.generateReportForRange('Monthly', start, end);
        this.reportsCache.set(reportKey, report);
        this.reports = [report];
      }
    }

    this.selectedReport = this.reports[0] || null;
  }

  private generateReportForRange(reportType: string, start: Date, end: Date): Report {
    // Filter vehicles relevant for this date range
    const relevantVehicles = this.vehicles.filter(vehicle => {
      const entryTime = new Date(vehicle.entry_time);
      return entryTime >= start && entryTime <= end;
    });

    // Calculate vehicle type distribution
    const vehicleTypeDistribution = this.calculateVehicleTypeDistribution(relevantVehicles);
    
    // Convert vehicleTypeDistribution to the format expected by details
    const details = vehicleTypeDistribution.map(item => ({
      vehicle_type: item.type,
      count: item.count
    }));

    // Calculate status distribution
    const statusDistribution = this.calculateStatusDistribution(relevantVehicles);

    // Calculate location distribution
    const locationDistribution = this.calculateLocationDistribution(relevantVehicles);

    // Calculate average parking duration for vehicles that have exited
    const averageParkingDuration = this.calculateAverageParkingDuration(relevantVehicles);

    // Calculate peak entry hours
    const peakHours = this.calculatePeakHours(relevantVehicles);

    // Calculate daily activity (entries and exits per day)
    const dailyActivity = this.calculateDailyActivity(relevantVehicles, start, end);

    // Calculate parking occupancy rate (currently inside / total)
    const parkingOccupancyRate = this.calculateOccupancyRate(relevantVehicles);

    return {
      report_id: `REP-${reportType.toUpperCase()}-${this.datePipe.transform(start, 'yyyyMMdd')}`,
      report_type: reportType,
      date_range: { start, end },
      vehicle_count: relevantVehicles.length,
      entry_count: relevantVehicles.length,
      details, // Use the converted format that matches the expected type
      created_at: new Date(),
      
      // Enhanced data
      vehicleTypeDistribution,
      statusDistribution,
      averageParkingDuration,
      peakHours,
      parkingOccupancyRate,
      locationDistribution,
      dailyActivity
    };
  }

  private calculateVehicleTypeDistribution(vehicles: any[]): { type: string; count: number; percentage: number }[] {
    const typeCounts: Record<string, number> = {};
    const totalVehicles = vehicles.length;
    
    // Count vehicles by type
    vehicles.forEach(vehicle => {
      const type = vehicle.vehicle_type || 'Unknown';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    
    // Convert to array with percentages
    return Object.entries(typeCounts).map(([type, count]) => ({
      type,
      count,
      percentage: totalVehicles > 0 ? (count / totalVehicles) * 100 : 0
    }));
  }

  private calculateStatusDistribution(vehicles: any[]): { status: string; count: number; percentage: number }[] {
    const statusCounts: Record<string, number> = {};
    const totalVehicles = vehicles.length;
    
    // Count vehicles by status
    vehicles.forEach(vehicle => {
      const status = vehicle.status || 'Unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    // Convert to array with percentages
    return Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
      percentage: totalVehicles > 0 ? (count / totalVehicles) * 100 : 0
    }));
  }

  private calculateLocationDistribution(vehicles: any[]): { location: string; count: number; percentage: number }[] {
    const locationCounts: Record<string, number> = {};
    const totalVehicles = vehicles.length;
    
    // Count vehicles by location
    vehicles.forEach(vehicle => {
      const location = vehicle.location || 'Unknown';
      locationCounts[location] = (locationCounts[location] || 0) + 1;
    });
    
    // Convert to array with percentages
    return Object.entries(locationCounts).map(([location, count]) => ({
      location,
      count,
      percentage: totalVehicles > 0 ? (count / totalVehicles) * 100 : 0
    }));
  }

  private calculateAverageParkingDuration(vehicles: any[]): number {
    const vehiclesWithExitTime = vehicles.filter(v => v.exit_time && v.entry_time);
    
    if (vehiclesWithExitTime.length === 0) {
      return 0;
    }
    
    const totalDurationHours = vehiclesWithExitTime.reduce((total, vehicle) => {
      const entryTime = new Date(vehicle.entry_time).getTime();
      const exitTime = new Date(vehicle.exit_time).getTime();
      const durationHours = (exitTime - entryTime) / (1000 * 60 * 60); // Convert ms to hours
      return total + durationHours;
    }, 0);
    
    return totalDurationHours / vehiclesWithExitTime.length;
  }

  private calculatePeakHours(vehicles: any[]): { hour: number; count: number }[] {
    const hourCounts: Record<number, number> = {};
    
    // Count entries by hour of day
    vehicles.forEach(vehicle => {
      const entryHour = new Date(vehicle.entry_time).getHours();
      hourCounts[entryHour] = (hourCounts[entryHour] || 0) + 1;
    });
    
    // Convert to array and sort by hour
    return Object.entries(hourCounts)
      .map(([hour, count]) => ({ hour: parseInt(hour), count }))
      .sort((a, b) => a.hour - b.hour);
  }

  private calculateDailyActivity(vehicles: any[], start: Date, end: Date): { date: string; entries: number; exits: number }[] {
    const dailyActivity: Record<string, { entries: number; exits: number }> = {};
    
    // Initialize all dates in the range
    const currentDate = new Date(start);
    while (currentDate <= end) {
      const dateStr = this.formatDateKey(currentDate);
      dailyActivity[dateStr] = { entries: 0, exits: 0 };
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Count entries and exits by date
    vehicles.forEach(vehicle => {
      const entryDate = this.formatDateKey(new Date(vehicle.entry_time));
      if (dailyActivity[entryDate]) {
        dailyActivity[entryDate].entries++;
      }
      
      if (vehicle.exit_time) {
        const exitDate = this.formatDateKey(new Date(vehicle.exit_time));
        if (dailyActivity[exitDate]) {
          dailyActivity[exitDate].exits++;
        }
      }
    });
    
    // Convert to array
    return Object.entries(dailyActivity).map(([date, data]) => ({
      date,
      entries: data.entries,
      exits: data.exits
    }));
  }

  private calculateOccupancyRate(vehicles: any[]): number {
    const insideVehicles = vehicles.filter(v => v.status === 'Inside').length;
    return vehicles.length > 0 ? (insideVehicles / vehicles.length) * 100 : 0;
  }

  private formatDateKey(date: Date): string {
    return this.datePipe.transform(date, 'yyyy-MM-dd') || '';
  }

  private aggregateDetails(vehicles: any[]): { vehicle_type: string; count: number }[] {
    const aggregated: { [key: string]: number } = {};
    vehicles.forEach(vehicle => {
      const type = vehicle.vehicle_type || 'Unknown';
      aggregated[type] = (aggregated[type] || 0) + 1;
    });
    return Object.entries(aggregated).map(([vehicle_type, count]) => ({ vehicle_type, count }));
  }

  changeReportType(reportType: string): void {
    this.selectedReportType = reportType;
    if (reportType !== 'custom') {
      this.generateReports();
    }
  }

  generateReport(): void {
    if (this.dateRangeForm.invalid) {
      return;
    }

    const startDate = this.dateRangeForm.value.startDate!;
    const endDate = this.dateRangeForm.value.endDate!;

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    // Create a cache key for this custom report
    const reportKey = `custom-${this.formatDateKey(start)}-${this.formatDateKey(end)}`;
    
    // Check if report is already in cache
    if (this.reportsCache.has(reportKey)) {
      this.reports = [this.reportsCache.get(reportKey)!];
    } else {
      const customReport = this.generateReportForRange('Custom', start, end);
      this.reportsCache.set(reportKey, customReport);
      this.reports = [customReport];
    }
    
    this.selectedReport = this.reports[0];
  }

  // Validator for date range
  private dateRangeValidator(): ValidatorFn {
    return (control: AbstractControl): { [key: string]: any } | null => {
      const startDate = control.get('startDate')?.value;
      const endDate = control.get('endDate')?.value;
      if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        return { invalidRange: true };
      }
      return null;
    };
  }

  exportReport(format: string): void {
    if (!this.selectedReport) return;
    
    if (format === 'pdf') {
      this.exportToPdf();
    } else if (format === 'excel') {
      this.exportToExcel();
    }
  }

  // PDF Export Method - with improved formatting
  private exportToPdf(): void {
    if (!this.selectedReport || !this.reportContainer) return;
    
    // Show loading indicator
    alert('Generating PDF report. This may take a moment...');
    
    // Store the selected report in a local variable to satisfy TypeScript
    const report = this.selectedReport;
    
    const reportElement = this.reportContainer.nativeElement;
    const reportTitle = `${report.report_type}_Report_${this.formatDateKey(report.date_range.start)}`;
    
    // Set PDF options with higher quality
    const options = {
      backgroundColor: '#1a1f2c',
      scale: 2, // Higher scale for better quality
      useCORS: true,
      logging: false,
      allowTaint: true,
      height: reportElement.scrollHeight,
      width: reportElement.scrollWidth,
      windowWidth: reportElement.scrollWidth
    };
    
    // Generate a canvas of the entire report content
    html2canvas(reportElement, options).then(canvas => {
      // Calculate dimensions
      const imgWidth = 210; // A4 width in mm (portrait)
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      // Create PDF document
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      // Add report title and header
      pdf.setFillColor(30, 41, 59); // Dark blue header
      pdf.rect(0, 0, pdf.internal.pageSize.width, 25, 'F');
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.text(reportTitle, pdf.internal.pageSize.width / 2, 10, { align: 'center' });
      
      pdf.setFontSize(10);
      // Add null check for date_range properties
      const startDate = report.date_range?.start;
      const endDate = report.date_range?.end;
      const dateRangeText = startDate && endDate ? 
        `${this.formatDate(startDate)} - ${this.formatDate(endDate)}` : 
        'Date range not specified';
      
      pdf.text(dateRangeText, pdf.internal.pageSize.width / 2, 16, { align: 'center' });
      
      // Add footer to each page
      const addFooter = (pageNumber: number, totalPages: number) => {
        pdf.setFillColor(30, 41, 59); // Dark blue footer
        pdf.rect(0, pageHeight - 10, pdf.internal.pageSize.width, 10, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(8);
        pdf.text(`Vehicle Monitoring System - Generated on ${new Date().toLocaleString()}`, 10, pageHeight - 4);
        pdf.text(`Page ${pageNumber} of ${totalPages}`, pdf.internal.pageSize.width - 10, pageHeight - 4, { align: 'right' });
      };
      
      // Add first page image
      let position = 30; // Start below the header
      pdf.addImage(
        canvas.toDataURL('image/jpeg', 0.95), // Using JPEG for smaller file size
        'JPEG',
        10, // left margin
        position, // top margin
        imgWidth - 20, // width with margins
        imgHeight - 30 // height adjusted for header/footer
      );
      
      // Calculate the number of pages needed
      const totalPages = Math.ceil(imgHeight / (pageHeight - 40)); // Adjust height for header/footer
      
      addFooter(1, totalPages);
      
      // Add additional pages if content overflows
      if (totalPages > 1) {
        let currentPosition = 0;
        
        for (let i = 1; i < totalPages; i++) {
          pdf.addPage();
          
          // Add header to new page
          pdf.setFillColor(30, 41, 59);
          pdf.rect(0, 0, pdf.internal.pageSize.width, 25, 'F');
          
          pdf.setTextColor(255, 255, 255);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(16);
          pdf.text(reportTitle, pdf.internal.pageSize.width / 2, 10, { align: 'center' });
          
          pdf.setFontSize(10);
          pdf.text(dateRangeText, pdf.internal.pageSize.width / 2, 16, { align: 'center' });
          
          // Calculate position for the continuation of the image
          currentPosition = -((pageHeight - 40) * i - 30);
          
          // Add image continuation
          pdf.addImage(
            canvas.toDataURL('image/jpeg', 0.95),
            'JPEG',
            10,
            currentPosition,
            imgWidth - 20,
            imgHeight - 30
          );
          
          addFooter(i + 1, totalPages);
        }
      }
      
      // Save the PDF
      pdf.save(`${reportTitle}.pdf`);
    });
  }

  // Excel Export Method
  private exportToExcel(): void {
    if (!this.selectedReport) return;
    
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Vehicle Monitoring System';
    workbook.lastModifiedBy = 'Vehicle Monitoring System';
    workbook.created = new Date();
    workbook.modified = new Date();
    
    const reportTitle = `${this.selectedReport.report_type}_Report_${this.formatDateKey(this.selectedReport.date_range.start)}`;
    
    // Create multiple worksheets for better organization
    const summarySheet = workbook.addWorksheet('Summary');
    const vehicleTypesSheet = workbook.addWorksheet('Vehicle Types');
    const statusSheet = workbook.addWorksheet('Status Distribution');
    const peakHoursSheet = workbook.addWorksheet('Peak Hours');
    const locationsSheet = workbook.addWorksheet('Locations');
    const dailyActivitySheet = workbook.addWorksheet('Daily Activity');
    
    // ===== SUMMARY SHEET =====
    this.formatSheetHeader(summarySheet, `${this.selectedReport.report_type} Vehicle Report Summary`, 
      `Date Range: ${this.formatDate(this.selectedReport.date_range?.start)} - ${this.formatDate(this.selectedReport.date_range?.end)}`);
    
    // Add key metrics summary with better formatting
    summarySheet.addRow([]);
    summarySheet.addRow(['Key Metrics']);
    if (summarySheet.lastRow) {
      summarySheet.lastRow.font = { bold: true, size: 14 };
      summarySheet.lastRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '4472C4' }
      };
      summarySheet.lastRow.alignment = { horizontal: 'center' };
      summarySheet.lastRow.font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
    }
    
    // Create a 2x4 grid for metrics
    const metrics = [
      ['Total Vehicles', this.selectedReport.vehicle_count],
      ['Occupancy Rate', this.formatPercentage(this.selectedReport.parkingOccupancyRate)],
      ['Avg. Stay Duration', this.formatHours(this.selectedReport.averageParkingDuration)],
      ['Currently Inside', this.getStatusCount('Inside')]
    ];
    
    metrics.forEach(metric => {
      summarySheet.addRow([metric[0], metric[1]]);
      if (summarySheet.lastRow) {
        summarySheet.lastRow.getCell(1).font = { bold: true };
        summarySheet.lastRow.getCell(2).alignment = { horizontal: 'right' };
      }
    });
    
    // Add quick overview of distributions
    summarySheet.addRow([]);
    summarySheet.addRow(['Distribution Overview']);
    if (summarySheet.lastRow) {
      summarySheet.lastRow.font = { bold: true, size: 14 };
      summarySheet.lastRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '4472C4' }
      };
      summarySheet.lastRow.alignment = { horizontal: 'center' };
      summarySheet.lastRow.font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
    }
    
    summarySheet.addRow(['See detailed breakdowns in the respective worksheets']);
    
    // ===== VEHICLE TYPES SHEET =====
    this.formatSheetHeader(vehicleTypesSheet, 'Vehicle Type Distribution', 
      `Total vehicles: ${this.selectedReport.vehicle_count}`);
    
    // Add vehicle type data
    vehicleTypesSheet.addRow(['Vehicle Type', 'Count', 'Percentage']);
    if (vehicleTypesSheet.lastRow) {
      this.formatHeaderRow(vehicleTypesSheet.lastRow);
    }
    
    this.selectedReport.vehicleTypeDistribution.forEach(item => {
      vehicleTypesSheet.addRow([item.type, item.count, this.formatPercentage(item.percentage)]);
    });
    
    // Add total row
    vehicleTypesSheet.addRow(['Total', this.selectedReport.vehicle_count, '100%']);
    if (vehicleTypesSheet.lastRow) {
      vehicleTypesSheet.lastRow.font = { bold: true };
      vehicleTypesSheet.lastRow.border = {
        top: { style: 'thin' }
      };
    }
    
    // ===== STATUS SHEET =====
    this.formatSheetHeader(statusSheet, 'Vehicle Status Distribution', 
      `Report period: ${this.formatDate(this.selectedReport.date_range?.start)} - ${this.formatDate(this.selectedReport.date_range?.end)}`);
    
    // Add status data
    statusSheet.addRow(['Status', 'Count', 'Percentage']);
    if (statusSheet.lastRow) {
      this.formatHeaderRow(statusSheet.lastRow);
    }
    
    this.selectedReport.statusDistribution.forEach(item => {
      statusSheet.addRow([item.status, item.count, this.formatPercentage(item.percentage)]);
    });
    
    // Add total row
    statusSheet.addRow(['Total', this.selectedReport.vehicle_count, '100%']);
    if (statusSheet.lastRow) {
      statusSheet.lastRow.font = { bold: true };
      statusSheet.lastRow.border = {
        top: { style: 'thin' }
      };
    }
    
    // ===== PEAK HOURS SHEET =====
    this.formatSheetHeader(peakHoursSheet, 'Peak Entry Hours', 
      `Entry data from ${this.formatDate(this.selectedReport.date_range?.start)} to ${this.formatDate(this.selectedReport.date_range?.end)}`);
    
    // Add peak hours data
    peakHoursSheet.addRow(['Hour', 'Count', 'Percentage']);
    if (peakHoursSheet.lastRow) {
      this.formatHeaderRow(peakHoursSheet.lastRow);
    }
    
    // Calculate percentages for peak hours
    const peakHoursTotalEntries = this.selectedReport.peakHours.reduce((sum, hour) => sum + hour.count, 0);
    
    this.selectedReport.peakHours.forEach(item => {
      const percentage = peakHoursTotalEntries > 0 ? (item.count / peakHoursTotalEntries) * 100 : 0;
      peakHoursSheet.addRow([`${item.hour}:00`, item.count, this.formatPercentage(percentage)]);
    });
    
    // Add total row
    peakHoursSheet.addRow(['Total', peakHoursTotalEntries, '100%']);
    if (peakHoursSheet.lastRow) {
      peakHoursSheet.lastRow.font = { bold: true };
      peakHoursSheet.lastRow.border = {
        top: { style: 'thin' }
      };
    }
    
    // ===== LOCATIONS SHEET =====
    this.formatSheetHeader(locationsSheet, 'Parking Locations', 
      `Data from ${this.formatDate(this.selectedReport.date_range?.start)} to ${this.formatDate(this.selectedReport.date_range?.end)}`);
    
    // Add location data
    locationsSheet.addRow(['Location', 'Vehicle Count', 'Percentage']);
    if (locationsSheet.lastRow) {
      this.formatHeaderRow(locationsSheet.lastRow);
    }
    
    this.selectedReport.locationDistribution.forEach(item => {
      locationsSheet.addRow([item.location, item.count, this.formatPercentage(item.percentage)]);
    });
    
    // Add total row
    locationsSheet.addRow(['Total', this.selectedReport.vehicle_count, '100%']);
    if (locationsSheet.lastRow) {
      locationsSheet.lastRow.font = { bold: true };
      locationsSheet.lastRow.border = {
        top: { style: 'thin' }
      };
    }
    
    // ===== DAILY ACTIVITY SHEET =====
    this.formatSheetHeader(dailyActivitySheet, 'Daily Activity', 
      `Data from ${this.formatDate(this.selectedReport.date_range?.start)} to ${this.formatDate(this.selectedReport.date_range?.end)}`);
    
    // Add daily activity data
    dailyActivitySheet.addRow(['Date', 'Entries', 'Exits']);
    if (dailyActivitySheet.lastRow) {
      this.formatHeaderRow(dailyActivitySheet.lastRow);
    }
    
    this.selectedReport.dailyActivity.forEach(item => {
      dailyActivitySheet.addRow([item.date, item.entries, item.exits]);
    });
    
    // Add total row - rename variable to avoid redeclaration error
    const dailyTotalEntries = this.selectedReport.dailyActivity.reduce((sum, day) => sum + day.entries, 0);
    const totalExits = this.selectedReport.dailyActivity.reduce((sum, day) => sum + day.exits, 0);
    dailyActivitySheet.addRow(['Total', dailyTotalEntries, totalExits]);
    if (dailyActivitySheet.lastRow) {
      dailyActivitySheet.lastRow.font = { bold: true };
      dailyActivitySheet.lastRow.border = {
        top: { style: 'thin' }
      };
    }
    
    // Auto-fit columns in all sheets
    [summarySheet, vehicleTypesSheet, statusSheet, peakHoursSheet, locationsSheet, dailyActivitySheet].forEach(sheet => {
      sheet.columns.forEach(column => {
        if (column.values) {
          const lengths = column.values
            .filter((v): v is string | number | boolean => v !== null && v !== undefined)
            .map(v => v.toString().length);
          const maxLength = lengths.length > 0 ? Math.max(...lengths, 10) : 10;
          column.width = maxLength + 3;
        }
      });
    });
    
    // Save the workbook
    workbook.xlsx.writeBuffer().then(buffer => {
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `${reportTitle}.xlsx`);
    });
  }

  // Helper methods for Excel formatting
  private formatSheetHeader(sheet: ExcelJS.Worksheet, title: string, subtitle: string): void {
    // Add title
    sheet.mergeCells('A1:F1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = title;
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center' };
    
    // Add subtitle
    sheet.mergeCells('A2:F2');
    const subtitleCell = sheet.getCell('A2');
    subtitleCell.value = subtitle;
    subtitleCell.font = { italic: true, size: 12 };
    subtitleCell.alignment = { horizontal: 'center' };
    
    sheet.addRow([]); // Add empty row for spacing
  }

  private formatHeaderRow(row: ExcelJS.Row): void {
    row.font = { bold: true };
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'E2EFDA' }
    };
    row.border = {
      bottom: { style: 'thin' }
    };
  }

  formatDate(date: Date | undefined | null): string {
    if (!date) return 'Not specified';
    return this.datePipe.transform(date, 'MMM d, y') || '';
  }

  formatNumber(value: number, decimal: number = 1): string {
    return value.toFixed(decimal);
  }

  formatHours(hours: number): string {
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    return `${wholeHours}h ${minutes}m`;
  }

  formatPercentage(value: number): string {
    return `${value.toFixed(1)}%`;
  }

  getChartColorForIndex(index: number): string {
    const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    return colors[index % colors.length];
  }

  // Helper method to get status count by status name
  getStatusCount(statusName: string): number {
    if (!this.selectedReport || !this.selectedReport.statusDistribution) return 0;
    
    const status = this.selectedReport.statusDistribution.find(s => s.status === statusName);
    return status ? status.count : 0;
  }

  // Helper method to calculate bar height percentage
  calculateBarHeight(count: number, items: {count: number}[]): number {
    if (!items || items.length === 0) return 0;
    const maxCount = Math.max(...items.map(h => h.count));
    return maxCount > 0 ? (count / maxCount) * 70 : 0;
  }

  // Add these new methods for pie chart calculations
  calculatePieSegment(index: number): { startAngle: number; endAngle: number } {
    if (!this.selectedReport || !this.selectedReport.vehicleTypeDistribution) {
      return { startAngle: 0, endAngle: 0 };
    }
    
    const distribution = this.selectedReport.vehicleTypeDistribution;
    let startAngle = 0;
    
    // Calculate the start angle by summing up all previous segments
    for (let i = 0; i < index; i++) {
      startAngle += (distribution[i].percentage / 100) * 360;
    }
    
    // The end angle is the start angle plus this segment's angle
    const endAngle = startAngle + (distribution[index].percentage / 100) * 360;
    
    return { startAngle, endAngle };
  }

  createPieSegmentPath(startAngle: number, endAngle: number): string {
    // Convert angles to radians
    const startRad = (startAngle - 90) * Math.PI / 180;
    const endRad = (endAngle - 90) * Math.PI / 180;
    
    // Calculate the points on the circle
    const startX = 50 + 50 * Math.cos(startRad);
    const startY = 50 + 50 * Math.sin(startRad);
    const endX = 50 + 50 * Math.cos(endRad);
    const endY = 50 + 50 * Math.sin(endRad);
    
    // Determine if the arc should be drawn the long way around
    const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
    
    // Create the SVG path
    return `M50,50 L${startX},${startY} A50,50 0 ${largeArcFlag},1 ${endX},${endY} Z`;
  }
}