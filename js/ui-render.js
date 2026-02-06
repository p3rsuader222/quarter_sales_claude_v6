(() => {
  function renderKpi(result, currency, helpers) {
    const { money, fmtPct } = helpers;
    const confidence = Math.round(result.confidence);
    const confidenceClass = confidence >= 78 ? "good" : confidence >= 60 ? "mid" : "low";
    const confidenceBand = confidence >= 78 ? "High" : confidence >= 60 ? "Medium" : "Low";

    document.getElementById("kMin").textContent = money(result.min, currency);
    document.getElementById("kCom").textContent = money(result.commit, currency);
    document.getElementById("kStr").textContent = money(result.stretch, currency);
    document.getElementById("kP50").textContent = money(result.p.q50, currency);
    document.getElementById("kYoY").textContent = fmtPct(result.commitYoY, 1);

    const confidenceNode = document.getElementById("kConf");
    confidenceNode.className = "v " + confidenceClass;
    confidenceNode.textContent = confidence + "%";

    document.getElementById("kConfS").textContent = confidenceBand + " certainty";
    document.getElementById("kMinS").textContent = "YoY " + fmtPct(result.minYoY, 1) + " | Floor +10%";
    document.getElementById("kComS").textContent = "YoY " + fmtPct(result.commitYoY, 1) + " | P50 risk-adjusted";
    document.getElementById("kStrS").textContent = "YoY " + fmtPct(result.stretchYoY, 1) + " | P80 execution stretch";
    document.getElementById("kP50S").textContent = "YoY " + fmtPct(result.p50YoY, 1) + " | Range " + money(result.p.q20, currency) + " to " + money(result.p.q80, currency);
    document.getElementById("kYoYS").textContent = "Vs baseline quarter";
  }

  const compactMoney = (value, currency, money) => {
    if (!Number.isFinite(value)) return "";
    const short = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
    return `${short} ${currency === "EUR" ? "EUR" : ""}`.trim();
  };

  function dataLabelBase(formatter) {
    return {
      color: "#234047",
      backgroundColor: "rgba(255,255,255,.84)",
      borderRadius: 5,
      padding: { top: 2, right: 4, bottom: 2, left: 4 },
      font: { size: 10, weight: "600" },
      formatter
    };
  }

  function plotForecast(state, series, fittedSeries, label, interval, commitTarget, currency, helpers) {
    const { money } = helpers;
    if (state.charts.f) state.charts.f.destroy();

    const labels = series.map((item) => item.label).concat(label);
    const actual = series.map((item) => item.v).concat(null);
    const fittedLine = fittedSeries.concat(interval.q50);
    const p20 = new Array(series.length).fill(null).concat(interval.q20);
    const p80 = new Array(series.length).fill(null).concat(interval.q80);
    const commit = new Array(series.length).fill(null).concat(commitTarget);

    state.charts.f = new Chart(document.getElementById("forecastChart"), {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Actual", data: actual, borderColor: "#0f766e", backgroundColor: "rgba(15,118,110,.18)", borderWidth: 2.3, pointRadius: 3, tension: 0.2 },
          { label: "Fit + P50", data: fittedLine, borderColor: "#d97706", borderDash: [6, 4], borderWidth: 2.2, pointRadius: 2.5, tension: 0.2 },
          { label: "P20", data: p20, borderColor: "rgba(30,64,175,.72)", borderWidth: 2, pointRadius: 3, tension: 0.2 },
          { label: "P80", data: p80, borderColor: "rgba(30,64,175,.72)", borderWidth: 2, pointRadius: 3, tension: 0.2 },
          { type: "bar", label: "Commit", data: commit, borderColor: "#1d4ed8", backgroundColor: "rgba(37,99,235,.66)", borderRadius: 8 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          datalabels: {
            ...dataLabelBase((value, context) => compactMoney(value, currency, money)),
            display(context) {
              const idx = context.dataIndex;
              const datasetLabel = context.dataset.label;
              const last = context.chart.data.labels.length - 1;
              if (!Number.isFinite(context.dataset.data[idx])) return false;
              if (datasetLabel === "Actual") return idx % 2 === 0 || idx === last - 1;
              return idx === last;
            },
            align: "top",
            anchor: "end",
            offset: 3,
            clamp: true
          },
          tooltip: {
            callbacks: {
              label(context) {
                return `${context.dataset.label}: ${Number.isFinite(context.parsed.y) ? money(context.parsed.y, currency) : "-"}`;
              }
            }
          }
        },
        scales: {
          y: { ticks: { callback: (value) => money(value, currency) }, grid: { color: "rgba(19,39,44,.09)" } },
          x: { grid: { color: "rgba(19,39,44,.05)" } }
        }
      }
    });
  }

  function plotSeason(state, seasonIndex, targetQuarter) {
    if (state.charts.s) state.charts.s.destroy();
    const values = [seasonIndex[1], seasonIndex[2], seasonIndex[3], seasonIndex[4]].map((value) => value * 100);
    state.charts.s = new Chart(document.getElementById("seasonChart"), {
      type: "bar",
      data: {
        labels: ["Q1", "Q2", "Q3", "Q4"],
        datasets: [
          {
            data: values,
            backgroundColor: [1, 2, 3, 4].map((quarter) => quarter === targetQuarter ? "rgba(13,148,136,.85)" : "rgba(148,163,184,.72)"),
            borderRadius: 8
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: {
            ...dataLabelBase((value) => `${value.toFixed(0)}`),
            align: "end",
            anchor: "end",
            offset: 2
          }
        },
        scales: {
          y: { beginAtZero: false, grid: { color: "rgba(19,39,44,.09)" } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function plotLadder(state, minimumTarget, commitTarget, stretchTarget, capacity, currency, helpers) {
    const { money } = helpers;
    if (state.charts.l) state.charts.l.destroy();
    state.charts.l = new Chart(document.getElementById("ladderChart"), {
      type: "bar",
      data: {
        labels: ["Minimum", "Commit", "Stretch", "Commercial Capacity"],
        datasets: [
          {
            data: [minimumTarget, commitTarget, stretchTarget, capacity],
            backgroundColor: ["rgba(245,158,11,.78)", "rgba(37,99,235,.82)", "rgba(14,165,233,.78)", "rgba(15,118,110,.72)"],
            borderRadius: 8
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          datalabels: {
            ...dataLabelBase((value) => compactMoney(value, currency, money)),
            align: "end",
            anchor: "end",
            offset: 2
          },
          tooltip: { callbacks: { label: (context) => money(context.parsed.y, currency) } }
        },
        scales: {
          y: { ticks: { callback: (value) => money(value, currency) }, grid: { color: "rgba(19,39,44,.09)" } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function renderInsights(result, currency, helpers) {
    const { fmtPct, money, qName } = helpers;
    const lines = [
      `<strong>Trend:</strong> Deseasonalized annual trend is ${fmtPct(result.annTrend, 1)} and latest quarter momentum is ${fmtPct(result.latestQoq, 1)}.`,
      `<strong>Seasonality:</strong> ${qName(result.tq)} index is ${(result.targetSI * 100).toFixed(1)} (100 = neutral). Peak quarter ${qName(result.peakQ)}, trough ${qName(result.lowQ)}.`,
      `<strong>Reliability:</strong> Ensemble backtest sMAPE ${(result.esm * 100).toFixed(1)}% from ${result.points} points. Confidence ${Math.round(result.confidence)}%.`,
      `<strong>Target Logic:</strong> Minimum is max(P20, hard 10% growth floor). Commit is P50 with ambition and risk penalty, then constrained by commercial capacity.`,
      `<strong>Commercial Feasibility:</strong> Required pipeline for commit ${money(result.reqPipeline, currency)}. Coverage ratio ${fmtPct(result.coverage - 1, 1)}.`,
      `<strong>KAM Narrative:</strong> Commit is the accountable target, stretch is upside with execution quality, minimum is the non-negotiable growth baseline.`
    ];
    document.getElementById("insights").innerHTML = lines.map((line) => `<li>${line}</li>`).join("");
  }

  function renderMethods(result, profile, helpers) {
    const { fmtPct } = helpers;
    const modelRows = [
      ["Seasonal Naive + drift", "sn"],
      ["Same-quarter CAGR", "cagr"],
      ["Deseasonalized Trend Regression", "trend"],
      ["TTM Momentum", "mom"]
    ].map(([label, key]) => `<div class="m"><strong>${label}</strong><br>Weight ${(result.w[key] * 100).toFixed(1)}% | sMAPE ${(result.mm[key].smape * 100).toFixed(1)}% | MASE ${result.mm[key].mase.toFixed(2)} | Bias ${fmtPct(result.mm[key].bias, 1)}</div>`).join("");

    document.getElementById("methods").innerHTML = `
      <div class="m"><strong>Forecast Stack</strong><br>Quarterly seasonality decomposition + 4-model ensemble + rolling-origin backtesting.</div>
      <div class="m"><strong>Formulae</strong><br>SI_q = avg(Sales_yq / annual_avg_y), normalized. Min = max(P20, BaselineSameQuarter * 1.10). Commit = max(Min, min(P50 * (1 + ambition - riskPenalty), max(commercialCapacity, Min))). Stretch = max(Commit*1.08, P80*(1 + ambition*0.5), Min*1.12).</div>
      <div class="m"><strong>Commercial Capacity</strong><br>Capacity = (Pipeline * WinRate) * CapacityFactor.</div>
      <div class="m"><strong>Profile</strong><br>${profile.label}, risk bias ${fmtPct(profile.risk, 1)}, ambition cap ${fmtPct(profile.ambitionCap, 0)}.</div>
      ${modelRows}
    `;
  }

  function renderDiagnostics(diagnostic) {
    const node = document.getElementById("diagnostics");
    const lines = [];
    lines.push(`<li class="diag-ok"><strong>Data quality score:</strong> ${Math.round(diagnostic.score)} / 100.</li>`);
    diagnostic.errors.forEach((line) => lines.push(`<li class="diag-bad"><strong>Critical:</strong> ${line}</li>`));
    diagnostic.warnings.forEach((line) => lines.push(`<li class="diag-warn"><strong>Warning:</strong> ${line}</li>`));
    diagnostic.notes.forEach((line) => lines.push(`<li class="diag-ok"><strong>Check:</strong> ${line}</li>`));
    node.innerHTML = lines.join("");
  }

  window.UiRender = {
    renderKpi,
    plotForecast,
    plotSeason,
    plotLadder,
    renderInsights,
    renderMethods,
    renderDiagnostics
  };
})();
