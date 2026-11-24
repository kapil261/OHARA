import { useQuery } from '@tanstack/react-query';
import { api, isApiError, queries } from './api';
import type { MeResponse } from '../types';

/** The single source of truth for who the user is. Drives all routing in AppGate. */
export function useMe(enabled = true) {
  return useQuery({
    enabled,
    queryKey: queries.me,
    queryFn: () => api.get<MeResponse>('/me'),
    retry: (count, error) => count < 2 && !(isApiError(error) && error.status >= 400 && error.status < 500),
  });
}