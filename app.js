// Validate Global Chart Setup
Chart.defaults.color = '#9CA3AF';
Chart.defaults.font.family = "'Inter', sans-serif";

let mainChartInstance = null;
let impressionChartInstance = null;
let currentPeriod = 'weekly';

// Global Data Storage for GSC
let globalGSCData = null;
let globalGSCKeywords = {};
let isGscConnected = false;
let globalSiteBreakdown = [];
let currentViewMode = 'clicks';

// Local Storage Handlers
function getTargetDomains() {
    const defaultDomains = [
        'vidcogroup.com', 'kuromi.vn', 'tranhalinh.org', 'duyhoang.vn', 'dulich24h.net',
        'duansungroups.com', 'dadiland.com', 'thanhhungtrans.com', 'cafelegend.vn',
        'healthpark.com.vn', 'banmat.vn', 'gamingpcguru.com', 'quanche.vn',
        'lynkcohanoi5s.com', 'lynkcotoanquoc.com', 'zeekrvietnams.vn', 'nuocmamvn.vn'
    ];
    try {
        const stored = localStorage.getItem('targetDomains');
        if (stored) return JSON.parse(stored);
    } catch(e) {}
    return defaultDomains;
}

function saveTargetDomains(domains) {
    localStorage.setItem('targetDomains', JSON.stringify(domains));
    pushDataToFirebase();
}

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
function saveLocalBackup(data, kwData) {
    try {
        localStorage.setItem('local_fallback_gsc', JSON.stringify({ timestamp: Date.now(), gsc: data, gscKw: kwData || {} }));
    } catch (e) { console.error("Lỗi lưu máy cục bộ:", e); }
}

function loadLocalBackup() {
    try {
        const local = JSON.parse(localStorage.getItem('local_fallback_gsc'));
        if (local && local.gsc) {
            globalGSCData = local.gsc;
            globalGSCKeywords = local.gscKw || {};
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
                    const orgKwData = {};
                    if (data.gscKwData) {
                        for(let k in data.gscKwData) orgKwData[decodeFBKey(k)] = data.gscKwData[k];
                    }
                    globalGSCKeywords = orgKwData;
                    isGscConnected = true;
                    saveLocalBackup(orgGsc, orgKwData);
                }
                if (data.customStats) localStorage.setItem('customStats', JSON.stringify(data.customStats));
                if (data.siteKeywords) {
                    const orgKw = {};
                    for(let k in data.siteKeywords) orgKw[decodeFBKey(k)] = data.siteKeywords[k];
                    localStorage.setItem('siteKeywords', JSON.stringify(orgKw));
                }
                if (data.targetDomains) {
                    localStorage.setItem('targetDomains', JSON.stringify(data.targetDomains));
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

    const safeGscKwData = {};
    if (globalGSCKeywords) {
        for(let k in globalGSCKeywords) safeGscKwData[encodeFBKey(k)] = globalGSCKeywords[k];
    }

    const payload = {
        gscData: safeGscData,
        gscKwData: safeGscKwData,
        customStats: getCustomStats(),
        siteKeywords: safeKws,
        targetDomains: getTargetDomains(),
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

    const exportCsvBtn = document.getElementById('exportCsvBtn');
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', exportToCSV);
    }

    const manageBtn = document.getElementById('manageSitesBtn');
    if (manageBtn) {
        manageBtn.addEventListener('click', () => {
            const domains = getTargetDomains();
            document.getElementById('sitesTextarea').value = domains.join('\n');
            document.getElementById('manageSitesModal').classList.add('active');
            document.getElementById('sitesTextarea').focus();
        });
    }
    const closeManageModal = () => {
        const modal = document.getElementById('manageSitesModal');
        if(modal) modal.classList.remove('active');
    };
    document.getElementById('closeManageSitesBtn')?.addEventListener('click', closeManageModal);
    document.getElementById('cancelManageSitesBtn')?.addEventListener('click', closeManageModal);
    document.getElementById('saveManageSitesBtn')?.addEventListener('click', () => {
        const text = document.getElementById('sitesTextarea').value;
        // Parse lines, format URLs/domains (remove http:// and trailing slash)
        const domains = text.split('\n')
            .map(d => d.trim().replace(/^https?:\/\//i, '').replace(/\/$/, ''))
            .filter(d => d.length > 0);
        
        saveTargetDomains(domains);
        closeManageModal();
        alert('Đã lưu danh sách website! Hãy bấm "Cập nhật GSC API" trên góc phải tải số liệu mới nhất.');
    });

    // View mode tab switcher
    document.querySelectorAll('.view-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-tab').forEach(b => {
                b.classList.remove('active');
                b.style.background = 'transparent';
                b.style.color = '#9CA3AF';
            });
            btn.classList.add('active');
            btn.style.background = 'rgba(99,102,241,0.2)';
            btn.style.color = '#6366F1';
            currentViewMode = btn.dataset.view;
            renderDashboard(currentPeriod);
        });
    });

    // Navigation logic (SPA)
    const navOverview = document.getElementById('nav-overview');
    const navNetwork = document.getElementById('nav-network');
    const viewDashboard = document.getElementById('view-dashboard');
    const viewNetwork = document.getElementById('view-network');

    navOverview?.addEventListener('click', (e) => {
        e.preventDefault();
        navOverview.classList.add('active');
        navNetwork.classList.remove('active');
        viewDashboard.style.display = 'block';
        if(viewNetwork) viewNetwork.style.display = 'none';
        lucide.createIcons();
    });

    navNetwork?.addEventListener('click', (e) => {
        e.preventDefault();
        navNetwork.classList.add('active');
        navOverview.classList.remove('active');
        viewDashboard.style.display = 'none';
        if(viewNetwork) viewNetwork.style.display = 'block';
        
        // Load configurations
        if (!document.getElementById('sheetIdInput').value) {
            document.getElementById('sheetIdInput').value = localStorage.getItem('pbnSheetId') || '';
            document.getElementById('sheetRangeInput').value = localStorage.getItem('pbnSheetRange') || 'Sheet1!A:E';
        }
        
        // Auto fetch if there is token and ID and the table is still empty
        const token = localStorage.getItem('gsc_token');
        const sheetId = localStorage.getItem('pbnSheetId');
        if (token && sheetId && document.getElementById('sheetTableBody')?.children.length <= 1) {
            fetchSheetData(token, sheetId, localStorage.getItem('pbnSheetRange') || 'Sheet1!A:E');
        }
    });

    document.getElementById('syncSheetBtn')?.addEventListener('click', () => {
        const sheetId = document.getElementById('sheetIdInput').value.trim();
        const range = document.getElementById('sheetRangeInput').value.trim() || 'Sheet1!A:E';
        if (!sheetId) {
            alert('Vui lòng nhập ID trang tính!');
            return;
        }
        localStorage.setItem('pbnSheetId', sheetId);
        localStorage.setItem('pbnSheetRange', range);

        const token = localStorage.getItem('gsc_token');
        if (!token) {
            alert('Chưa có xác thực Google. Hãy qua tab Tổng Quan ấn "Kết nối GSC" (hoặc Nạp lại bản quyền) để cấp quyền đọc Sheet nhé!');
            return;
        }
        fetchSheetData(token, sheetId, range);
    });

    initGoogleAuth();
});

window.toggleKeywordRow = function(safeId) {
    const row = document.getElementById('kw-row-' + safeId);
    if (!row) return;
    row.style.display = (row.style.display === 'none' || row.style.display === '') ? 'table-row' : 'none';
};

function initMockData() {
    renderDashboard('weekly');
}

let renderTimer = null;
function renderDashboard(period) {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
        if (isGscConnected && globalGSCData) {
            processAndRenderRealData(period);
        }
    }, 500); // Throttles processing to max 1 per 500ms
}

// Process Real GSC Data dynamically
function processAndRenderRealData(period) {
    // Tự động tìm ngày mới nhất có dữ liệu (Do GSC luôn trễ 2-3 ngày)
    let maxDateStr = "";
    Object.keys(globalGSCData).forEach(url => {
        Object.keys(globalGSCData[url]).forEach(dtStr => {
            if (dtStr > maxDateStr) maxDateStr = dtStr;
        });
    });

    let anchorDate = new Date();
    if (maxDateStr && maxDateStr.length === 10) {
        anchorDate = new Date(maxDateStr);
    }

    const dates = [];
    for (let i = 0; i < 60; i++) {
        let d = new Date(anchorDate.getTime()); 
        d.setDate(d.getDate() - i);
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
    const targetDomainsList = getTargetDomains();

    targetDomainsList.forEach(domain => {
        const domainClean = domain.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
        const existingKey = Object.keys(globalGSCData).find(k => {
            const kClean = k.toLowerCase().replace('sc-domain:', '').replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
            return kClean === domainClean || kClean.includes(domainClean) || domainClean.includes(kClean);
        });
        const siteUrl = existingKey ? existingKey : `sc-domain:${domainClean}`;
        const siteData = existingKey ? globalGSCData[existingKey] : {};

        let wkCurC = 0, wkPrevC = 0, wkCurI = 0, wkPrevI = 0;
        let moCurC = 0, moPrevC = 0, moCurI = 0, moPrevI = 0;
        let wkPosCur = 0, wkImpPos = 0, moPosCur = 0, moImpPos = 0;

        weekCurDates.forEach(dt => {
            const i = siteData[dt] || { clicks: 0, impressions: 0, position: 0 };
            wkCurC += i.clicks; wkCurI += i.impressions;
            if (i.impressions > 0) { wkPosCur += (i.position || 0) * i.impressions; wkImpPos += i.impressions; }
        });
        weekPrevDates.forEach(dt => {
            const i = siteData[dt] || { clicks: 0, impressions: 0 };
            wkPrevC += i.clicks; wkPrevI += i.impressions;
        });
        monthCurDates.forEach(dt => {
            const i = siteData[dt] || { clicks: 0, impressions: 0, position: 0 };
            moCurC += i.clicks; moCurI += i.impressions;
            if (i.impressions > 0) { moPosCur += (i.position || 0) * i.impressions; moImpPos += i.impressions; }
        });
        monthPrevDates.forEach(dt => {
            const i = siteData[dt] || { clicks: 0, impressions: 0 };
            moPrevC += i.clicks; moPrevI += i.impressions;
        });

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
            siteUrl,
            wkCurC, wkPrevC, wkCurI, wkPrevI,
            moCurC, moPrevC, moCurI, moPrevI,
            wkCurCtr: wkCurI > 0 ? (wkCurC / wkCurI * 100) : 0,
            wkPrevCtr: wkPrevI > 0 ? (wkPrevC / wkPrevI * 100) : 0,
            wkCurPos: wkImpPos > 0 ? (wkPosCur / wkImpPos) : 0,
            moCurCtr: moCurI > 0 ? (moCurC / moCurI * 100) : 0,
            moPrevCtr: moPrevI > 0 ? (moPrevC / moPrevI * 100) : 0,
            moCurPos: moImpPos > 0 ? (moPosCur / moImpPos) : 0
        });
    });

    globalSiteBreakdown = siteBreakdown;

    const trendStr = isWeekly ? 'vs tuần trước' : 'vs tháng trước';
    const clickChange = calcChangeObj(totalActiveCurClicks, totalActivePrevClicks);
    const impChange = calcChangeObj(totalActiveCurImp, totalActivePrevImp);

    const kwsObj = getSiteKeywords();
    let computedKw = 0;
    siteBreakdown.forEach(s => { computedKw += kwsObj[s.domain] || 0; });

    const stats = [
        { id: 'website', title: 'Website đang chạy', value: siteBreakdown.length, change: '+0', trend: trendStr, isPositive: true, icon: 'globe' },
        { id: 'keyword', title: 'Từ khóa lên Top', value: computedKw > 0 ? computedKw.toLocaleString('en-US') : '...', change: '+0%', trend: trendStr, isPositive: true, icon: 'key' },
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

    // Sort by best metric for each view mode
    if (currentViewMode === 'impressions') {
        siteBreakdown.sort((a, b) => b.moCurI - a.moCurI);
    } else if (currentViewMode === 'traffic') {
        // Higher CTR = better; if CTR equal, lower position = better
        siteBreakdown.sort((a, b) => {
            if (Math.abs(b.moCurCtr - a.moCurCtr) > 0.01) return b.moCurCtr - a.moCurCtr;
            const posA = a.moCurPos > 0 ? a.moCurPos : 999;
            const posB = b.moCurPos > 0 ? b.moCurPos : 999;
            return posA - posB;
        });
    } else {
        siteBreakdown.sort((a, b) => b.moCurC - a.moCurC);
    }
    renderDataTable(siteBreakdown);
    lucide.createIcons();
}

window.updateKwInput = function (domain, element) { saveSiteKeyword(domain, element.value); };

function renderDataTable(sites) {
    const thead = document.getElementById('siteTableHead');
    const tbody = document.getElementById('siteTableBody');
    if (!tbody || !thead) return;

    // Dynamic header based on view mode
    let headHtml = '<tr><th>Website</th>';
    if (currentViewMode === 'clicks') {
        headHtml += '<th>Keyword (SEO)</th><th>Clicks (Tu\u1EA7n n\u00E0y)</th><th>Clicks (Tu\u1EA7n tr\u01B0\u1EDBc)</th><th>So s\u00E1nh (%)</th><th>Clicks (Th\u00E1ng n\u00E0y)</th><th>Clicks (Th\u00E1ng tr\u01B0\u1EDBc)</th><th>So s\u00E1nh (%)</th>';
    } else if (currentViewMode === 'impressions') {
        headHtml += '<th>Top T\u1EEB Kh\u00F3a</th><th>Imp. (Tu\u1EA7n n\u00E0y)</th><th>Imp. (Tu\u1EA7n tr\u01B0\u1EDBc)</th><th>So s\u00E1nh (%)</th><th>Imp. (Th\u00E1ng n\u00E0y)</th><th>Imp. (Th\u00E1ng tr\u01B0\u1EDBc)</th><th>So s\u00E1nh (%)</th>';
    } else {
        headHtml += '<th>CTR (Tu\u1EA7n n\u00E0y)</th><th>CTR (Tu\u1EA7n tr\u01B0\u1EDBc)</th><th>V\u1ECB tr\u00ED (Tu\u1EA7n)</th><th>CTR (Th\u00E1ng n\u00E0y)</th><th>CTR (Th\u00E1ng tr\u01B0\u1EDBc)</th><th>V\u1ECB tr\u00ED (Th\u00E1ng)</th>';
    }
    headHtml += '</tr>';
    thead.innerHTML = headHtml;

    tbody.innerHTML = '';
    const kws = getSiteKeywords();
    const errImg = "this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM5Y2EzYWYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCI+PC9jaXJjbGU+PGxpbmUgeDE9IjIiIHkxPSIxMiIgeDI9IjIyIiB5Mj0iMTIiPjwvbGluZT48cGF0aCBkPSJNMTIgMmExNS4zIDE1LjMgMCAwIDEgNCAxMGExNS4zIDE1LjMgMCAwIDEtNCAxMCAxNS4zIDE1LjMgMCAwIDEtNC0xMCAxNS4zIDE1LjMgMCAwIDEgNC0xMHoiPjwvcGF0aD48L3N2Zz4='";

    sites.forEach(site => {
        const kwVal = kws[site.domain] || 0;
        const faviconUrl = 'https://www.google.com/s2/favicons?domain=' + site.domain + '&sz=64';
        const domainCell = '<td><div class="site-name-col"><img src="' + faviconUrl + '" class="domain-icon" onerror="' + errImg + '">' + site.domain + '</div></td>';
        const tr = document.createElement('tr');

        if (currentViewMode === 'clicks') {
            const wT = calcChangeObj(site.wkCurC, site.wkPrevC);
            const mT = calcChangeObj(site.moCurC, site.moPrevC);
            tr.innerHTML = domainCell +
                '<td><input type="number" class="keyword-input" value="' + kwVal + '" placeholder="0" onblur="updateKwInput(\'' + site.domain + '\', this)"></td>' +
                '<td style="font-weight:600;color:#6366F1">' + site.wkCurC.toLocaleString('en-US') + '</td>' +
                '<td>' + site.wkPrevC.toLocaleString('en-US') + '</td>' +
                '<td><span class="pct-badge ' + wT.class + '">' + wT.str + '</span></td>' +
                '<td style="font-weight:600;color:#8B5CF6">' + site.moCurC.toLocaleString('en-US') + '</td>' +
                '<td>' + site.moPrevC.toLocaleString('en-US') + '</td>' +
                '<td><span class="pct-badge ' + mT.class + '">' + mT.str + '</span></td>';
            tbody.appendChild(tr);

        } else if (currentViewMode === 'impressions') {
            const wT = calcChangeObj(site.wkCurI, site.wkPrevI);
            const mT = calcChangeObj(site.moCurI, site.moPrevI);
            const safeId = site.domain.replace(/\./g, '_');
            tr.innerHTML = domainCell +
                '<td><button onclick="toggleKeywordRow(\'' + safeId + '\')" style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);color:#818CF8;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">\uD83D\uDD0D Top t\u1EEB kh\u00F3a</button></td>' +
                '<td style="font-weight:600;color:#10B981">' + site.wkCurI.toLocaleString('en-US') + '</td>' +
                '<td>' + site.wkPrevI.toLocaleString('en-US') + '</td>' +
                '<td><span class="pct-badge ' + wT.class + '">' + wT.str + '</span></td>' +
                '<td style="font-weight:600;color:#34D399">' + site.moCurI.toLocaleString('en-US') + '</td>' +
                '<td>' + site.moPrevI.toLocaleString('en-US') + '</td>' +
                '<td><span class="pct-badge ' + mT.class + '">' + mT.str + '</span></td>';
            tbody.appendChild(tr);

            // Expandable keyword row
            const kwArr = (globalGSCKeywords && globalGSCKeywords[site.siteUrl]) ? globalGSCKeywords[site.siteUrl] : [];
            const kwTr = document.createElement('tr');
            kwTr.id = 'kw-row-' + safeId;
            kwTr.className = 'keyword-expand-row';
            kwTr.style.display = 'none';
            const pills = kwArr.length > 0
                ? kwArr.map(k => '<div class="kw-pill">' + k.keyword + ' <strong>' + k.impressions.toLocaleString() + '</strong></div>').join('')
                : '<span style="color:#6B7280;font-size:12px;font-style:italic;">Ch\u01B0a c\u00F3 d\u1EEF li\u1EC7u. Nh\u1EA5n "C\u1EADp nh\u1EADt GSC API" \u0111\u1EC3 t\u1EA3i t\u1EEB kh\u00F3a.</span>';
            kwTr.innerHTML = '<td colspan="8"><div class="keyword-expand-content">' + pills + '</div></td>';
            tbody.appendChild(kwTr);

        } else {
            tr.innerHTML = domainCell +
                '<td style="font-weight:600;color:#F59E0B">' + site.wkCurCtr.toFixed(2) + '%</td>' +
                '<td>' + site.wkPrevCtr.toFixed(2) + '%</td>' +
                '<td style="font-weight:600;color:#EC4899">' + (site.wkCurPos > 0 ? site.wkCurPos.toFixed(1) : '-') + '</td>' +
                '<td style="font-weight:600;color:#F59E0B">' + site.moCurCtr.toFixed(2) + '%</td>' +
                '<td>' + site.moPrevCtr.toFixed(2) + '%</td>' +
                '<td style="font-weight:600;color:#EC4899">' + (site.moCurPos > 0 ? site.moCurPos.toFixed(1) : '-') + '</td>';
            tbody.appendChild(tr);
        }
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

let hasLoadedBackup = false;
function initGoogleAuth() {
    // Ưu tiên load bộ nhớ vĩnh viễn (LocalStorage) đầu tiên khi vừa refresh F5!
    if (!hasLoadedBackup) { loadLocalBackup(); hasLoadedBackup = true; }

    if (typeof google === 'undefined') { setTimeout(initGoogleAuth, 500); return; }
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: 'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/spreadsheets.readonly', prompt: '',
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
        const targetDomains = getTargetDomains();

        const matchedSites = siteData.siteEntry ? siteData.siteEntry.filter(e => 
            targetDomains.some(d => e.siteUrl.toLowerCase().includes(d.toLowerCase().trim()))
        ) : [];

        if (matchedSites.length === 0) {
            setLoginState(false);
            if (!isSilent) alert('Không tìm thấy domain nào khớp!');
            return;
        }

        const endDt = new Date(); const startDt = new Date(endDt); startDt.setDate(startDt.getDate() - 59);
        const formatDate = (date) => date.toISOString().split('T')[0];
        const bodyStyle = { startDate: formatDate(startDt), endDate: formatDate(endDt), dimensions: ['date'] };
        const queryBodyStyle = { startDate: formatDate(startDt), endDate: formatDate(endDt), dimensions: ['query'], rowLimit: 15 };

        let siteAggregated = {};
        let siteAggregatedKw = {};

        await Promise.all(matchedSites.map(async (siteObj) => {
            siteAggregated[siteObj.siteUrl] = {};
            siteAggregatedKw[siteObj.siteUrl] = [];
            try {
                const [statsRes, kwRes] = await Promise.all([
                    fetch('https://searchconsole.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(siteObj.siteUrl) + '/searchAnalytics/query', {
                        method: 'POST', headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, body: JSON.stringify(bodyStyle)
                    }),
                    fetch('https://searchconsole.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(siteObj.siteUrl) + '/searchAnalytics/query', {
                        method: 'POST', headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, body: JSON.stringify(queryBodyStyle)
                    })
                ]);
                const statsData = await statsRes.json();
                if (statsData.rows) {
                    statsData.rows.forEach(r => {
                        siteAggregated[siteObj.siteUrl][r.keys[0]] = { clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position };
                    });
                }
                const kwData = await kwRes.json();
                if (kwData.rows) {
                    siteAggregatedKw[siteObj.siteUrl] = kwData.rows.map(r => ({ keyword: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
                }
            } catch (e) { console.error('Lỗi khi tải:', siteObj.siteUrl); }
        }));

        if (!globalGSCData) globalGSCData = {};
        for (let url in siteAggregated) { globalGSCData[url] = siteAggregated[url]; }
        if (!globalGSCKeywords) globalGSCKeywords = {};
        for (let url in siteAggregatedKw) { globalGSCKeywords[url] = siteAggregatedKw[url]; }
        isGscConnected = true;

        // Lưu VĨNH VIỄN LÊN TRÌNH DUYỆT ĐỂ FIX LỖI F5 !
        saveLocalBackup(globalGSCData, globalGSCKeywords);

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

// Export to CSV
function exportToCSV() {
    if (!globalSiteBreakdown || globalSiteBreakdown.length === 0) {
        alert("Chưa có dữ liệu để xuất!");
        return;
    }
    
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "Website,Keyword (SEO),Clicks (Tuan nay),Clicks (Tuan truoc),Impressions (Tuan nay),Impressions (Tuan truoc),CTR (Tuan nay),Vi tri (Tuan nay),Clicks (Thang nay),Clicks (Thang truoc),Impressions (Thang nay),Impressions (Thang truoc),CTR (Thang nay),Vi tri (Thang nay)\n";
    
    const kws = getSiteKeywords();
    globalSiteBreakdown.forEach(site => {
        const kwVal = kws[site.domain] || 0;
        const row = [
            site.domain, kwVal,
            site.wkCurC, site.wkPrevC,
            site.wkCurI, site.wkPrevI,
            site.wkCurCtr.toFixed(2) + "%",
            site.wkCurPos > 0 ? site.wkCurPos.toFixed(1) : "-",
            site.moCurC, site.moPrevC,
            site.moCurI, site.moPrevI,
            site.moCurCtr.toFixed(2) + "%",
            site.moCurPos > 0 ? site.moCurPos.toFixed(1) : "-"
        ];
        csvContent += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute("download", `SEO_Report_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Thêm logic tải Google Sheets
async function fetchSheetData(accessToken, sheetId, range) {
    const btn = document.getElementById('syncSheetBtn');
    if (btn) btn.innerHTML = '<i data-lucide="loader" class="spin" style="width: 16px;"></i> Đang tải...';
    lucide.createIcons();
    
    try {
        const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        if (res.status === 401 || res.status === 403) {
            alert('Lỗi quyền (Token hết hạn hoặc bạn chưa đánh dấu cấp quyền Google Sheets lúc đăng nhập). Xin hãy qua tab Tổng quan nhấn Kết nối GSC lại!');
            localStorage.removeItem('gsc_token');
            if (btn) btn.innerHTML = '<i data-lucide="refresh-cw" style="width: 16px;"></i> Đồng bộ Sheets';
            lucide.createIcons();
            return;
        }
        
        if (!res.ok) {
            const errorText = await res.text();
            alert('Lỗi tải Sheets (Kiểm tra lại ID): ' + errorText);
            if (btn) btn.innerHTML = '<i data-lucide="refresh-cw" style="width: 16px;"></i> Đồng bộ Sheets';
            lucide.createIcons();
            return;
        }

        const data = await res.json();
        const rows = data.values;
        const tbody = document.getElementById('sheetTableBody');
        
        if (!rows || rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Không có dữ liệu trong vùng này</td></tr>';
        } else {
            tbody.innerHTML = '';
            // Render từng dòng
            rows.forEach((row, index) => {
                if(index === 0 && row[0]?.toLowerCase().includes('website')) return; // Bỏ tiêu đề
                
                const tr = document.createElement('tr');
                const webGoc = row[0] || '';
                const web301 = row[1] || '';
                const adminUrl = row[2] || '';
                const tk = row[3] || '';
                const mk = row[4] || '';
                
                const safeMk = mk.replace(/"/g, '&quot;');
                
                tr.innerHTML = `
                    <td>${index + 1}</td>
                    <td style="font-weight: 600; color: #F3F4F6;">${webGoc}</td>
                    <td>${web301}</td>
                    <td><a href="${adminUrl.startsWith('http') ? adminUrl : 'https://'+adminUrl}" target="_blank" style="color: #6366F1;">${adminUrl}</a></td>
                    <td>${tk}</td>
                    <td style="display:flex; align-items:center; gap:8px;">
                        <span class="pw-box" data-pw="${safeMk}" style="font-family: monospace; background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 4px; color: #9CA3AF;">******</span>
                        <button class="eye-btn" onclick="togglePassword(this)" style="background:transparent; border:none; cursor:pointer; color:#6B7280;" title="Hiện/Ẩn">
                            <i data-lucide="eye" style="width: 14px; height: 14px;"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (err) {
        console.error(err);
        alert('Lỗi ngoại lệ: ' + err.message);
    }
    
    if (btn) btn.innerHTML = '<i data-lucide="refresh-cw" style="width: 16px;"></i> Đồng bộ Sheets';
    lucide.createIcons();
}

// Logic hiện mật khẩu
window.togglePassword = function(btn) {
    const pwBox = btn.previousElementSibling;
    const realPw = pwBox.getAttribute('data-pw');
    if (pwBox.innerText === '******') {
        pwBox.innerText = realPw || ' ';
        pwBox.style.color = '#10B981';
    } else {
        pwBox.innerText = '******';
        pwBox.style.color = '#9CA3AF';
    }
};