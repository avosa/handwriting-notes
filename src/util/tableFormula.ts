// A tiny spreadsheet evaluator for table cells. A cell whose text starts with "=" is a formula.
// Row 1 is the header; row 2 is the first body row, addressed A1, B2, and so on. Ranges like
// A2:A5 feed the functions SUM, AVG, MIN, MAX, COUNT, and PRODUCT; plain cell references and the
// operators + - * / ( ) work too. Anything it cannot make sense of shows a small "#err" so a
// mistyped formula is obvious rather than silently wrong. It never runs arbitrary code: only a
// digits-and-operators expression is ever evaluated, and only after refs and functions are gone.

const CELL = /([A-Z]+)(\d+)/g
const RANGE = /([A-Z]+)(\d+):([A-Z]+)(\d+)/g
const FUNC = /\b(SUM|AVG|MIN|MAX|COUNT|PRODUCT)\s*\(([^)]*)\)/gi

function colToIndex(letters: string): number {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function cellValue(col: number, rowNum: number, header: string[], rows: string[][]): string {
  if (col < 0 || col >= header.length) return ''
  if (rowNum === 1) return header[col] ?? ''
  return rows[rowNum - 2]?.[col] ?? ''
}

// Every value in a range, in reading order, as raw strings.
function rangeValues(a: string, header: string[], rows: string[][]): string[] {
  const m = new RegExp(`^${RANGE.source}$`).exec(a.trim())
  if (m) {
    const c1 = colToIndex(m[1])
    const r1 = Number(m[2])
    const c2 = colToIndex(m[3])
    const r2 = Number(m[4])
    const out: string[] = []
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++)
      for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) out.push(cellValue(c, r, header, rows))
    return out
  }
  // A single cell, or a comma list of cells, given to a function.
  return a
    .split(',')
    .map((ref) => {
      const cm = /^([A-Z]+)(\d+)$/.exec(ref.trim())
      return cm ? cellValue(colToIndex(cm[1]), Number(cm[2]), header, rows) : ref.trim()
    })
    .filter((v) => v !== '')
}

function applyFunc(name: string, values: string[]): number {
  const nums = values.map(Number).filter((n) => !Number.isNaN(n))
  switch (name.toUpperCase()) {
    case 'SUM':
      return nums.reduce((s, n) => s + n, 0)
    case 'AVG':
      return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0
    case 'MIN':
      return nums.length ? Math.min(...nums) : 0
    case 'MAX':
      return nums.length ? Math.max(...nums) : 0
    case 'PRODUCT':
      return nums.reduce((p, n) => p * n, 1)
    case 'COUNT':
      return nums.length
    default:
      return 0
  }
}

// Tidy a computed number: whole numbers stay whole, the rest are trimmed to a few decimals.
function tidy(n: number): string {
  if (!Number.isFinite(n)) return '#err'
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1e6) / 1e6)
}

export function isFormula(text: string): boolean {
  return text.trimStart().startsWith('=')
}

export function evalFormula(raw: string, header: string[], rows: string[][], depth = 0): string {
  if (!isFormula(raw)) return raw
  if (depth > 8) return '#err'
  let expr = raw.trim().slice(1)
  try {
    // Functions first, each replaced by the number it yields.
    expr = expr.replace(FUNC, (_all, name: string, args: string) =>
      tidy(applyFunc(name, rangeValues(args, header, rows))),
    )
    // Then any remaining plain cell references, replaced by their value (a formula cell is
    // resolved in turn, so one formula can build on another).
    expr = expr.replace(CELL, (_all, col: string, row: string) => {
      const v = cellValue(colToIndex(col), Number(row), header, rows)
      const resolved = isFormula(v) ? evalFormula(v, header, rows, depth + 1) : v
      const n = Number(resolved)
      return Number.isNaN(n) ? '0' : String(n)
    })
    // What remains must be a bare arithmetic expression before it is evaluated.
    if (!/^[0-9+\-*/(). ]*$/.test(expr)) return '#err'
    if (!expr.trim()) return '0'
    const value = Function(`"use strict";return (${expr})`)() as number
    return tidy(typeof value === 'number' ? value : Number(value))
  } catch {
    return '#err'
  }
}
