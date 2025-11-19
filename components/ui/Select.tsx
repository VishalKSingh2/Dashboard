'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectProps {
  options: string[];
  label?: string;
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  className?: string;
}

export default function Select({
  options,
  label,
  value,
  onChange,
  className,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(value || options[0]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) setSelectedValue(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (option: string) => {
    setSelectedValue(option);
    setIsOpen(false);
    if (onChange) {
      onChange({ target: { value: option } });
    }
  };

  const getDisplayValue = (option: string) => {
    return option === 'all' ? `All ${label || 'Options'}` : option;
  };

  return (
    <div className="flex flex-col gap-1.5" ref={dropdownRef}>
      {label && (
        <label className="text-sm font-semibold text-gray-700">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-lg bg-white text-gray-900',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
            'hover:border-gray-400 hover:bg-gray-50',
            'cursor-pointer transition-all duration-200',
            'font-medium text-sm text-left',
            'shadow-sm',
            isOpen && 'ring-2 ring-blue-500 border-blue-500',
            className
          )}
        >
          {getDisplayValue(selectedValue)}
        </button>
        <ChevronDown 
          className={cn(
            'absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500 pointer-events-none transition-transform duration-200',
            isOpen && 'rotate-180'
          )} 
        />
        
        {isOpen && (
          <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="max-h-60 overflow-y-auto py-1">
              {options.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={cn(
                    'w-full px-4 py-2.5 text-left text-sm transition-colors duration-150',
                    'hover:bg-blue-50 hover:text-blue-700',
                    'flex items-center justify-between',
                    selectedValue === option
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-gray-700 font-medium'
                  )}
                >
                  <span>{getDisplayValue(option)}</span>
                  {selectedValue === option && (
                    <Check className="h-4 w-4 text-blue-600" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
