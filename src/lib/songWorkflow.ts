import type { SongStatus } from '../types';

export const getSongSaveStatus = (selectedStatus: SongStatus, existingStatus: SongStatus | undefined, approvalRequired: boolean, isAdmin: boolean): SongStatus => {
  if (selectedStatus === 'draft') return 'draft';
  if (existingStatus === 'published') return 'published';
  return approvalRequired && !isAdmin ? 'pending_approval' : 'published';
};

export const getSongToggleStatus = (currentStatus: SongStatus, approvalRequired: boolean, isAdmin: boolean): SongStatus => {
  if (currentStatus === 'published' || currentStatus === 'pending_approval') return 'draft';
  return approvalRequired && !isAdmin ? 'pending_approval' : 'published';
};
