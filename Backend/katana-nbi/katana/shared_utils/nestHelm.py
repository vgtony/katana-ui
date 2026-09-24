"""Translate the supported NEST chart profile into OSM KDU parameters."""
import re


def free5gc_parameters(config):
    """SD-only profile for the adapted free5GC chart (SST 1, source SD 010203)."""
    fields = {"profile", "member_vnf_index", "kdu_name", "sd"}
    if not isinstance(config, dict) or set(config) != fields:
        raise ValueError("helm_configuration requires profile, member_vnf_index, kdu_name and sd only")
    if config["profile"] != "free5gc-sd-v1":
        raise ValueError("Unsupported Helm configuration profile")
    sd = config["sd"]
    if not isinstance(sd, str) or not re.fullmatch(r"[0-9a-fA-F]{6}", sd):
        raise ValueError('SD must be a quoted six-digit hexadecimal string, for example "000002"')
    if sd.lower() == "ffffff":
        raise ValueError("FFFFFF is reserved and cannot identify this slice")
    for field in ("member_vnf_index", "kdu_name"):
        if not isinstance(config[field], str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,128}", config[field]):
            raise ValueError(f"Invalid {field}")
    return [{
        "member-vnf-index": config["member_vnf_index"],
        "additionalParamsForKdu": [{
            "kdu_name": config["kdu_name"],
            "additionalParams": {"global": {"katanaNestSd": sd.lower()}},
        }],
    }]
