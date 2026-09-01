import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { IconModelCluster, IconRefreshCw, IconSearch } from '@/components/ui/icons';
import { useAuthStore, useNotificationStore } from '@/stores';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { formatCompactNumber, formatDateTimeValue, formatPercent } from '@/utils/format';
import { deviceUsageApi, type DeviceUsageDetail, type DeviceUsageQuery, type DeviceUsageStatus, type DeviceUsageSummary, type DeviceUsageUser } from '@/services/api/deviceUsage';
import styles from './DeviceUsagePage.module.scss';

const DEFAULT_RANGE_DAYS = 7;
const pageSize = 50;
const emptyStatus: DeviceUsageStatus = {
  schema_version: 0,
  collection_enabled: false,
  storage_available: false,
  data_available: false,
  queued_events: 0,
  dropped_events: 0,
  failed_writes: 0,
  retention_days: 0,
};

const toRange = (days = DEFAULT_RANGE_DAYS): Pick<DeviceUsageQuery, 'start_time' | 'end_time'> => {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start_time: start.toISOString(), end_time: end.toISOString() };
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : 'Request failed';

const percentFor = (item: DeviceUsageSummary): string =>
  item.success_rate === undefined ? '—' : formatPercent(item.success_rate);

export function DeviceUsagePage() {
  const { t, i18n } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const { showNotification, showConfirmation } = useNotificationStore();
  const [range, setRange] = useState(toRange);
  const [devices, setDevices] = useState<DeviceUsageSummary[]>([]);
  const [users, setUsers] = useState<DeviceUsageUser[]>([]);
  const [status, setStatus] = useState<DeviceUsageStatus>(emptyStatus);
  const [totals, setTotals] = useState({ requests: 0, tokens: 0, successes: 0, failures: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [devicesPageCount, setDevicesPageCount] = useState(0);
  const [deviceTotal, setDeviceTotal] = useState(0);
  const [userTotal, setUserTotal] = useState(0);
  const [selectedDevice, setSelectedDevice] = useState<DeviceUsageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'devices' | 'users'>('devices');
  const [userName, setUserName] = useState('');
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [newUserSaving, setNewUserSaving] = useState(false);
  const [membershipUser, setMembershipUser] = useState<DeviceUsageUser | null>(null);
  const [membershipDevices, setMembershipDevices] = useState<DeviceUsageSummary[]>([]);
  const [membershipSelection, setMembershipSelection] = useState<string[]>([]);
  const [membershipSaving, setMembershipSaving] = useState(false);

  const query = useMemo<DeviceUsageQuery>(
    () => ({ ...range, q: search.trim() || undefined, page, page_size: pageSize, sort_by: 'total_tokens', sort_order: 'desc' }),
    [page, range, search]
  );

  const load = useCallback(async () => {
    if (connectionStatus !== 'connected') return;
    setLoading(true);
    setError('');
    try {
      const [deviceResult, userResult] = await Promise.all([
        deviceUsageApi.listDevices(query),
        deviceUsageApi.listUsers({ ...range, page: 1, page_size: 200 }),
      ]);
      setDevices(deviceResult.data.items);
      setUsers(userResult.data.items);
      setDevicesPageCount(deviceResult.data.total_pages);
      setDeviceTotal(deviceResult.data.total);
      setUserTotal(userResult.data.total);
      setTotals({ requests: deviceResult.totals.requests, tokens: deviceResult.totals.total_tokens, successes: deviceResult.totals.successes, failures: deviceResult.totals.failures });
      setStatus(deviceResult.status);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [connectionStatus, query, range]);

  useEffect(() => {
    void load();
  }, [load]);

  useHeaderRefresh(load, connectionStatus === 'connected');

  const successRate = totals.requests > 0 ? (totals.successes / totals.requests) * 100 : null;

  const openDevice = async (device: DeviceUsageSummary) => {
    setDetailLoading(true);
    try {
      const result = await deviceUsageApi.getDevice(device.device_id, range);
      setSelectedDevice(result.data);
    } catch (err) {
      showNotification(`${t('device_usage.load_failed')}: ${errorMessage(err)}`, 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const renameDevice = (device: DeviceUsageSummary) => {
    const nextName = window.prompt(t('device_usage.rename_device_prompt'), device.name)?.trim();
    if (!nextName || nextName === device.name) return;
    void deviceUsageApi.updateDevice(device.device_id, nextName)
      .then(() => load())
      .then(() => showNotification(t('device_usage.device_updated'), 'success'))
      .catch((err) => showNotification(`${t('device_usage.save_failed')}: ${errorMessage(err)}`, 'error'));
  };

  const createUser = async () => {
    const name = userName.trim();
    if (!name) return;
    setNewUserSaving(true);
    try {
      await deviceUsageApi.createUser(name);
      setUserName('');
      setNewUserOpen(false);
      showNotification(t('device_usage.user_created'), 'success');
      await load();
    } catch (err) {
      showNotification(`${t('device_usage.save_failed')}: ${errorMessage(err)}`, 'error');
    } finally {
      setNewUserSaving(false);
    }
  };

  const renameUser = (user: DeviceUsageUser) => {
    const nextName = window.prompt(t('device_usage.rename_prompt'), user.name)?.trim();
    if (!nextName || nextName === user.name) return;
    void deviceUsageApi.updateUser(user.user_id, nextName)
      .then(() => load())
      .then(() => showNotification(t('device_usage.user_updated'), 'success'))
      .catch((err) => showNotification(`${t('device_usage.save_failed')}: ${errorMessage(err)}`, 'error'));
  };

  const manageMembers = async (user: DeviceUsageUser) => {
    setMembershipUser(user);
    setMembershipSelection(user.device_ids);
    try {
      const result = await deviceUsageApi.listDevices({ ...range, page: 1, page_size: 200, sort_by: 'name', sort_order: 'asc' });
      setMembershipDevices(result.data.items);
    } catch (err) {
      showNotification(`${t('device_usage.load_failed')}: ${errorMessage(err)}`, 'error');
      setMembershipUser(null);
    }
  };

  const saveMembers = async () => {
    if (!membershipUser) return;
    setMembershipSaving(true);
    try {
      const current = new Set(membershipUser.device_ids);
      const next = new Set(membershipSelection);
      await Promise.all([
        ...membershipSelection.filter((id) => !current.has(id)).map((id) => deviceUsageApi.addDevice(membershipUser.user_id, id)),
        ...membershipUser.device_ids.filter((id) => !next.has(id)).map((id) => deviceUsageApi.removeDevice(membershipUser.user_id, id)),
      ]);
      setMembershipUser(null);
      showNotification(t('device_usage.members_updated'), 'success');
      await load();
    } catch (err) {
      showNotification(`${t('device_usage.save_failed')}: ${errorMessage(err)}`, 'error');
    } finally {
      setMembershipSaving(false);
    }
  };

  const deleteUser = (user: DeviceUsageUser) => {
    showConfirmation({
      title: t('device_usage.delete_user_title'),
      message: t('device_usage.delete_user_message', { name: user.name }),
      variant: 'danger',
      onConfirm: async () => {
        await deviceUsageApi.deleteUser(user.user_id);
        await load();
        showNotification(t('device_usage.user_deleted'), 'success');
      },
    });
  };

  const setPreset = (days: number) => {
    setRange(toRange(days));
    setPage(1);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{t('device_usage.eyebrow')}</p>
          <h1 className={styles.title}>{t('device_usage.title')}</h1>
          <p className={styles.description}>{t('device_usage.description')}</p>
        </div>
        <Button variant="secondary" onClick={() => void load()} loading={loading}>
          <IconRefreshCw size={16} /> {t('device_usage.refresh')}
        </Button>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.presets} role="group" aria-label={t('device_usage.range_label')}>
          {[1, 7, 30].map((days) => (
            <Button key={days} size="sm" variant="ghost" onClick={() => setPreset(days)}>
              {t(`device_usage.range_${days}`)}
            </Button>
          ))}
        </div>
        <label className={styles.search}>
          <IconSearch size={16} aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder={t('device_usage.search_placeholder')}
            aria-label={t('device_usage.search_placeholder')}
          />
        </label>
      </div>

      {!status.collection_enabled && connectionStatus === 'connected' && (
        <div className={styles.notice} role="status">{t('device_usage.collection_disabled')}</div>
      )}
      {status.storage_error && (
        <div className={styles.errorNotice} role="alert">{t('device_usage.storage_error')}: {status.storage_error}</div>
      )}
      {status.dropped_events > 0 && (
        <div className={styles.warningNotice} role="status">{t('device_usage.dropped_events', { count: status.dropped_events })}</div>
      )}
      {error && <div className={styles.errorNotice} role="alert">{t('device_usage.load_failed')}: {error}</div>}

      <section className={styles.kpis} aria-label={t('device_usage.kpis')}>
        {[
          [t('device_usage.devices'), deviceTotal],
          [t('device_usage.users'), userTotal],
          [t('device_usage.requests'), formatCompactNumber(totals.requests)],
          [t('device_usage.tokens'), formatCompactNumber(totals.tokens)],
          [t('device_usage.success_rate'), successRate === null ? '—' : formatPercent(successRate)],
        ].map(([label, value]) => (
          <Card key={String(label)} className={styles.kpi}>
            <span>{label}</span><strong>{value}</strong>
          </Card>
        ))}
      </section>

      <Card className={styles.panel}>
        <div className={styles.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={activeTab === 'devices'} className={activeTab === 'devices' ? styles.activeTab : ''} onClick={() => setActiveTab('devices')}>
            {t('device_usage.devices_tab')}
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'users'} className={activeTab === 'users' ? styles.activeTab : ''} onClick={() => setActiveTab('users')}>
            <IconModelCluster size={15} /> {t('device_usage.users_tab')}
          </button>
          {activeTab === 'users' && <Button size="sm" onClick={() => setNewUserOpen(true)}>{t('device_usage.create_user')}</Button>}
        </div>

        {loading && devices.length === 0 ? <p className={styles.state}>{t('device_usage.loading')}</p> : null}
        {!loading && activeTab === 'devices' && devices.length === 0 ? <EmptyState title={t('device_usage.empty_title')} description={t('device_usage.empty_description')} /> : null}
        {activeTab === 'devices' && devices.length > 0 && (
          <Table>
            <TableHeader><TableRow><TableHead>{t('device_usage.device')}</TableHead><TableHead>{t('device_usage.source')}</TableHead><TableHead alignRight>{t('device_usage.requests')}</TableHead><TableHead alignRight>{t('device_usage.tokens')}</TableHead><TableHead alignRight>{t('device_usage.success_rate')}</TableHead><TableHead>{t('device_usage.last_seen')}</TableHead></TableRow></TableHeader>
            <TableBody>{devices.map((device) => <TableRow key={device.device_id} onClick={() => void openDevice(device)} className={styles.clickable}>
              <TableCell><div className={styles.deviceName}>{device.name}</div><code>{device.display_id}</code>{device.user_name ? <span className={styles.userBadge}>{device.user_name}</span> : null}<Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); renameDevice(device); }}>{t('device_usage.rename')}</Button></TableCell>
              <TableCell><span className={styles.source}>{device.source}</span><small>{device.confidence}</small></TableCell>
              <TableCell alignRight>{device.requests.toLocaleString()}</TableCell><TableCell alignRight>{formatCompactNumber(device.total_tokens)}</TableCell><TableCell alignRight>{percentFor(device)}</TableCell><TableCell>{formatDateTimeValue(device.last_seen, i18n.language) || '—'}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        )}
        {activeTab === 'users' && users.length === 0 ? <EmptyState title={t('device_usage.no_users_title')} description={t('device_usage.no_users_description')} /> : null}
        {activeTab === 'users' && users.length > 0 && <Table>
          <TableHeader><TableRow><TableHead>{t('device_usage.user')}</TableHead><TableHead alignRight>{t('device_usage.devices')}</TableHead><TableHead alignRight>{t('device_usage.requests')}</TableHead><TableHead alignRight>{t('device_usage.tokens')}</TableHead><TableHead>{t('device_usage.actions')}</TableHead></TableRow></TableHeader>
          <TableBody>{users.map((user) => <TableRow key={user.user_id}><TableCell><strong>{user.name}</strong><small>{user.device_ids.join(', ') || t('device_usage.no_members')}</small></TableCell><TableCell alignRight>{user.device_count}</TableCell><TableCell alignRight>{user.requests.toLocaleString()}</TableCell><TableCell alignRight>{formatCompactNumber(user.total_tokens)}</TableCell><TableCell><div className={styles.actions}><Button size="sm" variant="ghost" onClick={() => void manageMembers(user)}>{t('device_usage.members')}</Button><Button size="sm" variant="ghost" onClick={() => renameUser(user)}>{t('device_usage.rename')}</Button><Button size="sm" variant="danger" onClick={() => deleteUser(user)}>{t('device_usage.delete')}</Button></div></TableCell></TableRow>)}</TableBody>
        </Table>}
        {activeTab === 'devices' && devicesPageCount > 1 ? <div className={styles.pagination}><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t('device_usage.previous')}</Button><span>{page} / {devicesPageCount}</span><Button size="sm" variant="secondary" disabled={page >= devicesPageCount} onClick={() => setPage((value) => value + 1)}>{t('device_usage.next')}</Button></div> : null}
      </Card>

      <Modal open={newUserOpen} title={t('device_usage.create_user')} onClose={() => setNewUserOpen(false)} footer={<><Button variant="ghost" onClick={() => setNewUserOpen(false)}>{t('common.cancel')}</Button><Button onClick={() => void createUser()} loading={newUserSaving}>{t('common.confirm')}</Button></>}>
        <Input label={t('device_usage.user_name')} value={userName} onChange={(event) => setUserName(event.target.value)} autoFocus maxLength={80} />
        <p className={styles.modalHint}>{t('device_usage.user_hint')}</p>
      </Modal>

      <Modal open={Boolean(membershipUser)} title={membershipUser ? `${t('device_usage.members')}: ${membershipUser.name}` : undefined} onClose={() => setMembershipUser(null)} footer={<><Button variant="ghost" onClick={() => setMembershipUser(null)}>{t('common.cancel')}</Button><Button onClick={() => void saveMembers()} loading={membershipSaving}>{t('common.confirm')}</Button></>}>
        <div className={styles.memberPicker}>
          {membershipDevices.map((device) => <label key={device.device_id} className={styles.memberOption}><input type="checkbox" checked={membershipSelection.includes(device.device_id)} onChange={(event) => setMembershipSelection((current) => event.target.checked ? [...current, device.device_id] : current.filter((id) => id !== device.device_id))} /><span><strong>{device.name}</strong><code>{device.display_id}</code></span></label>)}
          {membershipDevices.length === 0 ? <p className={styles.state}>{t('device_usage.no_devices')}</p> : null}
        </div>
      </Modal>

      <Modal open={Boolean(selectedDevice)} title={selectedDevice?.name} onClose={() => setSelectedDevice(null)}>
        {detailLoading ? <p className={styles.state}>{t('device_usage.loading')}</p> : selectedDevice ? <div className={styles.detail}>
          <div className={styles.detailMeta}><code>{selectedDevice.display_id}</code><span>{selectedDevice.source} · {selectedDevice.confidence}</span></div>
          <div className={styles.detailStats}><span>{t('device_usage.requests')}<b>{selectedDevice.requests.toLocaleString()}</b></span><span>{t('device_usage.tokens')}<b>{formatCompactNumber(selectedDevice.total_tokens)}</b></span><span>{t('device_usage.success_rate')}<b>{percentFor(selectedDevice)}</b></span></div>
          <h3>{t('device_usage.trend')}</h3>
          {selectedDevice.trend.length === 0 ? <p className={styles.state}>{t('device_usage.no_trend')}</p> : <div className={styles.trend}>{selectedDevice.trend.map((point) => <div key={point.period} className={styles.trendRow}><span>{formatDateTimeValue(point.period, i18n.language)}</span><i style={{ '--bar': `${Math.min(100, point.total_tokens / Math.max(1, selectedDevice.total_tokens) * 100 * selectedDevice.trend.length) }%` } as React.CSSProperties} /><b>{formatCompactNumber(point.total_tokens)}</b></div>)}</div>}
          <h3>{t('device_usage.top_models')}</h3><ul className={styles.breakdown}>{selectedDevice.by_model.map((item) => <li key={item.name}><span>{item.name}</span><b>{formatCompactNumber(item.total_tokens)}</b></li>)}</ul>
        </div> : null}
      </Modal>
    </div>
  );
}
