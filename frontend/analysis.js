const API_BASE = "http://127.0.0.1:5000";

const formatVND = (v) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(v || 0);

const formatPercent = (v) => {
    const n = Number(v || 0);
    return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
};

async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

let chartInstances = {};

function destroyChart(key) {
    if (chartInstances[key]) {
        chartInstances[key].destroy();
        delete chartInstances[key];
    }
}

// ── Status banner ─────────────────────────────────────────────────────────────
async function checkStatus() {
    try {
        const status = await fetchJSON(`${API_BASE}/api/analysis/status`);
        const allReady = Object.values(status).every((s) => s.exists);
        const banner = document.getElementById("analysisBanner");

        if (!allReady) {
            banner.style.display = "block";
            setText("analysisStatusText", "Chưa có dữ liệu phân tích — hãy chạy notebook trước.");
            return false;
        }

        banner.style.display = "none";
        const lastUpdated = Object.values(status)
            .map((s) => s.last_updated)
            .filter(Boolean)
            .sort()
            .at(-1);
        setText("analysisStatusText", `Cập nhật lần cuối: ${lastUpdated}`);
        return true;
    } catch {
        setText("analysisStatusText", "Không thể kết nối backend.");
        return false;
    }
}

// ── Section 2: Descriptive Stats ─────────────────────────────────────────────
async function loadDescriptive() {
    const data = await fetchJSON(`${API_BASE}/api/analysis/descriptive-stats`);

    setText("descMean",         formatVND(data.overall?.mean));
    setText("descMedian",       formatVND(data.overall?.median));
    setText("descStd",          formatVND(data.overall?.std));
    setText("descBhyt",         `${(data.bhyt_ratio || 0).toFixed(1)}%`);
    setText("descRevPerPatient", formatVND(data.revenue_per_patient));
    setText("descRevPerVisit",   formatVND(data.revenue_per_visit));

    // Revenue per visit by department (horizontal bar)
    const depts = (data.by_department || []).sort((a, b) => a.revenue_per_visit - b.revenue_per_visit);
    destroyChart("descRevVisit");
    chartInstances["descRevVisit"] = new Chart(document.getElementById("descRevVisitChart"), {
        type: "bar",
        data: {
            labels: depts.map((d) => d.TEN_KHOAPHONG),
            datasets: [{
                label: "Doanh thu/lượt",
                data: depts.map((d) => d.revenue_per_visit),
                backgroundColor: "#26a69a",
            }],
        },
        options: {
            indexAxis: "y",
            responsive: true,
            plugins: { legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => formatVND(ctx.raw) } } },
            scales: { x: { ticks: { callback: (v) => formatVND(v) } } },
        },
    });

    // Service group doughnut
    const svcs = data.by_service_group || [];
    destroyChart("descService");
    chartInstances["descService"] = new Chart(document.getElementById("descServiceChart"), {
        type: "doughnut",
        data: {
            labels: svcs.map((s) => s.NHOM_DICHVU),
            datasets: [{
                data: svcs.map((s) => s.total),
                backgroundColor: ["#1976d2", "#26a69a", "#fb8c00", "#8e24aa", "#e53935", "#43a047"],
            }],
        },
        options: {
            responsive: true,
            plugins: {
                tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatVND(ctx.raw)}` } },
            },
        },
    });

    // Department share doughnut (live from DB, not notebook)
    try {
        const deptRaw = await fetchJSON(`${API_BASE}/api/revenue-by-department`);
        destroyChart("descDeptShare");
        chartInstances["descDeptShare"] = new Chart(document.getElementById("descDeptShareChart"), {
            type: "doughnut",
            data: {
                labels: deptRaw.map((d) => d.TEN_KHOAPHONG ?? "(Không rõ)"),
                datasets: [{
                    data: deptRaw.map((d) => d.THANHTIEN),
                    backgroundColor: deptRaw.map((_, i) =>
                        `hsl(${(i * 37 + 200) % 360}, 60%, 52%)`
                    ),
                }],
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: "right" },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const pct = deptRaw[ctx.dataIndex]?.PHAN_TRAM ?? 0;
                                return `${ctx.label}: ${formatVND(ctx.raw)} (${pct}%)`;
                            },
                        },
                    },
                },
            },
        });
    } catch (_) { /* bỏ qua nếu API lỗi */ }

    // Day of week bar
    const dow = data.by_day_of_week || [];
    const viNames = {
        Monday: "Thứ Hai", Tuesday: "Thứ Ba", Wednesday: "Thứ Tư",
        Thursday: "Thứ Năm", Friday: "Thứ Sáu", Saturday: "Thứ Bảy", Sunday: "Chủ Nhật",
    };
    destroyChart("descDow");
    chartInstances["descDow"] = new Chart(document.getElementById("descDowChart"), {
        type: "bar",
        data: {
            labels: dow.map((d) => viNames[d.THU_TEN] || d.THU_TEN),
            datasets: [{
                label: "Doanh thu TB",
                data: dow.map((d) => d.mean),
                backgroundColor: dow.map((d) => {
                    const max = Math.max(...dow.map((x) => x.mean));
                    const ratio = d.mean / max;
                    return `rgba(25, 118, 210, ${0.35 + ratio * 0.65})`;
                }),
            }],
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => formatVND(ctx.raw) } } },
            scales: { y: { ticks: { callback: (v) => formatVND(v) } } },
        },
    });
}

// ── Section 3: Correlation ────────────────────────────────────────────────────
function renderCorrTable(tableId, labels, matrix) {
    const table = document.getElementById(tableId);
    if (!table) return;

    const colorFor = (v) => {
        if (v === null || v === undefined) return "#f5f5f5";
        const abs = Math.abs(v);
        if (v >= 0.7)  return `rgba(25, 118, 210, ${0.25 + abs * 0.55})`;
        if (v >= 0.3)  return `rgba(25, 118, 210, ${0.1 + abs * 0.3})`;
        if (v <= -0.3) return `rgba(229, 57, 53,  ${0.1 + abs * 0.45})`;
        return "#f9f9f9";
    };

    const header = `<thead><tr><th></th>${labels.map((l) => `<th>${l}</th>`).join("")}</tr></thead>`;
    const rows = labels.map((rowLabel, i) =>
        `<tr>
            <th>${rowLabel}</th>
            ${matrix[i].map((v, j) => {
                const diag = i === j;
                const bg = diag ? "#e8e8e8" : colorFor(v);
                return `<td style="background:${bg};text-align:center;font-size:12px;">${diag ? "—" : v.toFixed(2)}</td>`;
            }).join("")}
        </tr>`
    ).join("");

    table.innerHTML = `${header}<tbody>${rows}</tbody>`;
}

async function loadCorrelation() {
    const data = await fetchJSON(`${API_BASE}/api/analysis/correlation`);

    // Correlation tables
    renderCorrTable(
        "corrDeptTable",
        data.department_correlation?.labels || [],
        data.department_correlation?.matrix || []
    );
    renderCorrTable(
        "corrSvcTable",
        data.service_correlation?.labels || [],
        data.service_correlation?.matrix || []
    );

    // Scatter: visits vs revenue
    const dvr = data.dept_volume_revenue || [];
    destroyChart("corrScatter");
    chartInstances["corrScatter"] = new Chart(document.getElementById("corrScatterChart"), {
        type: "bubble",
        data: {
            datasets: dvr.map((d, i) => ({
                label: d.TEN_KHOAPHONG,
                data: [{
                    x: d.total_visits,
                    y: d.total_revenue,
                    r: Math.max(6, Math.sqrt(d.total_patients) * 1.5),
                }],
                backgroundColor: `hsla(${(i * 43) % 360}, 65%, 50%, 0.7)`,
            })),
        },
        options: {
            responsive: true,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const d = dvr[ctx.datasetIndex];
                            return [
                                `${d.TEN_KHOAPHONG}`,
                                `Lượt khám: ${d.total_visits.toLocaleString("vi-VN")}`,
                                `Doanh thu: ${formatVND(d.total_revenue)}`,
                                `Bệnh nhân: ${d.total_patients.toLocaleString("vi-VN")}`,
                            ];
                        },
                    },
                },
            },
            scales: {
                x: { title: { display: true, text: "Số lượt khám" } },
                y: { title: { display: true, text: "Tổng doanh thu (VNĐ)" },
                     ticks: { callback: (v) => formatVND(v) } },
            },
        },
    });
}

// ── Section 4: Trend ──────────────────────────────────────────────────────────
async function loadTrend() {
    const data = await fetchJSON(`${API_BASE}/api/analysis/trend`);

    const monthly = data.monthly_revenue || [];

    // Monthly bar + growth line (dual axis)
    destroyChart("trendMonthly");
    chartInstances["trendMonthly"] = new Chart(document.getElementById("trendMonthlyChart"), {
        type: "bar",
        data: {
            labels: monthly.map((m) => m.THANG_NAM),
            datasets: [
                {
                    label: "Doanh thu",
                    data: monthly.map((m) => m.total),
                    backgroundColor: "rgba(25, 118, 210, 0.75)",
                    yAxisID: "yRevenue",
                },
                {
                    label: "Tăng trưởng (%)",
                    data: monthly.map((m) => m.growth_rate),
                    type: "line",
                    borderColor: "#e53935",
                    backgroundColor: "transparent",
                    pointRadius: 4,
                    borderWidth: 2,
                    yAxisID: "yGrowth",
                },
            ],
        },
        options: {
            responsive: true,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.datasetIndex === 0) return `Doanh thu: ${formatVND(ctx.raw)}`;
                            return `Tăng trưởng: ${formatPercent(ctx.raw)}`;
                        },
                    },
                },
            },
            scales: {
                yRevenue: { position: "left",  ticks: { callback: (v) => formatVND(v) } },
                yGrowth:  { position: "right", grid: { drawOnChartArea: false },
                            ticks: { callback: (v) => `${v.toFixed(1)}%` } },
            },
        },
    });

    // STL decomposition
    const decomp = data.decomposition || {};
    const decompCard = document.getElementById("trendDecompCard");

    if (!decomp.dates || decomp.dates.length === 0) {
        if (decompCard) decompCard.style.display = "none";
        return;
    }

    if (decompCard) decompCard.style.display = "";

    destroyChart("trendDecomp");
    chartInstances["trendDecomp"] = new Chart(document.getElementById("trendDecompChart"), {
        type: "line",
        data: {
            labels: decomp.dates,
            datasets: [
                {
                    label: "Trend",
                    data: decomp.trend,
                    borderColor: "#1976d2",
                    backgroundColor: "rgba(25, 118, 210, 0.08)",
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.4,
                },
                {
                    label: "Seasonal",
                    data: decomp.seasonal,
                    borderColor: "#26a69a",
                    backgroundColor: "transparent",
                    borderWidth: 1.5,
                    pointRadius: 0,
                    tension: 0.3,
                },
                {
                    label: "Residual",
                    data: decomp.residual,
                    borderColor: "#8e24aa",
                    backgroundColor: "transparent",
                    borderWidth: 1,
                    pointRadius: 0,
                    tension: 0,
                },
            ],
        },
        options: {
            responsive: true,
            interaction: { mode: "index", intersect: false },
            plugins: {
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatVND(ctx.raw)}` } },
            },
            scales: {
                y: { ticks: { callback: (v) => formatVND(v) } },
            },
        },
    });
}

// ── Quarterly & Yearly (live from DB) ────────────────────────────────────────
async function loadQuarterly() {
    const data = await fetchJSON(`${API_BASE}/api/revenue-quarterly`);
    if (!data.length) return;

    destroyChart("trendQuarterly");
    chartInstances["trendQuarterly"] = new Chart(document.getElementById("trendQuarterlyChart"), {
        type: "bar",
        data: {
            labels: data.map((q) => q.QUY_NAM),
            datasets: [
                {
                    label: "Doanh thu",
                    data: data.map((q) => q.THANHTIEN),
                    backgroundColor: "rgba(25, 118, 210, 0.75)",
                    yAxisID: "yRevenue",
                },
                {
                    label: "Tăng trưởng QoQ (%)",
                    type: "line",
                    data: data.map((q) => q.GROWTH),
                    borderColor: "#fb8c00",
                    backgroundColor: "transparent",
                    pointRadius: 5,
                    borderWidth: 2,
                    yAxisID: "yGrowth",
                },
            ],
        },
        options: {
            responsive: true,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.datasetIndex === 0) {
                                const pct = data[ctx.dataIndex]?.PHAN_TRAM ?? 0;
                                return `Doanh thu: ${formatVND(ctx.raw)} (${pct}% tổng)`;
                            }
                            return ctx.raw != null ? `Tăng trưởng QoQ: ${formatPercent(ctx.raw)}` : "Tăng trưởng QoQ: --";
                        },
                    },
                },
            },
            scales: {
                yRevenue: { position: "left",  ticks: { callback: (v) => formatVND(v) } },
                yGrowth:  { position: "right", grid: { drawOnChartArea: false },
                            ticks: { callback: (v) => `${v != null ? v.toFixed(1) : "--"}%` } },
            },
        },
    });
}

async function loadYearly() {
    const data = await fetchJSON(`${API_BASE}/api/revenue-yearly`);
    const card = document.getElementById("trendYearlyCard");

    if (!data.length) {
        if (card) card.style.display = "none";
        return;
    }

    if (data.length < 2 && card) {
        card.querySelector("p.chart-description").textContent =
            "Cần ít nhất 2 năm dữ liệu để so sánh YoY. Hiện đang hiển thị doanh thu theo năm.";
    }

    destroyChart("trendYearly");
    chartInstances["trendYearly"] = new Chart(document.getElementById("trendYearlyChart"), {
        type: "bar",
        data: {
            labels: data.map((y) => String(y.NAM)),
            datasets: [
                {
                    label: "Doanh thu",
                    data: data.map((y) => y.THANHTIEN),
                    backgroundColor: "rgba(67, 160, 71, 0.75)",
                    yAxisID: "yRevenue",
                },
                {
                    label: "Tăng trưởng YoY (%)",
                    type: "line",
                    data: data.map((y) => y.YOY),
                    borderColor: "#e53935",
                    backgroundColor: "transparent",
                    pointRadius: 5,
                    borderWidth: 2,
                    yAxisID: "yGrowth",
                },
            ],
        },
        options: {
            responsive: true,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.datasetIndex === 0) return `Doanh thu: ${formatVND(ctx.raw)}`;
                            return ctx.raw != null ? `Tăng trưởng YoY: ${formatPercent(ctx.raw)}` : "Tăng trưởng YoY: --";
                        },
                    },
                },
            },
            scales: {
                yRevenue: { position: "left",  ticks: { callback: (v) => formatVND(v) } },
                yGrowth:  { position: "right", grid: { drawOnChartArea: false },
                            ticks: { callback: (v) => `${v != null ? v.toFixed(1) : "--"}%` } },
            },
        },
    });
}

// ── Section: Forecast ────────────────────────────────────────────────────────
async function loadForecast() {
    const data = await fetchJSON(`${API_BASE}/api/analysis/forecast`);
    const mf = data.monthly_forecast || {};

    setText("fcTotal",    formatVND(mf.predicted_total));
    setText("fcLower",    `Tối thiểu: ${formatVND(mf.lower_95)}`);
    setText("fcUpper",    `Tối đa: ${formatVND(mf.upper_95)}`);
    setText("fcLastDate", data.last_actual_date || "--");
    setText("fcModel",    data.model || "--");

    const growthVal = mf.growth_vs_last_30d || 0;
    const growthEl  = document.getElementById("fcGrowth");
    if (growthEl) {
        growthEl.textContent = `vs 30 ngày qua: ${growthVal > 0 ? "+" : ""}${growthVal.toFixed(1)}%`;
        growthEl.style.color = growthVal >= 0 ? "#2e7d32" : "#c62828";
    }

    // ── Forecast line chart ───────────────────────────────────────────
    const hist     = data.historical_last_60d || [];
    const fc       = data.daily_forecast      || [];

    const histDates = hist.map((d) => d.date);
    const histVals  = hist.map((d) => d.actual);
    const fcDates   = fc.map((d) => d.date);
    const fcVals    = fc.map((d) => d.predicted);
    const fcLower   = fc.map((d) => d.lower);
    const fcUpper   = fc.map((d) => d.upper);

    // Build confidence band dataset
    const bandLabels = [...fcDates, ...fcDates.slice().reverse()];
    const bandVals   = [...fcUpper, ...fcLower.slice().reverse()];

    destroyChart("fcForecast");
    chartInstances["fcForecast"] = new Chart(document.getElementById("fcForecastChart"), {
        type: "line",
        data: {
            labels: [...histDates, ...fcDates],
            datasets: [
                {
                    label: "Doanh thu thực tế",
                    data: [...histVals, ...Array(fcDates.length).fill(null)],
                    borderColor: "#1976d2",
                    backgroundColor: "rgba(25,118,210,0.07)",
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.3,
                },
                {
                    label: "Dự báo",
                    data: [...Array(histDates.length).fill(null), ...fcVals],
                    borderColor: "#e53935",
                    borderWidth: 2,
                    borderDash: [6, 4],
                    pointRadius: 0,
                    tension: 0.3,
                },
                {
                    label: "Khoảng tin cậy 95% (max)",
                    data: [...Array(histDates.length).fill(null), ...fcUpper],
                    borderColor: "rgba(229,57,53,0)",
                    backgroundColor: "rgba(229,57,53,0.1)",
                    pointRadius: 0,
                    fill: "+1",
                    tension: 0.3,
                },
                {
                    label: "Khoảng tin cậy 95% (min)",
                    data: [...Array(histDates.length).fill(null), ...fcLower],
                    borderColor: "rgba(229,57,53,0)",
                    backgroundColor: "rgba(229,57,53,0.1)",
                    pointRadius: 0,
                    fill: false,
                    tension: 0.3,
                },
            ],
        },
        options: {
            responsive: true,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: { labels: { filter: (item) => !item.text.includes("min)") && !item.text.includes("max)") } },
                tooltip: { callbacks: { label: (ctx) => ctx.raw != null ? `${ctx.dataset.label}: ${formatVND(ctx.raw)}` : null } },
            },
            scales: { y: { ticks: { callback: (v) => formatVND(v) } } },
        },
    });

    // ── Scenario bar chart ────────────────────────────────────────────
    const scenarios = data.scenarios || [];
    const scColors  = scenarios.map((s) =>
        s.change_percent < 0 ? "#e53935" : s.change_percent === 0 ? "#1976d2" : "#43a047"
    );

    destroyChart("fcScenario");
    chartInstances["fcScenario"] = new Chart(document.getElementById("fcScenarioChart"), {
        type: "bar",
        data: {
            labels: scenarios.map((s) => s.label),
            datasets: [{
                label: "Doanh thu dự báo",
                data: scenarios.map((s) => s.monthly_total),
                backgroundColor: scColors,
            }],
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => formatVND(ctx.raw) } },
            },
            scales: { y: { ticks: { callback: (v) => formatVND(v) } } },
        },
    });

    // ── Scenario table ────────────────────────────────────────────────
    const scTbody = document.querySelector("#fcScenarioTable tbody");
    if (scTbody) {
        scTbody.innerHTML = scenarios.map((s) => {
            const color = s.vs_last_30d >= 0 ? "#2e7d32" : "#c62828";
            return `<tr>
                <td><strong>${s.label}</strong></td>
                <td>${formatVND(s.monthly_total)}</td>
                <td style="color:${color}">${s.vs_last_30d > 0 ? "+" : ""}${s.vs_last_30d.toFixed(1)}%</td>
            </tr>`;
        }).join("");
    }

    // ── Department impact table ───────────────────────────────────────
    const depts  = (data.by_department || []).sort((a, b) => b.forecast_base - a.forecast_base);
    const dTbody = document.querySelector("#fcDeptTable tbody");
    if (dTbody) {
        dTbody.innerHTML = depts.map((d) => `
            <tr>
                <td>${d.TEN_KHOAPHONG}</td>
                <td>${formatVND(d.forecast_base)}</td>
                <td style="color:#2e7d32">+${formatVND(d.impact_plus10)}</td>
            </tr>
        `).join("");
    }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function loadAnalysis() {
    const ready = await checkStatus();
    if (!ready) return;

    try {
        await Promise.all([
            loadForecast(),
            loadDescriptive(),
            loadCorrelation(),
            loadTrend(),
            loadQuarterly(),
            loadYearly(),
        ]);
    } catch (err) {
        console.error("Lỗi tải phân tích:", err);
    }
}

document.addEventListener("DOMContentLoaded", loadAnalysis);
