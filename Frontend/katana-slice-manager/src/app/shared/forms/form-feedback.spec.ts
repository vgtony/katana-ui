import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FORM_FEEDBACK_IMPORTS } from './form-feedback';

@Component({
  imports: [ReactiveFormsModule, ...FORM_FEEDBACK_IMPORTS],
  template: `<form appFormFeedback [formGroup]="form" [serverError]="error()">
    <label
      ><span>Location name</span><input formControlName="name" aria-describedby="name-hint"
    /></label>
    <p id="name-hint">Use a recognizable name.</p>
    <div formArrayName="nodes">
      <div [formGroupName]="0">
        <label><span>CPU cores</span><input type="number" formControlName="cpu" /></label>
      </div>
    </div>
    <button type="submit">Save location</button>
  </form>`,
})
class FormHarness {
  error = signal('');
  form = new FormGroup({
    name: new FormControl('', Validators.required),
    nodes: new FormArray([new FormGroup({ cpu: new FormControl(0, Validators.min(1)) })]),
  });
}

describe('Accessible form feedback', () => {
  it('reveals nested field errors, focuses the summary, links to fields and preserves hints', async () => {
    const fixture = TestBed.createComponent(FormHarness);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    document.body.appendChild(root);
    expect(root.querySelector('.ui-error-summary')).toBeNull();
    root
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const summary = root.querySelector('.ui-error-summary')!;
    expect(document.activeElement).toBe(summary);
    expect(summary.textContent).toContain('Enter location name.');
    expect(summary.textContent).toContain('Enter cpu cores of at least 1.');
    const input = root.querySelector('input')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain('name-hint');
    const errorId = input.getAttribute('aria-describedby')!.split(' ')[1];
    expect(document.getElementById(errorId)?.textContent).toBe('Enter location name.');
    (summary.querySelector('a') as HTMLAnchorElement).click();
    expect(document.activeElement).toBe(input);
    fixture.componentInstance.form.setValue({ name: 'Edge west', nodes: [{ cpu: 2 }] });
    fixture.detectChanges();
    expect(root.querySelector('.ui-error-summary')).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(input.getAttribute('aria-describedby')).toBe('name-hint');
    fixture.componentInstance.error.set('This location already exists. Choose another name.');
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(document.activeElement).toBe(root.querySelector('.ui-error-summary'));
    expect(input.value).toBe('Edge west');
    fixture.destroy();
    root.remove();
  });
});
