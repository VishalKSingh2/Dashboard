export function getDefaultStartDate(): string {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return firstDayOfMonth.toISOString().split('T')[0];
}

export function getDefaultEndDate(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}
