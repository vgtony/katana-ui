export interface K8sOperation {
  operation_id: string;
  nfvo_id: string;
  submission_state: 'submitting' | 'accepted' | 'unknown' | 'rejected';
  phase: 'pending' | 'unknown' | 'completed' | 'failed';
  message: string;
  osm_instance_id?: string;
  osm_operation_id?: string;
  osm_operation_state?: string;
  observed_at?: number;
}
