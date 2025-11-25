'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardData, DashboardFilters } from '@/lib/types';
import { exportToExcel, exportToCSV } from '@/lib/exportUtils';

interface DownloadButtonProps {
  data: DashboardData;
  filters: DashboardFilters;
  disabled?: boolean;
}

export default function DownloadButton({ data, filters, disabled }: DownloadButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = async (format: 'excel' | 'csv') => {
    setIsExporting(true);
    setIsOpen(false);

    try {
      if (format === 'excel') {
        exportToExcel(data, filters);
      } else {
        exportToCSV(data, filters);
      }
      
      // Show success notification (you can enhance this with a toast library)
      setTimeout(() => {
        alert('Download complete!');
      }, 500);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || isExporting}
        className={cn(
          'flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200',
          'bg-green-600 text-white hover:bg-green-700',
          'focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'shadow-sm'
        )}
      >
        <Download className="h-4 w-4" />
        {isExporting ? 'Exporting...' : 'Download Report'}
        <ChevronDown className={cn(
          'h-4 w-4 transition-transform duration-200',
          isOpen && 'rotate-180'
        )} />
      </button>

      {isOpen && !isExporting && (
        <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="py-1">
            <button
              type="button"
              onClick={() => handleExport('excel')}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors duration-150 flex items-center gap-3"
            >
              <FileSpreadsheet className="h-5 w-5 text-green-600" />
              <div>
                <div className="font-medium text-gray-900">Excel (.xlsx)</div>
                <div className="text-xs text-gray-500">Complete report with multiple sheets</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleExport('csv')}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors duration-150 flex items-center gap-3 border-t border-gray-100"
            >
              <FileText className="h-5 w-5 text-blue-600" />
              <div>
                <div className="font-medium text-gray-900">CSV Files</div>
                <div className="text-xs text-gray-500">Multiple CSV files for data analysis</div>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
