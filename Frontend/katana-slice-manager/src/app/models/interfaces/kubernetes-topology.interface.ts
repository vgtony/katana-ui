export interface KubernetesResources {
  cpu_millicores: number | null;
  memory_bytes: number | null;
}
export interface KubernetesUsage extends KubernetesResources {
  timestamp: string | null;
  window: string | null;
}
export interface KubernetesContainer {
  name: string;
  kind: 'container' | 'init' | 'ephemeral';
  state: string;
  reason: string | null;
  ready: boolean;
  restarts: number;
  requests: KubernetesResources;
  limits: KubernetesResources;
  usage: KubernetesUsage;
}
export interface KubernetesPod {
  uid: string;
  name: string;
  namespace: string;
  node: string | null;
  phase: string;
  ready: number;
  container_count: number;
  restarts: number;
  containers: KubernetesContainer[];
  usage: KubernetesUsage;
}
export interface KubernetesNode {
  name: string;
  ready: boolean | null;
  reported: boolean;
  allocatable: KubernetesResources;
  usage: KubernetesUsage;
}
export interface KubernetesTopology {
  cluster_id: string;
  name: string;
  namespace: string;
  collected_at: string;
  nodes: KubernetesNode[];
  pods: KubernetesPod[];
  warnings: string[];
}
