import { HttpClient } from '@angular/common/http';
import { inject, Injectable, isDevMode } from '@angular/core';
import { Observable } from 'rxjs';

export function getLinksApiUrl(devMode: boolean, currentOrigin: string): string {
  const origin = devMode ? 'http://localhost:3000' : currentOrigin;
  return `${origin}/api/links`;
}

export interface Link {
  code: string;
  url: string;
  shortUrl: string;
  hits: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class LinksService {
  private readonly http = inject(HttpClient);
  private readonly linksUrl = getLinksApiUrl(
    isDevMode(),
    window.location.origin,
  );

  list(): Observable<Link[]> {
    return this.http.get<Link[]>(this.linksUrl);
  }

  create(url: string): Observable<Link> {
    return this.http.post<Link>(this.linksUrl, { url });
  }
}
