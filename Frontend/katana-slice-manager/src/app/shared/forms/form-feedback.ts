import {
  Component,
  ContentChildren,
  Directive,
  DoCheck,
  ElementRef,
  Input,
  OnDestroy,
  QueryList,
  Renderer2,
  ViewChild,
  inject,
} from '@angular/core';
import { AbstractControl, FormGroupDirective, NgControl, Validators } from '@angular/forms';

let nextFieldId = 0;

/** Adds field feedback without replacing existing controls or their validators. */
@Directive({ selector: '[formControlName], [appFieldControl]' })
export class FieldFeedbackDirective implements DoCheck, OnDestroy {
  private readonly ngControl = inject(NgControl, { self: true, optional: true });
  @Input() appFieldControl: AbstractControl | null = null;
  private get control(): AbstractControl | null {
    return this.appFieldControl ?? this.ngControl?.control ?? null;
  }
  private readonly renderer = inject(Renderer2);
  readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  readonly id = this.element.id || `katana-field-${++nextFieldId}`;
  private readonly errorId = `${this.id}-error`;
  private errorElement?: HTMLElement;

  get label(): string {
    return (
      this.element.labels?.[0]
        ?.querySelector('span')
        ?.textContent?.trim()
        .replace(/\s*\*$/, '') || String(this.ngControl?.name ?? 'This field')
    );
  }

  get message(): string {
    const control = this.control;
    if (!control?.touched || !control.invalid || control.disabled) return '';
    const errors = control.errors ?? {};
    if (errors['required'])
      return `${this.element.type === 'file' ? 'Choose' : 'Enter'} ${this.label.toLowerCase()}.`;
    if (errors['fileType']) return 'Choose a YAML or JSON credentials file.';
    if (errors['emptyFile']) return 'Choose a file that is not empty.';
    if (errors['min']) return `Enter ${this.label.toLowerCase()} of at least ${errors['min'].min}.`;
    if (errors['max']) return `Enter ${this.label.toLowerCase()} of ${errors['max'].max} or less.`;
    if (errors['email']) return 'Enter a valid email address.';
    if (errors['minlength'])
      return `Enter at least ${errors['minlength'].requiredLength} characters.`;
    if (errors['maxlength'])
      return `Enter no more than ${errors['maxlength'].requiredLength} characters.`;
    return `Check ${this.label.toLowerCase()} and use the requested format.`;
  }

  ngDoCheck(): void {
    this.renderer.setAttribute(this.element, 'id', this.id);
    this.renderer.setAttribute(
      this.element,
      'aria-required',
      String(this.control?.hasValidator(Validators.required) ?? false),
    );
    const message = this.message;
    this.renderer.setAttribute(this.element, 'aria-invalid', String(!!message));
    if (message && !this.errorElement) {
      this.errorElement = this.renderer.createElement('span');
      this.renderer.setAttribute(this.errorElement, 'id', this.errorId);
      this.renderer.addClass(this.errorElement, 'ui-field-error');
      this.renderer.insertBefore(
        this.element.parentNode,
        this.errorElement,
        this.element.nextSibling,
      );
    }
    if (this.errorElement) {
      this.renderer.setProperty(this.errorElement, 'textContent', message);
      this.renderer.setProperty(this.errorElement, 'hidden', !message);
    }
    const descriptions = (this.element.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter((id) => id && id !== this.errorId);
    if (message) descriptions.push(this.errorId);
    if (descriptions.length)
      this.renderer.setAttribute(this.element, 'aria-describedby', descriptions.join(' '));
    else this.renderer.removeAttribute(this.element, 'aria-describedby');
  }

  ngOnDestroy(): void {
    if (this.errorElement?.parentNode)
      this.renderer.removeChild(this.errorElement.parentNode, this.errorElement);
  }
}

@Component({
  selector: 'form[appFormFeedback]',
  template: `
    @if (invalidFields.length || serverError) {
      <div
        #summary
        class="ui-error-summary"
        tabindex="-1"
        role="alert"
        aria-label="There is a problem"
      >
        <h2>There is a problem</h2>
        @if (serverError) {
          <p>{{ serverError }}</p>
        }
        <ul>
          @for (field of invalidFields; track field.id) {
            <li>
              <a [href]="'#' + field.id" (click)="focusField($event, field)">{{ field.message }}</a>
            </li>
          }
        </ul>
      </div>
    }
    <ng-content />
  `,
  host: { '(submit)': 'showErrors()', novalidate: '' },
})
export class FormFeedbackComponent implements OnDestroy {
  private readonly form = inject(FormGroupDirective, { self: true });
  @ContentChildren(FieldFeedbackDirective, { descendants: true })
  fields?: QueryList<FieldFeedbackDirective>;
  @ViewChild('summary') summary?: ElementRef<HTMLElement>;
  private focusTimer?: ReturnType<typeof setTimeout>;
  private error = '';

  @Input() set serverError(value: string) {
    if (value && value !== this.error) this.focusSummary();
    this.error = value;
  }
  get serverError(): string {
    return this.error;
  }
  get invalidFields(): FieldFeedbackDirective[] {
    return this.fields?.filter((field) => !!field.message) ?? [];
  }

  protected showErrors(): void {
    if (this.form.form.invalid) {
      this.form.form.markAllAsTouched();
      this.focusSummary();
    }
  }

  protected focusField(event: Event, field: FieldFeedbackDirective): void {
    event.preventDefault();
    field.element.focus();
  }

  private focusSummary(): void {
    clearTimeout(this.focusTimer);
    this.focusTimer = setTimeout(() => this.summary?.nativeElement.focus());
  }

  ngOnDestroy(): void {
    clearTimeout(this.focusTimer);
  }
}

export const FORM_FEEDBACK_IMPORTS = [FormFeedbackComponent, FieldFeedbackDirective] as const;
