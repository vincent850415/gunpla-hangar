import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, Boxes, ArrowUpRight, Download, Plus, Search, X, Check, CheckCheck, ImagePlus, FolderOpen, ScanLine, HardDrive, ChevronRight, FileSpreadsheet, LoaderCircle, AlertCircle, ArchiveRestore, ShieldCheck, CircleHelp, Trash2 } from 'lucide-react';
import { GRADES } from './catalog.mjs';
import { parseSeriesLabel, seriesLabel } from './product-lines.mjs';
import { recognize, imageData } from './recognition';
import { loadWorkspace, saveWorkspace, download, readBackup } from './storage';
import { createCollectionStore } from './collection-store.mjs';
import { confirmationIds, confirmationSummary, queueTarget } from './editor-model.mjs';
import { activeRecords, defaultQuery, exportPreview, hasFilters, locationSuggestions, planBatch, queryCollection } from './collection-query.mjs';
import { backupStatus, emptyMetadata } from './workspace-model.mjs';
import { mergeRestore, planRestore } from './backup-model.mjs';
import { runImportBatch, summarizeJobs } from './import-jobs.mjs';
import { BatchDialog, ExportDialog, ImportReport, RestoreDialog, TrashDialog } from './CollectionDialogs';
import { Editor } from './Editor';
import { Dialog } from './Dialog';
import './style.css';

const newRecord = () => ({ id: crypto.randomUUID(), name: '', grade: '待確認', productLine: '', series: '待確認', scale: '', price: '', location: '', image: '', confirmed: false, status: 'ready', warnings: [], deletedAt: null, createdAt: new Date().toISOString() });
const sortLabels = { newest: '新增時間：新到舊', oldest: '新增時間：舊到新', name: '商品名稱', 'price-desc': '價格：高到低', 'price-asc': '價格：低到高' };

function App() {
  const [records, setRecords] = useState([]), [metadata, setMetadata] = useState(emptyMetadata), [loaded, setLoaded] = useState(false), [saveState, setSaveState] = useState('loading');
  const [query, setQuery] = useState(defaultQuery), [selected, setSelected] = useState([]), [editor, setEditor] = useState(null), [queue, setQueue] = useState(null);
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(''), [jobs, setJobs] = useState([]), [notice, setNotice] = useState(''), [undo, setUndo] = useState(null);
  const [help, setHelp] = useState(false), [dragging, setDragging] = useState(false), [uploadExpanded, setUploadExpanded] = useState(false);
  const [batch, setBatch] = useState(false), [exportSnapshot, setExportSnapshot] = useState(null), [restoreSnapshot, setRestoreSnapshot] = useState(null), [trash, setTrash] = useState(false), [migrationError, setMigrationError] = useState('');
  const fileInput = useRef(), restoreInput = useRef(), current = useRef([]), busyRef = useRef(false), stopped = useRef(false), store = useRef();
  if (!store.current) store.current = createCollectionStore(saveWorkspace, (next, meta) => { current.current = next; setRecords(next); setMetadata(meta); }, setSaveState);
  const commit = (change, meta) => store.current.update(change, meta);
  async function load() {
    setSaveState('loading'); setLoaded(false);
    try {
      const workspace = await loadWorkspace();
      store.current.hydrate(workspace.records, workspace.metadata);
      setMigrationError(workspace.migrationError || '');
      if (workspace.migrationError) { setSaveState('error'); return; }
      setLoaded(true); setSaveState('saved');
      if (workspace.records.some(row => row.status === 'processing')) {
        try { await commit(rows => rows.map(row => row.status === 'processing' ? { ...row, status: 'error', error: '上次辨識中斷，可重新辨識。' } : row)); setNotice('上次匯入／辨識中斷；保有照片的錯誤紀錄可重新辨識，未保存的照片請重新選取。'); }
        catch { setNotice('中斷狀態無法儲存，請先備份後重試。'); }
      }
    } catch { setNotice('無法讀取本機資料。請勿清除網站資料，確認瀏覽器允許儲存後再重試。'); setSaveState('error'); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (saveState !== 'saving') return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);
  useEffect(() => { if (!undo) return; const timer = setTimeout(() => setUndo(null), 12000); return () => clearTimeout(timer); }, [undo]);
  const live = activeRecords(records), confirmed = live.filter(row => row.confirmed).length;
  const series = [...new Set(live.map(seriesLabel).filter(value => value !== '待確認'))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  const locations = locationSuggestions(records), visible = queryCollection(records, query), status = backupStatus(metadata);
  const disabled = !loaded || busy || saveState === 'saving';
  const active = query.series || (query.confirmation === 'pending' ? '待確認' : '全部收藏');
  function changeQuery(patch) {
    if (selected.length) { setSelected([]); setNotice('篩選或排序已改變，已清除選取，請重新選取要批次修改的收藏。'); }
    setQuery(previous => ({ ...previous, ...patch }));
  }
  const clearQuery = () => changeQuery({ ...defaultQuery });
  const runAction = async action => { try { await action(); } catch (error) { setNotice(error.message || '儲存失敗，原資料仍保留，請重試。'); } };
  async function processImages(fileList) {
    if (busyRef.current || disabled || editor || restoreSnapshot || batch) return;
    const files = [...fileList]; if (!files.length) return;
    if (files.length > 100) { setNotice('每批最多 100 張照片，請分批匯入。'); return; }
    busyRef.current = true; stopped.current = false; setBusy(true); setNotice(''); setSelected([]);
    try {
      const result = await runImportBatch(files, {
        records: () => current.current, stopped: () => stopped.current, report: setJobs, progress: setProgress,
        hash: async file => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, '0')).join(''),
        decode: imageData, recognize,
        create: async fields => { const row = { ...newRecord(), ...fields, status: 'processing' }; await commit(rows => [row, ...rows]); return row; },
        complete: (id, result) => commit(rows => rows.map(row => row.id === id ? { ...row, ...result, price: row.price, location: row.location, confirmed: false, status: 'ready', error: '' } : row)),
        fail: id => commit(rows => rows.map(row => row.id === id ? { ...row, status: 'error', error: '辨識未完成，可重試原紀錄或手動填寫。' } : row)),
      });
      const summary = summarizeJobs(result);
      setNotice(`新增 ${summary.created} 筆；辨識成功 ${summary.succeeded} 張${summary.counts.duplicate ? `；略過 ${summary.counts.duplicate} 張重複照片` : ''}${summary.counts.cancelled ? `；已取消 ${summary.counts.cancelled} 張` : ''}。請查看逐張結果並核對收藏。`);
    } finally { busyRef.current = false; setBusy(false); setProgress(''); }
  }
  async function retryJob(job) {
    if (disabled || busyRef.current) return;
    const row = current.current.find(row => row.id === job.recordId && !row.deletedAt);
    if (!row?.image) { setNotice('這筆照片已刪除或不存在，可從回收桶復原後重試。'); return; }
    busyRef.current = true; setBusy(true); setProgress('重試原紀錄辨識中…');
    setJobs(items => items.map(item => item.key === job.key ? { ...item, status: 'recognizing', error: '' } : item));
    try {
      const result = await recognize(row.image, message => setProgress(message.status === 'recognizing text' ? `辨識文字 ${Math.round(message.progress * 100)}%（本張）` : '準備辨識引擎'));
      await commit(rows => rows.map(item => item.id === row.id ? { ...item, ...result, price: item.price, location: item.location, confirmed: false, status: 'ready', error: '' } : item));
      setJobs(items => items.map(item => item.key === job.key ? { ...item, status: 'success', error: '', action: '原紀錄已更新，請人工確認。' } : item));
    } catch { setJobs(items => items.map(item => item.key === job.key ? { ...item, status: 'recognition', error: '重試未完成，原紀錄仍保留。', action: '可再次重試或從收藏清單手動填寫。' } : item)); }
    finally { busyRef.current = false; setBusy(false); setProgress(''); }
  }
  async function sample() {
    try { const response = await fetch('/sample.jpg'); if (!response.ok) throw new Error(); await processImages([new File([await response.blob()], '20261103.jpg', { type: 'image/jpeg' })]); }
    catch { setNotice('無法載入範例，請直接選取你的照片。'); }
  }
  function openExport() { setExportSnapshot({ all: exportPreview(queryCollection(current.current, { sort: query.sort })), filtered: exportPreview(visible), filteredDefault: hasFilters(query) }); }
  async function downloadExcel(snapshot) {
    const { excelBlob } = await import('./export.mjs');
    download(await excelBlob(snapshot), `模型收藏_${new Date().toLocaleDateString('sv-SE')}.xlsx`); setNotice(`已匯出 ${snapshot.length} 筆已確認商品，依作品系列分頁。`);
  }
  async function backup(draft) {
    try {
      const snapshot = store.current.snapshot(), exportedAt = new Date().toISOString();
      const rows = draft?.id ? [{ ...draft, ...parseSeriesLabel(draft.series), updatedAt: exportedAt, confirmed: false }, ...snapshot.records.filter(row => row.id !== draft.id)] : snapshot.records;
      download(new Blob([JSON.stringify({ version: 2, exportedAt, records: rows }, null, 2)], { type: 'application/json' }), `格納庫備份_${new Date().toLocaleDateString('sv-SE')}.json`);
      if (!draft?.id && loaded) await commit(rows => rows, meta => ({ ...meta, lastBackupAt: exportedAt, backupBaseline: { ...snapshot.metadata.revisions }, reminderDismissedAt: null }));
      setNotice(draft?.id ? '已觸發含草稿備份下載，目前草稿標為待確認。' : '已觸發完整備份下載，請確認瀏覽器下載位置與檔案。');
    } catch { setNotice('備份下載或狀態寫入失敗，請檢查下載項目並重試；收藏仍保留。'); }
  }
  async function restore(file) {
    if (!file || disabled || busyRef.current) return;
    try {
      if (file.size > 200 * 1024 * 1024) throw new Error('備份超過 200 MB，無法匯入。');
      const parsed = await readBackup(JSON.parse(await file.text()));
      for (const [index, row] of parsed.records.entries()) if (row.image) {
        try { const image = new Image(); image.src = row.image; await image.decode(); }
        catch { parsed.errors.push({ index, message: `「${row.name || '未命名商品'}」的照片無法解碼，請確認備份內容。` }); }
      }
      setRestoreSnapshot({ backup: parsed, records: structuredClone(current.current), revision: store.current.snapshot().metadata.revision });
    } catch (error) { setNotice(`讀取備份失敗：${error.message}`); }
  }
  async function applyRestore(mode, choices) {
    const snapshot = restoreSnapshot;
    if (snapshot.backup.errors.length) throw new Error('備份含無效內容，整份未套用。');
    let applied = 0;
    await commit(rows => {
      if (store.current.snapshot().metadata.revision !== snapshot.revision) throw new Error('預覽後資料已改變，請取消並重新選取備份。');
      const plan = planRestore(rows, snapshot.backup, mode);
      applied = plan.counts.new + choices.length;
      return mergeRestore(rows, plan, choices);
    });
    setSelected([]); setNotice(`已還原 ${applied} 筆，已合併收藏；未勾選的衝突保留現有資料。${mode === 'external' || snapshot.backup.version === 1 ? '匯入內容請重新確認。' : '有效 v2 確認與回收桶狀態已保留。'}`);
  }
  const saveEditor = async saved => { const rows = await commit(rows => rows.some(row => row.id === saved.id) ? rows.map(row => row.id === saved.id ? saved : row) : [saved, ...rows]); return rows.find(row => row.id === saved.id); };
  const closeEditor = () => { setEditor(null); setQueue(null); };
  function startConfirmation() { const ids = confirmationIds(visible); if (!ids.length) return; setQueue({ ids, index: 0 }); setEditor({ ...current.current.find(row => row.id === ids[0]) }); }
  function moveQueue(direction, nextQueue = queue) {
    const index = queueTarget(nextQueue.ids, nextQueue.index, direction, current.current);
    if (index < 0) {
      if (direction > 0) { const summary = confirmationSummary(nextQueue.ids, current.current); setNotice(`本輪確認完成：共 ${nextQueue.ids.length} 筆，本輪已確認 ${summary.confirmed} 筆，仍待確認 ${summary.pending} 筆${summary.removed ? `，略過已移除 ${summary.removed} 筆` : ''}。`); closeEditor(); }
      return;
    }
    setQueue({ ...nextQueue, index }); setEditor({ ...current.current.find(row => row.id === nextQueue.ids[index]) });
  }
  function savedEditor(saved, confirm) { if (queue && confirm) moveQueue(1); else closeEditor(); }
  async function deleteEditor() {
    const id = editor.id;
    await commit(rows => rows.map(row => row.id === id ? { ...row, deletedAt: new Date().toISOString() } : row));
    setUndo(id); setNotice(`已將「${editor.name || '未命名商品'}」移至回收桶。`); setSelected(items => items.filter(item => item !== id));
    if (queue) moveQueue(1); else closeEditor();
  }
  async function restoreDeleted(id) { await commit(rows => rows.map(row => row.id === id ? { ...row, deletedAt: null } : row)); setUndo(null); setNotice('已復原收藏，照片、價格與確認狀態均保留。'); setJobs(items => items.map(item => item.recordId === id && item.deleted ? { ...item, deleted: false, action: '既有收藏已復原。' } : item)); }
  async function applyBatch(changes) {
    const ids = [...selected];
    await commit(rows => { const plan = planBatch(rows, ids, changes); if (plan.errors.length) throw new Error(plan.errors.join('；')); return plan.records; });
    setSelected([]); setNotice(`已儲存 ${ids.length} 筆批次設定。`);
  }
  const filters = [query.search && ['search', `搜尋：${query.search}`], query.series && ['series', `系列：${query.series}`], query.grade && ['grade', `規格：${query.grade}`], query.location && ['location', `位置：${query.location === '__empty__' ? '未填寫' : query.location.replace(/^value:/, '')}`], query.confirmation && ['confirmation', query.confirmation === 'confirmed' ? '已確認' : '待確認']].filter(Boolean);
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="格納庫首頁"><span className="brand-mark"><Box size={25}/></span><span>格納庫<small>GUNPLA HANGAR</small></span></a>
      <div className="workspace"><span className="avatar">私</span><div>我的模型收藏<small>PERSONAL WORKSPACE</small></div><ChevronRight size={14}/></div>
      <div className="nav-label">收藏管理</div><nav><button className={`nav-item ${!query.series && !query.confirmation ? 'selected' : ''}`} onClick={() => changeQuery({ series: '', confirmation: '' })}><Boxes size={18}/>全部收藏<span>{live.length}</span></button><button className={`nav-item ${query.confirmation === 'pending' ? 'selected' : ''}`} onClick={() => changeQuery({ series: '', confirmation: 'pending' })}><ScanLine size={18}/>待確認<span>{live.length - confirmed}</span></button></nav>
      <div className="nav-label series-label">作品系列 <span>{series.length}</span></div><div className="series-nav">{series.length ? series.map(value => <button key={value} className={`nav-item ${query.series === value ? 'selected' : ''}`} onClick={() => changeQuery({ series: value })}><span className="series-dot"/>{value}<span>{live.filter(row => seriesLabel(row) === value).length}</span></button>) : <p>匯入收藏後，系列會出現在這裡。</p>}</div>
      <div className="sidebar-bottom"><div className="local-card"><ShieldCheck size={19}/><strong>你的收藏，留在你的裝置</strong><p>照片與辨識都在本機處理。<br/>定期下載完整備份。</p></div><button className="nav-item" onClick={() => backup()} disabled={!records.length || saveState === 'saving'}><Download size={17}/>備份收藏</button><button className="nav-item" onClick={() => restoreInput.current.click()} disabled={disabled}><ArchiveRestore size={17}/>還原備份</button><button className="nav-item" onClick={() => setTrash(true)} disabled={!loaded || busy}><Trash2 size={17}/>回收桶（{records.filter(row => row.deletedAt).length}）</button><button className="nav-item" onClick={() => setHelp(true)}><CircleHelp size={17}/>使用說明</button><div className={`storage-status ${saveState === 'error' ? 'error-text' : ''}`}><span/>{saveState === 'saved' ? '已儲存至這台裝置' : saveState === 'saving' ? '正在儲存…' : saveState === 'error' ? '儲存異常，請先備份' : '正在讀取收藏…'}</div></div>
    </aside>
    <main><header className="topbar"><div className="breadcrumb">我的格納庫 <ChevronRight size={14}/><span>{active}</span></div><div className="device-label"><HardDrive size={15}/> 本機工作空間 <span className="version">BETA 0.3</span></div></header><div className="page">
      <section className="page-heading"><div><div className="eyebrow">A HOME FOR EVERY BUILD</div><h1>{active === '全部收藏' ? '把熱愛，好好收藏。' : active}</h1><p>從一張盒照開始，讓每一台機體都有自己的位置。</p></div><button className="primary" onClick={openExport} disabled={!loaded}><FileSpreadsheet size={18}/>匯出 Excel <ArrowUpRight size={16}/></button></section>
      <section className="stats"><Stat icon={<Boxes/>} value={live.length} label="收藏總數" detail="每一盒，都是一個故事"/><Stat icon={<FolderOpen/>} value={series.length} label="作品系列" detail="依系列，自動整理分頁"/><Stat icon={<CheckCheck/>} value={confirmed} label="已確認商品" detail="準備好加入收藏清單"/><Stat icon={<ScanLine/>} value={live.length - confirmed} label="等待確認" detail="檢查辨識結果，補上細節" accent/></section>
      {notice && <div className="notice" role="status"><AlertCircle size={17}/><span>{notice}</span>{undo && <button className="secondary" disabled={disabled} onClick={() => runAction(() => restoreDeleted(undo))}>復原</button>}<button aria-label="關閉通知" onClick={() => { setNotice(''); setUndo(null); }}><X size={16}/></button></div>}
      {saveState === 'error' && <div className="notice danger" role="alert">{migrationError || '本機儲存失敗，未套用的變更請重試，或下載含草稿的備份。'}{migrationError && <button className="secondary" onClick={load}>重試資料升級</button>}</div>}
      <div className="backup-status"><span>{metadata.lastBackupAt ? `上次下載備份：${new Date(metadata.lastBackupAt).toLocaleString('zh-TW')}` : '尚未下載完整備份'} · {status.changes} 筆變更尚未備份</span>{status.remind && <div className="backup-reminder"><span>有收藏變更尚未下載備份，建議定期保存完整 JSON。</span><button className="secondary" onClick={() => backup()} disabled={!records.length}>下載完整備份</button><button aria-label="關閉備份提醒" disabled={disabled} onClick={() => runAction(() => commit(rows => rows, meta => ({ ...meta, reminderDismissedAt: new Date().toISOString() })))}><X size={16}/></button></div>}</div>
      <section className={`upload-zone ${dragging ? 'dragging' : ''} ${live.length && !uploadExpanded && !busy ? 'collapsed' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); processImages(event.dataTransfer.files); }}>
        <div className="upload-symbol">{busy ? <LoaderCircle size={30} className="spin"/> : <ImagePlus size={30}/>}</div><div className="upload-copy"><h2>{busy ? '正在為收藏建立檔案…' : live.length && !uploadExpanded ? '新增照片' : '放入盒照，收藏從這裡開始'}</h2><p>{busy ? progress : '將多張照片拖曳至此，或選取檔案。辨識均在本機處理。'}</p><div className="upload-meta">JPG / PNG / WebP · 每張上限 20 MB · 每批最多 100 張</div></div><div className="upload-actions"><button className="primary" onClick={() => fileInput.current.click()} disabled={disabled}><Plus size={18}/>選取照片</button>{busy ? <button className="text-button" onClick={() => { stopped.current = true; setNotice('將在目前這張照片完成後停止，未開始的照片會標為已取消。'); }}>完成此張後停止</button> : live.length > 0 && <button className="text-button" onClick={() => setUploadExpanded(value => !value)}>{uploadExpanded ? '收合新增照片' : '展開新增照片說明'}</button>}</div>
      </section>
      <ImportReport jobs={jobs} busy={busy} onRetry={retryJob} onRestore={id => runAction(() => restoreDeleted(id))}/>
      <section className="collection"><div className="collection-heading"><div><h2>{active === '全部收藏' ? '收藏清單' : active}<span>{visible.length}</span></h2><p>確認後再匯出，讓清單的每個細節都正確。</p></div><div className="collection-actions"><button className="secondary" onClick={startConfirmation} disabled={disabled || !confirmationIds(visible).length}><CheckCheck size={16}/>開始確認</button><button className="secondary" onClick={() => setEditor(newRecord())} disabled={disabled}><Plus size={16}/>手動新增</button></div></div>
        <div className="toolbar"><label className="search"><Search size={17}/><input aria-label="搜尋收藏" placeholder="搜尋名稱、系列、位置、規格…" value={query.search} onChange={event => changeQuery({ search: event.target.value })}/></label><select aria-label="篩選規格" value={query.grade} onChange={event => changeQuery({ grade: event.target.value })}><option value="">全部規格</option>{GRADES.map(value => <option key={value}>{value}</option>)}</select><select aria-label="篩選作品系列" value={query.series} onChange={event => changeQuery({ series: event.target.value })}><option value="">全部作品系列</option>{[...new Set([...series, ...live.map(seriesLabel)])].map(value => <option key={value}>{value}</option>)}</select><select aria-label="篩選存放位置" value={query.location} onChange={event => changeQuery({ location: event.target.value })}><option value="">全部位置</option><option value="__empty__">位置未填寫</option>{locations.map(value => <option key={value} value={`value:${value}`}>{value}</option>)}</select><select aria-label="篩選確認狀態" value={query.confirmation} onChange={event => changeQuery({ confirmation: event.target.value })}><option value="">全部確認狀態</option><option value="pending">待確認</option><option value="confirmed">已確認</option></select><select aria-label="排序收藏" value={query.sort} onChange={event => changeQuery({ sort: event.target.value })}>{Object.entries(sortLabels).map(([key, value]) => <option value={key} key={key}>{value}</option>)}</select></div>
        {!!filters.length && <div className="filter-tags">{filters.map(([key, label]) => <button key={key} onClick={() => changeQuery({ [key]: '' })}>{label}<X size={14}/><span className="sr-only">清除條件</span></button>)}<button className="text-button" onClick={clearQuery}>清除全部</button></div>}
        {visible.length > 0 && <div className="selection-toolbar"><label><input type="checkbox" aria-label="選取目前結果" disabled={disabled} checked={selected.length === visible.length && visible.length > 0} onChange={event => setSelected(event.target.checked ? visible.map(row => row.id) : [])}/>選取目前結果</label><span>已選 {selected.length} 筆</span><button className="secondary" disabled={disabled || !selected.length} onClick={() => setBatch(true)}>批次設定</button>{selected.length > 0 && <button className="text-button" onClick={() => setSelected([])}>清除選取</button>}</div>}
        {!visible.length ? <div className="empty-state">{live.length || hasFilters(query) ? <><Search size={38}/><h3>沒有符合條件的收藏</h3><p>試試其他關鍵字，或清除篩選。</p><button className="secondary" onClick={clearQuery}>顯示全部收藏</button></> : <><div className="empty-illustration"><Box size={46}/></div><h3>你的第一盒收藏，值得一份記錄。</h3><p>匯入盒照，核對辨識結果並填寫購入價格與存放位置。</p><button className="text-button sample-button" onClick={sample} disabled={disabled}>用 RX-78-2 附件試試辨識 <ArrowUpRight size={16}/></button></>}</div> : <div className="record-list"><div className="table-labels"><span>商品 / 作品系列</span><span>規格 / 比例</span><span>購入價格</span><span>存放位置</span><span>狀態</span></div>{visible.map(row => <div className="record-row" key={row.id}><label className="record-selection"><input type="checkbox" aria-label={`選取 ${row.name || row.fileName || '未命名商品'}`} checked={selected.includes(row.id)} disabled={disabled || row.status === 'processing'} onChange={event => setSelected(items => event.target.checked ? [...items, row.id] : items.filter(id => id !== row.id))}/></label><button className="record" onClick={() => setEditor({ ...row })} disabled={disabled || row.status === 'processing'}><div className="product-cell"><div className="thumbnail">{row.image ? <img src={row.image} alt={row.name || '待辨識模型盒照'}/> : <Box size={25}/>}</div><div><strong>{row.name || row.fileName || '未命名商品'}</strong><small>{seriesLabel(row)}</small></div></div><div className="grade-cell"><b>{row.grade}</b><small>{row.scale || '比例待填'}</small></div><div className="value-cell">{row.price === '' || row.price == null ? <span className="muted">尚未填寫</span> : Number(row.price).toLocaleString('zh-TW')}</div><div className="value-cell location-cell">{row.location || <span className="muted">位置未填</span>}</div><div className="status-cell"><span className={`badge ${row.confirmed ? 'confirmed' : row.status === 'error' ? 'failed' : ''}`}>{row.status === 'processing' ? <><LoaderCircle size={12} className="spin"/>辨識中</> : row.confirmed ? <><Check size={12}/>已確認</> : row.status === 'error' ? '需手動確認' : '待確認'}</span><ChevronRight size={16}/></div></button></div>)}</div>}
        <div className="collection-footer"><FileSpreadsheet size={15}/><span>Excel 依作品系列分頁 · 比例 / 商品名稱（含規格） / 價格 / 存放位置</span><span className="footer-right">只匯出已確認且未刪除的商品</span></div>
      </section><footer className="page-footer"><span>格納庫 / 留下收藏的每一個細節。</span><span>LOCAL FIRST. COLLECTION ALWAYS.</span></footer>
    </div></main>
    <input type="file" ref={fileInput} aria-label="匯入照片" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={event => { processImages(event.target.files); event.target.value = ''; }}/><input type="file" ref={restoreInput} aria-label="還原備份檔案" accept="application/json,.json" hidden onChange={event => { restore(event.target.files[0]); event.target.value = ''; }}/>
    {editor && <Editor key={editor.id} record={editor} locations={locations} onClose={closeEditor} onSave={saveEditor} onSaved={savedEditor} onDelete={deleteEditor} onBackup={backup} queue={queue} onMove={moveQueue} canPrevious={queue && queueTarget(queue.ids, queue.index, -1, records) >= 0} canNext={queue && queueTarget(queue.ids, queue.index, 1, records) >= 0}/>}
    {batch && <BatchDialog records={records} ids={selected} locations={locations} onApply={applyBatch} onClose={() => setBatch(false)}/>}
    {exportSnapshot && <ExportDialog snapshot={exportSnapshot} onDownload={downloadExcel} onClose={() => setExportSnapshot(null)}/>}
    {restoreSnapshot && <RestoreDialog backup={restoreSnapshot.backup} records={restoreSnapshot.records} onApply={applyRestore} onClose={() => setRestoreSnapshot(null)}/>}
    {trash && <TrashDialog records={records.filter(row => row.deletedAt)} onRestore={restoreDeleted} onPurge={id => commit(rows => rows.filter(row => row.id !== id))} onClose={() => setTrash(false)}/>}
    {help && <Dialog className="help-modal" aria-label="使用說明" onClose={() => setHelp(false)}><button className="close-modal" aria-label="關閉說明" onClick={() => setHelp(false)}><X/></button><h2>給收藏一個位置。</h2><ol><li>匯入盒照，本機辨識後人工確認。</li><li>搜尋、篩選或排序後，可連續確認及批次設定位置／系列。</li><li>Excel 預覽會顯示匯出範圍；只有已確認且未刪除商品會輸出。</li><li>刪除可從回收桶復原；永久刪除無法復原。</li><li>定期下載 v2 完整 JSON。還原前先比較，預設保留現有衝突。</li></ol><p className="help-note">資料保存在目前瀏覽器與網址。下載提示無法保證檔案已由使用者保存；清除網站資料前請確認完整備份。</p></Dialog>}
  </div>;
}
function Stat({ icon, value, label, detail, accent }) { return <div className={`stat ${accent ? 'stat-accent' : ''}`}><div className="stat-top"><span>{label}</span>{icon}</div><div className="stat-value">{String(value).padStart(2, '0')}<small>{label === '作品系列' ? '個系列' : '件模型'}</small></div><p>{detail}</p></div>; }
createRoot(document.getElementById('root')).render(<App/>);
if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
