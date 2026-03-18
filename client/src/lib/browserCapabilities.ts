/**
 * Browser capability detection for modern file download features
 */

export interface BrowserCapabilities {
  hasFileSystemAccess: boolean;
  browserName: string;
  browserVersion: string;
  isSupported: boolean;
}

/**
 * Detect if browser supports File System Access API
 * Required for no-ZIP folder downloads
 */
export function detectBrowserCapabilities(): BrowserCapabilities {
  const hasFileSystemAccess = 'showDirectoryPicker' in window;
  
  // Detect browser
  const userAgent = navigator.userAgent;
  let browserName = 'Unknown';
  let browserVersion = 'Unknown';
  
  if (userAgent.includes('Edg/')) {
    browserName = 'Edge';
    const match = userAgent.match(/Edg\/(\d+)/);
    browserVersion = match ? match[1] : 'Unknown';
  } else if (userAgent.includes('Chrome/') && !userAgent.includes('Edg/')) {
    browserName = 'Chrome';
    const match = userAgent.match(/Chrome\/(\d+)/);
    browserVersion = match ? match[1] : 'Unknown';
  } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) {
    browserName = 'Safari';
    const match = userAgent.match(/Version\/(\d+)/);
    browserVersion = match ? match[1] : 'Unknown';
  } else if (userAgent.includes('Firefox/')) {
    browserName = 'Firefox';
    const match = userAgent.match(/Firefox\/(\d+)/);
    browserVersion = match ? match[1] : 'Unknown';
  }
  
  const isSupported = hasFileSystemAccess && 
    (browserName === 'Chrome' || browserName === 'Edge');
  
  return {
    hasFileSystemAccess,
    browserName,
    browserVersion,
    isSupported,
  };
}

/**
 * Get user-friendly browser requirement message
 */
export function getUnsupportedBrowserMessage(capabilities: BrowserCapabilities): string {
  if (capabilities.isSupported) {
    return '';
  }
  
  if (!capabilities.hasFileSystemAccess) {
    return `Your browser (${capabilities.browserName} ${capabilities.browserVersion}) does not support folder downloads. Please use Chrome 86+ or Edge 86+ for the best experience.`;
  }
  
  if (capabilities.browserName === 'Safari') {
    return 'Safari does not support direct folder downloads. Please use Chrome or Edge for folder downloads.';
  }
  
  if (capabilities.browserName === 'Firefox') {
    return 'Firefox does not support direct folder downloads. Please use Chrome or Edge for folder downloads.';
  }
  
  return `Your browser does not support folder downloads. Please use Chrome 86+ or Edge 86+ for the best experience.`;
}
