'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardFilters } from '@/lib/types';
import EmailModal from './EmailModal';

interface AdvancedDownloadButtonProps {
  filters: DashboardFilters;
  disabled?: boolean;
}

export default function AdvancedDownloadButton({ filters, disabled }: AdvancedDownloadButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleButtonClick = () => {
    setIsModalOpen(true);
  };

  const handleSubmitEmail = async (email: string) => {
    setIsSubmitting(true);

    try {
      // Queue the report generation
      const response = await fetch('/api/queue-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          startDate: filters.startDate,
          endDate: filters.endDate,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to queue report');
      }

      const result = await response.json();

      // Close modal and show success message
      setIsModalOpen(false);
      
      // Show success notification
      alert(
        `✅ Report Queued Successfully!\n\n` +
        `Your advanced report is being generated.\n` +
        `You'll receive an email at ${email} with a download link when it's ready.\n\n` +
        `This usually takes a few minutes depending on the data size.\n\n` +
        `You can close this page - we'll email you when it's done!`
      );

      console.log('Report queued:', result);
    } catch (error) {
      console.error('Failed to queue report:', error);
      alert(
        '❌ Failed to Queue Report\n\n' +
        'There was an error queuing your report. Please try again.\n\n' +
        (error instanceof Error ? error.message : 'Unknown error')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={handleButtonClick}
        disabled={disabled || isSubmitting}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all',
          'bg-purple-600 text-white hover:bg-purple-700',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'shadow-sm hover:shadow-md',
          isSubmitting && 'animate-pulse'
        )}
        title="Generate advanced report - You'll receive an email when it's ready"
      >
        <Download className="w-4 h-4" />
        {isSubmitting ? 'Submitting...' : 'Advanced Report'}
      </button>

      <EmailModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmitEmail}
        isSubmitting={isSubmitting}
      />
    </>
  );
}
