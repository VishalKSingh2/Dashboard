import { format } from 'date-fns';

export function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'MM-dd-yyyy');
}

export function formatHours(hours: number): string {
  return hours.toFixed(1);
}

export function getChangeType(percent: number): 'increase' | 'decrease' | 'stable' {
  if (percent > 0) return 'increase';
  if (percent < 0) return 'decrease';
  return 'stable';
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
