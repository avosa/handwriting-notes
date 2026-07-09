import { test, expect } from '@playwright/test'

// The sheet is the thing that kept breaking, so this asserts the ruling directly:
// every horizontal rule is present, evenly spaced, and the salmon margin sits where
// the spec says. Reading geometry from the rendered SVG keeps the check exact.
test('the 1C sheet rules are uniform and complete', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('.note-page .sheet')

  const geometry = await page.evaluate(() => {
    const svg = document.querySelector('.note-page .sheet') as SVGSVGElement
    const lines = Array.from(svg.querySelectorAll('line'))
    const horizontals = lines
      .filter((l) => l.getAttribute('y1') === l.getAttribute('y2'))
      .map((l) => Number(l.getAttribute('y1')))
      .sort((a, b) => a - b)
    const vertical = lines.find((l) => l.getAttribute('x1') === l.getAttribute('x2'))
    return { horizontals, marginX: vertical ? Number(vertical.getAttribute('x1')) : null }
  })

  expect(geometry.horizontals.length).toBeGreaterThan(20)

  const gaps: number[] = []
  for (let i = 1; i < geometry.horizontals.length; i++) {
    gaps.push(geometry.horizontals[i] - geometry.horizontals[i - 1])
  }
  const target = 9.02
  for (const gap of gaps) {
    // The viewBox is in millimetres, so 0.15 here is 0.15 mm.
    expect(Math.abs(gap - target)).toBeLessThan(0.15)
  }

  expect(geometry.marginX).not.toBeNull()
  expect(Math.abs((geometry.marginX as number) - 24.8)).toBeLessThan(0.3)
})

test('diagrams are drawn as pen paths, never perfect primitives', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('.note-page .diagram')

  const shapes = await page.evaluate(() => {
    const diagram = document.querySelector('.note-page .diagram') as SVGSVGElement
    return {
      paths: diagram.querySelectorAll('path').length,
      circles: diagram.querySelectorAll('circle').length,
      rects: diagram.querySelectorAll('rect').length,
    }
  })

  expect(shapes.paths).toBeGreaterThan(0)
  expect(shapes.circles).toBe(0)
  expect(shapes.rects).toBe(0)
})
