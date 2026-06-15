'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/logger';

interface UseLoggerOptions {
  deviceId: string;
  templateType?: string;
  instanceId?: string;
}

export function useLogger(options: UseLoggerOptions): typeof logger {
  useEffect(function() {
    logger.init({
      deviceId: options.deviceId,
      templateType: options.templateType,
      instanceId: options.instanceId,
    });

    logger.info('App initialized', {
      templateType: options.templateType,
      instanceId: options.instanceId,
    });

    return function() {
      logger.info('App unmounting');
      logger.destroy();
    };
  }, [options.deviceId, options.templateType, options.instanceId]);

  return logger;
}
