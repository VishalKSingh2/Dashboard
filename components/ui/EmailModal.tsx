'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (email: string) => void;
  isSubmitting?: boolean;
}

export default function EmailModal({ isOpen, onClose, onSubmit, isSubmitting }: EmailModalProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setError('');
    onSubmit(email);
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setEmail('');
      setError('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 animate-in fade-in zoom-in duration-200">
        {/* Close button */}
        {!isSubmitting && (
          <button
            onClick={handleClose}
            className="absolute right-4 top-4 p-1 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        )}

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Advanced Report Generation
          </h2>
          <p className="text-sm text-gray-600">
            This report may take several minutes to generate. Enter your email address and we'll send you a download link when it's ready.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              placeholder="your.email@example.com"
              disabled={isSubmitting}
              className={cn(
                'w-full px-4 py-2.5 rounded-lg border transition-all',
                'focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500',
                'disabled:bg-gray-50 disabled:cursor-not-allowed',
                error ? 'border-red-300 bg-red-50' : 'border-gray-300'
              )}
            />
            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}
          </div>

          {/* Info box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex gap-2">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">What to expect:</p>
                <ul className="list-disc list-inside space-y-1 text-blue-700">
                  <li>Report generation starts immediately</li>
                  <li>You'll receive an email with a download link</li>
                  <li>The link will be valid for 24 hours</li>
                  <li>You can close this page after submitting</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className={cn(
                'flex-1 px-4 py-2.5 rounded-lg font-medium transition-all',
                'border border-gray-300 text-gray-700 hover:bg-gray-50',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                'flex-1 px-4 py-2.5 rounded-lg font-medium transition-all',
                'bg-purple-600 text-white hover:bg-purple-700',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'shadow-sm hover:shadow-md',
                isSubmitting && 'animate-pulse'
              )}
            >
              {isSubmitting ? 'Submitting...' : 'Generate Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
