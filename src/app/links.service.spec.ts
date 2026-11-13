import { getLinksApiUrl } from './links.service';

describe('getLinksApiUrl', () => {
  it('uses the local backend while Angular is in development mode', () => {
    expect(getLinksApiUrl(true, 'http://localhost:4200')).toBe(
      'http://localhost:3000/api/links',
    );
  });

  it('uses the current app origin in production', () => {
    expect(getLinksApiUrl(false, 'https://snip.example.com')).toBe(
      'https://snip.example.com/api/links',
    );
  });
});
