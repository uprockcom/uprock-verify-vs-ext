/**
 * Constants for UpRock Verify Extension
 */

// Web Vitals Thresholds
const WEB_VITALS_THRESHOLDS = {
  lcp: {
    good: 2500,
    poor: 4000,
    unit: 'ms',
    label: 'LCP (Largest Contentful Paint)'
  },
  cls: {
    good: 0.1,
    poor: 0.25,
    unit: '',
    label: 'CLS (Cumulative Layout Shift)'
  },
  ttfb: {
    good: 800,
    poor: 1800,
    unit: 'ms',
    label: 'TTFB (Time to First Byte)'
  },
  fcp: {
    good: 1800,
    poor: 3000,
    unit: 'ms',
    label: 'FCP (First Contentful Paint)'
  },
  tti: {
    good: 3800,
    poor: 7300,
    unit: 'ms',
    label: 'TTI (Time to Interactive)'
  }
};

// State Display
const STATE_DISPLAY = {
  perfect: {
    label: 'Perfect',
    color: '#22c55e',
    emoji: '🟢',
    description: 'Site is fully reachable and highly usable'
  },
  good: {
    label: 'Good',
    color: '#eab308',
    emoji: '🟡',
    description: 'Site is reachable with acceptable performance'
  },
  degraded: {
    label: 'Degraded',
    color: '#f97316',
    emoji: '🟠',
    description: 'Site has reachability or performance issues'
  },
  down: {
    label: 'Down',
    color: '#ef4444',
    emoji: '🔴',
    description: 'Site is unreachable or severely degraded'
  }
};

// Continent Display
const CONTINENT_DISPLAY = {
  NA: { label: 'North America', flag: '🇺🇸' },
  EU: { label: 'Europe', flag: '🇪🇺' },
  AS: { label: 'Asia', flag: '🇯🇵' },
  AF: { label: 'Africa', flag: '🇿🇦' },
  OC: { label: 'Oceania', flag: '🇦🇺' },
  SA: { label: 'South America', flag: '🇧🇷' }
};

// Default Configuration
const DEFAULT_CONFIG = {
  apiBaseUrl: 'https://768q7f2qhge7.share.zrok.io',
  defaultRegion: 'NA',
  timeout: 180000,
  showNotifications: true
};

module.exports = {
  WEB_VITALS_THRESHOLDS,
  STATE_DISPLAY,
  CONTINENT_DISPLAY,
  DEFAULT_CONFIG
};
