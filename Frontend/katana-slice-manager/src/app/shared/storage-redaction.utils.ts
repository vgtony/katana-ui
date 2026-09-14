const SENSITIVE_STORAGE_KEY = /(credentials?|password|secret|token|kubeconfig)/i;
const SAFE_CONTAINER_KEYS = new Set(['k8s-credentials']);

export function redactStoredSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactStoredSecrets(item)) as T;
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  // ponytail: Current form models name every secret-bearing field. Replace this with
  // per-form storage schemas if a future integration puts secrets under opaque keys.
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) =>
      SENSITIVE_STORAGE_KEY.test(key) && !SAFE_CONTAINER_KEYS.has(key)
        ? []
        : [[key, redactStoredSecrets(item)]],
    ),
  ) as T;
}
