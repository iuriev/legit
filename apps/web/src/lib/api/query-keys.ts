/** The keys under which server data is cached. */
export const queryKeys = {
  session: ['session'] as const,
  cvs: ['cvs'] as const,
  cv: (id: string) => ['cvs', id] as const,
};
