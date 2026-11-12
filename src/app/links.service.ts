import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

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
  private readonly linksUrl = 'http://localhost:3000/api/links';

  list(): Observable<Link[]> {
    return this.http.get<Link[]>(this.linksUrl);
  }

  create(url: string): Observable<Link> {
    return this.http.post<Link>(this.linksUrl, { url });
  }
}
