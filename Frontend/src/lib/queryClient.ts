import { QueryClient } from '@tanstack/react-query';
import { isApiError } from './api';

/** One client for the whole app, so plain action functions can invalidate queries after a write. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // 4xx answers won't change on retry
      retry: (count, error) => count < 2 && !(isApiError(error) && error.status >= 400 && error.status < 500),
    },
  },
});
