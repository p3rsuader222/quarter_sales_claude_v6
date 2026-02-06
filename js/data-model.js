(() => {
  function drawRows(state) {
    state.years.sort((a, b) => a - b);
    const tableBody = document.getElementById("rows");
    tableBody.innerHTML = state.years.map((year) => {
      const cells = [1, 2, 3, 4].map((quarter) => {
        const key = year + "-Q" + quarter;
        const value = state.vals[key] ?? "";
        return `<td><input class="sale" data-k="${key}" type="number" min="0" step="0.01" value="${value}" placeholder="0"></td>`;
      }).join("");
      return `<tr><td class="y">${year}</td>${cells}</tr>`;
    }).join("");

    document.querySelectorAll(".sale").forEach((input) => {
      input.addEventListener("input", (event) => {
        state.vals[event.target.dataset.k] = event.target.value;
      });
    });
  }

  function series(state, parseNumber, toTimeIndex) {
    const out = [];
    state.years.forEach((year) => [1, 2, 3, 4].forEach((quarter) => {
      const value = parseNumber(state.vals[year + "-Q" + quarter]);
      if (value !== null && value > 0) {
        out.push({
          year,
          quarter,
          q: quarter,
          v: value,
          tt: toTimeIndex(year, quarter),
          label: `${year} Q${quarter}`
        });
      }
    }));
    return out.sort((a, b) => a.tt - b.tt);
  }

  function point(seriesData, year, quarter) {
    return seriesData.find((item) => item.year === year && (item.quarter ?? item.q) === quarter) || null;
  }

  function lastSame(seriesData, quarter, maxYear = Infinity) {
    const candidates = seriesData
      .filter((item) => (item.quarter ?? item.q) === quarter && item.year <= maxYear)
      .sort((a, b) => a.tt - b.tt);
    return candidates.length ? candidates[candidates.length - 1] : null;
  }

  function diagnostics(state, seriesData, utils) {
    const { quantile } = utils;
    const warnings = [];
    const errors = [];
    const notes = [];

    const yearMissing = {};
    state.years.forEach((year) => {
      const missing = [1, 2, 3, 4].filter((quarter) => {
        const raw = state.vals[`${year}-Q${quarter}`];
        const value = Number(raw);
        return !Number.isFinite(value) || value <= 0;
      });
      if (missing.length) yearMissing[year] = missing;
    });

    const missingYears = Object.keys(yearMissing);
    if (missingYears.length) {
      warnings.push(`Missing quarter values found in ${missingYears.length} year(s): ${missingYears.map((year) => `${year} [${yearMissing[year].map((quarter) => `Q${quarter}`).join(", ")}]`).join("; ")}.`);
    } else {
      notes.push("No missing quarter values in loaded years.");
    }

    const values = seriesData.map((item) => item.v).sort((a, b) => a - b);
    if (values.length >= 8) {
      const q1 = quantile(values, 0.25);
      const q3 = quantile(values, 0.75);
      const iqr = q3 - q1;
      const lowFence = q1 - 1.5 * iqr;
      const highFence = q3 + 1.5 * iqr;
      const outliers = seriesData.filter((item) => item.v < lowFence || item.v > highFence);
      if (outliers.length) {
        warnings.push(`Outlier-like quarters flagged (${outliers.length}): ${outliers.map((item) => `${item.label} (${Math.round(item.v).toLocaleString()})`).join(", ")}.`);
      } else {
        notes.push("No major outlier flags from IQR check.");
      }
    }

    if (seriesData.length >= 12) {
      const recent = seriesData.slice(-4).map((item) => item.v);
      const previous = seriesData.slice(-8, -4).map((item) => item.v);
      const recentMean = recent.reduce((sum, value) => sum + value, 0) / recent.length;
      const previousMean = previous.reduce((sum, value) => sum + value, 0) / previous.length;
      const shift = previousMean > 0 ? recentMean / previousMean - 1 : 0;
      if (Math.abs(shift) >= 0.25) {
        warnings.push(`Possible structural break: latest 4-quarter average changed ${shift >= 0 ? "+" : ""}${(shift * 100).toFixed(1)}% vs prior 4 quarters.`);
      } else {
        notes.push("No major structural break between recent and prior 4-quarter windows.");
      }
    }

    if (seriesData.length < 8) {
      errors.push("At least 8 valid quarter values are required.");
    }

    const scorePenalty = warnings.length * 10 + errors.length * 25;
    const score = Math.max(0, 100 - scorePenalty);
    return { warnings, errors, notes, score };
  }

  window.DataModel = { drawRows, series, point, lastSame, diagnostics };
})();
