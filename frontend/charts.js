const API_BASE = "http://127.0.0.1:5000";

let dailyRevenueChart = null;
let paymentChart = null;
let topDepartmentChart = null;
let serviceGroupChart = null;
let treatmentTypeChart = null;

const formatVND = (value) => {
    return new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0
    }).format(value || 0);
};

const formatPercent = (value) => {
    const number = Number(value || 0);
    const sign = number > 0 ? "+" : "";
    return `${sign}${number.toFixed(2)}%`;
};

function getDateFilterQuery() {
    const preset = document.getElementById("datePreset")?.value || "7days";
    const startDate = document.getElementById("startDate")?.value;
    const endDate = document.getElementById("endDate")?.value;

    const params = new URLSearchParams();

    params.append("preset", preset);

    if (preset === "custom") {
        if (startDate) {
            params.append("startdate", startDate);
        }

        if (endDate) {
            params.append("enddate", endDate);
        }
    }

    return params.toString();
}

function apiUrl(path) {
    const query = getDateFilterQuery();
    return `${API_BASE}${path}?${query}`;
}

const getStatusClass = (status) => {
    if (status === "Critical") return "status-critical";
    if (status === "Warning") return "status-warning";
    if (status === "Normal") return "status-normal";
    return "status-neutral";
};

const destroyChart = (chart) => {
    if (chart) {
        chart.destroy();
    }
};

async function fetchJSON(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`API error: ${url}`);
    }

    return response.json();
}

async function loadMonitoringSummary() {
    const data = await fetchJSON(apiUrl("/api/monitoring-summary"));

    document.getElementById("latestDateText").textContent =
        `Ngày dữ liệu gần nhất: ${data.latest_date || "--"}`;

    document.getElementById("kpiTotalRevenue").textContent =
        formatVND(data.total_revenue);

    document.getElementById("kpiTodayRevenue").textContent =
        formatVND(data.today_revenue);

    document.getElementById("kpiMonthRevenue").textContent =
        formatVND(data.month_revenue);

    document.getElementById("kpiAvg7dRevenue").textContent =
        formatVND(data.avg_7d_revenue);

    document.getElementById("kpiChangeVsYesterday").textContent =
        `So với hôm trước: ${formatPercent(data.change_vs_yesterday)}`;

    document.getElementById("kpiChangeVs7d").textContent =
        `Ngày gần nhất so với TB: ${formatPercent(data.change_vs_7d)}`;

    const statusEl = document.getElementById("kpiSystemStatus");
    statusEl.textContent = data.system_status;
    statusEl.className = `kpi-value ${getStatusClass(data.system_status)}`;

    document.getElementById("kpiAlertCount").textContent = data.alert_count;
}

async function loadBasicKpis() {
    const [patients, treatments] = await Promise.all([
        fetchJSON(apiUrl("/api/total-patients")),
        fetchJSON(apiUrl("/api/total-treatments"))
    ]);

    document.getElementById("kpiTotalPatients").textContent =
        patients.total_patients;

    document.getElementById("kpiTotalTreatments").textContent =
        treatments.total_treatments;
}

async function loadDailyRevenueChart() {
    const data = await fetchJSON(apiUrl("/api/revenue-daily-monitor"));

    const labels = data.map(item => item.NGAY);
    const revenueValues = data.map(item => item.THANHTIEN);
    const avgValues = data.map(item => item.AVG_7D);

    const pointColors = data.map(item => {
        if (item.STATUS === "Critical") return "#e53935";
        if (item.STATUS === "Warning") return "#fb8c00";
        return "#1976d2";
    });

    destroyChart(dailyRevenueChart);

    dailyRevenueChart = new Chart(document.getElementById("dailyRevenueChart"), {
        type: "line",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "Doanh thu thực tế",
                    data: revenueValues,
                    borderColor: "#1976d2",
                    backgroundColor: "rgba(25, 118, 210, 0.08)",
                    pointBackgroundColor: pointColors,
                    pointRadius: 3,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.35
                },
                {
                    label: "TB 7 ngày",
                    data: avgValues,
                    borderColor: "#ef6c00",
                    borderWidth: 2,
                    borderDash: [6, 6],
                    pointRadius: 2,
                    pointHoverRadius: 3,
                    pointBackgroundColor: "#ef6c00",
                    pointBorderColor: "#ef6c00",
                    fill: false,
                    tension: 0.35
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const v = typeof context.parsed?.y === "number" ? context.parsed.y : context.raw;
                            return `${context.dataset.label}: ${formatVND(v)}`;
                        }
                    }
                },
                legend: {
                    display: true,
                    position: "top"
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatVND(value);
                        }
                    }
                }
            }
        }
    });
}

async function loadPaymentMethodChart() {
    const data = await fetchJSON(apiUrl("/api/revenue-by-payment-method"));

    // Backend returns TEN_DOITUONG; keep fallbacks for older payloads.
    const labels = data.map(item => item.TEN_DOITUONG ?? item.PAYMENT_METHOD ?? item.TEN_THANHTOAN ?? "(Không rõ)");
    const values = data.map(item => item.THANHTIEN);

    destroyChart(paymentChart);

    paymentChart = new Chart(document.getElementById("paymentChart"), {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: [
                    "#1976d2", "#8e24aa", "#fb8c00",
                    "#00897b", "#e53935", "#43a047",
                    "#f06292", "#546e7a"
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.label}: ${formatVND(context.raw)}`;
                        }
                    }
                }
            }
        }
    });
}

async function loadTopDepartmentChart() {
    const rawData = await fetchJSON(apiUrl("/api/revenue-by-department"));
    const data = rawData.slice(0, 5);

    const labels = data.map(item => item.TEN_KHOAPHONG);
    const values = data.map(item => item.THANHTIEN);

    destroyChart(topDepartmentChart);

    topDepartmentChart = new Chart(document.getElementById("topDepartmentChart"), {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Doanh thu",
                data: values,
                backgroundColor: "#26a69a"
            }]
        },
        options: {
            indexAxis: "y",
            responsive: true,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return formatVND(context.raw);
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatVND(value);
                        }
                    }
                }
            }
        }
    });
}

async function loadServiceGroupChart() {
    const data = await fetchJSON(apiUrl("/api/revenue-by-service-group"));

    const labels = data.map(item => item.NHOM_DICHVU);
    const values = data.map(item => item.THANHTIEN);

    destroyChart(serviceGroupChart);

    serviceGroupChart = new Chart(document.getElementById("serviceGroupChart"), {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Doanh thu",
                data: values,
                backgroundColor: "#5c6bc0"
            }]
        },
        options: {
            responsive: true,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return formatVND(context.raw);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatVND(value);
                        }
                    }
                }
            }
        }
    });
}

async function loadTreatmentTypeChart() {
    const data = await fetchJSON(apiUrl("/api/revenue-by-treatment-type"));

    const labels = data.map(item => item.TEN_LOAI_DIEUTRI ?? "(Không rõ)");
    const values = data.map(item => item.THANHTIEN);
    const percents = data.map(item => item.PHAN_TRAM);

    destroyChart(treatmentTypeChart);

    treatmentTypeChart = new Chart(document.getElementById("treatmentTypeChart"), {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Doanh thu",
                data: values,
                backgroundColor: ["#1976d2", "#43a047", "#fb8c00", "#8e24aa"],
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            indexAxis: "y",
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const pct = percents[context.dataIndex];
                            return `${formatVND(context.raw)}  (${pct}%)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatVND(value);
                        }
                    }
                }
            }
        }
    });
}

async function loadAlerts() {
    const data = await fetchJSON(apiUrl("/api/alerts"));
    const tbody = document.getElementById("alertTableBody");

    if (!tbody) return;

    if (!data.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5">Không có cảnh báo. Hệ thống đang ở trạng thái ổn định.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = data.map(item => `
        <tr>
            <td>${item.date}</td>
            <td><span class="badge ${getStatusClass(item.level)}">${item.level}</span></td>
            <td>${item.object}</td>
            <td>${item.message}</td>
            <td>${formatPercent(item.change_percent)}</td>
        </tr>
    `).join("");
}

async function loadDepartmentMonitoring() {
    const data = await fetchJSON(apiUrl("/api/department-monitoring"));
    const tbody = document.getElementById("departmentTableBody");

    if (!tbody) return;

    if (!data.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5">Không có dữ liệu khoa/phòng.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = data.map(item => `
        <tr>
            <td>${item.TEN_KHOAPHONG}</td>
            <td>${formatVND(item.TODAY_REVENUE)}</td>
            <td>${formatVND(item.AVG_7D)}</td>
            <td>${formatPercent(item.CHANGE_PERCENT)}</td>
            <td><span class="badge ${getStatusClass(item.STATUS)}">${item.STATUS}</span></td>
        </tr>
    `).join("");
}

async function loadServiceMonitoring() {
    const data = await fetchJSON(apiUrl("/api/service-monitoring"));
    const tbody = document.getElementById("serviceTableBody");

    if (!tbody) return;

    if (!data.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5">Không có dữ liệu nhóm dịch vụ.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = data.map(item => `
        <tr>
            <td>${item.NHOM_DICHVU}</td>
            <td>${formatVND(item.TODAY_REVENUE)}</td>
            <td>${formatVND(item.AVG_7D)}</td>
            <td>${formatPercent(item.CHANGE_PERCENT)}</td>
            <td><span class="badge ${getStatusClass(item.STATUS)}">${item.STATUS}</span></td>
        </tr>
    `).join("");
}

async function loadDataQuality() {
    const data = await fetchJSON(apiUrl("/api/data-quality"));

    // Support both old ids (quality*) and current ids (dq*)
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    const missingDate = data.missing_ngay ?? 0;
    const missingService = data.missing_dichvu ?? 0;
    const missingDepartment = data.missing_khoaphong ?? 0;
    const negativeRevenue = data.negative_thanhtien ?? 0;
    const zeroRevenue = data.zero_revenue ?? 0;
    const unmapped = data.unmapped_total ?? 0;
    const totalIssues = data.total_issues ?? 0;
    const qualityScore = data.quality_score ?? null;

    setText("dqMissingDate", missingDate);
    setText("dqMissingService", missingService);
    setText("dqMissingDepartment", missingDepartment);
    setText("dqNegativeRevenue", negativeRevenue);
    setText("dqZeroRevenue", zeroRevenue);
    setText("dqUnmapped", unmapped);
    setText("dqTotalIssues", totalIssues);

    if (typeof qualityScore === "number") {
        setText("dqQualityScore", `${qualityScore.toFixed(1)}%`);
    }
}

function setupDateFilterEvents() {
    const hiddenPreset = document.getElementById("datePreset");
    const presetTabs = document.querySelectorAll(".preset-tab");
    const customRange = document.getElementById("customDateRange");
    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");
    const applyBtn = document.getElementById("applyFilterBtn");

    if (!hiddenPreset || !presetTabs.length) return;

    const isValidISODate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

    const activateTab = (value) => {
        presetTabs.forEach(t => t.classList.toggle("active", t.dataset.value === value));
        hiddenPreset.value = value;
    };

    presetTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const value = tab.dataset.value;
            activateTab(value);

            if (value === "custom") {
                customRange.style.display = "flex";
                if (isValidISODate(startDateInput?.value) && isValidISODate(endDateInput?.value)) {
                    loadDashboard();
                }
            } else {
                customRange.style.display = "none";
                if (startDateInput) startDateInput.value = "";
                if (endDateInput) endDateInput.value = "";
                loadDashboard();
            }
        });
    });

    // Auto-reload when both custom dates are valid
    const maybeReloadCustom = () => {
        if (hiddenPreset.value !== "custom") return;
        if (!isValidISODate(startDateInput?.value) || !isValidISODate(endDateInput?.value)) return;
        loadDashboard();
    };

    startDateInput?.addEventListener("change", maybeReloadCustom);
    endDateInput?.addEventListener("change", maybeReloadCustom);

    applyBtn?.addEventListener("click", () => {
        if (isValidISODate(startDateInput?.value) && isValidISODate(endDateInput?.value)) {
            loadDashboard();
        }
    });
}

async function loadDashboard() {
    try {
        // Destroy existing charts to prevent memory leaks
        destroyChart(dailyRevenueChart);
        destroyChart(paymentChart);
        destroyChart(topDepartmentChart);
        destroyChart(serviceGroupChart);
        destroyChart(treatmentTypeChart);

        // Load all data in parallel
        await Promise.all([
            loadMonitoringSummary(),
            loadBasicKpis(),
            loadDailyRevenueChart(),
            loadPaymentMethodChart(),
            loadTopDepartmentChart(),
            loadServiceGroupChart(),
            loadTreatmentTypeChart(),
            loadAlerts(),
            loadDepartmentMonitoring(),
            loadServiceMonitoring(),
            loadDataQuality()
        ]);
    } catch (error) {
        console.error("Lỗi khi tải dashboard:", error);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    setupDateFilterEvents();
    loadDashboard();
});
