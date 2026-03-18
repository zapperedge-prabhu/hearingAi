import { useState, useCallback } from 'react';

export interface AIAgentProcessingState {
  isProcessing: boolean;
  fileName: string;
  fileSize: number;
  agentName: string;
  status: string;
}

export const useAIAgentProgress = () => {
  const [processing, setProcessing] = useState<AIAgentProcessingState>({
    isProcessing: false,
    fileName: '',
    fileSize: 0,
    agentName: '',
    status: 'Initializing...',
  });

  /**
   * Start AI Agent processing
   */
  const startProcessing = useCallback((
    fileName: string,
    fileSize: number,
    agentName: string
  ) => {
    setProcessing({
      isProcessing: true,
      fileName,
      fileSize,
      agentName,
      status: 'Initializing...',
    });
  }, []);

  /**
   * Update processing status
   */
  const updateStatus = useCallback((status: string) => {
    setProcessing(prev => ({
      ...prev,
      status,
    }));
  }, []);

  /**
   * Complete processing
   */
  const completeProcessing = useCallback(() => {
    setProcessing({
      isProcessing: false,
      fileName: '',
      fileSize: 0,
      agentName: '',
      status: '',
    });
  }, []);

  return {
    ...processing,
    startProcessing,
    updateStatus,
    completeProcessing,
  };
};
