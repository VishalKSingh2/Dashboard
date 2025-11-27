'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchableSelectProps {
  options: string[];
  label?: string;
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  className?: string;
  maxVisible?: number;
  placeholder?: string;
}

export default function SearchableSelect({
  options,
  label,
  value,
  onChange,
  className,
  maxVisible = 5,
  placeholder = 'Search...',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(value || options[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value) setSelectedValue(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSelect = (option: string) => {
    setSelectedValue(option);
    setIsOpen(false);
    setSearchTerm('');
    if (onChange) {
      onChange({ target: { value: option } });
    }
  };

  const getDisplayValue = (option: string) => {
    return option === 'all' ? `All ${label || 'Options'}` : option;
  };

  const filteredOptions = options.filter(option => {
    if (option === 'all') return true;
    return option.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const displayedOptions = searchTerm 
    ? filteredOptions 
    : filteredOptions.slice(0, maxVisible + 1); // +1 for "all" option

  const clearSearch = () => {
    setSearchTerm('');
    searchInputRef.current?.focus();
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
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
            'hover:border-gray-400 transition-all duration-200',
            'font-medium text-sm text-left',
            'shadow-sm',
            isOpen && 'ring-2 ring-blue-500 border-blue-500 bg-blue-50/30',
            className
          )}
        >
          <span className="block truncate">{getDisplayValue(selectedValue)}</span>
        </button>
        <ChevronDown 
          className={cn(
            'absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none transition-transform duration-300',
            isOpen && 'rotate-180 text-blue-600'
          )} 
        />
        
        {isOpen && (
          <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Search Bar */}
            <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={placeholder}
                  className="w-full pl-9 pr-9 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white placeholder:text-gray-400 transition-all"
                />
                {searchTerm && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Options List */}
            <div className="max-h-64 overflow-y-auto py-1.5 custom-scrollbar">
              {displayedOptions.length > 0 ? (
                displayedOptions.map((option, index) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleSelect(option)}
                    className={cn(
                      'w-full px-4 py-2.5 text-left text-sm transition-all duration-150',
                      'flex items-center justify-between group',
                      'hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 hover:pl-5',
                      selectedValue === option
                        ? 'bg-blue-50 text-blue-700 font-semibold border-l-4 border-blue-500 pl-3'
                        : 'text-gray-700 font-medium border-l-4 border-transparent',
                      index === 0 && 'border-b border-gray-100'
                    )}
                  >
                    <span className="truncate">{getDisplayValue(option)}</span>
                    {selectedValue === option && (
                      <Check className="h-4 w-4 text-blue-600 flex-shrink-0 ml-2" />
                    )}
                  </button>
                ))
              ) : (
                <div className="px-4 py-6 text-sm text-gray-500 text-center">
                  <Search className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  <p className="font-medium">No results found</p>
                  <p className="text-xs text-gray-400 mt-1">Try a different search term</p>
                </div>
              )}
            </div>

            {/* Footer Info */}
            {!searchTerm && filteredOptions.length > maxVisible + 1 && (
              <div className="px-4 py-2.5 text-xs bg-gradient-to-r from-gray-50 to-slate-50 border-t border-gray-200">
                <div className="flex items-center justify-between text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500"></div>
                    Showing <span className="font-semibold text-gray-700">{maxVisible}</span> of{' '}
                    <span className="font-semibold text-gray-700">{filteredOptions.length - 1}</span> customers
                  </span>
                  <span className="text-gray-500">↑ Search for more</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
}
