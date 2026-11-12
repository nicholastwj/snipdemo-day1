import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { LinksService, Link } from './links.service';

const httpUrlValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const value = typeof control.value === 'string' ? control.value.trim() : '';
  if (!value) return null;

  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname
      ? null
      : { httpUrl: true };
  } catch {
    return { httpUrl: true };
  }
};

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly linksService = inject(LinksService);

  readonly form = this.formBuilder.nonNullable.group({
    url: ['', [Validators.required, httpUrlValidator]],
  });
  readonly links = signal<Link[]>([]);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly submitError = signal<string | null>(null);
  readonly createdLink = signal<Link | null>(null);

  get urlControl() {
    return this.form.controls.url;
  }

  ngOnInit(): void {
    this.refreshLinks();
  }

  refreshLinks(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.linksService.list().subscribe({
      next: (links) => {
        this.links.set(links);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(
          this.errorMessage(error, 'Could not load links. Try again.'),
        );
        this.loading.set(false);
      },
    });
  }

  submit(): void {
    if (this.submitting()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.submitError.set(null);
    this.createdLink.set(null);

    this.linksService.create(this.urlControl.value.trim()).subscribe({
      next: (link) => {
        this.createdLink.set(link);
        this.form.reset();
        this.submitting.set(false);
        this.refreshLinks();
      },
      error: (error: unknown) => {
        const message = this.errorMessage(
          error,
          'Could not create the short link. Try again.',
        );
        if (error instanceof HttpErrorResponse && error.status === 400) {
          this.urlControl.setErrors({ server: message });
        } else {
          this.submitError.set(message);
        }
        this.submitting.set(false);
      },
    });
  }

  urlError(): string {
    if (!this.urlControl.touched && !this.urlControl.dirty) return '';
    if (this.urlControl.hasError('required')) return 'Enter a URL to shorten.';
    if (this.urlControl.hasError('server')) {
      return String(this.urlControl.getError('server'));
    }
    if (this.urlControl.hasError('httpUrl')) {
      return 'Enter a valid HTTP or HTTPS URL.';
    }
    return '';
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return 'Could not reach Snip. Check that the backend is running.';
      }
      const message = error.error?.error;
      if (typeof message === 'string' && message.trim()) return message;
      return `Snip returned an error (${error.status}).`;
    }
    return fallback;
  }
}
