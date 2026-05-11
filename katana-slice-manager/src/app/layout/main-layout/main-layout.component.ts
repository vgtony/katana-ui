import { DOCUMENT } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpActivityService } from '../../shared/services/http-activity.service';
import { SidebarComponent } from '../../shared/sidebar/sidebar.component';

type AppTheme = 'dark' | 'light';

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, SidebarComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss'
})
export class MainLayoutComponent implements OnInit {
  private readonly document = inject(DOCUMENT);
  private readonly themeStorageKey = 'katana-ui-theme';
  protected readonly httpActivityService = inject(HttpActivityService);

  protected theme: AppTheme = 'dark';

  ngOnInit(): void {
    this.theme = this.getInitialTheme();
    this.applyTheme(this.theme);
  }

  protected toggleTheme(): void {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    this.applyTheme(this.theme);
  }

  protected getThemeLabel(): string {
    return this.theme === 'light' ? 'Light Mode' : 'Dark Mode';
  }

  protected getThemeActionLabel(): string {
    return this.theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
  }

  protected getThemeIcon(): string {
    return this.theme === 'light' ? '☀' : '☾';
  }

  private getInitialTheme(): AppTheme {
    if (typeof window === 'undefined') {
      return 'dark';
    }

    const storedTheme = window.localStorage.getItem(this.themeStorageKey);

    if (storedTheme === 'light' || storedTheme === 'dark') {
      return storedTheme;
    }

    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  private applyTheme(theme: AppTheme): void {
    this.document.documentElement.dataset['theme'] = theme;
    this.document.documentElement.style.colorScheme = theme;

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(this.themeStorageKey, theme);
    }
  }
}
