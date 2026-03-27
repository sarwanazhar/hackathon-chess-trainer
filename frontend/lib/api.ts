import { getToken } from '@clerk/nextjs';

/**
 * Configuration for API requests
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';

/**
 * Creates a fetch request with automatic Clerk authentication
 * @param url - The endpoint URL (relative to API_BASE_URL)
 * @param options - Fetch options
 * @returns Promise<Response>
 */
export async function fetchWithAuth(
  url: string, 
  options: RequestInit = {}
): Promise<Response> {
  // Get the JWT token from Clerk using supabase template
  const token = await getToken({ template: 'supabase' });
  
  if (!token) {
    throw new Error('No authentication token available');
  }

  // Set default headers
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers,
  };

  // Make the request with authentication
  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  });

  // Handle authentication errors
  if (response.status === 401) {
    // Token might be expired, try to refresh
    const newToken = await getToken({ template: 'supabase' });
    if (newToken && newToken !== token) {
      // Retry with new token
      const retryResponse = await fetch(`${API_BASE_URL}${url}`, {
        ...options,
        headers: {
          ...headers,
          'Authorization': `Bearer ${newToken}`,
        },
      });
      return retryResponse;
    }
    throw new Error('Authentication failed: Invalid or expired token');
  }

  return response;
}

/**
 * Makes a GET request with authentication
 */
export async function get<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetchWithAuth(url, {
    method: 'GET',
    ...options,
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Makes a POST request with authentication
 */
export async function post<T>(
  url: string, 
  data: any, 
  options: RequestInit = {}
): Promise<T> {
  const response = await fetchWithAuth(url, {
    method: 'POST',
    body: JSON.stringify(data),
    ...options,
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Makes a PUT request with authentication
 */
export async function put<T>(
  url: string, 
  data: any, 
  options: RequestInit = {}
): Promise<T> {
  const response = await fetchWithAuth(url, {
    method: 'PUT',
    body: JSON.stringify(data),
    ...options,
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Makes a DELETE request with authentication
 */
export async function del<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetchWithAuth(url, {
    method: 'DELETE',
    ...options,
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Creates an authenticated WebSocket connection
 * @param endpoint - The WebSocket endpoint (relative to API_BASE_URL)
 * @param onOpen - Callback when connection opens
 * @param onMessage - Callback for incoming messages
 * @param onError - Callback for errors
 * @param onClose - Callback when connection closes
 * @returns WebSocket instance
 */
export async function createAuthenticatedWebSocket(
  endpoint: string,
  onOpen?: (event: Event) => void,
  onMessage?: (event: MessageEvent) => void,
  onError?: (event: Event) => void,
  onClose?: (event: CloseEvent) => void
): Promise<WebSocket> {
  // Get the JWT token from Clerk using supabase template
  const token = await getToken({ template: 'supabase' });
  
  if (!token) {
    throw new Error('No authentication token available');
  }

  // Construct WebSocket URL with token as query parameter
  const wsProtocol = API_BASE_URL.startsWith('https') ? 'wss' : 'ws';
  const wsUrl = `${wsProtocol}://${new URL(API_BASE_URL).host}${endpoint}?token=${encodeURIComponent(token)}`;

  const ws = new WebSocket(wsUrl);

  ws.onopen = onOpen;
  ws.onmessage = onMessage;
  ws.onerror = onError;
  ws.onclose = onClose;

  return ws;
}

/**
 * Utility to check if a response indicates authentication error
 */
export function isAuthError(response: Response): boolean {
  return response.status === 401;
}

/**
 * Utility to handle authentication errors in components
 */
export function handleAuthError(error: any): void {
  if (error.message.includes('Authentication failed')) {
    // Redirect to sign-in or refresh the page
    window.location.href = '/sign-in';
  }
  throw error;
}