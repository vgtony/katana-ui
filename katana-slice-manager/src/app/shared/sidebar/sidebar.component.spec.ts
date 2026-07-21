import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SidebarComponent } from './sidebar.component';

describe('SidebarComponent', () => {
  let fixture: ComponentFixture<SidebarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();
  });

  it('renders Deployments as a standalone navigation link', () => {
    const element = fixture.nativeElement as HTMLElement;
    const navButtons = element.querySelectorAll('nav button');
    const navLinks = Array.from(element.querySelectorAll('nav a')).map((link) =>
      link.textContent?.replace(/\s+/g, ' ').trim()
    );

    expect(navButtons.length).toBe(0);
    expect(navLinks).not.toContain('Proxmox API');
    expect(navLinks).toContain('Deployments');
    expect(element.querySelectorAll('.sidebar__sublink').length).toBe(0);
  });
});
