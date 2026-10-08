import './styles/global.css';

import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { ApiError } from './lib/api/client';
import { queryKeys } from './lib/api/query-keys';
import { unsavedChanges } from './lib/unsaved-changes';
import { router } from './router';

const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The pages decide when to ask again; a CV being edited is never
      // replaced under the user because a window regained focus.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
    },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      // The session ended on the server: show the sign-in page. Not while there
      // are unsaved edits, which leaving the page would destroy; the editor
      // tells the user what happened instead.
      if (error instanceof ApiError && error.status === 401 && !unsavedChanges.present) {
        queryClient.setQueryData(queryKeys.session, null);
      }
    },
  }),
});

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}
