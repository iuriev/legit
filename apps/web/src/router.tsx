import { createBrowserRouter, Navigate } from 'react-router-dom';

import { SignInPage, SignUpPage } from './features/auth/pages';
import { RequireSession, VisitorsOnly } from './features/auth/session';
import { CvListPage } from './features/cvs/cv-list-page';
import { CvPage } from './features/cvs/cv-page';
import { NewCvPage } from './features/cvs/new-cv-page';

/**
 * The pages. Everything about a CV — progress, questions, the editor, a
 * failure — lives at one address and is drawn from what the server says, which
 * is what makes a reload or another device show the same thing.
 */
export const router = createBrowserRouter([
  {
    element: <VisitorsOnly />,
    children: [
      { path: '/sign-in', element: <SignInPage /> },
      { path: '/sign-up', element: <SignUpPage /> },
    ],
  },
  {
    element: <RequireSession />,
    children: [
      { path: '/', element: <CvListPage /> },
      { path: '/new', element: <NewCvPage /> },
      { path: '/cvs/:id', element: <CvPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
