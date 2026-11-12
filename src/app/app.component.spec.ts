import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('http://localhost:3000/api/links').flush([]);
  });

  afterEach(() => {
    http.verify();
  });

  it('creates the app', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('rejects non-HTTP(S) URLs without sending a request', () => {
    const component = fixture.componentInstance;
    component.urlControl.setValue('ftp://example.com/file');
    component.urlControl.markAsTouched();
    component.submit();

    expect(component.urlControl.hasError('httpUrl')).toBeTrue();
    expect(http.match('http://localhost:3000/api/links').length).toBe(0);
  });

  it('creates a link and refreshes the links table', () => {
    const component = fixture.componentInstance;
    const link = {
      code: 'a1B2c3',
      url: 'https://example.com/article',
      shortUrl: 'http://localhost:3000/a1B2c3',
      hits: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    component.urlControl.setValue('https://example.com/article');
    component.submit();
    component.submit();
    http.expectOne('http://localhost:3000/api/links').flush(link);
    http.expectOne('http://localhost:3000/api/links').flush([link]);

    expect(component.createdLink()).toEqual(link);
    expect(component.links()).toEqual([link]);
    expect(component.submitting()).toBeFalse();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.notice-success a')?.getAttribute('href')).toBe(
      link.shortUrl,
    );
    expect(compiled.querySelector('tbody tr')?.textContent).toContain('a1B2c3');
  });

  it('shows a server validation error beside the URL field', () => {
    const component = fixture.componentInstance;
    component.urlControl.setValue('https://example.com');
    component.urlControl.markAsTouched();
    component.submit();
    http.expectOne('http://localhost:3000/api/links').flush(
      { error: 'URL is not allowed' },
      { status: 400, statusText: 'Bad Request' },
    );

    fixture.detectChanges();
    expect(component.urlControl.hasError('server')).toBeTrue();
    expect(fixture.nativeElement.querySelector('#url-error')?.textContent).toContain(
      'URL is not allowed',
    );
  });
});
