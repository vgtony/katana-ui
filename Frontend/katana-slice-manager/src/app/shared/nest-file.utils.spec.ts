import {
  getCredentialReference,
  parseStructuredFile,
  summarizeNest
} from './nest-file.utils';

describe('NEST file utilities', () => {
  it('parses YAML and extracts the sanitized deployment summary', () => {
    const nest = parseStructuredFile(`
name: open5gs-slice
infrastructure:
  id: edge-k8s-1
  type: kubernetes
  credentials_file: ./creds.yaml
base_slice_descriptor:
  coverage: [edge]
service_descriptor:
  ns_list:
    - nsd-id: open5gs-knf
`);

    expect(summarizeNest(nest)).toEqual({
      sliceName: 'open5gs-slice',
      coverage: ['edge'],
      nsdReferences: ['open5gs-knf'],
      infrastructure: {
        id: 'edge-k8s-1',
        type: 'kubernetes',
        credentials_file: './creds.yaml'
      }
    });
    expect(getCredentialReference(summarizeNest(nest).infrastructure)).toBe('./creds.yaml');
  });

  it('rejects files whose root is not an object', () => {
    expect(() => parseStructuredFile('- one\n- two')).toThrow(
      'The file must contain one YAML or JSON object.'
    );
  });
});
