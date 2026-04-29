// Date utility functions
export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('ko-KR')
}
