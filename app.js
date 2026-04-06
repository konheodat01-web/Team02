// Validate Global Chart Setup
Chart.defaults.color = '#9CA3AF';
Chart.defaults.font.family = "'Inter', sans-serif";

let mainChartInstance = null;
let impressionChartInstance = null;
let currentPeriod = 'weekly';

// Global Data Storage for GSC
let globalGSCData = null;
let isGscConnected = false;
let globalSiteBreakdown = []; // Cache for Table Totals

// Local Storage Handlers
function getCustomStats() { return JSON.parse(localStorage.getItem('customStats') || '{}'); }
function saveCustomStat(id, value) {
    const customStats = getCustomStats();
    customStats[id] = value;
    localStorage.setItem('customStats', JSON.stringify(customStats));
    pushDataToFirebase();
}

function getSiteKeywords() { return JSON.parse(localStorage.getItem('siteKeywords') || '{}'); }
function saveSiteKeyword(domain, value) {
    const kws = getSiteKeywords();
    kws[domain] = parseInt(value) || 0;
    localStorage.setItem('siteKeywords', JSON.stringify(kws));
    renderTableFooter();
    pushDataToFirebase();
}

// Local Fallback Storage to prevent F5 data loss
function saveLocalBackup(data) {
    try {
        localStorage.setItem('local_fallback_gsc', JSON.stringify({ timestamp: Date.now(), gsc: data }));
    } catch (e) { console.error("Lỗi lưu máy cục bộ:", e); }
}

function loadLocalBackup() {
    try {
        const local = JSON.parse(localStorage.getItem('local_fallback_gsc'));
        if (local && local.gsc) {
            globalGSCData = local.gsc;
            isGscConnected = true;
            renderDashboard(currentPeriod);

            const t = new Date(local.timestamp);
            const timeStr = ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2) + ' ' + ('0' + t.getDate()).slice(-2) + '/' + ('0' + (t.getMonth() + 1)).slice(-2);

            updateCloudBadge(timeStr, false);

            return true;
        }
    } catch (e) { }
    return false;
}

// --- FIREBASE DATABASE CONFIGURATION ---
// BƯỚC 1: Thay thế thông tin Cấu hình Firebase vào đây
const firebaseConfig = {
    apiKey: "AIzaSyBHK8Ga2-DlZ7JgGKW5B0yR3HiuQUMa7rY",
    authDomain: "potent-catwalk-463811-r3.firebaseapp.com",
    databaseURL: "https://potent-catwalk-463811-r3-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "potent-catwalk-463811-r3",
    storageBucket: "potent-catwalk-463811-r3.firebasestorage.app",
    messagingSenderId: "910348783245",
    appId: "1:910348783245:web:1e3377c35c4070093adcc4",
    measurementId: "G-WKRMZEPP1F"
};
// BƯỚC 2: Khởi tạo kết nối Đám mây
let fbDB = null;
let isRealtimeEnabled = false;

function initFirebaseDatabase() {
    if (firebaseConfig.apiKey === "YET_TO_FILL") return;
    try {
        firebase.initializeApp(firebaseConfig);
        fbDB = firebase.database();
        isRealtimeEnabled = true;

        // BƯỚC 3: Lắng nghe sự thay đổi Database theo thời gian thực (Real-time listener)
        fbDB.ref('dashboard_data').on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const decodeFBKey = (k) => String(k).replace(/,,/g, '.').replace(/\|\|/g, '/').replace(/@@/g, '#').replace(/\$\$/g, '$').replace(/<</g, '[').replace(/>>/g, ']');

                if (data.gscData) {
                    const orgGsc = {};
                    for(let k in data.gscData) orgGsc[decodeFBKey(k)] = data.gscData[k];
                    globalGSCData = orgGsc;
                    isGscConnected = true;
                    // Sao lưu nội bộ để chống F5 nếu rớt mạng
                    localStorage.setItem('local_fallback_gsc', JSON.stringify({ timestamp: Date.now(), gsc: orgGsc }));
                }
                if (data.customStats) localStorage.setItem('customStats', JSON.stringify(data.customStats));
                if (data.siteKeywords) {
                    const orgKw = {};
                    for(let k in data.siteKeywords) orgKw[decodeFBKey(k)] = data.siteKeywords[k];
                    localStorage.setItem('siteKeywords', JSON.stringify(orgKw));
                }

                const t = new Date(data.lastUpdated);
                const timeStr = ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2) + ' ' + ('0' + t.getDate()).slice(-2) + '/' + ('0' + (t.getMonth() + 1)).slice(-2);
                updateCloudBadge(timeStr, true);

                renderDashboard(currentPeriod);
            } else {
                // Cloud rỗng! Nếu máy này đang giữ dữ liệu GSC xịn thì Đẩy lên cứu viện!
                if (globalGSCData && isGscConnected) {
                    pushDataToFirebase();
                }
            }
        });
    } catch (err) { console.error("Lỗi Khởi tạo Firebase:", err); }
}

// BƯỚC 4: Hàm đẩy/đồng bộ dữ liệu LÊN Cloud
function pushDataToFirebase() {
    if (!isRealtimeEnabled || !fbDB) return;
    
    const encodeFBKey = (k) => String(k).replace(/\./g, ',,').replace(/\//g, '||').replace(/#/g, '@@').replace(/\$/g, '$$').replace(/\[/g, '<<').replace(/\]/g, '>>');
    const safeGscData = {};
    if (globalGSCData) {
        for(let k in globalGSCData) safeGscData[encodeFBKey(k)] = globalGSCData[k];
    }
    const safeKws = {};
    const orgKws = getSiteKeywords();
    for(let k in orgKws) safeKws[encodeFBKey(k)] = orgKws[k];

    const payload = {
        gscData: safeGscData,
        customStats: getCustomStats(),
        siteKeywords: safeKws,
        lastUpdated: Date.now()
    };
    fbDB.ref('dashboard_data').set(payload).catch(e => console.error("Lỗi Push DB:", e));
}

// Cập nhật trạng thái Cloud/Offline trên Giao diện
function updateCloudBadge(timeStr, isLiveDatabase) {
    let badge = document.getElementById('cloudSyncBadge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'cloudSyncBadge';
        const actions = document.querySelector('.header-actions');
        if (actions) actions.insertBefore(badge, actions.firstChild);
    }

    if (isLiveDatabase) {
        badge.style.cssText = 'margin-left: 12px; margin-right: 12px; font-size: 11px; color: #3B82F6; font-weight: 600; background: rgba(59, 130, 246, 0.1); padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.3); box-shadow: 0 0 10px rgba(59,130,246,0.2); animation: pulse 2s infinite;';
        badge.innerHTML = `<i data-lucide="database" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:4px;"></i> Live Data: ${timeStr}`;
    } else {
        badge.style.cssText = 'margin-left: 12px; margin-right: 12px; font-size: 11px; color: #10B981; font-weight: 500; background: rgba(16, 185, 129, 0.1); padding: 6px 12px; border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.2);';
        badge.innerHTML = `<i data-lucide="hard-drive" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:4px;"></i> Offline Save: ${timeStr}`;
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Formatters
function formatShort(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString('en-US');
}

function calcChangeObj(current, previous) {
    if (previous === 0) return { str: current > 0 ? '+100%' : '0%', class: current > 0 ? 'pct-positive' : 'pct-neutral', isPositive: current > 0 };
    const pct = ((current - previous) / previous) * 100;
    const sign = pct > 0 ? '+' : '';
    let classStr = 'pct-neutral';
    if (pct > 0) classStr = 'pct-positive';
    else if (pct < 0) classStr = 'pct-negative';

    return { str: `${sign}${pct.toFixed(1)}%`, class: classStr, isPositive: pct >= 0 };
}

// Setup Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    initMockData();

    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentPeriod = e.target.dataset.period;
            renderDashboard(currentPeriod);
        });
    });

    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('cancelEditBtn').addEventListener('click', closeModal);
    document.getElementById('saveEditBtn').addEventListener('click', saveManualData);

    initGoogleAuth();
});

function initMockData() {
    renderDashboard('weekly');
}

function renderDashboard(period) {
    if (isGscConnected && globalGSCData) {
        processAndRenderRealData(period);
    }
}

// Process Real GSC Data dynamically
function processAndRenderRealData(period) {
    const dates = [];
    for (let i = 0; i < 60; i++) {
        let d = new Date(); d.setDate(d.getDate() - i);
        dates.unshift(d.toISOString().split('T')[0]);
    }

    const weekCurDates = dates.slice(-7);
    const weekPrevDates = dates.slice(-14, -7);
    const monthCurDates = dates.slice(-30);
    const monthPrevDates = dates.slice(-60, -30);

    const isWeekly = (period === 'weekly');
    const rangeSize = isWeekly ? 7 : 30;
    const activeCurDates = isWeekly ? weekCurDates : monthCurDates;
    const activePrevDates = isWeekly ? weekPrevDates : monthPrevDates;

    let totalActiveCurClicks = 0, totalActivePrevClicks = 0;
    let totalActiveCurImp = 0, totalActivePrevImp = 0;

    const chartCurrentClicks = new Array(rangeSize).fill(0);
    const chartPrevClicks = new Array(rangeSize).fill(0);
    const chartCurrentImp = new Array(rangeSize).fill(0);

    const siteBreakdown = [];

    Object.keys(globalGSCData).forEach(siteUrl => {
        const siteData = globalGSCData[siteUrl];

        let wkCurC = 0, wkPrevC = 0, wkCurI = 0;
        let moCurC = 0, moPrevC = 0;

        weekCurDates.forEach(dt => { const i = siteData[dt] || { clicks: 0, impressions: 0 }; wkCurC += i.clicks; wkCurI += i.impressions; });
        weekPrevDates.forEach(dt => { const i = siteData[dt] || { clicks: 0, impressions: 0 }; wkPrevC += i.clicks; });
        monthCurDates.forEach(dt => { const i = siteData[dt] || { clicks: 0, impressions: 0 }; moCurC += i.clicks; });
        monthPrevDates.forEach(dt => { const i = siteData[dt] || { clicks: 0, impressions: 0 }; moPrevC += i.clicks; });

        let curClick = 0, prevClick = 0, curImp = 0, prevImp = 0;
        activeCurDates.forEach((dt, idx) => {
            const item = siteData[dt] || { clicks: 0, impressions: 0 };
            curClick += item.clicks;
            curImp += item.impressions;
            chartCurrentClicks[idx] += item.clicks;
            chartCurrentImp[idx] += item.impressions;
        });

        activePrevDates.forEach((dt, idx) => {
            const item = siteData[dt] || { clicks: 0, impressions: 0 };
            prevClick += item.clicks;
            prevImp += item.impressions;
            chartPrevClicks[idx] += item.clicks;
        });

        totalActiveCurClicks += curClick;
        totalActiveCurImp += curImp;
        totalActivePrevClicks += prevClick;
        totalActivePrevImp += prevImp;

        const cleanDomain = siteUrl.replace('sc-domain:', '').replace('https://', '').replace('/', '');

        siteBreakdown.push({
            domain: cleanDomain,
            wkCurC, wkPrevC, wkCurI,
            moCurC, moPrevC
        });
    });

    globalSiteBreakdown = siteBreakdown;

    const trendStr = isWeekly ? 'vs tuần trước' : 'vs tháng trước';
    const clickChange = calcChangeObj(totalActiveCurClicks, totalActivePrevClicks);
    const impChange = calcChangeObj(totalActiveCurImp, totalActivePrevImp);

    const stats = [
        { id: 'website', title: 'Website đang chạy', value: siteBreakdown.length, change: '+0', trend: trendStr, isPositive: true, icon: 'globe' },
        { id: 'keyword', title: 'Từ khóa lên Top', value: '...', change: '+0%', trend: trendStr, isPositive: true, icon: 'key' },
        { id: 'click_real', title: 'Lượt Click', value: formatShort(totalActiveCurClicks), change: clickChange.str, trend: trendStr, isPositive: clickChange.isPositive, icon: 'mouse-pointer-click' },
        { id: 'impression_real', title: 'Lượt hiển thị', value: formatShort(totalActiveCurImp), change: impChange.str, trend: trendStr, isPositive: impChange.isPositive, icon: 'eye' }
    ];

    const chartLabels = activeCurDates.map(dt => dt.substring(5).replace('-', '/'));
    const chartData = {
        mainChart: { labels: chartLabels, current: chartCurrentClicks, previous: chartPrevClicks },
        impressionChart: { labels: chartLabels, data: chartCurrentImp }
    };

    renderCards(stats);
    renderCharts(chartData);

    siteBreakdown.sort((a, b) => b.moCurC - a.moCurC);
    renderDataTable(siteBreakdown);
    lucide.createIcons();
}

window.updateKwInput = function (domain, element) { saveSiteKeyword(domain, element.value); };

function renderDataTable(sites) {
    const tbody = document.getElementById('siteTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const kws = getSiteKeywords();

    sites.forEach(site => {
        const tr = document.createElement('tr');
        const wkClickTrend = calcChangeObj(site.wkCurC, site.wkPrevC);
        const moClickTrend = calcChangeObj(site.moCurC, site.moPrevC);
        const kwVal = kws[site.domain] || 0;
        const faviconUrl = 'https://www.google.com/s2/favicons?domain=' + site.domain + '&sz=64';

        tr.innerHTML = `
            <td>
                <div class="site-name-col">
                    <img src="${faviconUrl}" class="domain-icon" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM5Y2EzYWYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCI+PC9jaXJjbGU+PGxpbmUgeDE9IjIiIHkxPSIxMiIgeDI9IjIyIiB5Mj0iMTIiPjwvbGluZT48cGF0aCBkPSJNMTIgMmExNS4zIDE1LjMgMCAwIDEgNCAxMGExNS4zIDE1LjMgMCAwIDEtNCAxMCAxNS4zIDE1LjMgMCAwIDEtNC0xMCAxNS4zIDE1LjMgMCAwIDEgNC0xMHoiPjwvcGF0aD48L3N2Zz4='">
                    ${site.domain}
                </div>
            </td>
            <td><input type="number" class="keyword-input" value="${kwVal}" placeholder="0" onblur="updateKwInput('${site.domain}', this)"></td>
            <td style="font-weight: 600; color: #6366F1;">${site.wkCurC.toLocaleString('en-US')}</td>
            <td>${site.wkCurI.toLocaleString('en-US')}</td>
            <td>${site.wkPrevC.toLocaleString('en-US')}</td>
            <td><span class="pct-badge ${wkClickTrend.class}">${wkClickTrend.str}</span></td>
            
            <td style="font-weight: 600; color: #8B5CF6;">${site.moCurC.toLocaleString('en-US')}</td>
            <td>${site.moPrevC.toLocaleString('en-US')}</td>
            <td><span class="pct-badge ${moClickTrend.class}">${moClickTrend.str}</span></td>
        `;
        tbody.appendChild(tr);
    });

    renderTableFooter();
}

function renderTableFooter() {
    const tfoot = document.getElementById('siteTableFoot');
    if (!tfoot || globalSiteBreakdown.length === 0) return;

    let totalKw = 0, twkCurC = 0, twkCurI = 0, twkPrevC = 0, tmoCurC = 0, tmoPrevC = 0;
    const kws = getSiteKeywords();

    globalSiteBreakdown.forEach(s => {
        totalKw += kws[s.domain] || 0;
        twkCurC += s.wkCurC; twkCurI += s.wkCurI; twkPrevC += s.wkPrevC;
        tmoCurC += s.moCurC; tmoPrevC += s.moPrevC;
    });

    const wkTrend = calcChangeObj(twkCurC, twkPrevC);
    const moTrend = calcChangeObj(tmoCurC, tmoPrevC);

    tfoot.innerHTML = `
        <tr>
            <td style="text-align: left;">**Tổng cộng (${globalSiteBreakdown.length} Website)**</td>
            <td>${totalKw.toLocaleString('en-US')}</td>
            <td style="color: #6366F1;">${twkCurC.toLocaleString('en-US')}</td>
            <td>${twkCurI.toLocaleString('en-US')}</td>
            <td>${twkPrevC.toLocaleString('en-US')}</td>
            <td>${wkTrend.str}</td>
            <td style="color: #8B5CF6;">${tmoCurC.toLocaleString('en-US')}</td>
            <td>${tmoPrevC.toLocaleString('en-US')}</td>
            <td>${moTrend.str}</td>
        </tr>
    `;
    tfoot.style.display = 'table-footer-group';

    if (totalKw > 0) saveCustomStat('keyword', totalKw.toLocaleString('en-US'));
}

function renderCards(stats) {
    const grid = document.getElementById('statsGrid');
    grid.innerHTML = '';
    const customStats = getCustomStats();

    stats.forEach(stat => {
        const changeClass = stat.isPositive ? 'positive' : 'negative';
        const changeIcon = stat.isPositive ? 'trending-up' : 'trending-down';

        const displayValue = customStats[stat.id] !== undefined ? customStats[stat.id] : stat.value;
        const canEdit = (stat.id === 'website' || stat.id === 'keyword');
        const editBtnHTML = canEdit
            ? `<button class="edit-btn" onclick="openModal('${stat.id}', '${stat.title}', '${displayValue}')"><i data-lucide="edit-2" style="width: 14px; height: 14px;"></i></button>`
            : '';

        const card = document.createElement('div');
        card.className = 'stat-card';
        card.innerHTML = `
            <div class="stat-header">
                <div class="flex-row-center">
                    <span>${stat.title}</span>
                    ${editBtnHTML}
                </div>
                <i data-lucide="${stat.icon}" class="stat-icon"></i>
            </div>
            <div class="stat-value">${displayValue}</div>
            <div class="stat-footer">
                <span class="stat-change ${changeClass}">
                    <i data-lucide="${changeIcon}" style="width: 14px; height: 14px;"></i>
                    ${stat.change}
                </span>
                <span class="trend-text">${stat.trend}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderCharts(data) {
    if (mainChartInstance) mainChartInstance.destroy();
    if (impressionChartInstance) impressionChartInstance.destroy();

    const mainCtx = document.getElementById('mainChart').getContext('2d');
    const primaryGradient = mainCtx.createLinearGradient(0, 0, 0, 400);
    primaryGradient.addColorStop(0, 'rgba(99, 102, 241, 0.5)');
    primaryGradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

    mainChartInstance = new Chart(mainCtx, {
        type: 'line',
        data: {
            labels: data.mainChart.labels,
            datasets: [
                { label: 'Clicks Kỳ Này', data: data.mainChart.current, borderColor: '#6366F1', backgroundColor: primaryGradient, borderWidth: 2, tension: 0.4, fill: true, yAxisID: 'y' },
                { label: 'Clicks Kỳ Trước', data: data.mainChart.previous, borderColor: '#6B7280', backgroundColor: 'transparent', borderWidth: 2, borderDash: [5, 5], tension: 0.4, pointRadius: 0, yAxisID: 'y' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'top', labels: { boxWidth: 12, usePointStyle: true } }, tooltip: { backgroundColor: '#1C2433', titleColor: '#F3F4F6', bodyColor: '#D1D5DB', borderColor: '#2D3748', borderWidth: 1, padding: 12 } },
            scales: { x: { grid: { color: '#2D3748', drawBorder: false } }, y: { type: 'linear', display: true, position: 'left', grid: { color: '#2D3748', drawBorder: false }, ticks: { callback: function (v) { return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v; } } } }
        }
    });

    const impCtx = document.getElementById('impressionChart').getContext('2d');
    const barGradient = impCtx.createLinearGradient(0, 0, 0, 400);
    barGradient.addColorStop(0, '#8B5CF6');
    barGradient.addColorStop(1, '#6366F1');

    impressionChartInstance = new Chart(impCtx, {
        type: 'bar',
        data: { labels: data.impressionChart.labels, datasets: [{ label: 'Lượt hiển thị', data: data.impressionChart.data, backgroundColor: barGradient, borderRadius: 6, borderSkipped: false }] },
        options: {
            responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1C2433', titleColor: '#F3F4F6', bodyColor: '#D1D5DB', borderColor: '#2D3748', borderWidth: 1, padding: 12 } },
            scales: { x: { grid: { display: false } }, y: { grid: { color: '#2D3748', drawBorder: false }, ticks: { callback: function (v) { return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v; } } } }
        }
    });
}

function openModal(id, title, currentValue) {
    document.getElementById('editCardId').value = id;
    document.getElementById('editCardName').innerText = title;
    document.getElementById('editValueInput').value = String(currentValue).replace(/,/g, '');
    document.getElementById('editModal').classList.add('active');
    document.getElementById('editValueInput').focus();
}

function closeModal() { document.getElementById('editModal').classList.remove('active'); }

function saveManualData() {
    const id = document.getElementById('editCardId').value;
    let value = document.getElementById('editValueInput').value.trim();
    if (!isNaN(value) && value !== '') value = Number(value).toLocaleString('en-US');
    if (value !== '') { saveCustomStat(id, value); renderDashboard(currentPeriod); closeModal(); }
}

const CLIENT_ID = '910348783245-iu1mru28v684ds523abgnqe7bshs5ppd.apps.googleusercontent.com';
let tokenClient;

function setLoginState(isLoading) {
    let btn = document.getElementById('gscLoginBtn');
    if (!btn) return;
    if (isLoading) {
        btn.innerHTML = '<i data-lucide="loader" class="spin" style="width: 16px;"></i> Đang kết nối Google...';
        btn.classList.add('disabled'); btn.disabled = true;
    } else {
        btn.innerHTML = '<i data-lucide="refresh-ccw" style="width: 16px;"></i> Cập nhật GSC API';
        btn.classList.remove('disabled'); btn.classList.replace('btn-secondary', 'btn-primary');
        btn.disabled = false; isGscConnected = true;
    }
    lucide.createIcons();
}

function initGoogleAuth() {
    // Ưu tiên load bộ nhớ vĩnh viễn (LocalStorage) đầu tiên khi vừa refresh F5!
    loadLocalBackup();

    if (typeof google === 'undefined') { setTimeout(initGoogleAuth, 500); return; }
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: 'https://www.googleapis.com/auth/webmasters.readonly', prompt: '',
        callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                localStorage.setItem('gsc_token', tokenResponse.access_token);
                localStorage.setItem('gsc_token_expiry', Date.now() + (3500 * 1000));
                fetchGSCData(tokenResponse.access_token, false);
            }
        }
    });

    const loginBtn = document.getElementById('gscLoginBtn');
    if (loginBtn) loginBtn.addEventListener('click', () => { tokenClient.requestAccessToken({ prompt: 'consent' }); });

    // Khởi động Realtime Database thay cho Export/Import
    initFirebaseDatabase();
}

async function fetchGSCData(accessToken, isSilent = false) {
    try {
        setLoginState(true);
        const siteRes = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', { headers: { Authorization: 'Bearer ' + accessToken } });

        if (siteRes.status === 401) {
            localStorage.removeItem('gsc_token');
            const btn = document.getElementById('gscLoginBtn');
            btn.innerHTML = '<i data-lucide="log-in" style="width: 16px;"></i> Nạp lại Bản quyền';
            btn.classList.replace('btn-primary', 'btn-secondary'); btn.disabled = false;
            lucide.createIcons();
            if (!isSilent) alert('Phiên bản quyền GSC đã hết hạn. Vui lòng bấm Nạp lại bản quyền!');
            return;
        }

        const siteData = await siteRes.json();
        const targetDomains = [
            'vidcogroup.com', 'kuromi.vn', 'tranhalinh.org', 'duyhoang.vn', 'dulich24h.net',
            'duansungroups.com', 'dadiland.com', 'thanhhungtrans.com', 'cafelegend.vn',
            'healthpark.com.vn', 'banmat.vn', 'gamingpcguru.com', 'quanche.vn',
            'lynkcohanoi5s.com', 'lynkcotoanquoc.com', 'zeekrvietnams.vn', 'nuocmamvn.vn'
        ];

        const matchedSites = siteData.siteEntry ? siteData.siteEntry.filter(e => targetDomains.some(d => e.siteUrl.includes(d))) : [];

        if (matchedSites.length === 0) {
            setLoginState(false);
            if (!isSilent) alert('Không tìm thấy domain nào khớp!');
            return;
        }

        const endDt = new Date(); const startDt = new Date(endDt); startDt.setDate(startDt.getDate() - 59);
        const formatDate = (date) => date.toISOString().split('T')[0];
        const bodyStyle = { startDate: formatDate(startDt), endDate: formatDate(endDt), dimensions: ['date'] };

        let siteAggregated = {};
        matchedSites.forEach(s => { siteAggregated[s.siteUrl] = {}; });

        await Promise.all(matchedSites.map(async (siteObj) => {
            try {
                const statsRes = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(siteObj.siteUrl) + '/searchAnalytics/query', {
                    method: 'POST', headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, body: JSON.stringify(bodyStyle)
                });
                const statsData = await statsRes.json();
                if (statsData.rows) {
                    statsData.rows.forEach(r => {
                        siteAggregated[siteObj.siteUrl][r.keys[0]] = { clicks: r.clicks, impressions: r.impressions };
                    });
                }
            } catch (e) { console.error('Lỗi khi tải:', siteObj.siteUrl); }
        }));

        globalGSCData = siteAggregated;
        isGscConnected = true;

        // Lưu VĨNH VIỄN LÊN TRÌNH DUYỆT ĐỂ FIX LỖI F5 !
        saveLocalBackup(siteAggregated);

        // Đồng bộ lên DATABASE ngay lập tức
        pushDataToFirebase();

        setLoginState(false);
        renderDashboard(currentPeriod);
        loadLocalBackup(); // Cập nhật lại UI huy hiệu (Màu xanh lá)
        // Lưu ý: Nếu có Firebase, nó sẽ tự đè lại thành viền xanh dương (Live)

        if (!isSilent) alert(`Hoàn tất nạp số liệu! Dữ liệu đã được nén vĩnh viễn vào thiết bị này chống F5.`);
    } catch (err) {
        console.error(err); setLoginState(false);
        if (!isSilent) alert('Lỗi tải dữ liệu. Vui lòng chụp màn hình này gửi em nhé: \n\n' + err.message + '\n' + err.stack);
    }
}