/**
 * Render Armand-style colored grid export with exceljs.
 */
import ExcelJS from 'exceljs'

const PALETTES = {
  header: { fg: 'FFFFFFFF', bg: 'FF3C4B4D' },
  yellow: { fg: 'FF1A1A1A', bg: 'FFFFF4CC' },
  gray: { fg: 'FF1A1A1A', bg: 'FFECEFF1' },
  blue: { fg: 'FF1A1A1A', bg: 'FFDCE8F5' },
  green: { fg: 'FF1A1A1A', bg: 'FFC8E6C9' },
  subrow: { fg: 'FF4A5568', bg: 'FFF3F4F6' },
  normal: { fg: 'FF1A1A1A', bg: 'FFFFFFFF' },
}

function applyPalette(cell, paletteKey = 'normal') {
  const palette = PALETTES[paletteKey] || PALETTES.normal
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.bg } }
  cell.font = { name: 'Calibri', size: 10, color: { argb: palette.fg } }
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFD0D5DD' } },
    left: { style: 'thin', color: { argb: 'FFD0D5DD' } },
    bottom: { style: 'thin', color: { argb: 'FFD0D5DD' } },
    right: { style: 'thin', color: { argb: 'FFD0D5DD' } },
  }
}

function writeCells(sheet, rowIndex, cells = []) {
  const row = sheet.getRow(rowIndex)
  cells.forEach((item, colIndex) => {
    const cell = row.getCell(colIndex + 1)
    const value = item?.v
    if (typeof value === 'number' && Number.isFinite(value)) {
      cell.value = value
      if (colIndex >= cells.length - 4) cell.numFmt = '#,##0.00'
    } else {
      cell.value = value ?? ''
    }
    applyPalette(cell, item?.p || 'normal')
    if (colIndex >= cells.length - 2) cell.alignment = { horizontal: 'right', vertical: 'middle' }
    else cell.alignment = { vertical: 'middle', wrapText: true }
  })
  row.commit()
}

/**
 * @param {import('../../src/lib/gridXlsxPayload.js').buildGridXlsxPayload extends Function ? ReturnType<import('../../src/lib/gridXlsxPayload.js').buildGridXlsxPayload> : object} payload
 */
export async function renderGridXlsxBuffer(payload = {}) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Zerux Devis Grid'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet('Grille devis', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  const headers = Array.isArray(payload.headers) ? payload.headers : []
  const headerRow = sheet.getRow(1)
  headers.forEach((label, index) => {
    const cell = headerRow.getCell(index + 1)
    cell.value = label
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: PALETTES.header.fg } }
    applyPalette(cell, 'header')
    cell.alignment = { horizontal: index >= headers.length - 4 ? 'right' : 'left', vertical: 'middle', wrapText: true }
  })
  headerRow.height = 22
  headerRow.commit()

  let rowIndex = 2
  for (const block of payload.body || []) {
    writeCells(sheet, rowIndex, block.cells || [])
    rowIndex += 1
  }

  const colCount = headers.length || 18
  const valueCol = colCount
  const labelColSpan = Math.max(1, colCount - 1)

  for (const footer of payload.footer || []) {
    const row = sheet.getRow(rowIndex)
    sheet.mergeCells(rowIndex, 1, rowIndex, labelColSpan)
    const labelCell = row.getCell(1)
    labelCell.value = footer.label || ''
    applyPalette(labelCell, footer.palette === 'green' ? 'green' : 'normal')
    labelCell.font = { name: 'Calibri', size: 11, bold: footer.palette === 'blue' || footer.palette === 'green' }
    labelCell.alignment = { horizontal: 'left', vertical: 'middle' }

    const valueCell = row.getCell(valueCol)
    valueCell.value = Number(footer.value) || 0
    valueCell.numFmt = '#,##0.00'
    applyPalette(valueCell, footer.palette || 'normal')
    valueCell.font = { name: 'Calibri', size: 11, bold: true }
    valueCell.alignment = { horizontal: 'right', vertical: 'middle' }
    row.commit()
    rowIndex += 1
  }

  headers.forEach((label, index) => {
    const widths = {
      '#': 5,
      'Désignation': 34,
      'Localisation': 16,
      'Perfs': 18,
      'PU HT': 11,
      'Remise': 8,
      'Q.': 6,
      'Total HT': 12,
    }
    const col = sheet.getColumn(index + 1)
    col.width = widths[label] || (label.length > 12 ? 14 : 11)
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
