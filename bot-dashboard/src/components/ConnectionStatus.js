import React, { useState, useEffect } from 'react';
import { Alert } from '@mui/material';

function ConnectionStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOnline) {
    return (
      <Alert severity="warning">
        أنت غير متصل بالإنترنت
      </Alert>
    );
  }

  return null;
}

export default ConnectionStatus; 