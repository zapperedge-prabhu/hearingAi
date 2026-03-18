import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getAuthToken } from "./auth";

let on401Handler: (() => void) | null = null;

export function set401Handler(handler: () => void) {
  on401Handler = handler;
}

// Custom error class that preserves the full response data
export class HttpError extends Error {
  status: number;
  data: any;
  response: Response;

  constructor(message: string, status: number, data: any, response: Response) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.data = data;
    this.response = response;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 401 && on401Handler) {
      on401Handler();
    }
    
    let errorMessage = res.statusText;
    let errorData: any = {};
    
    try {
      const text = await res.text();
      if (text) {
        // Try to parse as JSON first
        try {
          errorData = JSON.parse(text);
          // Extract the error message from JSON response
          errorMessage = errorData.error || errorData.message || text;
        } catch {
          // If not JSON, use the raw text
          errorMessage = text;
          errorData = { message: text };
        }
      }
    } catch {
      // If we can't read the response, use statusText
      errorMessage = res.statusText;
      errorData = { message: res.statusText };
    }
    
    // Throw custom error with full response data attached
    throw new HttpError(errorMessage, res.status, errorData, res);
  }
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = {};
  
  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  return headers;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  signal?: AbortSignal,
): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  const headers = {
    ...(data ? { "Content-Type": "application/json" } : {}),
    ...authHeaders,
  };

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
    signal,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const authHeaders = await getAuthHeaders();
    
    const res = await fetch(queryKey[0] as string, {
      headers: authHeaders,
      credentials: "include",
    });

    if (res.status === 401) {
      if (on401Handler) {
        on401Handler();
      }
      if (unauthorizedBehavior === "returnNull") {
        return null;
      }
    }

    // Handle 404 Not Found - throw error
    if (res.status === 404) {
      throw new Error(`Resource not found: ${res.status}`);
    }

    // Let throwIfResNotOk handle all errors (including 403) to preserve response data
    await throwIfResNotOk(res);
    
    // Check content type before parsing as JSON
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await res.text();
      // If it looks like HTML, throw a descriptive error
      if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
        throw new Error('Server returned HTML instead of JSON. The endpoint may not exist or there may be a routing issue.');
      }
      // Try to parse as JSON anyway in case content-type is wrong
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Unexpected response format: ${text.substring(0, 100)}`);
      }
    }
    
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
      retry: false,
      retryOnMount: false,
      refetchIntervalInBackground: false,
    },
    mutations: {
      retry: false,
    },
  },
});
