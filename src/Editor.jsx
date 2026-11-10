import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, ScanLine, ShieldCheck, Trash2, X } from 'lucide-react';
import { SERIES, GRADES } from './catalog.mjs';
import { PRODUCT_LINES, seriesLabel } from './product-lines.mjs';
import { recognize } from './recognition';
import { applyRecognition, asDraft, comparisonFields, draftSignature, validateDraft } from './editor-model.mjs';
import { Dialog } from './Dialog';
import { PhotoViewer } from './PhotoViewer';

export function Editor({ record, onClose, onSave, onSaved, onDelete, onBackup, queue, onMove, canPrevious, canNext }) {
  const [draft, setDraft] = useState(() => asDraft(record)), [baseline, setBaseline] = useState(() => draftSignature(asDraft(record)));
  const [error, setError] = useState(''), [saveFailed, setSaveFailed] = useState(false), [saving, setSaving] = useState(false);
  const [leave, setLeave] = useState(null), [viewer, setViewer] = useState(false);
  const [candidate, setCandidate] = useState(null), [selected, setSelected] = useState([]), [recognizing, setRecognizing] = useState(false), [progress, setProgress] = useState('');
  const fields = useRef({}), request = useRef(0), mounted = useRef(true), savingRef = useRef(false);
  const dirty = draftSignature(draft) !== baseline;
  useEffect(() => () => { mounted.current = false; request.current++; }, []);
  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving]);
  const cancelRecognition = () => { request.current++; setRecognizing(false); setCandidate(null); setProgress(''); };
  function requestLeave(action) {
    if (savingRef.current) return;
    if (dirty) setLeave(() => action);
    else { cancelRecognition(); action(); }
  }
  const field = key => ({ disabled: saving, ref: element => { fields.current[key] = element; }, value: draft[key] ?? '', onChange: event => setDraft(previous => ({ ...previous, [key]: event.target.value })) });
  async function persist(confirm) {
    const validation = validateDraft(draft, confirm);
    if (!validation.record) { setError(validation.message); setSaveFailed(false); setLeave(null); requestAnimationFrame(() => fields.current[validation.field]?.focus()); return null; }
    savingRef.current = true; setSaving(true); setError(''); setSaveFailed(false);
    try {
      const saved = await onSave(validation.record);
      setDraft(asDraft(saved)); setBaseline(draftSignature(asDraft(saved))); return saved;
    } catch { setError('本機儲存失敗，草稿仍保留。請重試儲存，或下載含草稿的備份。'); setSaveFailed(true); return null; }
    finally { savingRef.current = false; setSaving(false); }
  }
  async function submit(confirm) {
    if (savingRef.current) return;
    const saved = await persist(confirm);
    if (saved) { cancelRecognition(); onSaved(saved, confirm); }
  }
  async function remove() {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try { await onDelete(); }
    catch { setError('刪除儲存失敗，原收藏仍保留，請重試。'); }
    finally { savingRef.current = false; if (mounted.current) setSaving(false); }
  }
  async function retry() {
    const token = ++request.current;
    setRecognizing(true); setCandidate(null); setSelected([]); setError(''); setProgress('準備辨識引擎');
    try {
      const result = await recognize(record.image, message => {
        if (mounted.current && token === request.current) setProgress(message.status === 'recognizing text' ? `辨識文字 ${Math.round(message.progress * 100)}%` : '準備辨識引擎');
      });
      if (mounted.current && token === request.current) setCandidate(result);
    } catch { if (mounted.current && token === request.current) setError('重新辨識失敗，原資料與草稿均已保留，可重試或手動填寫。'); }
    finally { if (mounted.current && token === request.current) { setRecognizing(false); setProgress(''); } }
  }
  const adopt = keys => { setDraft(previous => applyRecognition(previous, candidate, keys)); setCandidate(null); };
  const backupDraft = () => onBackup({ ...draft, ...validateDraft(draft, false).record, confirmed: false });
  return <Dialog className="editor" aria-labelledby="editor-title" onClose={() => requestLeave(onClose)}>
    <div className="editor-header"><div><span className="eyebrow">COLLECTION DETAILS</span><h2 id="editor-title">確認收藏資料</h2>{queue && <p className="queue-progress">第 {queue.index + 1}／共 {queue.ids.length} 筆</p>}</div><button aria-label="關閉編輯" onClick={() => requestLeave(onClose)} disabled={saving}><X/></button></div>
    {queue && <nav className="queue-navigation" aria-label="連續確認"><button className="secondary" disabled={!canPrevious || saving} onClick={() => requestLeave(() => onMove(-1))}>上一筆</button><span>切換不會自動確認</span><button className="secondary" disabled={!canNext || saving} onClick={() => requestLeave(() => onMove(1))}>下一筆</button></nav>}
    <div className="editor-body"><div className="editor-photo">
      {draft.image ? <button className="photo-open" aria-label="放大商品盒照" onClick={() => setViewer(true)}><img src={draft.image} alt="商品盒照"/><span>點擊放大核對</span></button> : <div className="no-image"><Camera size={42}/><p>手動新增商品</p></div>}
      <div className="photo-caption"><ShieldCheck size={14}/>照片保留於本機</div>
      {record.image && <button className="secondary" onClick={retry} disabled={recognizing || saving || Boolean(candidate)}><ScanLine size={15}/>重新辨識</button>}
      {recognizing && <div className="recognition-progress" role="status"><p>{progress}</p><button className="secondary" onClick={cancelRecognition}>取消本次辨識</button><small>取消後不採用結果；背景引擎可能仍會完成本張。</small></div>}
      <details><summary>查看原始辨識文字</summary>{draft.ocrEngine && <small>{draft.ocrEngine}</small>}<pre>{draft.evidence || '尚無辨識文字。'}</pre></details>
    </div><div className="editor-fields">
      {draft.warnings?.length > 0 && <div className="recognition-warnings" role="note" aria-label="辨識提醒"><strong>請核對以下項目</strong><ul>{draft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
      {record.error && <div className="field-note warning">{record.error}</div>}
      <div className="field-note"><ScanLine size={16}/><span>辨識結果供你核對。請以實際盒面為準，確認後才會納入 Excel。</span></div>
      <label>商品名稱 <span>*</span><input autoFocus maxLength={200} placeholder="例如 RX-78-2 GUNDAM" {...field('name')}/></label>
      <label>作品系列 <span>*</span><input list="series-options" maxLength={100} placeholder="選擇或輸入自訂作品系列" {...field('series')}/><datalist id="series-options">{[...SERIES, ...Object.entries(PRODUCT_LINES).map(([productLine, series]) => seriesLabel({ productLine, series }))].map(s => <option key={s} value={s}/>)}</datalist><small>可填 HGUC 宇宙世紀、HGBF 鋼彈創鬥者；Excel 依此名稱分頁。</small></label>
      <div className="field-pair"><label>規格 <span>*</span><select {...field('grade')}>{GRADES.map(g => <option key={g}>{g}</option>)}</select></label><label>比例<input placeholder="例如 1/144、無比例" maxLength={50} {...field('scale')}/></label></div>
      <div className="field-pair"><label>購入價格<input type="number" min="0" step="any" placeholder="可稍後填寫" {...field('price')}/></label><label>存放位置<input placeholder="例如 書房 A 櫃第 2 層" maxLength={200} {...field('location')}/></label></div>
      <p className="input-hint">價格與存放位置保留空白亦可；價格請使用同一幣別。</p>
      {error && <div className="form-error" role="alert">{error}{saveFailed && <div className="save-recovery"><button className="secondary" onClick={() => submit(false)} disabled={saving}>重試儲存為待確認</button><button className="secondary" onClick={backupDraft}>下載含草稿的備份</button></div>}</div>}
    </div></div>
    <div className="editor-footer"><button className="delete-button" aria-label="刪除收藏" disabled={saving || recognizing} onClick={() => requestLeave(remove)}><Trash2 size={17}/></button><div><button className="secondary" disabled={saving || recognizing || Boolean(candidate)} onClick={() => submit(false)}>儲存為待確認</button><button className="primary" disabled={saving || recognizing || Boolean(candidate)} onClick={() => submit(true)}><Check size={17}/>{saving ? '正在儲存…' : queue ? '確認並開啟下一筆' : '確認並儲存'}</button></div></div>
    {viewer && <PhotoViewer image={draft.image} onClose={() => setViewer(false)}/>}
    {candidate && <Dialog className="comparison-modal" aria-labelledby="comparison-title" onClose={() => setCandidate(null)}><h2 id="comparison-title">比較重新辨識結果</h2><p>預設保留目前草稿。套用後仍須人工確認；價格與位置會保留。</p><div className="comparison-head"><span>欄位</span><span>目前值</span><span>新辨識值</span></div>{comparisonFields.map(([key, label]) => <label className="comparison-row" key={key}><span><input type="checkbox" aria-label={`採用新${label}`} checked={selected.includes(key)} onChange={event => setSelected(previous => event.target.checked ? [...previous, key] : previous.filter(field => field !== key))}/>{label}</span><span>{draft[key] || '（空白）'}</span><span>{asDraft(candidate)[key] || '（空白）'}</span></label>)}<details><summary>查看新辨識證據與提醒</summary><p>{candidate.ocrEngine}</p><ul>{candidate.warnings?.map((warning, index) => <li key={index}>{warning}</li>)}</ul><pre>{candidate.evidence || '尚無辨識文字。'}</pre></details><div className="dialog-actions"><button className="secondary" autoFocus onClick={() => setCandidate(null)}>保留目前值</button><button className="secondary" onClick={() => adopt(selected)} disabled={!selected.length}>採用勾選欄位</button><button className="primary" onClick={() => adopt(comparisonFields.map(([key]) => key))}>全部採用</button></div></Dialog>}
    {leave && <Dialog className="leave-modal" aria-labelledby="leave-title" onClose={() => setLeave(null)}><h2 id="leave-title">尚有未儲存修改</h2><p>選擇如何處理目前草稿。</p>{saveFailed && <p role="alert">儲存失敗，草稿仍保留。可繼續編輯後重試，或下載備份。</p>}<div className="dialog-actions"><button className="secondary" autoFocus disabled={saving} onClick={() => setLeave(null)}>繼續編輯</button><button className="secondary" disabled={saving} onClick={() => { const action = leave; setLeave(null); cancelRecognition(); action(); }}>捨棄修改</button><button className="primary" disabled={saving} onClick={async () => { if (savingRef.current) return; const action = leave; const saved = await persist(false); if (saved) { setLeave(null); cancelRecognition(); action(); } }}>儲存為待確認後離開</button>{saveFailed && <button className="secondary" onClick={backupDraft}>下載含草稿的備份</button>}</div></Dialog>}
  </Dialog>;
}
