import type { ChartOptions } from 'chart.js';

const GRID = 'rgba(255, 255, 255, 0.07)';
const TICK = '#9aa1b1';

/** Shared dark-theme chart styling, tuned for a phone-width canvas. */
const base = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { intersect: false, mode: 'index' as const },
  },
  scales: {
    x: { grid: { color: GRID }, ticks: { color: TICK, maxTicksLimit: 7 } },
    y: { grid: { color: GRID }, ticks: { color: TICK } },
  },
};

export const LINE_CHART_OPTIONS: ChartOptions<'line'> = {
  ...base,
  scales: {
    ...base.scales,
    // Weight moves in a narrow band — a zero-based axis would flatten the curve.
    y: { ...base.scales.y, beginAtZero: false },
  },
};

export const BAR_CHART_OPTIONS: ChartOptions<'bar'> = {
  ...base,
  scales: {
    ...base.scales,
    y: { ...base.scales.y, beginAtZero: true },
  },
};
