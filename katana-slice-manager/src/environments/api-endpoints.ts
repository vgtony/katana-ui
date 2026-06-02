export interface KatanaApiEndpoints {
  slice: {
    list: string;
    create: string;
    detail: string;
    delete: string;
    deploymentTime: string;
  };
  amarisoftSlices: {
    list: string;
    create: string;
    detail: string;
    delete: string;
    preview: string;
    apply: string;
  };
  vim: {
    list: string;
    create: string;
    detail: string;
    update: string;
    delete: string;
  };
  nfvo: {
    list: string;
    create: string;
    detail: string;
    update: string;
    delete: string;
  };
  wim: {
    list: string;
    create: string;
    detail: string;
    update: string;
    delete: string;
  };
  ems: {
    list: string;
    create: string;
    detail: string;
    update: string;
    delete: string;
  };
  networkFunctions: {
    list: string;
    create: string;
    detail: string;
    update: string;
    delete: string;
  };
  policy: {
    list: string;
    create: string;
    detail: string;
    update: string;
    delete: string;
    neatBySlice: string;
  };
  resources: {
    list: string;
    byLocation: string;
  };
  location: {
    list: string;
    create: string;
    detail: string;
    update: string;
    delete: string;
  };
  gst: {
    list: string;
    detail: string;
  };
  baseSliceDescriptors: {
    list: string;
    create: string;
    detail: string;
    update: string;
    delete: string;
  };
  other: {
    nsDescriptors: string;
    bootstrap: string;
  };
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function buildEndpoint(apiBase: string, path: string): string {
  return `${withoutTrailingSlash(apiBase)}/${path.replace(/^\/+/, '')}`;
}

export function buildKatanaApiEndpoints(apiBase: string): KatanaApiEndpoints {
  return {
    slice: {
      list: buildEndpoint(apiBase, 'slice'),
      create: buildEndpoint(apiBase, 'slice'),
      detail: buildEndpoint(apiBase, 'slice/{slice_id}'),
      delete: buildEndpoint(apiBase, 'slice/{slice_id}'),
      deploymentTime: buildEndpoint(apiBase, 'slice/{slice_id}/time')
    },
    amarisoftSlices: {
      list: buildEndpoint(apiBase, 'amarisoft-slices'),
      create: buildEndpoint(apiBase, 'amarisoft-slices'),
      detail: buildEndpoint(apiBase, 'amarisoft-slices/{slice_id}'),
      delete: buildEndpoint(apiBase, 'amarisoft-slices/{slice_id}'),
      preview: buildEndpoint(apiBase, 'amarisoft-slices/preview'),
      apply: buildEndpoint(apiBase, 'amarisoft-slices/{slice_id}/apply')
    },
    vim: {
      list: buildEndpoint(apiBase, 'vim'),
      create: buildEndpoint(apiBase, 'vim'),
      detail: buildEndpoint(apiBase, 'vim/{vim_id}'),
      update: buildEndpoint(apiBase, 'vim/{vim_id}'),
      delete: buildEndpoint(apiBase, 'vim/{vim_id}')
    },
    nfvo: {
      list: buildEndpoint(apiBase, 'nfvo'),
      create: buildEndpoint(apiBase, 'nfvo'),
      detail: buildEndpoint(apiBase, 'nfvo/{nfvo_id}'),
      update: buildEndpoint(apiBase, 'nfvo/{nfvo_id}'),
      delete: buildEndpoint(apiBase, 'nfvo/{nfvo_id}')
    },
    wim: {
      list: buildEndpoint(apiBase, 'wim'),
      create: buildEndpoint(apiBase, 'wim'),
      detail: buildEndpoint(apiBase, 'wim/{wim_id}'),
      update: buildEndpoint(apiBase, 'wim/{wim_id}'),
      delete: buildEndpoint(apiBase, 'wim/{wim_id}')
    },
    ems: {
      list: buildEndpoint(apiBase, 'ems'),
      create: buildEndpoint(apiBase, 'ems'),
      detail: buildEndpoint(apiBase, 'ems/{ems_id}'),
      update: buildEndpoint(apiBase, 'ems/{ems_id}'),
      delete: buildEndpoint(apiBase, 'ems/{ems_id}')
    },
    networkFunctions: {
      list: buildEndpoint(apiBase, 'function'),
      create: buildEndpoint(apiBase, 'function'),
      detail: buildEndpoint(apiBase, 'function/{func_id}'),
      update: buildEndpoint(apiBase, 'function/{func_id}'),
      delete: buildEndpoint(apiBase, 'function/{func_id}')
    },
    policy: {
      list: buildEndpoint(apiBase, 'policy'),
      create: buildEndpoint(apiBase, 'policy'),
      detail: buildEndpoint(apiBase, 'policy/{policy_system_id}'),
      update: buildEndpoint(apiBase, 'policy/{policy_system_id}'),
      delete: buildEndpoint(apiBase, 'policy/{policy_system_id}'),
      neatBySlice: buildEndpoint(apiBase, 'policy/neat/{slice_id}')
    },
    resources: {
      list: buildEndpoint(apiBase, 'resources'),
      byLocation: buildEndpoint(apiBase, 'resources/{location}')
    },
    location: {
      list: buildEndpoint(apiBase, 'location'),
      create: buildEndpoint(apiBase, 'location'),
      detail: buildEndpoint(apiBase, 'location/{id}'),
      update: buildEndpoint(apiBase, 'location/{id}'),
      delete: buildEndpoint(apiBase, 'location/{id}')
    },
    gst: {
      list: buildEndpoint(apiBase, 'gst'),
      detail: buildEndpoint(apiBase, 'gst/{gst_id}')
    },
    baseSliceDescriptors: {
      list: buildEndpoint(apiBase, 'base_slice_des'),
      create: buildEndpoint(apiBase, 'base_slice_des'),
      detail: buildEndpoint(apiBase, 'base_slice_des/{id}'),
      update: buildEndpoint(apiBase, 'base_slice_des/{id}'),
      delete: buildEndpoint(apiBase, 'base_slice_des/{id}')
    },
    other: {
      nsDescriptors: buildEndpoint(apiBase, 'nslist'),
      bootstrap: buildEndpoint(apiBase, 'bootstrap')
    }
  };
}
