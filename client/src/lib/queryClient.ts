import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

interface ApiOptions {
  endpoint: string;
  method: string;
  data?: unknown;
}

export async function apiRequest(options: ApiOptions): Promise<any>;
export async function apiRequest(method: string, url: string, data?: unknown): Promise<Response>;
export async function apiRequest(
  methodOrOptions: string | ApiOptions,
  url?: string,
  data?: unknown
): Promise<any> {
  let method: string;
  let endpoint: string;
  let body: unknown | undefined;

  // Handle both call patterns
  if (typeof methodOrOptions === 'object') {
    method = methodOrOptions.method;
    endpoint = methodOrOptions.endpoint;
    body = methodOrOptions.data;
  } else {
    method = methodOrOptions;
    endpoint = url as string;
    body = data;
  }

  const res = await fetch(endpoint, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  
  // If using the new API format with object param, automatically parse JSON
  if (typeof methodOrOptions === 'object') {
    if (res.headers.get('content-type')?.includes('application/json')) {
      return res.json();
    }
    return res;
  }
  
  // Otherwise return the Response object (old style)
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      // Retry transient fetch failures so one blip doesn't blank a feed
      // until the user hard-reloads.
      retry: 2,
    },
    mutations: {
      retry: false,
    },
  },
});
