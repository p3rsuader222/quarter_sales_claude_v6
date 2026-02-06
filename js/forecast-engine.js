(() => {
  const utils = window.CoreUtils;
  if (!utils || typeof utils.clamp !== "function" || typeof utils.mean !== "function" || typeof utils.toTime !== "function") {
    throw new Error("ForecastEngine requires CoreUtils (clamp, mean, toTime). Check script load order in index.html.");
  }

  const quarterOf = (point) => point.quarter ?? point.q;
  const clamp = utils.clamp;
  const mean = utils.mean;
  const median = utils.median;
  const toTime = utils.toTime;
  const quantile = utils.quantile;

  function seasonality(series) {
    const byYear = new Map();
    const byQuarter = { 1: [], 2: [], 3: [], 4: [] };

    series.forEach((point) => {
      if (!byYear.has(point.year)) byYear.set(point.year, []);
      byYear.get(point.year).push(point.v);
    });

    const yearMean = new Map();
    byYear.forEach((values, year) => yearMean.set(year, mean(values)));

    series.forEach((point) => {
      const yMean = yearMean.get(point.year);
      if (yMean > 0) byQuarter[quarterOf(point)].push(point.v / yMean);
    });

    const index = [0, 1, 1, 1, 1];
    [1, 2, 3, 4].forEach((quarter) => {
      if (byQuarter[quarter].length) index[quarter] = mean(byQuarter[quarter]);
    });

    const avgIndex = mean([index[1], index[2], index[3], index[4]]) || 1;
    [1, 2, 3, 4].forEach((quarter) => {
      index[quarter] /= avgIndex;
    });

    const values = [index[1], index[2], index[3], index[4]];
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    return { idx: index, peak: values.indexOf(maxValue) + 1, low: values.indexOf(minValue) + 1 };
  }

  function adjustSeason(value, fromQuarter, toQuarter, seasonIndex) {
    return value * ((seasonIndex[toQuarter] || 1) / (seasonIndex[fromQuarter] || 1));
  }

  function regression(x, y) {
    if (x.length < 2) return { m: 0, b: mean(y) };
    const xMean = mean(x);
    const yMean = mean(y);
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < x.length; i += 1) {
      const dx = x[i] - xMean;
      numerator += dx * (y[i] - yMean);
      denominator += dx * dx;
    }
    if (!denominator) return { m: 0, b: yMean };
    const slope = numerator / denominator;
    return { m: slope, b: yMean - slope * xMean };
  }

  function mSN(train, targetYear, targetQuarter) {
    const seasonIndex = seasonality(train).idx;
    const targetT = toTime(targetYear, targetQuarter);
    const sameQuarter = train.filter((point) => quarterOf(point) === targetQuarter).sort((a, b) => a.tt - b.tt);
    if (sameQuarter.length) {
      const latest = sameQuarter[sameQuarter.length - 1];
      let base = latest.v;
      if (sameQuarter.length >= 2) {
        const growth = [];
        for (let i = 1; i < sameQuarter.length; i += 1) {
          if (sameQuarter[i - 1].v > 0) growth.push(sameQuarter[i].v / sameQuarter[i - 1].v - 1);
        }
        const drift = clamp(median(growth), -0.25, 0.45);
        const yearsAhead = Math.max(0.25, (targetT - latest.tt) / 4);
        base *= Math.pow(1 + drift * 0.55, yearsAhead);
      }
      return Math.max(base, 1);
    }
    const latest = train[train.length - 1];
    return Math.max(adjustSeason(latest.v, quarterOf(latest), targetQuarter, seasonIndex), 1);
  }

  function mCAGR(train, targetYear, targetQuarter) {
    const targetT = toTime(targetYear, targetQuarter);
    const sameQuarter = train.filter((point) => quarterOf(point) === targetQuarter).sort((a, b) => a.tt - b.tt);
    if (sameQuarter.length >= 2) {
      const first = sameQuarter[0];
      const latest = sameQuarter[sameQuarter.length - 1];
      if (first.v > 0 && latest.v > 0) {
        const years = Math.max(1, (latest.tt - first.tt) / 4);
        const cagr = clamp(Math.pow(latest.v / first.v, 1 / years) - 1, -0.2, 0.45);
        const yearsAhead = Math.max(0.25, (targetT - latest.tt) / 4);
        return Math.max(latest.v * Math.pow(1 + cagr, yearsAhead), 1);
      }
    }
    if (sameQuarter.length) return Math.max(sameQuarter[sameQuarter.length - 1].v, 1);
    return mSN(train, targetYear, targetQuarter);
  }

  function mTrend(train, targetYear, targetQuarter) {
    const seasonIndex = seasonality(train).idx;
    const x = train.map((point) => point.tt);
    const y = train.map((point) => point.v / (seasonIndex[quarterOf(point)] || 1));
    if (x.length < 3) return mSN(train, targetYear, targetQuarter);
    const med = median(y);
    const mad = median(y.map((value) => Math.abs(value - med))) || 0;
    const filteredX = [];
    const filteredY = [];
    for (let i = 0; i < y.length; i += 1) {
      if (!mad || Math.abs(y[i] - med) <= 3 * mad) {
        filteredX.push(x[i]);
        filteredY.push(y[i]);
      }
    }
    const fit = regression(filteredX, filteredY);
    const predicted = Math.max(fit.b + fit.m * toTime(targetYear, targetQuarter), mean(filteredY) * 0.35);
    return Math.max(predicted * seasonIndex[targetQuarter], 1);
  }

  function mMom(train, targetYear, targetQuarter) {
    const seasonIndex = seasonality(train).idx;
    const latest = train[train.length - 1];
    const horizon = Math.max(1, toTime(targetYear, targetQuarter) - latest.tt);
    let annualGrowth = 0;
    if (train.length >= 8) {
      const recent4 = train.slice(-4).reduce((sum, point) => sum + point.v, 0);
      const previous4 = train.slice(-8, -4).reduce((sum, point) => sum + point.v, 0);
      if (previous4 > 0) annualGrowth = recent4 / previous4 - 1;
    } else {
      const qoq = [];
      for (let i = 1; i < train.length; i += 1) {
        if (train[i - 1].v > 0) qoq.push(train[i].v / train[i - 1].v - 1);
      }
      annualGrowth = mean(qoq) * 4;
    }
    annualGrowth = clamp(annualGrowth, -0.35, 0.65);
    const sameQuarter = train.filter((point) => quarterOf(point) === targetQuarter).sort((a, b) => a.tt - b.tt);
    const base = sameQuarter.length
      ? sameQuarter[sameQuarter.length - 1].v
      : adjustSeason(latest.v, quarterOf(latest), targetQuarter, seasonIndex);
    return Math.max(base * (1 + annualGrowth * (horizon / 4) * 0.75), 1);
  }

  function naive(train, targetYear, targetQuarter) {
    const sameQuarter = train.filter((point) => quarterOf(point) === targetQuarter).sort((a, b) => a.tt - b.tt);
    if (sameQuarter.length) return sameQuarter[sameQuarter.length - 1].v;
    const latest = train[train.length - 1];
    const seasonIndex = seasonality(train).idx;
    return adjustSeason(latest.v, quarterOf(latest), targetQuarter, seasonIndex);
  }

  function backtest(series, profile) {
    const folds = [];
    const stats = { sn: [], cagr: [], trend: [], mom: [] };
    const naiveErrors = { sn: [], cagr: [], trend: [], mom: [] };
    const biases = { sn: [], cagr: [], trend: [], mom: [] };

    for (let i = 8; i < series.length; i += 1) {
      const train = series.slice(0, i);
      const target = series[i];
      const naivePred = naive(train, target.year, quarterOf(target));
      const pred = {
        sn: mSN(train, target.year, quarterOf(target)),
        cagr: mCAGR(train, target.year, quarterOf(target)),
        trend: mTrend(train, target.year, quarterOf(target)),
        mom: mMom(train, target.year, quarterOf(target))
      };
      folds.push({ a: target.v, p: pred });
      ["sn", "cagr", "trend", "mom"].forEach((key) => {
        const predicted = pred[key];
        const absError = Math.abs(target.v - predicted);
        const smape = (2 * absError) / (Math.abs(target.v) + Math.abs(predicted) + 1e-9);
        const bias = (predicted - target.v) / Math.max(target.v, 1);
        stats[key].push(smape);
        naiveErrors[key].push(Math.abs(target.v - naivePred));
        biases[key].push(bias);
      });
    }

    const metrics = {};
    ["sn", "cagr", "trend", "mom"].forEach((key) => {
      const smape = mean(stats[key]) || 0.22;
      const mae = mean(stats[key].map((_, i) => Math.abs((folds[i]?.a ?? 0) - (folds[i]?.p?.[key] ?? 0)))) || 1;
      const mase = mae / (mean(naiveErrors[key]) || 1);
      const bias = mean(biases[key]) || 0;
      metrics[key] = { smape, mase, bias };
    });

    let sum = 0;
    const weights = {};
    ["sn", "cagr", "trend", "mom"].forEach((key) => {
      const score = (profile.priors[key] || 1) *
        (1 / (metrics[key].smape + 0.03)) *
        (1 / (1 + Math.abs(metrics[key].bias) * 2.1)) *
        (1 / (metrics[key].mase + 0.2));
      weights[key] = score;
      sum += score;
    });

    if (sum <= 0) {
      ["sn", "cagr", "trend", "mom"].forEach((key) => { weights[key] = 0.25; });
    } else {
      ["sn", "cagr", "trend", "mom"].forEach((key) => { weights[key] /= sum; });
    }

    const residuals = [];
    const ensembleSmape = [];
    folds.forEach((fold) => {
      const ensemblePred = weights.sn * fold.p.sn + weights.cagr * fold.p.cagr + weights.trend * fold.p.trend + weights.mom * fold.p.mom;
      if (ensemblePred > 0) {
        residuals.push((fold.a - ensemblePred) / ensemblePred);
        ensembleSmape.push((2 * Math.abs(fold.a - ensemblePred)) / (Math.abs(fold.a) + Math.abs(ensemblePred) + 1e-9));
      }
    });
    return { w: weights, m: metrics, res: residuals, esm: mean(ensembleSmape) || 0.18 };
  }

  function pool(residuals, ensembleSmape) {
    const filtered = residuals.filter((value) => Number.isFinite(value) && Math.abs(value) < 1.2);
    if (filtered.length >= 12) return filtered;
    const spread = clamp(ensembleSmape || 0.16, 0.06, 0.4);
    return filtered.concat([-1, -0.65, -0.35, -0.15, 0, 0.15, 0.35, 0.65, 1].map((m) => m * spread));
  }

  function boot(baseForecast, residuals, sampleSize = 1800) {
    const values = [];
    for (let i = 0; i < sampleSize; i += 1) {
      const sampled = residuals[Math.floor(Math.random() * residuals.length)] || 0;
      values.push(Math.max(baseForecast * (1 + sampled), 1));
    }
    values.sort((a, b) => a - b);
    return { q20: quantile(values, 0.2), q50: quantile(values, 0.5), q80: quantile(values, 0.8) };
  }

  function fitted(series, weights) {
    const fit = new Array(series.length).fill(null);
    for (let i = 8; i < series.length; i += 1) {
      const train = series.slice(0, i);
      const target = series[i];
      fit[i] =
        weights.sn * mSN(train, target.year, quarterOf(target)) +
        weights.cagr * mCAGR(train, target.year, quarterOf(target)) +
        weights.trend * mTrend(train, target.year, quarterOf(target)) +
        weights.mom * mMom(train, target.year, quarterOf(target));
    }
    return fit;
  }

  window.ForecastEngine = {
    seasonality,
    regression,
    mSN,
    mCAGR,
    mTrend,
    mMom,
    naive,
    backtest,
    pool,
    boot,
    fitted
  };
})();
