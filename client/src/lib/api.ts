import { getAuthToken } from "./auth";

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown
): Promise<Response> {
  const token = getAuthToken();
  console.log("API request token:", token ? "Token found" : "No token found");
  
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    console.log("Authorization header added");
  } else {
    console.log("No authorization header added - no token available");
  }

  const config: RequestInit = {
    method,
    headers,
    credentials: "include",
  };

  if (data) {
    config.body = JSON.stringify(data);
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    let errorMessage = `${response.status}: ${response.statusText}`;
    
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      // If we can't parse the error response, use the default message
    }
    
    throw new Error(errorMessage);
  }

  return response;
}

export async function apiGet<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  return response.json();
}

export async function apiPost<T>(url: string, data: unknown): Promise<T> {
  const response = await apiRequest("POST", url, data);
  return response.json();
}

export async function apiPut<T>(url: string, data: unknown): Promise<T> {
  const response = await apiRequest("PUT", url, data);
  return response.json();
}

export async function apiDelete(url: string): Promise<void> {
  await apiRequest("DELETE", url);
}

// SAS-based file upload helpers
export interface SasFileInfo {
  name: string;
  size: number;
  type: string;
  relativePath?: string;
}

export interface SasUploadResponse {
  uploads: Array<{
    file: string;
    url: string;
    relativePath?: string;
  }>;
}

export async function generateSasUrls(
  storageAccount: string,
  container: string,
  path: string,
  files: SasFileInfo[]
): Promise<SasUploadResponse> {
  return apiPost<SasUploadResponse>("/api/storage-accounts/files/generate-sas", {
    storageAccount,
    container,
    path,
    files
  });
}

export async function uploadFilesToSas(
  file: File,
  sasUrl: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = (event.loaded / event.total) * 100;
        onProgress(progress);
      }
    });
    
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.statusText}`));
      }
    });
    
    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed due to network error'));
    });
    
    xhr.open('PUT', sasUrl);
    xhr.setRequestHeader('x-ms-blob-type', 'BlockBlob');
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });
}

export function buildFileApiUrl(
  endpoint: string,
  params: Record<string, string | number | null | undefined>
): string {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });
  
  const queryString = searchParams.toString();
  return queryString ? `${endpoint}?${queryString}` : endpoint;
}
