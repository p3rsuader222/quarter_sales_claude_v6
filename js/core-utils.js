(() => {
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const sd = (values) => values.length < 2 ? 0 : Math.sqrt(mean(values.map((value) => (value - mean(values)) ** 2)));
  const median = (values) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const quantile = (sortedValues, p) => {
    if (!sortedValues.length) return 0;
    const i = (sortedValues.length - 1) * p;
    const lower = Math.floor(i);
    const upper = Math.ceil(i);
    if (lower === upper) return sortedValues[lower];
    return sortedValues[lower] * (upper - i) + sortedValues[upper] * (i - lower);
  };
  const pct = (value) => (Number(value) || 0) / 100;
  const toTime = (year, quarter) => year * 4 + quarter;
  const qName = (quarter) => "Q" + quarter;
  const parseNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const money = (value, currency = "EUR") => Number.isFinite(value)
    ? new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
    : "-";
  const fmtPct = (value, digits = 1) => Number.isFinite(value)
    ? (value >= 0 ? "+" : "") + (value * 100).toFixed(digits) + "%"
    : "-";

  window.CoreUtils = {
    clamp,
    mean,
    sd,
    median,
    quantile,
    pct,
    toTime,
    qName,
    parseNumber,
    money,
    fmtPct
  };
})();
