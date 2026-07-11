import { describe, it, expect } from 'vitest'
import { evalFormula, isFormula } from '@/util/tableFormula'

const header = ['item', 'qty', 'price']
const rows = [
  ['apple', '3', '2'],
  ['pear', '5', '4'],
  ['plum', '2', '1'],
]

describe('table formulas', () => {
  it('recognises a formula by its leading equals', () => {
    expect(isFormula('=SUM(B2:B4)')).toBe(true)
    expect(isFormula('plain')).toBe(false)
  })

  it('sums, averages, and finds min/max over a range (row 1 is the header)', () => {
    expect(evalFormula('=SUM(B2:B4)', header, rows)).toBe('10')
    expect(evalFormula('=AVG(B2:B4)', header, rows)).toBe('3.333333')
    expect(evalFormula('=MIN(C2:C4)', header, rows)).toBe('1')
    expect(evalFormula('=MAX(C2:C4)', header, rows)).toBe('4')
    expect(evalFormula('=COUNT(B2:B4)', header, rows)).toBe('3')
  })

  it('does cell arithmetic and rejects anything unsafe', () => {
    expect(evalFormula('=B2*C2', header, rows)).toBe('6')
    expect(evalFormula('=B2+B3+B4', header, rows)).toBe('10')
    expect(evalFormula('=alert(1)', header, rows)).toBe('#err')
  })
})
