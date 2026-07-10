const BRANCH_COLORS = [
  'var(--branch-color-1, #3b82f6)',
  'var(--branch-color-2, #ef4444)',
  'var(--branch-color-3, #22c55e)',
  'var(--branch-color-4, #f59e0b)',
  'var(--branch-color-5, #8b5cf6)',
  'var(--branch-color-6, #06b6d4)',
  'var(--branch-color-7, #f97316)',
  'var(--branch-color-8, #ec4899)',
  'var(--branch-color-9, #14b8a6)',
  'var(--branch-color-10, #a855f7)',
];

export function getBranchColor(branchFirstSha: string): string {
  let hash = 0;
  for (let i = 0; i < branchFirstSha.length; i++) {
    const char = branchFirstSha.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  const index = Math.abs(hash) % BRANCH_COLORS.length;
  return BRANCH_COLORS[index];
}
