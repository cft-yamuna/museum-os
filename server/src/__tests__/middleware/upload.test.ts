import { describe, expect, it } from 'vitest';
import { getContentTypeFromMime } from '../../middleware/upload.js';

describe('middleware/upload', () => {
  it('maps quicktime MIME to video', () => {
    expect(getContentTypeFromMime('video/quicktime')).toBe('video');
  });

  it('maps mp4 MIME to video', () => {
    expect(getContentTypeFromMime('video/mp4')).toBe('video');
  });

  it('throws for unsupported MIME types', () => {
    expect(() => getContentTypeFromMime('application/x-msdownload')).toThrow(
      'Unsupported MIME type: application/x-msdownload'
    );
  });
});
