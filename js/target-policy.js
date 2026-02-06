(() => {
  function calculate(input) {
    const {
      arr,
      targetYear,
      targetQuarter,
      profile,
      controls,
      forecastEngine,
      dataModel,
      utils
    } = input;

    const { clamp, mean, sd } = utils;
    const {
      ambition,
      winRate,
      capacityFactor,
      pipeline,
      dealValue
    } = controls;

    const backtest = forecastEngine.backtest(arr, profile);
    const modelForecast = {
      sn: forecastEngine.mSN(arr, targetYear, targetQuarter),
      cagr: forecastEngine.mCAGR(arr, targetYear, targetQuarter),
      trend: forecastEngine.mTrend(arr, targetYear, targetQuarter),
      mom: forecastEngine.mMom(arr, targetYear, targetQuarter)
    };

    let ensemble = backtest.w.sn * modelForecast.sn +
      backtest.w.cagr * modelForecast.cagr +
      backtest.w.trend * modelForecast.trend +
      backtest.w.mom * modelForecast.mom;
    if (!Number.isFinite(ensemble) || ensemble <= 0) {
      ensemble = forecastEngine.mSN(arr, targetYear, targetQuarter);
    }

    const interval = forecastEngine.boot(ensemble, forecastEngine.pool(backtest.res, backtest.esm), 2200);
    const reference = dataModel.point(arr, targetYear - 1, targetQuarter) ||
      dataModel.lastSame(arr, targetQuarter, targetYear - 1) ||
      arr[arr.length - 1];

    const floor = reference.v * 1.10;
    const minimum = Math.max(floor, interval.q20);

    const cv = sd(arr.map((item) => item.v)) / Math.max(mean(arr.map((item) => item.v)), 1);
    const riskPenalty = clamp(cv * 0.22 + backtest.esm * 0.55 + profile.risk, 0, 0.25);

    const pipelineCapacity = pipeline * winRate;
    const commercialCapacity = pipelineCapacity * capacityFactor;

    const statisticalCommit = interval.q50 * (1 + ambition - riskPenalty);
    const commit = Math.max(minimum, Math.min(statisticalCommit, Math.max(commercialCapacity, minimum)));
    const stretch = Math.max(commit * 1.08, interval.q80 * (1 + ambition * 0.5), minimum * 1.12);

    const requiredPipeline = commit / winRate;
    const coverage = requiredPipeline > 0 ? pipeline / requiredPipeline : 0;

    const season = forecastEngine.seasonality(arr);
    const deseasonalized = arr.map((item) => item.v / (season.idx[item.quarter ?? item.q] || 1));
    const trendFit = forecastEngine.regression(arr.map((item) => item.tt), deseasonalized);
    const annualTrend = Math.pow(1 + (trendFit.m / Math.max(mean(deseasonalized), 1)), 4) - 1;
    const latestQoq = arr.length >= 2 ? (arr[arr.length - 1].v / arr[arr.length - 2].v - 1) : 0;

    const depth = clamp(arr.length / 24, 0, 1);
    const accuracy = clamp(1 - backtest.esm / 0.35, 0, 1);
    const stability = clamp(1 - cv / 0.8, 0, 1);
    const coverageScore = clamp(coverage, 0, 1);
    const confidence = clamp((accuracy * 0.45 + stability * 0.2 + depth * 0.2 + coverageScore * 0.15) * 100, 25, 95);

    const result = {
      p: interval,
      min: minimum,
      commit,
      stretch,
      minYoY: minimum / reference.v - 1,
      commitYoY: commit / reference.v - 1,
      stretchYoY: stretch / reference.v - 1,
      p50YoY: interval.q50 / reference.v - 1,
      confidence,
      annTrend: annualTrend,
      latestQoq,
      targetSI: season.idx[targetQuarter],
      peakQ: season.peak,
      lowQ: season.low,
      esm: backtest.esm,
      points: arr.length,
      reqPipeline: requiredPipeline,
      coverage,
      w: backtest.w,
      mm: backtest.m,
      tq: targetQuarter
    };

    return {
      result,
      commercialCapacity,
      fittedSeries: forecastEngine.fitted(arr, backtest.w),
      seasonIndex: season.idx
    };
  }

  window.TargetPolicy = { calculate };
})();
