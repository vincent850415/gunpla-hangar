import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, Boxes, ArrowUpRight, Upload, Download, Plus, Search, X, Check, CheckCheck, ImagePlus, FolderOpen, ScanLine, HardDrive, ChevronRight, Pencil, Trash2, FileSpreadsheet, LoaderCircle, AlertCircle, ArchiveRestore, ShieldCheck, Camera, CircleHelp } from 'lucide-react';
import { SERIES, GRADES, validRecord } from './catalog.mjs';
import { PRODUCT_LINES, seriesLabel, parseSeriesLabel } from './product-lines.mjs';
import { recognize, imageData } from './recognition';
import { loadRecords, saveRecords, download, readBackup } from './storage';
import './style.css';

const newRecord = () => ({ id: crypto.randomUUID(), name: '', grade: '待確認', series: '待確認', scale: '', price: '', location: '', image: '', confirmed: false, status: 'ready', warnings: [], createdAt: new Date().toISOString() });
function App() {
  const [records, setRecords] = useState([]), [loaded, setLoaded] = useState(false), [saveState, setSaveState] = useState('loading');
  const [active, setActive] = useState('全部收藏'), [search, setSearch] = useState(''), [gradeFilter, setGradeFilter] = useState('全部規格');
  const [editor, setEditor] = useState(null), [busy, setBusy] = useState(false), [progress, setProgress] = useState(''), [notice, setNotice] = useState(''), [help, setHelp] = useState(false), [dragging, setDragging] = useState(false), [exporting, setExporting] = useState(false);
  const fileInput = useRef(), restoreInput = useRef(), current = useRef([]), busyRef = useRef(false), stopped = useRef(false), saveVersion = useRef(0);
  const commit = value => { const next = typeof value === 'function' ? value(current.current) : value; current.current = next; setRecords(next); };
  useEffect(() => {
    loadRecords().then(data => { commit(data.map(row => row.status === 'processing' ? { ...row, status: 'error', error: '上次辨識中斷，可重新辨識。' } : row)); setLoaded(true); })
      .catch(() => { setNotice('無法讀取本機資料。請確認瀏覽器允許儲存資料，再重新整理；為保護既有收藏，暫停新增。'); setSaveState('error'); });
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const version = ++saveVersion.current;
    setSaveState('saving');
    saveRecords(records).then(() => { if (version === saveVersion.current) setSaveState('saved'); }).catch(() => { if (version === saveVersion.current) setSaveState('error'); });
  }, [records, loaded]);
  const confirmed = records.filter(r => r.confirmed).length;
  const series = [...new Set(records.map(seriesLabel).filter(s => s && s !== '待確認'))];
  const visible = records.filter(r => (active === '全部收藏' || (active === '待確認' ? !r.confirmed : seriesLabel(r) === active)) && (gradeFilter === '全部規格' || r.grade === gradeFilter) && `${r.name} ${seriesLabel(r)} ${r.location} ${r.grade}`.toLowerCase().includes(search.toLowerCase()));
  async function processImages(fileList) {
    if (busyRef.current || !loaded) return;
    const files = [...fileList];
    if (!files.length) return;
    if (files.length > 100) { setNotice('每批最多 100 張照片，請分批匯入。'); return; }
    busyRef.current = true; stopped.current = false; setBusy(true); setNotice('');
    let imported = 0, skipped = 0, failed = 0;
    try {
      for (let index = 0; index < files.length; index++) {
        if (stopped.current) break;
        const file = files[index];
        setProgress(`${index + 1} / ${files.length} · 讀取 ${file.name}`);
        if (!/\.(jpe?g|png|webp)$/i.test(file.name) || file.size > 20 * 1024 * 1024) { failed++; continue; }
        let row;
        try {
          const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
          const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
          if (current.current.some(r => r.hash === hash)) { skipped++; continue; }
          const data = await imageData(file);
          row = { ...newRecord(), image: data, fileName: file.name, hash, status: 'processing' };
          commit(previous => [row, ...previous]); imported++;
          const result = await recognize(data, message => {
            setProgress(`${index + 1} / ${files.length} · ${file.name} · ${message.status === 'recognizing text' ? `辨識文字 ${Math.round(message.progress * 100)}%` : '準備辨識引擎'}`);
          });
          commit(previous => previous.map(r => r.id === row.id ? { ...r, ...result, status: 'ready' } : r));
        } catch (error) {
          failed++;
          if (row) commit(previous => previous.map(r => r.id === row.id ? { ...r, status: 'error', error: '辨識未完成，請重試或手動填寫。' } : r));
        }
      }
      setNotice(`${stopped.current ? '已停止後續匯入。' : ''}新增 ${imported} 筆${skipped ? `，略過 ${skipped} 張重複照片` : ''}${failed ? `；${failed} 張無法讀取或辨識（僅支援 JPG／PNG／WebP，每張上限 20 MB）` : ''}。請確認辨識結果後匯出。`);
    } finally { busyRef.current = false; setBusy(false); setProgress(''); }
  }
  async function retry(record) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setProgress('重新辨識中…'); setEditor(null);
    commit(rows => rows.map(r => r.id === record.id ? { ...r, status: 'processing' } : r));
    try {
      const result = await recognize(record.image, m => setProgress(m.status === 'recognizing text' ? `重新辨識 ${Math.round(m.progress * 100)}%` : '準備辨識引擎'));
      commit(rows => rows.map(r => r.id === record.id ? { ...r, ...result, price: r.price, location: r.location, confirmed: false, status: 'ready', error: '' } : r));
      setEditor({ ...current.current.find(r => r.id === record.id) });
    } catch { commit(rows => rows.map(r => r.id === record.id ? { ...r, status: 'error', error: '辨識失敗，可手動輸入。' } : r)); }
    finally { busyRef.current = false; setBusy(false); setProgress(''); }
  }
  async function sample() {
    try { const response = await fetch('/sample.jpg'); if (!response.ok) throw new Error(); await processImages([new File([await response.blob()], '20261103.jpg', { type: 'image/jpeg' })]); }
    catch { setNotice('無法載入範例，請直接選取你的照片。'); }
  }
  async function exportExcel() {
    setExporting(true);
    try { const { excelBlob } = await import('./export.mjs'); download(await excelBlob(current.current), `模型收藏_${new Date().toLocaleDateString('sv-SE')}.xlsx`); setNotice(`已匯出 ${confirmed} 筆已確認商品，依作品系列分頁。${records.length > confirmed ? `另有 ${records.length - confirmed} 筆未確認，未納入匯出。` : ''}`); }
    catch (error) { setNotice(error.message || '匯出失敗，請重試。'); }
    finally { setExporting(false); }
  }
  function backup() { download(new Blob([JSON.stringify({ version: 1, records: current.current }, null, 2)], { type: 'application/json' }), `格納庫備份_${new Date().toLocaleDateString('sv-SE')}.json`); }
  async function restore(file) {
    if (!file || busyRef.current) return;
    try {
      if (file.size > 200 * 1024 * 1024) throw new Error('備份超過 200 MB，無法匯入');
      const imported = readBackup(JSON.parse(await file.text()));
      const hashes = new Set(current.current.map(r => r.hash).filter(Boolean));
      const unique = imported.filter(r => { if (r.hash && hashes.has(r.hash)) return false; if (r.hash) hashes.add(r.hash); return true; });
      commit(rows => [...unique, ...rows]); setNotice(`已還原 ${unique.length} 筆，略過 ${imported.length - unique.length} 筆相同照片。還原資料請重新確認。`);
    } catch (error) { setNotice(`還原失敗：${error.message}`); }
  }
  const saveEditor = (draft, confirm) => {
    const saved = { ...draft, name: draft.name.trim(), series: draft.series.trim() || '待確認', confirmed: confirm, status: 'ready' };
    commit(rows => rows.some(r => r.id === draft.id) ? rows.map(r => r.id === draft.id ? saved : r) : [saved, ...rows]); setEditor(null);
  };
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="格納庫首頁"><span className="brand-mark"><Box size={25}/></span><span>格納庫<small>GUNPLA HANGAR</small></span></a>
      <div className="workspace"><span className="avatar">私</span><div>我的模型收藏<small>PERSONAL WORKSPACE</small></div><ChevronRight size={14}/></div>
      <div className="nav-label">收藏管理</div>
      <nav><button className={active === '全部收藏' ? 'nav-item selected' : 'nav-item'} onClick={() => setActive('全部收藏')}><Boxes size={18}/>全部收藏<span>{records.length}</span></button><button className={active === '待確認' ? 'nav-item selected' : 'nav-item'} onClick={() => setActive('待確認')}><ScanLine size={18}/>待確認<span>{records.length - confirmed}</span></button></nav>
      <div className="nav-label series-label">作品系列 <span>{series.length}</span></div>
      <div className="series-nav">{series.length ? series.map(s => <button key={s} className={`nav-item ${active === s ? 'selected' : ''}`} onClick={() => setActive(s)}><span className="series-dot"/>{s}<span>{records.filter(r => seriesLabel(r) === s).length}</span></button>) : <p>匯入收藏後，系列會出現在這裡。</p>}</div>
      <div className="sidebar-bottom"><div className="local-card"><ShieldCheck size={19}/><strong>你的收藏，留在你的裝置</strong><p>照片與辨識都在本機處理。<br/>定期備份，讓收藏安心保存。</p></div><button className="nav-item" onClick={backup} disabled={!loaded || !records.length}><Download size={17}/>備份收藏</button><button className="nav-item" onClick={() => restoreInput.current.click()} disabled={!loaded || busy}><ArchiveRestore size={17}/>還原備份</button><button className="nav-item" onClick={() => setHelp(true)}><CircleHelp size={17}/>使用說明</button><div className={`storage-status ${saveState === 'error' ? 'error-text' : ''}`}><span/>{saveState === 'saved' ? '已儲存至這台裝置' : saveState === 'saving' ? '正在儲存…' : saveState === 'error' ? '儲存異常，請先備份' : '正在讀取收藏…'}</div></div>
    </aside>
    <main>
      <header className="topbar"><div className="breadcrumb">我的格納庫 <ChevronRight size={14}/><span>{active}</span></div><div className="device-label"><HardDrive size={15}/> 本機工作空間 <span className="version">BETA 0.3</span></div></header>
      <div className="page">
        <section className="page-heading"><div><div className="eyebrow">A HOME FOR EVERY BUILD</div><h1>{active === '全部收藏' ? '把熱愛，好好收藏。' : active}</h1><p>從一張盒照開始，讓每一台機體都有自己的位置。</p></div><button className="primary" onClick={exportExcel} disabled={!confirmed || exporting}>{exporting ? <LoaderCircle className="spin" size={18}/> : <FileSpreadsheet size={18}/>}匯出 Excel <ArrowUpRight size={16}/></button></section>
        <section className="stats"><Stat icon={<Boxes/>} value={records.length} label="收藏總數" detail="每一盒，都是一個故事"/><Stat icon={<FolderOpen/>} value={series.length} label="作品系列" detail="依系列，自動整理分頁"/><Stat icon={<CheckCheck/>} value={confirmed} label="已確認商品" detail="準備好加入收藏清單"/><Stat icon={<ScanLine/>} value={records.length - confirmed} label="等待確認" detail="檢查辨識結果，補上細節" accent/></section>
        {notice && <div className="notice" role="status"><AlertCircle size={17}/><span>{notice}</span><button aria-label="關閉通知" onClick={() => setNotice('')}><X size={16}/></button></div>}
        {saveState === 'error' && <div className="notice danger" role="alert">本機儲存失敗，重新整理可能遺失變更。請立即「備份收藏」保存資料。</div>}
        <section className={`upload-zone ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); processImages(e.dataTransfer.files); }}>
          <div className="upload-symbol">{busy ? <LoaderCircle size={30} className="spin"/> : <ImagePlus size={30}/>}</div><div className="upload-copy"><h2>{busy ? '正在為收藏建立檔案…' : '放入盒照，收藏從這裡開始'}</h2><p>{busy ? progress : '將多張照片拖曳至此，或選取檔案。自動辨識規格、比例與作品線索。'}</p><div className="upload-meta">JPG / PNG / WebP <span>·</span> 每張上限 20 MB <span>·</span> 每批最多 100 張</div></div><div className="upload-actions"><button className="primary" onClick={() => fileInput.current.click()} disabled={busy || !loaded}><Plus size={18}/>選取照片</button>{busy ? <button className="text-button" onClick={() => { stopped.current = true; setNotice('將在目前這張照片完成後停止。'); }}>完成此張後停止</button> : <span><ShieldCheck size={13}/> 無須上傳雲端</span>}</div>
        </section>
        <section className="collection"><div className="collection-heading"><div><h2>{active === '全部收藏' ? '收藏清單' : active}<span>{visible.length}</span></h2><p>確認後再匯出，讓清單的每個細節都正確。</p></div><button className="secondary" onClick={() => setEditor(newRecord())} disabled={!loaded || busy}><Plus size={16}/>手動新增</button></div>
          <div className="toolbar"><label className="search"><Search size={17}/><input aria-label="搜尋收藏" placeholder="搜尋商品名稱、系列或存放位置…" value={search} onChange={e => setSearch(e.target.value)}/></label><select aria-label="篩選規格" value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}><option>全部規格</option>{GRADES.map(g => <option key={g}>{g}</option>)}</select><span className="view-note">依新增時間排序</span></div>
          {!visible.length ? <div className="empty-state">{records.length ? <><Search size={38}/><h3>沒有符合條件的收藏</h3><p>試試其他關鍵字，或切換規格與系列。</p><button className="secondary" onClick={() => { setSearch(''); setGradeFilter('全部規格'); setActive('全部收藏'); }}>顯示全部收藏</button></> : <><div className="empty-illustration"><Box size={46} strokeWidth={1.3}/><span>01</span></div><h3>你的第一盒收藏，值得一份記錄。</h3><p>匯入盒照，自動辨識後補上購入價格與存放位置。<br/>從 HG 到 PG，每一盒都能井然有序。</p><button className="text-button sample-button" onClick={sample} disabled={busy || !loaded}>用 RX-78-2 附件試試辨識 <ArrowUpRight size={16}/></button></>}</div> : <div className="record-list"><div className="table-labels"><span>商品 / 作品系列</span><span>規格 / 比例</span><span>購入價格</span><span>存放位置</span><span>狀態</span></div>{visible.map(row => <button key={row.id} className="record" onClick={() => setEditor({ ...row })} disabled={row.status === 'processing'}><div className="product-cell"><div className="thumbnail">{row.image ? <img src={row.image} alt={row.name || '待辨識模型盒照'}/> : <Box size={25}/>}</div><div><strong>{row.name || row.fileName || '未命名商品'}</strong><small>{seriesLabel(row)}</small></div></div><div className="grade-cell"><b>{row.grade}</b><small>{row.scale || '比例待填'}</small></div><div className="value-cell">{row.price === '' || row.price == null ? <span className="muted">尚未填寫</span> : Number(row.price).toLocaleString('zh-TW')}</div><div className="value-cell location-cell">{row.location || <span className="muted">尚未填寫</span>}</div><div className="status-cell"><span className={`badge ${row.confirmed ? 'confirmed' : row.status === 'error' ? 'failed' : ''}`}>{row.status === 'processing' ? <><LoaderCircle size={12} className="spin"/>辨識中</> : row.confirmed ? <><Check size={12}/>已確認</> : row.status === 'error' ? '需手動確認' : '待確認'}</span><ChevronRight size={16}/></div></button>)}</div>}
          <div className="collection-footer"><FileSpreadsheet size={15}/><span>Excel 依作品系列分頁 <b>·</b> 比例 / 商品名稱（含規格） / 價格 / 存放位置</span><span className="footer-right">只匯出已確認的商品</span></div>
        </section><footer className="page-footer"><span>格納庫 <span className="slash">/</span> 留下收藏的每一個細節。</span><span>LOCAL FIRST. COLLECTION ALWAYS.</span></footer>
      </div>
    </main>
    <input type="file" ref={fileInput} aria-label="匯入照片" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => { processImages(e.target.files); e.target.value = ''; }}/>
    <input type="file" ref={restoreInput} accept="application/json,.json" hidden onChange={e => { restore(e.target.files[0]); e.target.value = ''; }}/>
    {editor && <Editor key={editor.id} record={editor} busy={busy} onClose={() => setEditor(null)} onSave={saveEditor} onRetry={retry} onDelete={() => { if (window.confirm('確定刪除這筆收藏？此動作無法復原。')) { commit(rows => rows.filter(r => r.id !== editor.id)); setEditor(null); } }}/ >}
    {help && <div className="modal-backdrop" onClick={() => setHelp(false)}><section className="help-modal" role="dialog" aria-modal="true" aria-label="使用說明" onClick={e => e.stopPropagation()}><button className="close-modal" aria-label="關閉說明" onClick={() => setHelp(false)}><X/></button><span className="eyebrow">QUICK START</span><h2>給收藏一個位置。</h2><ol><li><strong>拍攝完整盒面</strong><p>每張照片對應一件商品，清楚拍到規格標誌、名稱與比例，避免反光。</p></li><li><strong>批次匯入並確認</strong><p>本機 OCR 讀取盒面文字，並對名稱與標誌追加區域辨識。首次載入模型需要一些時間。作品不明會留待確認；特殊字母、限定版本與模糊小字請逐字核對。</p></li><li><strong>補上收藏細節</strong><p>價格是你的購入價格，並非盒面定價，不會自動推估。請統一使用同一幣別；存放位置也由你填寫。</p></li><li><strong>匯出與備份</strong><p>Excel 只包含已確認商品，按作品系列分頁。HG／RG／MG 等規格放在商品名稱前。JSON 備份另外包含照片，可在其他裝置還原。</p></li></ol><div className="help-note">資料保存在目前瀏覽器與網址的本機儲存空間。清除網站資料、切換瀏覽器或網址不會自動轉移收藏，請定期備份。Windows 版可離線使用；行動裝置版預留相同網頁核心，未包含跨裝置同步。</div></section></div>}
  </div>;
}
function Stat({ icon, value, label, detail, accent }) { return <div className={`stat ${accent ? 'stat-accent' : ''}`}><div className="stat-top"><span>{label}</span>{icon}</div><div className="stat-value">{String(value).padStart(2, '0')}<small>{label === '作品系列' ? '個系列' : '件模型'}</small></div><p>{detail}</p></div>; }
function Editor({ record, onClose, onSave, onDelete, onRetry, busy }) {
  const [draft, setDraft] = useState({ ...record, series: seriesLabel(record) }), [error, setError] = useState('');
  const firstInput = useRef();
  const modalRef = useRef();
  useEffect(() => {
    firstInput.current?.focus();
    const key = event => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const elements = [...modalRef.current.querySelectorAll('button:not(:disabled), input, select, textarea, summary')];
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, []);
  const field = key => ({ value: draft[key], onChange: e => setDraft({ ...draft, [key]: e.target.value }) });
  const submit = confirmed => {
    if (draft.price !== '' && (!Number.isFinite(Number(draft.price)) || Number(draft.price) < 0)) { setError('價格請填入零或正數，或保留空白。'); return; }
    const normalized = { ...draft, ...parseSeriesLabel(draft.series) };
    if (confirmed && !validRecord(normalized)) { setError('請填寫商品名稱，並確認作品系列與規格；HGUC 等 HG 商品線須搭配 HG 規格。'); return; }
    onSave(normalized, confirmed);
  };
  return <div className="modal-backdrop"><section className="editor" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="editor-title"><div className="editor-header"><div><span className="eyebrow">COLLECTION DETAILS</span><h2 id="editor-title">確認收藏資料</h2></div><button aria-label="關閉編輯" onClick={onClose}><X/></button></div><div className="editor-body"><div className="editor-photo">{draft.image ? <img src={draft.image} alt="商品盒照"/> : <div className="no-image"><Camera size={42}/><p>手動新增商品</p></div>}<div className="photo-caption"><ShieldCheck size={14}/>照片保留於本機</div>{record.image && <button className="secondary" onClick={() => onRetry(record)} disabled={busy}><ScanLine size={15}/>重新辨識</button>}<details><summary>查看原始辨識文字</summary>{record.ocrEngine && <small>{record.ocrEngine}</small>}<pre>{record.evidence || '尚無辨識文字。'}</pre></details></div><div className="editor-fields">{record.warnings?.length > 0 && <div className="recognition-warnings" role="note" aria-label="辨識提醒"><strong>請核對以下項目</strong><ul>{record.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}{record.error && <div className="field-note warning">{record.error}</div>}<div className="field-note"><ScanLine size={16}/><span>辨識結果供你核對。請以實際盒面為準，確認後才會納入 Excel。</span></div><label>商品名稱 <span>*</span><input ref={firstInput} maxLength={200} placeholder="例如 RX-78-2 GUNDAM" {...field('name')}/></label><label>作品系列 <span>*</span><input list="series-options" maxLength={100} placeholder="選擇或輸入自訂作品系列" {...field('series')}/><datalist id="series-options">{[...SERIES, ...Object.entries(PRODUCT_LINES).map(([productLine, series]) => seriesLabel({ productLine, series }))].map(s => <option key={s} value={s}/>)}</datalist><small>可填 HGUC 宇宙世紀、HGBF 鋼彈創鬥者；Excel 依此名稱分頁。</small></label><div className="field-pair"><label>規格 <span>*</span><select {...field('grade')}>{GRADES.map(g => <option key={g}>{g}</option>)}</select></label><label>比例<input placeholder="例如 1/144、無比例" maxLength={50} {...field('scale')}/></label></div><div className="field-pair"><label>購入價格<input type="number" min="0" step="any" placeholder="可稍後填寫" {...field('price')}/></label><label>存放位置<input placeholder="例如 書房 A 櫃第 2 層" maxLength={200} {...field('location')}/></label></div><p className="input-hint">價格與存放位置保留空白亦可；價格請使用同一幣別。</p>{error && <p className="form-error" role="alert">{error}</p>}</div></div><div className="editor-footer"><button className="delete-button" aria-label="刪除收藏" onClick={onDelete}><Trash2 size={17}/></button><div><button className="secondary" onClick={() => submit(false)}>儲存為待確認</button><button className="primary" onClick={() => submit(true)}><Check size={17}/>確認並儲存</button></div></div></section></div>;
}
createRoot(document.getElementById('root')).render(<App/>);
if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
