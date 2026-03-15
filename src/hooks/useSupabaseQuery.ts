import { useState, useEffect, useCallback } from "react";

type QueryFn<T> = () => Promise<{ data: T | null; error: unknown }>;

interface QueryState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Generic hook for Supabase queries with loading/error states.
 * Re-fetches when `deps` change.
 */
export function useSupabaseQuery<T>(
  queryFn: QueryFn<T>,
  deps: unknown[] = []
) {
  const [state, setState] = useState<QueryState<T>>({
    data: null,
    isLoading: true,
    error: null,
  });

  const refetch = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const { data, error } = await queryFn();
      if (error) {
        setState({ data: null, isLoading: false, error: String(error) });
      } else {
        setState({ data, isLoading: false, error: null });
      }
    } catch (err) {
      setState({
        data: null,
        isLoading: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { ...state, refetch };
}
