"""Local workflow regressions; external infrastructure is simulated."""
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

from tests.test_nest_helm import load_method
from tests.test_unified_infrastructure import load_definitions

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'Proxmox Standalone'))
from proxmox_standalone.provisioner import ProxmoxProvisioner
from proxmox_standalone.client import ProxmoxAPIError


def vm(**changes):
    return dict(dict(name='test', template=100, cpu=1, ram=512, storage_type='local',
                disk_size=8, bridges=[dict(name='vmbr0', type='management')]), **changes)


class WorkflowRegressions(unittest.TestCase):
    def test_clone_and_fresh_creation_wait_for_tasks_and_preserve_vm_configuration(self):
        for template in (100, None):
            with self.subTest(template=template):
                client = Mock()
                client.next_vmid.return_value = 101
                client.vm_config.return_value = {'template': 1}
                client.storage_content.return_value = [{'volid': 'local:iso/test.iso'}]
                provisioner = ProxmoxProvisioner(client, {'node': 'node'})
                result = provisioner.provision_from_config({'vms': [vm(template=template, iso_image='local:iso/test.iso')]})
                self.assertEqual(result['results'][0]['vmid'], 101)
                self.assertTrue(result['results'][0]['started'])
                self.assertEqual(client.wait_for_task.call_count, 2)
                client.start_vm.assert_called_once_with('node', 101)
                if template:
                    client.clone_vm.assert_called_once()
                    client.create_vm.assert_not_called()
                else:
                    client.create_vm.assert_called_once()
                    self.assertEqual(client.create_vm.call_args.kwargs['disk'], 'local:8')
                    client.clone_vm.assert_not_called()

    def test_kafka_connection_retries_are_bounded_in_every_service(self):
        class Unavailable(Exception):
            pass

        root = Path(__file__).resolve().parents[1]
        paths = list(root.glob('katana-*/katana/**/kafkaUtils.py'))
        self.assertEqual(len(paths), 3)
        for path in paths:
            for function, client_name, args in (
                ('create_producer', 'KafkaProducer', []),
                ('create_consumer', 'KafkaConsumer', ['slice']),
                ('create_topic', 'KafkaAdminClient', ['slice']),
            ):
                with self.subTest(path=path, function=function):
                    client = Mock(side_effect=[Unavailable()] * 31 + [RuntimeError('excess retry')])
                    clock = Mock()
                    method = load_definitions(str(path.relative_to(root)), {function}, {
                        client_name: client, 'time': clock, 'json': json, 'logger': Mock(),
                        'admin': Mock(), 'errors': SimpleNamespace(
                            NoBrokersAvailable=Unavailable, TopicAlreadyExistsError=KeyError),
                    })[function]
                    with self.assertRaises(Unavailable):
                        method(*args)
                    self.assertEqual(client.call_count, 31)
                    self.assertEqual(clock.sleep.call_count, 30)

    def test_saved_proxmox_connection_keeps_tls_and_timeout(self):
        method = load_method('katana-nbi/katana/api/proxmox.py', '_standalone_cluster_config', {
            'mongoUtils': SimpleNamespace(get=lambda *args: dict(_id='lab', name='lab',
                url='https://example.invalid', username='test', password='test',
                verify_ssl=True, timeout=12)),
        })
        view = SimpleNamespace(proxmox_collection='proxmox')
        result = method(view, {'cluster_id': 'lab'})
        self.assertIs(result['verify_ssl'], True)
        self.assertEqual(result['timeout'], 12)

    def test_all_vm_inputs_are_validated_before_provisioning(self):
        provisioner = ProxmoxProvisioner(Mock(), {'node': 'node'})
        provisioner.provision_vm = Mock(return_value={'vmid': 101})
        with self.assertRaises(ValueError):
            provisioner.provision_from_config({'vms': [vm(), {'name': 'invalid'}]})
        provisioner.provision_vm.assert_not_called()

    def test_partial_provisioning_failure_identifies_completed_vms(self):
        provisioner = ProxmoxProvisioner(Mock(), {'node': 'node'})
        provisioner.provision_vm = Mock(side_effect=[{'vmid': 101, 'node': 'node'}, ProxmoxAPIError('offline')])
        with self.assertRaisesRegex(ProxmoxAPIError, '101'):
            provisioner.provision_from_config({'vms': [vm(), vm()]})
        self.assertEqual(provisioner.provision_vm.call_count, 2)

    def test_amari_does_not_delete_recovery_record_after_target_failure(self):
        delete = load_method('katana-nbi/katana/api/amarisoft_slices.py', 'delete', {
            'mongoUtils': (mongo := Mock()), 'dumps': json.dumps,
        })
        mongo.get.return_value = {'_id': 'slice', 'status': 'running'}
        view = SimpleNamespace(collection='amari', _delete_from_targets=Mock(return_value={
            'ran': {'ok': True}, 'core': {'ok': False},
        }))
        _, status = delete(view, 'slice')
        self.assertEqual(status, 502)
        mongo.delete.assert_not_called()

    def test_amari_plan_deletion_does_not_contact_targets(self):
        delete = load_method('katana-nbi/katana/api/amarisoft_slices.py', 'delete', {
            'mongoUtils': (mongo := Mock()), 'dumps': json.dumps,
        })
        mongo.get.return_value = {'_id': 'slice', 'status': 'planned'}
        view = SimpleNamespace(collection='amari', _delete_from_targets=Mock())
        _, status = delete(view, 'slice')
        self.assertEqual(status, 200)
        view._delete_from_targets.assert_not_called()


if __name__ == '__main__':
    unittest.main()
