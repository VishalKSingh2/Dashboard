import { InputHTMLAttributes } from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DatePickerProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export default function DatePicker({
  label,
  className,
  ...props
}: DatePickerProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type="date"
          className={cn(
            'w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg bg-white text-gray-900',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
            'cursor-pointer transition-colors',
            className
          )}
          {...props}
        />
        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
      </div>
    </div>
  );
}
