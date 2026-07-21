import { routes } from './app.routes';

describe('application routes', () => {
  it('redirects the removed legacy slice wizard to the sole slice creation flow', () => {
    const children = routes[0].children ?? [];
    expect(children.find((route) => route.path === 'deployment/slice')).toMatchObject({
      redirectTo: 'slices/create',
      pathMatch: 'full',
    });
    expect(children.some((route) => route.path === 'infrastructure')).toBe(true);
    expect(children.some((route) => route.path === 'admin/infrastructure/bootstrap')).toBe(true);
  });
});
