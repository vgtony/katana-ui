import { routes } from './app.routes';

describe('application routes', () => {
  it('removes standalone Proxmox monitoring while keeping deployment routes', () => {
    const children = routes[0].children ?? [];
    expect(children.some((route) => route.path === 'proxmox-monitoring')).toBe(false);
    expect(children.find((route) => route.path === 'deployment/:option')?.loadComponent).toBeDefined();
  });

  it('redirects the removed legacy slice wizard to the Kubernetes deployment flow', () => {
    const children = routes[0].children ?? [];
    expect(children.find((route) => route.path === 'deployment/slice')).toMatchObject({
      redirectTo: 'deployment/k8s',
      pathMatch: 'full',
    });
    expect(children.some((route) => route.path === 'infrastructure')).toBe(true);
    expect(children.some((route) => route.path === 'admin/infrastructure/bootstrap')).toBe(true);
  });
});
