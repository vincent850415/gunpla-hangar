import ExcelJS from 'exceljs';
import { seriesLabel } from './product-lines.mjs';
export function sheetName(raw, used) {
  let base = String(raw || '待確認').replace(/[\\/*?:\[\]\x00-\x1f]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || '未分類';
  if (base.toLowerCase() === 'history') base = 'History 收藏';
  let result = base, count = 2;
  while (used.has(result.toLowerCase())) { const tail = ` (${count++})`; result = base.slice(0, 31 - tail.length) + tail; }
  used.add(result.toLowerCase());
  return result;
}
export async function makeWorkbook(records) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '格納庫 Collection Record System';
  workbook.created = new Date();
  const groups = new Map();
  for (const record of records) {
    if (!record.confirmed || record.deletedAt) continue;
    const series = seriesLabel(record);
    if (!groups.has(series)) groups.set(series, []);
    groups.get(series).push(record);
  }
  if (!groups.size) throw new Error('請先確認至少一筆商品，再匯出 Excel。');
  const used = new Set();
  for (const [series, items] of groups) {
    const sheet = workbook.addWorksheet(sheetName(series, used), { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = [
      { header: '比例', key: 'scale', width: 14 }, { header: '商品名稱', key: 'name', width: 56 },
      { header: '價格', key: 'price', width: 18 }, { header: '存放位置', key: 'location', width: 28 },
    ];
    sheet.getRow(1).height = 30;
    sheet.getRow(1).eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF162A27' } };
      cell.font = { name: 'Microsoft JhengHei', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { vertical: 'middle' };
    });
    for (const item of items) {
      const row = sheet.addRow({ scale: item.scale || '', name: `[${item.grade}] ${item.name}`, price: item.price === '' || item.price == null ? null : Number(item.price), location: item.location || '' });
      row.height = 32;
      row.eachCell({ includeEmpty: true }, cell => {
        cell.font = { name: 'Microsoft JhengHei', size: 11 };
        cell.alignment = { vertical: 'middle', wrapText: true };
        if (row.number % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5EE' } };
      });
      row.getCell(3).numFmt = '#,##0.##';
    }
    sheet.autoFilter = { from: 'A1', to: `D${sheet.rowCount}` };
    sheet.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }
  return workbook;
}
export async function excelBlob(records) {
  const workbook = await makeWorkbook(records);
  return new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
