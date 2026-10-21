import { AfterViewInit, Directive, ElementRef, OnDestroy, inject } from '@angular/core';

/** Native dialogs provide focus containment, an inert background and Escape handling. */
@Directive({ selector: 'dialog[appNativeModal]' })
export class NativeModalDirective implements AfterViewInit, OnDestroy {
  private readonly dialog = inject<ElementRef<HTMLDialogElement>>(ElementRef).nativeElement;
  private opener: HTMLElement | null = null;

  ngAfterViewInit(): void {
    const active = this.dialog.ownerDocument.activeElement;
    this.opener = active instanceof HTMLElement ? active : null;
    this.dialog.showModal?.();
  }

  ngOnDestroy(): void {
    this.dialog.close?.();
    if (this.opener?.isConnected) this.opener.focus();
  }
}
