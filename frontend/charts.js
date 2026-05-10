const API_BASE = "http://127.0.0.1:5000";

let dailyRevenueChart = null;
let paymentChart = null;
let topDepartmentChart = null;
let serviceGroupChart = null;

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
        `So với TB 7 ngày: ${formatPercent(data.change_vs_7d)}`;

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
                    label: "Doanh thu TB",
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
                    display: false
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
                backgroundColor: ["#1976d2", "#8e24aa", "#fb8c00"]
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
    const data = await fetchJSON(apiUrl("/api/revenue-by-department"));

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

    const totalRows = data.total_rows ?? 0;
    const missingDate = data.missing_date ?? data.missing_ngay ?? 0;
    const missingService = data.missing_dichvu ?? data.missing_service ?? 0;
    const missingDepartment = data.missing_khoaphong ?? data.missing_department ?? 0;
    const negativeRevenue = data.negative_thanhtien ?? data.negative_revenue ?? 0;
    const zeroRevenue = data.zero_revenue ?? 0;

    // Unmapped might be returned either as a single number or separate parts
    const unmapped =
        data.unmapped_total ??
        ((data.unmapped_khoa ?? 0) + (data.unmapped_dichvu ?? 0) + (data.unmapped_doituong ?? 0));

    const totalIssues = data.total_issues ?? data.total_issues_count ?? 0;

    // New UI block ids
    setText("dqMissingDate", missingDate);
    setText("dqMissingService", missingService);
    setText("dqMissingDepartment", missingDepartment);
    setText("dqNegativeRevenue", negativeRevenue);
    setText("dqZeroRevenue", zeroRevenue);
    setText("dqUnmapped", unmapped);
    setText("dqTotalIssues", totalIssues);

    // Legacy UI ids (if still present in some versions of index.html)
    setText("qualityTotalRows", totalRows);
    setText("qualityMissingKhoaphong", missingDepartment);
    setText("qualityMissingDichvu", missingService);
    setText("qualityNegativeRevenue", negativeRevenue);
    setText("qualityZeroRevenue", zeroRevenue);
    setText("qualityUnmapped", unmapped);
    setText("qualityTotalIssues", totalIssues);

    if (document.getElementById("qualityScore") && typeof data.quality_score === "number") {
        setText("qualityScore", `${data.quality_score.toFixed(2)}%`);
    }
}

function setupDateFilterEvents() {
    const presetSelect = document.getElementById("datePreset");
    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");

    if (!presetSelect || !startDateInput || !endDateInput) {
        return;
    }

    const isValidISODate = (value) => {
        return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
    };

    presetSelect.addEventListener("change", () => {
        const isCustom = presetSelect.value === "custom";

        startDateInput.disabled = !isCustom;
        endDateInput.disabled = !isCustom;

        if (!isCustom) {
            startDateInput.value = "";
            endDateInput.value = "";
            loadDashboard();
        } else {
            // If user switches to custom, keep values but avoid auto-loading until valid.
            const s = startDateInput.value;
            const e = endDateInput.value;
            if (isValidISODate(s) && isValidISODate(e)) {
                loadDashboard();
            }
        }
    });

    const maybeReloadCustom = () => {
        if (presetSelect.value !== "custom") return;
        const s = startDateInput.value;
        const e = endDateInput.value;
        if (!isValidISODate(s) || !isValidISODate(e)) return;
        loadDashboard();
    };

    startDateInput.addEventListener("change", maybeReloadCustom);
    endDateInput.addEventListener("change", maybeReloadCustom);
}

async function loadDashboard() {
    try {
        // Destroy existing charts to prevent memory leaks
        destroyChart(dailyRevenueChart);
        destroyChart(paymentChart);
        destroyChart(topDepartmentChart);
        destroyChart(serviceGroupChart);

        // Load all data in parallel
        await Promise.all([
            loadMonitoringSummary(),
            loadBasicKpis(),
            loadDailyRevenueChart(),
            loadPaymentMethodChart(),
            loadTopDepartmentChart(),
            loadServiceGroupChart(),
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
