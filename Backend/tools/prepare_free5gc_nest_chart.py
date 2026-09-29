#!/usr/bin/env python3
"""Prepare a copy of the reviewed upstream chart; never alter the source checkout."""
import argparse
import hashlib
from pathlib import Path
import shutil

UPSTREAM_COMMIT = "c1ec95612010f844f8ae399bc2f019a8730ff239"
VERSION = "1.3.1"
CONFIGMAPS = (
    "charts/free5gc-amf/templates/amf-configmap.yaml",
    "charts/free5gc-smf/templates/smf-configmap.yaml",
    "charts/free5gc-nssf/templates/nssf-configmap.yaml",
    "charts/free5gc-n3iwf/templates/n3iwf-configmap.yaml",
    "charts/ueransim/templates/gnb-configmap.yaml",
    "charts/ueransim/templates/ue-configmap.yaml",
    "charts/ueransim/templates/subscriber-configmap.yaml",
)
# Filled from the reviewed commit, guarding the narrow transformation below.
SOURCE_HASHES = {'Chart.yaml': '9000404f4086bb392f6a6317fc4db3d1466dc8717015b82470c04ebdfae232a0',
 'charts/free5gc-amf/templates/amf-configmap.yaml': 'cba540430255e5dd082146d59f2846da7fca57e40fc6adcbd1572dd711db7509',
 'charts/free5gc-amf/values.yaml': '49cbcfd45191944ba4a5b92119344219f592bd12d601944bfffb267c02fad385',
 'charts/free5gc-n3iwf/templates/n3iwf-configmap.yaml': 'f75f2a980ba0e0fee77497f9977f23e42115c47d5230714204b1a46a34af0da5',
 'charts/free5gc-n3iwf/values.yaml': 'cbf7687832aa1eb9ff4706641e30d6296b103c80a18d9d6962e0cf88e2f0745c',
 'charts/free5gc-nssf/templates/nssf-configmap.yaml': 'f73d34b1fb02effbc612560fc7718cc622e01ce06214d4cd49a28c0f077bf49e',
 'charts/free5gc-nssf/values.yaml': '3b92a64725c294302bb7206ce88aa7591132dd158e26ca534fdc4999a4328cbd',
 'charts/free5gc-smf/templates/smf-configmap.yaml': '756310fe00ea05d638ec3e35b3bf5ce60b9bb787fb96f1e526cd7a5342f3ac53',
 'charts/free5gc-smf/values.yaml': '1f6c53c90234666da5f219b39fca4c27895d76fa90b59b05f42ff51826e2d6b0',
 'charts/ueransim/templates/gnb-configmap.yaml': '042d58ae53bcaecc800417af011e4eb7cc1b265baef1e7910095fa10103fb4d3',
 'charts/ueransim/templates/subscriber-configmap.yaml': 'b59e3f3802a1ad31034ff18dcf23f41a0c2ac6f393cfa2f210d0c4e2d5e86492',
 'charts/ueransim/templates/ue-configmap.yaml': '64b09095d83cc7cca643998492761833b6cbd16bcbc54e2273c6b9c7e15ebaf9',
 'charts/ueransim/values.yaml': '000255225789ec6a016484cd853913142ce7294b5aff871fa9b34ea0ab87170c',
 'values.yaml': '7fc9c2ae65cbf0fba03ef79477f089b81fa9f727043a133be9f13c9ae6ce385c'}


def prepare(source, destination):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if destination == source or source in destination.parents:
        raise ValueError("Destination must be outside the source directory")
    for name, expected in SOURCE_HASHES.items():
        if hashlib.sha256((source / name).read_bytes()).hexdigest() != expected:
            raise ValueError(f"Unreviewed chart file: {name}; use commit {UPSTREAM_COMMIT}")
    # copytree refuses to overwrite an existing destination.
    shutil.copytree(source, destination, ignore=shutil.ignore_patterns('.git', 'dist'))
    # The versioned chart is the source of truth for the maintained adaptation.
    adapted = Path(__file__).resolve().parents[2] / "Helm/free5gc-1.3.1"
    for name in (*CONFIGMAPS, "templates/_katana_nest.tpl", "values.schema.json"):
        shutil.copy2(adapted / name, destination / name)
    chart = destination / "Chart.yaml"
    chart.write_text(chart.read_text().replace("version: 1.2.11\n", f"version: {VERSION}\n"))
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    print(prepare(args.source, args.destination))
