import React, { useState } from 'react';
import { Dialog } from './Dialog';
import { planBatch } from './collection-query.mjs';
import { planRestore } from './backup-model.mjs';
import { seriesLabel } from './product-lines.mjs';
import { jobLabels, summarizeJobs } from './import-jobs.mjs';

export function BatchDialog({ records, ids, locations, onApply, onClose }) {
  const [changes, setChanges] = useState({ locationMode: 'keep', location: '', seriesMode: 'keep', series: '' });
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const plan = planBatch(records, ids, changes);
  const change = key => ({ value: changes[key], onChange: event => setChanges({ ...changes, [key]: event.target.value }), disabled: saving });
  return <Dialog className="action-modal" aria-labelledby="batch-title" onClose={() => !saving && onClose()}><h2 id="batch-title">批次設定 {ids.length} 筆收藏</h2>
    <label>位置操作<select aria-label="位置操作" {...change('locationMode')}><option value="keep">不變更位置</option><option value="set">設定位置</option><option value="clear">清空位置</option></select></label>
    {changes.locationMode === 'set' && <label>批次存放位置<input list="batch-locations" maxLength={200} {...change('location')}/></label>}
    <datalist id="batch-locations">{locations.map(value => <option key={value} value={value}/>)}</datalist>
    <label>系列操作<select aria-label="系列操作" {...change('seriesMode')}><option value="keep">不變更系列</option><option value="set">設定系列／商品線</option></select></label>
    {changes.seriesMode === 'set' && <label>批次作品系列<input maxLength={100} placeholder="例如 HGUC 宇宙世紀" {...change('series')}/></label>}
    <p>修改位置會保留確認狀態；更動系列／商品線須重新確認。規格不會自動變更。</p>
    <h3>變更預覽</h3><ul className="preview-list">{plan.preview.map(item => <li key={item.id}><strong>{item.name}</strong><span>位置：{item.before.location || '位置未填'} → {item.after.location || '位置未填'}</span><span>系列：{seriesLabel(item.before)} → {seriesLabel(item.after)}{item.before.confirmed && !item.after.confirmed ? '（改為待確認）' : ''}</span></li>)}</ul>
    {!!plan.errors.length && <div role="alert" className="form-error"><p>整批尚未套用，請修正：</p><ul>{plan.errors.map((message, index) => <li key={index}>{message}</li>)}</ul></div>}
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="dialog-actions"><button className="secondary" disabled={saving} onClick={onClose}>取消</button><button className="primary" disabled={saving || plan.errors.length > 0 || (changes.locationMode === 'keep' && changes.seriesMode === 'keep')} onClick={async () => { setSaving(true); setError(''); try { await onApply(changes); onClose(); } catch (error) { setError(error.message || '儲存失敗，請重試。'); } finally { setSaving(false); } }}>套用批次設定</button></div>
  </Dialog>;
}

export function ExportDialog({ snapshot, onDownload, onClose }) {
  const [scope, setScope] = useState(snapshot.filteredDefault ? 'filtered' : 'all'), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const preview = snapshot[scope];
  return <Dialog className="action-modal" aria-labelledby="export-title" onClose={() => !saving && onClose()}><h2 id="export-title">匯出 Excel 預覽</h2><p>本次下載依開啟預覽時的資料快照產生。</p>
    <fieldset><legend>匯出範圍</legend><label className="radio-label"><input type="radio" name="export-scope" value="all" checked={scope === 'all'} onChange={() => setScope('all')} disabled={saving}/>全部已確認（{snapshot.all.records.length} 筆）</label><label className="radio-label"><input type="radio" name="export-scope" value="filtered" checked={scope === 'filtered'} onChange={() => setScope('filtered')} disabled={saving}/>目前篩選結果中的已確認（{snapshot.filtered.records.length} 筆）</label></fieldset>
    <p className="export-count">可匯出 {preview.records.length} 筆；未確認排除 {preview.excluded} 筆。</p><h3>系列分頁</h3><ul>{preview.groups.map(([series, count]) => <li key={series}>{series}：{count} 筆</li>)}</ul><p>四欄：比例／商品名稱（含規格）／價格／存放位置。</p>
    {!preview.records.length && <p role="status">此範圍尚無已確認且未刪除的收藏，請先確認商品或選擇其他範圍。</p>}
    {error && <p role="alert" className="form-error">{error}</p>}<div className="dialog-actions"><button className="secondary" disabled={saving} onClick={onClose}>取消</button><button className="primary" disabled={!preview.records.length || saving} onClick={async () => { setSaving(true); try { await onDownload(preview.records); onClose(); } catch (error) { setError(error.message); } finally { setSaving(false); } }}>下載 Excel</button></div>
  </Dialog>;
}

const contentDescription = row => `${row.name || '未命名商品'}／${seriesLabel(row)}／${row.grade}／${row.scale || '比例未填'}／價格 ${row.price === '' ? '未填' : row.price}／${row.location || '位置未填'}／${row.confirmed ? '已確認' : '待確認'}／${row.deletedAt ? '回收桶' : '收藏中'}`;
export function RestoreDialog({ backup, records, onApply, onClose }) {
  const [mode, setMode] = useState('full'), [choices, setChoices] = useState([]), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const plan = planRestore(records, backup, mode);
  return <Dialog className="action-modal restore-modal" aria-labelledby="restore-title" onClose={() => !saving && onClose()}><h2 id="restore-title">還原備份預覽</h2>
    <p>備份 v{backup.version}，共 {backup.total} 筆{backup.exportedAt ? `，匯出於 ${new Date(backup.exportedAt).toLocaleString('zh-TW')}` : ''}。本次將合併收藏。</p>
    <fieldset><legend>還原方式</legend><label className="radio-label"><input type="radio" name="restore-mode" checked={mode === 'full'} onChange={() => { setMode('full'); setChoices([]); }} disabled={saving}/>還原完整備份</label><label className="radio-label"><input type="radio" name="restore-mode" checked={mode === 'external'} onChange={() => { setMode('external'); setChoices([]); }} disabled={saving}/>作為外部資料匯入（全部待確認）</label></fieldset>
    {backup.version === 1 && <p className="field-note">v1 備份一律改為待確認；有有效 ID 者保留，無 ID 者以本檔來源建立固定識別。同名手動紀錄不自動合併，無法判斷不同舊備份中的無 ID 無照片紀錄是否為同一件。</p>}
    <p className="restore-counts">新增 {plan.counts.new}／相同 {plan.counts.same}／衝突 {plan.counts.conflict}／無效 {plan.counts.invalid}</p>
    {!!backup.errors.length && <div role="alert" className="form-error"><strong>檔案含無效內容，整份尚未套用：</strong><ul>{backup.errors.map((item, index) => <li key={index}>{item.message}</li>)}</ul></div>}
    <ul className="preview-list">{plan.items.filter(item => item.kind === 'conflict').map(item => <li key={item.key}><strong>{item.reason}</strong><span>目前：{item.targets.map(contentDescription).join('；')}</span><span>備份：{contentDescription(item.incoming)}</span><details><summary>查看欄位差異與辨識證據</summary><pre>{JSON.stringify({ current: item.targets.map(({ image, ...row }) => ({ ...row, image: image ? '含照片' : '無照片' })), backup: { ...item.incoming, image: item.incoming.image ? '含照片' : '無照片' } }, null, 2)}</pre></details><label className="radio-label"><input type="checkbox" aria-label={`採用備份 ${item.incoming.name || item.incoming.id}`} checked={choices.includes(item.key)} disabled={saving || item.targets.length !== 1} onChange={event => setChoices(previous => event.target.checked ? [...previous, item.key] : previous.filter(key => key !== item.key))}/>採用這筆備份（未勾選則保留現有）</label></li>)}</ul>
    {error && <p role="alert" className="form-error">{error}</p>}<div className="dialog-actions"><button className="secondary" onClick={onClose} disabled={saving}>取消</button><button className="primary" disabled={saving || backup.errors.length > 0} onClick={async () => { setSaving(true); setError(''); try { await onApply(mode, choices); onClose(); } catch (error) { setError(error.message || '還原儲存失敗，原收藏仍保留，可重試。'); } finally { setSaving(false); } }}>確認合併還原</button></div>
  </Dialog>;
}

export function TrashDialog({ records, onRestore, onPurge, onClose }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const action = async callback => { setBusy(true); setError(''); try { await callback(); } catch { setError('儲存失敗，原資料仍保留，請重試。'); } finally { setBusy(false); } };
  return <Dialog className="action-modal" aria-labelledby="trash-title" onClose={() => !busy && onClose()}><h2 id="trash-title">回收桶（{records.length} 筆）</h2><p>復原會保留照片、價格與確認狀態。回收桶不會自動清空。</p>{!records.length && <p>回收桶目前是空的。</p>}<ul className="preview-list">{records.map(row => <li key={row.id}><strong>{row.name || '未命名商品'}</strong><span>{seriesLabel(row)} · {row.location || '位置未填'} · {row.confirmed ? '已確認' : '待確認'}</span><div className="dialog-actions"><button className="secondary" disabled={busy} onClick={() => action(() => onRestore(row.id))}>復原 {row.name || '未命名商品'}</button><button className="delete-button" disabled={busy} onClick={() => { if (window.confirm(`永久刪除「${row.name || '未命名商品'}」（1 筆）？照片與資料將無法復原。`)) action(() => onPurge(row.id)); }}>永久刪除 {row.name || '未命名商品'}</button></div></li>)}</ul>{error && <p role="alert">{error}</p>}<div className="dialog-actions"><button className="secondary" disabled={busy} onClick={onClose}>關閉回收桶</button></div></Dialog>;
}

export function ImportReport({ jobs, busy, onRetry, onRestore }) {
  if (!jobs.length) return null;
  const summary = summarizeJobs(jobs);
  return <section className="import-report" aria-labelledby="report-title"><h2 id="report-title">{busy ? '匯入進度' : '匯入結果'}</h2><p className="import-summary" role="status">已處理 {summary.processed}／{summary.total} 張；已建立紀錄 {summary.created} 筆，辨識成功 {summary.succeeded} 張。</p><p>{Object.entries(summary.counts).map(([key, count]) => `${jobLabels[key]} ${count}`).join(' · ')}</p><details open={!busy}><summary>逐張結果與處理方式</summary><ul className="preview-list">{jobs.map(job => <li key={job.key}><strong>{job.fileName} · {jobLabels[job.status]}</strong>{job.error && <span>{job.error}</span>}<span>{job.action}</span>{job.status === 'recognition' && job.recordId && <button className="secondary" disabled={busy} onClick={() => onRetry(job)}>重試辨識 {job.fileName}</button>}{job.deleted && <button className="secondary" disabled={busy} onClick={() => onRestore(job.recordId)}>復原既有收藏 {job.fileName}</button>}</li>)}</ul></details><p className="input-hint">報告不保存原始大檔；重新開頁後，可從保有照片的錯誤紀錄重試辨識。</p></section>;
}
