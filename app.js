// Department Configuration — MGM Evening College (BCA, BCom, BBA)
const DEPT_CONFIG = {
    BCA: {
        code: 'BCA',
        name: 'Bachelor of Computer Applications (BCA)',
        passcode: 'bca2026',
        badgeClass: 'bca',
        hasSections: true,
        sections: ['A', 'B'],
        defaultSubject: '',
        subjectsByYearAndSection: {
            'First Year': { 'A': [], 'B': [] },
            'Second Year': { 'A': [], 'B': [] },
            'Third Year': { 'A': [], 'B': [] }
        },
        subjectsByYear: {
            'First Year': [],
            'Second Year': [],
            'Third Year': []
        },
        subjects: [],
        samplePresets: []
    },
    BCOM: {
        code: 'BCOM',
        name: 'Bachelor of Commerce (B.Com)',
        passcode: 'bcom2026',
        badgeClass: 'bcom',
        hasSections: false,
        sections: ['ONLY'],
        defaultSubject: '',
        subjectsByYearAndSection: {
            'First Year': { 'ONLY': [] },
            'Second Year': { 'ONLY': [] },
            'Third Year': { 'ONLY': [] }
        },
        subjectsByYear: {
            'First Year': [],
            'Second Year': [],
            'Third Year': []
        },
        subjects: [],
        samplePresets: []
    },
    BBA: {
        code: 'BBA',
        name: 'Bachelor of Business Administration (BBA)',
        passcode: 'bba2026',
        badgeClass: 'bba',
        hasSections: false,
        sections: ['ONLY'],
        defaultSubject: '',
        subjectsByYearAndSection: {
            'First Year': { 'ONLY': [] },
            'Second Year': { 'ONLY': [] },
            'Third Year': { 'ONLY': [] }
        },
        subjectsByYear: {
            'First Year': [],
            'Second Year': [],
            'Third Year': []
        },
        subjects: [],
        samplePresets: []
    }
};


// Google Apps Script Webhook Endpoints
const EVENING_GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwAIxy5c3izKOlTA3xIm-ibo-6qdXcCoPpMELflaLyT3O9XdfDtozRd2pv4iwppiwrT/exec';

const STREAM_WEBHOOK_URLS = {
    BCA: EVENING_GOOGLE_SCRIPT_URL,
    BCOM: EVENING_GOOGLE_SCRIPT_URL,
    BBA: EVENING_GOOGLE_SCRIPT_URL
};

const DEFAULT_GOOGLE_SCRIPT_URL = EVENING_GOOGLE_SCRIPT_URL;

function getWebhookUrl(deptCode) {
    const dept = deptCode || currentDept;
    if (STREAM_WEBHOOK_URLS && STREAM_WEBHOOK_URLS[dept] && !STREAM_WEBHOOK_URLS[dept].includes('YOUR_')) {
        return STREAM_WEBHOOK_URLS[dept];
    }
    return DEFAULT_GOOGLE_SCRIPT_URL;
}

/** Session auth sent with every sheet request (validated by Apps Script). */
function getAuthPayload() {
    let pass = '';
    try { pass = sessionStorage.getItem('mgmec_auth_pass') || ''; } catch (e) {}
    if (!pass) {
        try {
            pass = localStorage.getItem('mgmec_session_pass') ||
                localStorage.getItem('mgmec_remember_pass') || '';
            if (pass) sessionStorage.setItem('mgmec_auth_pass', pass);
        } catch (e) {}
    }
    return {
        authPasscode: pass,
        authRole: localStorage.getItem('mgmec_role') || currentRole || 'TEACHER',
        authStream: localStorage.getItem('mgmec_auth_stream') || currentDept || 'BCA'
    };
}

function setAuthSession(passcode, role, deptCode, remember) {
    const pass = (passcode || '').trim();
    try { sessionStorage.setItem('mgmec_auth_pass', pass); } catch (e) {}
    try { localStorage.setItem('mgmec_session_pass', pass); } catch (e) {}
    try { localStorage.setItem('mgmec_is_logged_in', 'true'); } catch (e) {}
    if (deptCode) {
        try { localStorage.setItem('mgmec_auth_stream', deptCode); } catch (e) {}
        try { localStorage.setItem('mgmec_dept', deptCode); } catch (e) {}
        currentDept = deptCode;
    }
    if (remember) {
        try { localStorage.setItem('mgmec_remember_pass', pass); } catch (e) {}
        try { localStorage.setItem('mgmec_remember_checked', '1'); } catch (e) {}
    } else {
        try { localStorage.removeItem('mgmec_remember_pass'); } catch (e) {}
        try { localStorage.removeItem('mgmec_remember_checked'); } catch (e) {}
    }
    if (role) {
        currentRole = role;
        localStorage.setItem('mgmec_role', role);
    }
}

function clearAuthSession() {
    try { sessionStorage.removeItem('mgmec_auth_pass'); } catch (e) {}
    try { localStorage.removeItem('mgmec_session_pass'); } catch (e) {}
    try { localStorage.removeItem('mgmec_remember_pass'); } catch (e) {}
    try { localStorage.removeItem('mgmec_auth_stream'); } catch (e) {}
    try { localStorage.removeItem('mgmec_is_logged_in'); } catch (e) {}
    try { localStorage.removeItem('mgmec_dept'); } catch (e) {}
}

function restoreAuthSessionFromRemember() {
    try {
        const remembered = localStorage.getItem('mgmec_session_pass') ||
            localStorage.getItem('mgmec_remember_pass') || '';
        if (remembered) sessionStorage.setItem('mgmec_auth_pass', remembered);
    } catch (e) {}
}

/** Keep local offline fallback in sync after a successful server login. */
function syncLocalPasscodeFromLogin(deptCode, role, passcode) {
    const pass = (passcode || '').trim();
    if (!pass || !deptCode) return;
    try {
        const raw = JSON.parse(localStorage.getItem('mgmec_custom_passcodes') || '{}');
        if (role === 'ADMIN') {
            raw.ADMIN = pass;
        } else if (role === 'HOD') {
            raw['hod' + deptCode] = pass;
        } else if (role === 'TEACHER') {
            raw['teacher' + deptCode] = pass;
        }
        localStorage.setItem('mgmec_custom_passcodes', JSON.stringify(raw));
    } catch (e) {}
}

function withAuth(payload) {
    return Object.assign({}, payload || {}, getAuthPayload());
}

function appendAuthToParams(params) {
    const auth = getAuthPayload();
    params.set('authPasscode', auth.authPasscode || '');
    params.set('authRole', auth.authRole || '');
    params.set('authStream', auth.authStream || '');
    return params;
}

/** Confirm login passcode against Apps Script (local fallback only when offline). */
function authenticateWithServer(deptCode, passcode) {
    return new Promise((resolve) => {
        const targetUrl = getWebhookUrl(deptCode);
        const pass = String(passcode || '').trim();
        const stream = deptCode || currentDept || 'BCA';

        const tryLocalFallback = (reason) => {
            try {
                const store = getPasscodeStore();
                const pClean = pass.toLowerCase().replace(/[\s\.\-_]/g, '');
                const teacherPass = String((store.teacher && store.teacher[stream]) || (DEPT_CONFIG[stream] && DEPT_CONFIG[stream].passcode) || '').toLowerCase().replace(/[\s\.\-_]/g, '');
                const hodPass = String((store.hod && store.hod[stream]) || '').toLowerCase().replace(/[\s\.\-_]/g, '');
                const adminPass = String(store.ADMIN || 'admin2026').toLowerCase().replace(/[\s\.\-_]/g, '');
                if (pass && pClean === teacherPass) {
                    return { ok: true, role: 'TEACHER', stream: stream, offline: true, message: reason || 'offline' };
                }
                if (pass && pClean === hodPass) {
                    return { ok: true, role: 'TEACHER', stream: stream, offline: true, message: reason || 'offline' };
                }
                if (pass && (pClean === adminPass || pClean === 'admin')) {
                    return { ok: true, role: 'ADMIN', stream: stream, offline: true, message: reason || 'offline' };
                }
                // Try other streams
                const depts = ['BCA', 'BCOM', 'BBA'];
                for (let i = 0; i < depts.length; i++) {
                    const d = depts[i];
                    if (d === stream) continue;
                    const dTeacher = String((store.teacher && store.teacher[d]) || (DEPT_CONFIG[d] && DEPT_CONFIG[d].passcode) || '').toLowerCase().replace(/[\s\.\-_]/g, '');
                    const dHod = String((store.hod && store.hod[d]) || '').toLowerCase().replace(/[\s\.\-_]/g, '');
                    if (pClean === dTeacher || pClean === dHod) {
                        return { ok: true, role: 'TEACHER', stream: d, matchedOtherStream: true, offline: true, message: reason || 'offline' };
                    }
                }
            } catch (e) {}
            return { ok: false, offline: true, message: 'Invalid passcode (offline)' };
        };

        if (!pass) {
            resolve({ ok: false, offline: false, message: 'Enter stream PIN' });
            return;
        }

        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            resolve(tryLocalFallback('offline'));
            return;
        }

        const cbName = 'mgmAuthCb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
        let scriptEl = null;
        let done = false;

        const finish = (result) => {
            if (done) return;
            done = true;
            clearTimeout(timeout);
            try { delete window[cbName]; } catch (e) {}
            if (scriptEl && scriptEl.parentNode) {
                try { scriptEl.parentNode.removeChild(scriptEl); } catch (e) {}
            }
            resolve(result);
        };

        const timeout = setTimeout(() => {
            if (navigator.onLine) {
                finish({
                    ok: false,
                    offline: false,
                    slow: true,
                    message: 'Server is slow or busy. Please tap Login again.'
                });
            } else {
                finish(tryLocalFallback('offline'));
            }
        }, 5000);

        window[cbName] = function (data) {
            if (data && data.result === 'success') {
                let role = data.role || 'TEACHER';
                if (role === 'HOD') role = 'TEACHER';
                finish({
                    ok: true,
                    role: role,
                    stream: data.stream || stream,
                    matchedOtherStream: !!data.matchedOtherStream,
                    offline: false
                });
            } else {
                finish({
                    ok: false,
                    offline: false,
                    message: (data && (data.message || data.error)) || 'Invalid passcode'
                });
            }
        };

        const params = new URLSearchParams({
            action: 'auth',
            stream: stream,
            authPasscode: pass,
            authStream: stream,
            callback: cbName
        });

        scriptEl = document.createElement('script');
        scriptEl.src = targetUrl + (targetUrl.indexOf('?') >= 0 ? '&' : '?') + params.toString();
        scriptEl.onerror = function () {
            if (navigator.onLine) {
                finish({
                    ok: false,
                    offline: false,
                    slow: true,
                    message: 'Could not reach login server. Check Wi‑Fi and tap Login again.'
                });
            } else {
                finish(tryLocalFallback('offline'));
            }
        };
        document.body.appendChild(scriptEl);
    });
}

function verifyAttendanceOnSheet(payload) {
    return checkSheetSlotConflict(
        payload.date,
        payload.year,
        payload.section,
        payload.slot,
        payload.subject
    ).then((check) => {
        if (!check || check.offline) return { verified: false, offline: true };
        if (!check.exists) return { verified: false, offline: false };
        const sheetRolls = normalizeRollNumbers(check.rollNumbers).map(String).sort().join(',');
        const localRolls = normalizeRollNumbers(payload.rollNumbers).map(String).sort().join(',');
        const subjectOk = !check.subject ||
            String(check.subject).trim().toLowerCase() === String(payload.subject || '').trim().toLowerCase();
        return { verified: subjectOk && sheetRolls === localRolls, offline: false };
    }).catch(() => ({ verified: false, offline: true }));
}

function submitViaHiddenForm(url, payload) {
    return new Promise((resolve) => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            resolve(false);
            return;
        }
        try {
            let iframe = document.getElementById('gas_hidden_iframe');
            if (!iframe) {
                iframe = document.createElement('iframe');
                iframe.id = 'gas_hidden_iframe';
                iframe.name = 'gas_hidden_iframe';
                iframe.style.display = 'none';
                document.body.appendChild(iframe);
            }

            let form = document.createElement('form');
            form.method = 'POST';
            form.action = url;
            form.target = 'gas_hidden_iframe';
            form.style.display = 'none';

            let input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'postData';
            input.value = JSON.stringify(payload);
            form.appendChild(input);

            document.body.appendChild(form);
            form.submit();

            setTimeout(() => {
                try { document.body.removeChild(form); } catch (e) {}
                resolve(typeof navigator !== 'undefined' ? navigator.onLine !== false : true);
            }, 1200);
        } catch (e) {
            console.warn('Hidden form submission fallback failed:', e);
            resolve(false);
        }
    });
}

// Dual-Engine Webhook Transmitter (fetch POST + hidden HTML form fallback for mobile browsers)
async function postWithRetry(url, payload, maxRetries = 2) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('Offline: Device has no active internet connection.');
    }
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            throw new Error('Offline: Device has no active internet connection.');
        }
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            await fetch(url, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return true;
        } catch (err) {
            lastError = err;
            console.warn(`Webhook POST fetch attempt ${attempt + 1} failed:`, err);
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                throw new Error('Offline: Device has no active internet connection.');
            }
            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            }
        }
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('Offline: Device has no active internet connection.');
    }

    // Fallback 1: Beacon
    try {
        if (typeof navigator !== 'undefined' && navigator.sendBeacon && navigator.onLine) {
            const blob = new Blob([JSON.stringify(payload)], { type: 'text/plain;charset=utf-8' });
            if (navigator.sendBeacon(url, blob)) return true;
        }
    } catch (e) {
        console.warn('Beacon fallback failed:', e);
    }

    // Fallback 2: Hidden Form Submit (Bypasses mobile CORS redirect restrictions when online)
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        console.log('[Dual-Engine] Executing Hidden Form POST fallback to guarantee Google Sheet delivery...');
        const formSuccess = await submitViaHiddenForm(url, payload);
        if (formSuccess) return true;
    }

    throw lastError || new Error('Network error after retries (Device offline or server unreachable)');
}

// State Management
let currentDept = 'BCA';
let currentRole = 'ADMIN';
let isHODAuthenticated = false;
let currentHODData = null;
let currentHODYearFilter = 'ALL';
let pendingHODTabSwitch = false;

let isListening = false;
let recognition = null;
let currentTranscript = '';
let interimTranscript = '';
let parsedData = null;
let animationFrameId = null;

// Department Login DOM Elements
const deptLoginModal = document.getElementById('deptLoginModal');
const deptLoginForm = document.getElementById('deptLoginForm');
const deptPasscode = document.getElementById('deptPasscode');
const togglePassBtn = document.getElementById('togglePassBtn');
const loginAlertBox = document.getElementById('loginAlertBox');
const deptSubtitle = document.getElementById('deptSubtitle');
const activeDeptBadge = document.getElementById('activeDeptBadge');
const activeDeptText = document.getElementById('activeDeptText');
const rememberDeptCheck = document.getElementById('rememberDeptCheck');

// Mode Switcher Elements
const voiceModeTab = document.getElementById('voiceModeTab');
const typingModeTab = document.getElementById('typingModeTab');
const hodModeTab = document.getElementById('hodModeTab');
const voiceSection = document.getElementById('voiceSection');
const typingSection = document.getElementById('typingSection');
const hodSection = document.getElementById('hodSection');

// Voice DOM Elements
const micBtn = document.getElementById('micBtn');
const micWrapper = document.getElementById('micWrapper');
const micBtnLabel = document.getElementById('micBtnLabel');
const statusPill = document.getElementById('statusPill');
const statusText = document.getElementById('statusText');
const todayBadge = document.getElementById('todayBadge');
const transcriptText = document.getElementById('transcriptText');
const clearTranscriptBtn = document.getElementById('clearTranscriptBtn');
const processBtn = document.getElementById('processBtn');
const canvas = document.getElementById('audioVisualizer');
const canvasCtx = canvas ? canvas.getContext('2d') : null;

// Manual Typing DOM Elements
const manualTextInput = document.getElementById('manualTextInput');
const clearManualTextBtn = document.getElementById('clearManualTextBtn');
const parseTypedTextBtn = document.getElementById('parseTypedTextBtn');
const directDateInput = document.getElementById('directDateInput');
const directRollInput = document.getElementById('directRollInput');
const directYearSelect = document.getElementById('directYearSelect');
const directSectionSelect = document.getElementById('directSectionSelect');
const directSubjectInput = document.getElementById('directSubjectInput');
const directSlotSelect = document.getElementById('directSlotSelect');
const directSubmitBtn = document.getElementById('directSubmitBtn');
const directSubmitBtnText = document.getElementById('directSubmitBtnText');
const directSubmitSpinner = document.getElementById('directSubmitSpinner');
const directResetBtn = document.getElementById('directResetBtn');

// Modal & Alert Elements
const confirmationModal = document.getElementById('confirmationModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelBtn = document.getElementById('cancelBtn');
const deleteBtn = document.getElementById('deleteBtn');
const submitBtn = document.getElementById('submitBtn');
const submitBtnText = document.getElementById('submitBtnText');
const submitSpinner = document.getElementById('submitSpinner');
const dateInput = document.getElementById('dateInput');
const rollNumbersInput = document.getElementById('rollNumbersInput');
const yearSelect = document.getElementById('yearSelect');
const sectionSelect = document.getElementById('sectionSelect');
const subjectInput = document.getElementById('subjectInput');
const slotSelect = document.getElementById('slotSelect');
const modalAlertBox = document.getElementById('modalAlertBox');
const directAlertBox = document.getElementById('directAlertBox');

function normalizeRollNumbers(rollInput) {
    if (!rollInput) return [];
    let rawItems = [];
    if (Array.isArray(rollInput)) {
        rawItems = rollInput.map(r => r.toString().trim());
    } else {
        const str = rollInput.toString().trim();
        if (!str || str.toUpperCase() === 'NIL' || str.toUpperCase() === 'NONE') {
            return [];
        }
        rawItems = str.split(/[\s,]+/).map(n => n.trim());
    }
    const cleanItems = rawItems.filter(n => n.length > 0 && n.toUpperCase() !== 'NIL' && n.toUpperCase() !== 'NONE');
    const seen = new Set();
    const result = [];
    cleanItems.forEach(item => {
        if (!seen.has(item)) {
            seen.add(item);
            result.push(item);
        }
    });
    return result;
}

/** localStorage key for roll prefix per stream + year + section */
function rollPrefixStorageKey(stream, year, section) {
    return 'mgmec_roll_prefix_' + String(stream || currentDept || 'BCA') + '_' +
        String(year || '').trim() + '_' + String(section || '').trim();
}

function getStoredRollPrefix(stream, year, section) {
    if (!year || !section) return '';
    try {
        return String(localStorage.getItem(rollPrefixStorageKey(stream, year, section)) || '').trim();
    } catch (e) {
        return '';
    }
}

function setStoredRollPrefix(stream, year, section, prefix) {
    if (!year || !section) return;
    const p = String(prefix || '').trim();
    try {
        const key = rollPrefixStorageKey(stream, year, section);
        if (p) localStorage.setItem(key, p);
        else localStorage.removeItem(key);
    } catch (e) {}
}

/** Longest common prefix of full-looking rolls (for auto-learn). */
function inferRollPrefixFromList(rolls) {
    const list = (rolls || []).map(r => String(r).trim()).filter(r => {
        if (!r) return false;
        return /^(?:[A-Za-z]+)?\d{4,}$/.test(r);
    });
    if (list.length === 0) return '';
    let common = list[0];
    for (let i = 1; i < list.length; i++) {
        const s = list[i];
        let j = 0;
        while (j < common.length && j < s.length && common[j].toUpperCase() === s[j].toUpperCase()) j++;
        common = common.slice(0, j);
        if (!common) return '';
    }
    const m = common.match(/^(.*?)(\d*)$/);
    if (!m) return '';
    let letterPart = m[1] || '';
    let digitPart = m[2] || '';
    while (digitPart.length > 0) {
        const sample = list[0];
        const shortLen = sample.length - (letterPart.length + digitPart.length);
        if (shortLen >= 2) break;
        digitPart = digitPart.slice(0, -1);
    }
    const prefix = letterPart + digitPart;
    const shortLen = list[0].length - prefix.length;
    if (shortLen < 2 || shortLen > 4) {
        const sample = list[0];
        if (sample.length >= 5) return sample.slice(0, sample.length - 3);
        if (sample.length === 4) return sample.slice(0, 2);
        return '';
    }
    return prefix;
}

/**
 * Expand short 1–3 digit tokens with section prefix.
 * Full rolls (4+ digits) and codes like S0105 stay unchanged.
 */
function expandShortRollNumbers(rollInput, prefix) {
    const items = normalizeRollNumbers(rollInput);
    if (items.length === 0) return '';
    const p = String(prefix || '').trim();
    const out = items.map((token) => {
        const t = String(token).trim();
        if (!t) return t;
        if (/^[A-Za-z]+\d+$/.test(t)) return t;
        if (/^\d+$/.test(t)) {
            if (!p) return t;
            if (t.length >= 4) return t;
            return p + t;
        }
        return t;
    });
    const seen = new Set();
    const uniq = [];
    out.forEach((r) => {
        const key = r.toUpperCase();
        if (!seen.has(key)) {
            seen.add(key);
            uniq.push(r);
        }
    });
    return uniq.join(', ');
}

function getActiveRollPrefixFromUI(preferModal) {
    const directEl = document.getElementById('directRollPrefix');
    const modalEl = document.getElementById('modalRollPrefix');
    if (preferModal && modalEl && String(modalEl.value || '').trim()) return String(modalEl.value).trim();
    if (directEl && String(directEl.value || '').trim()) return String(directEl.value).trim();
    if (modalEl && String(modalEl.value || '').trim()) return String(modalEl.value).trim();
    return '';
}

function isConfirmModalActive() {
    return !!(confirmationModal && confirmationModal.classList.contains('active'));
}

/** Load/learn section prefix when editing from Today / All History. */
function prepareRollPrefixForEdit(item) {
    const year = (item && item.year) || (yearSelect && yearSelect.value) || (directYearSelect && directYearSelect.value) || '';
    const sec = (item && item.section) || (sectionSelect && sectionSelect.value) || (directSectionSelect && directSectionSelect.value) || '';
    const stream = (item && item.stream) || currentDept || 'BCA';
    const rollsRaw = (item && item.rollNumbers != null)
        ? item.rollNumbers
        : (rollNumbersInput ? rollNumbersInput.value : '');

    syncRollPrefixFieldsFromStorage();

    const inferred = inferRollPrefixFromList(normalizeRollNumbers(rollsRaw));
    if (inferred) {
        setStoredRollPrefix(stream, year, sec, inferred);
        const dP = document.getElementById('directRollPrefix');
        const mP = document.getElementById('modalRollPrefix');
        if (dP) dP.value = inferred;
        if (mP) mP.value = inferred;
    }

    updateRollExpandPreview(false);
    updateRollExpandPreview(true);

    try {
        if (rollNumbersInput) {
            setTimeout(() => {
                try { rollNumbersInput.focus(); } catch (e2) {}
            }, 80);
        }
    } catch (e) {}
}

function syncRollPrefixFieldsFromStorage() {
    const stream = currentDept || 'BCA';
    const dYear = directYearSelect ? directYearSelect.value : '';
    const dSec = directSectionSelect ? directSectionSelect.value : '';
    const mYear = yearSelect ? yearSelect.value : '';
    const mSec = sectionSelect ? sectionSelect.value : '';
    const directEl = document.getElementById('directRollPrefix');
    const modalEl = document.getElementById('modalRollPrefix');
    if (directEl) {
        if (dYear && dSec) directEl.value = getStoredRollPrefix(stream, dYear, dSec);
        else directEl.value = '';
    }
    if (modalEl) {
        if (mYear && mSec) modalEl.value = getStoredRollPrefix(stream, mYear, mSec);
        else modalEl.value = '';
    }
    updateRollExpandPreview(false);
    updateRollExpandPreview(true);
}

function updateRollExpandPreview(forModal) {
    const rollEl = forModal
        ? document.getElementById('rollNumbersInput')
        : document.getElementById('directRollInput');
    const prefixEl = forModal
        ? document.getElementById('modalRollPrefix')
        : document.getElementById('directRollPrefix');
    const previewEl = forModal
        ? document.getElementById('modalRollExpandPreview')
        : document.getElementById('directRollExpandPreview');
    if (!rollEl || !previewEl) return;

    const raw = String(rollEl.value || '').trim();
    if (!raw || raw.toUpperCase() === 'NIL' || raw.toUpperCase() === 'NONE') {
        previewEl.hidden = true;
        previewEl.textContent = '';
        return;
    }
    const prefix = prefixEl ? String(prefixEl.value || '').trim() : '';
    const expanded = expandShortRollNumbers(raw, prefix);
    if (expanded) {
        previewEl.hidden = false;
        previewEl.textContent = 'Will save: ' + expanded;
    } else {
        previewEl.hidden = true;
        previewEl.textContent = '';
    }
}

/** Expand shorts in an input; persist prefix; return expanded string. */
function applyRollPrefixExpansion(rollRaw, yearVal, sectionVal, options) {
    const opts = options || {};
    const stream = currentDept || 'BCA';
    let prefix = String(opts.prefix != null ? opts.prefix : getActiveRollPrefixFromUI(!!opts.preferModal)).trim();
    if (!prefix) prefix = getStoredRollPrefix(stream, yearVal, sectionVal);

    const expanded = expandShortRollNumbers(rollRaw, prefix);
    const rolls = normalizeRollNumbers(expanded);

    if (rolls.length > 0) {
        const inferred = inferRollPrefixFromList(rolls);
        if (inferred) {
            prefix = inferred;
            setStoredRollPrefix(stream, yearVal, sectionVal, inferred);
            const directEl = document.getElementById('directRollPrefix');
            const modalEl = document.getElementById('modalRollPrefix');
            if (directEl) directEl.value = inferred;
            if (modalEl) modalEl.value = inferred;
        } else if (prefix) {
            setStoredRollPrefix(stream, yearVal, sectionVal, prefix);
        }
    } else if (prefix && yearVal && sectionVal) {
        setStoredRollPrefix(stream, yearVal, sectionVal, prefix);
    }

    return expanded;
}

function computeRollDiff(prevRollInput, newRollInput) {
    const prevRolls = normalizeRollNumbers(prevRollInput);
    const newRolls = normalizeRollNumbers(newRollInput);

    const prevSet = new Set(prevRolls);
    const newSet = new Set(newRolls);

    const addedRolls = newRolls.filter(r => !prevSet.has(r));
    const deletedRolls = prevRolls.filter(r => !newSet.has(r));
    const retainedRolls = newRolls.filter(r => prevSet.has(r));

    return {
        prevRolls,
        newRolls,
        addedRolls,
        deletedRolls,
        retainedRolls
    };
}

function isSectionOverlap(sec1, sec2) {
    const n1 = normalizeSectionCode(sec1);
    const n2 = normalizeSectionCode(sec2);
    if (!n1 || !n2) return false;
    if (n1 === n2) return true;
    if (n1 === 'ALL' || n2 === 'ALL') return true;
    // BCA plain C and C (AIML) are the same class for conflict purposes
    if ((n1 === 'C' && n2 === 'C_AIML') || (n1 === 'C_AIML' && n2 === 'C')) return true;
    return false;
}

function checkDoubleEntryLive(dateVal, yearVal, sectionVal, subjectVal, slotVal, rollVal, alertBoxElem, submitBtnTextElem) {
    if (!alertBoxElem) return null;

    const cleanDate = dateVal || getTodayISOString();
    const cleanSlot = parseInt(slotVal, 10) || 1;
    const cleanSubject = (subjectVal || '').trim();
    const cleanYear = yearVal || 'First Year';
    const cleanStream = currentDept || 'BCA';

    const localHistory = JSON.parse(localStorage.getItem('mgmec_attendance_history') || '[]');
    
    // Find any existing entry for same Date + Stream + Year + Slot with overlapping Section
    const existingEntry = localHistory.find(item => {
        if ((item.stream || 'BCA') !== cleanStream) return false;
        if (item.date !== cleanDate) return false;
        if (item.year !== cleanYear) return false;
        if (parseInt(item.slot, 10) !== cleanSlot) return false;

        const sec1 = item.section || 'A';
        const sec2 = sectionVal || 'A';
        if (!isSectionOverlap(sec1, sec2)) return false;

        const isComb1 = sec1 === 'ALL' || String(sec1).toUpperCase() === 'ALL' || String(sec1).toLowerCase().includes('combin');
        const isComb2 = sec2 === 'ALL' || String(sec2).toUpperCase() === 'ALL' || String(sec2).toLowerCase().includes('combin');

        // If BOTH are Combined AND subjects have DIFFERENT names, they are parallel electives/classes on the same slot (e.g. Kannada & Hindi)!
        if (isComb1 && isComb2 && cleanSubject.length > 0 && (item.subject || '').trim().toLowerCase() !== cleanSubject.toLowerCase()) {
            return false; // Not a conflict!
        }

        return true; // Conflict or Match found!
    });

    if (existingEntry) {
        const sameSubject = cleanSubject.length > 0 &&
            existingEntry.subject.trim().toLowerCase() === cleanSubject.toLowerCase();
        const diff = computeRollDiff(existingEntry.rollNumbers, rollVal);
        const prevStr = diff.prevRolls.length > 0 ? diff.prevRolls.join(', ') : 'NIL';

        alertBoxElem.style.display = 'block';
        alertBoxElem.className = 'alert-banner active';

        if (!sameSubject) {
            const secLabel = existingEntry.section === 'ALL' ? 'Combined (Sec A,B,C)' : `Sec ${existingEntry.section}`;
            alertBoxElem.innerHTML = `
            <div style="display: flex; gap: 10px; align-items: flex-start;">
                <div style="flex: 1; font-size: 0.85rem; line-height: 1.4;">
                    <strong style="color: #fbbf24;">⚠️ Slot already occupied (${secLabel})</strong><br>
                    ${escapeHTML(cleanDate)} · ${escapeHTML(cleanYear)} · Slot ${cleanSlot}<br>
                    Existing entry: <strong>${escapeHTML(existingEntry.subject)}</strong> (${secLabel}) — Absentees: <strong>${escapeHTML(prevStr)}</strong><br>
                    <span style="opacity: 0.9;">Submitting will update/replace this slot.</span>
                </div>
            </div>`;
            if (submitBtnTextElem) submitBtnTextElem.textContent = 'Replace Existing Entry';
        } else {
            const addedStr = diff.addedRolls.length > 0 ? diff.addedRolls.join(', ') : 'None';
            const deletedStr = diff.deletedRolls.length > 0 ? diff.deletedRolls.join(', ') : 'None';
            const retainedStr = diff.retainedRolls.length > 0 ? diff.retainedRolls.join(', ') : 'None';
            alertBoxElem.innerHTML = `
            <div style="display: flex; gap: 10px; align-items: flex-start;">
                <div style="flex: 1; font-size: 0.85rem; line-height: 1.4;">
                    <strong style="color: #fbbf24;">ℹ️ Entry already exists for ${escapeHTML(existingEntry.subject)} (Slot ${cleanSlot})</strong><br>
                    Previous Teacher Entry: <strong>${escapeHTML(prevStr)}</strong><br>
                    <span style="opacity: 0.9;">Submitting will merge absentees from both teachers so no data is lost.</span>
                    <div style="margin-top: 6px; padding: 6px 8px; background: rgba(0,0,0,0.25); border-radius: 6px; display: flex; flex-wrap: wrap; gap: 8px;">
                        <span style="color: #34d399;"><strong>+ Added:</strong> ${escapeHTML(addedStr)}</span>
                        <span style="color: #a7f3d0;"><strong>Unchanged:</strong> ${escapeHTML(retainedStr)}</span>
                    </div>
                </div>
            </div>`;
            if (submitBtnTextElem) submitBtnTextElem.textContent = 'Merge & Save Attendance';
        }
        return existingEntry;
    }

    alertBoxElem.style.display = 'none';
    alertBoxElem.innerHTML = '';
    if (submitBtnTextElem) submitBtnTextElem.textContent = 'Submit Absentee';
    return null;
}

/**
 * Ask the Google Sheet if this Date+Year+Section+Slot already exists (works across teachers' phones).
 * Uses JSONP to avoid CORS limits on Apps Script.
 */
function checkSheetSlotConflict(dateVal, yearVal, sectionVal, slotVal, subjectVal) {
    return new Promise((resolve) => {
        const cbName = 'mgmConflictCb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
        let scriptEl = null;
        const timeout = setTimeout(() => {
            cleanup();
            resolve({ exists: false, offline: true });
        }, 6000);

        function cleanup() {
            clearTimeout(timeout);
            try { delete window[cbName]; } catch (e) {}
            if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
        }

        window[cbName] = function (data) {
            cleanup();
            resolve(data || { exists: false });
        };

        const params = new URLSearchParams({
            action: 'check',
            date: dateVal || getTodayISOString(),
            stream: currentDept,
            year: yearVal || '',
            section: sectionVal || '',
            slot: String(slotVal || 1),
            subject: subjectVal || '',
            callback: cbName
        });
        appendAuthToParams(params);

        const targetUrl = getWebhookUrl(currentDept);
        scriptEl = document.createElement('script');
        scriptEl.src = targetUrl + (targetUrl.indexOf('?') >= 0 ? '&' : '?') + params.toString();
        scriptEl.onerror = function () {
            cleanup();
            resolve({ exists: false, offline: true });
        };
        document.body.appendChild(scriptEl);
    });
}

function updateModalDoubleEntryCheck() {
    checkDoubleEntryLive(
        dateInput.value,
        yearSelect.value,
        sectionSelect.value,
        subjectInput.value,
        slotSelect.value,
        rollNumbersInput.value,
        modalAlertBox,
        submitBtnText
    );
}

function updateDirectDoubleEntryCheck() {
    checkDoubleEntryLive(
        directDateInput.value,
        directYearSelect.value,
        directSectionSelect.value,
        directSubjectInput.value,
        directSlotSelect.value,
        directRollInput.value,
        directAlertBox,
        directSubmitBtnText
    );
}

// Toast & History Elements
const successToast = document.getElementById('successToast');
const toastSubtext = document.getElementById('toastSubtext');
const historyBtn = document.getElementById('historyBtn');
const historyDrawer = document.getElementById('historyDrawer');
const closeHistoryBtn = document.getElementById('closeHistoryBtn');
const historyList = document.getElementById('historyList');
const themeToggle = document.getElementById('themeToggle');

// Helper to get Today ISO string YYYY-MM-DD
function getTodayISOString() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}


function wipeHODPortalState() {
    currentHODData = null;

    const container = document.getElementById('hodSectionCardsContainer');
    if (container) {
        container.innerHTML = `
            <div class="hod-empty-state">
                <div style="font-size: 2.5rem; margin-bottom: 8px;">📊</div>
                <p style="font-size: 0.88rem; color: var(--text-muted); font-weight: 500;">Select date and click <strong>"Fetch Absentees"</strong> to generate section report.</p>
            </div>`;
    }

    const globalShareContainer = document.getElementById('hodGlobalShareContainer');
    if (globalShareContainer) {
        globalShareContainer.style.display = 'none';
    }

    const hodStatusMessage = document.getElementById('hodStatusMessage');
    if (hodStatusMessage) {
        hodStatusMessage.style.display = 'none';
        hodStatusMessage.innerHTML = '';
    }
}

function cancelHODLoginAndReturnToLogger() {
    pendingHODTabSwitch = false;
    const deptLoginModal = document.getElementById('deptLoginModal');
    const cancelBtn = document.getElementById('cancelHODLoginBtn');
    if (deptLoginModal) deptLoginModal.classList.remove('active');
    if (cancelBtn) cancelBtn.style.display = 'none';
    switchMode('typing');
}

// 1. Mode Switcher Handler
function switchMode(mode) {
    const cancelBtn = document.getElementById('cancelHODLoginBtn');
    if (mode === 'voice' || mode === 'typing') {
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (typingModeTab) typingModeTab.classList.add('active');
        if (voiceModeTab) voiceModeTab.classList.remove('active');
        if (hodModeTab) hodModeTab.classList.remove('active');
        if (typingSection) typingSection.style.display = 'flex';
        if (voiceSection) voiceSection.style.display = 'none';
        if (hodSection) hodSection.style.display = 'none';
        if (isListening) stopListening();
        wipeHODPortalState();
    } else if (mode === 'hod') {
        if (cancelBtn) cancelBtn.style.display = 'none';
        isHODAuthenticated = true;

        if (hodModeTab) hodModeTab.classList.add('active');
        if (voiceModeTab) voiceModeTab.classList.remove('active');
        if (typingModeTab) typingModeTab.classList.remove('active');
        if (hodSection) hodSection.style.display = 'block';
        if (voiceSection) voiceSection.style.display = 'none';
        if (typingSection) typingSection.style.display = 'none';
        if (isListening) stopListening();

        const hodDatePicker = document.getElementById('hodDatePicker');
        if (hodDatePicker && !hodDatePicker.value) hodDatePicker.value = getTodayISOString();
        applyRoleUI();
        fetchHODAbsentees();
    }
}

// 2. Initialize Web Speech Recognition
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        updateStatus('Speech API unavailable. Manual typing mode fully supported.', 'error');
        return false;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        isListening = true;
        micWrapper.classList.add('active');
        statusPill.className = 'status-pill listening';
        statusText.textContent = 'Listening... Speak now';
        micBtnLabel.textContent = 'Stop';
        startVisualizer();
    };

    recognition.onresult = (event) => {
        interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                currentTranscript += ' ' + event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }
        renderTranscript();
    };

    recognition.onerror = (event) => {
        console.error('Speech error:', event.error);
        if (event.error !== 'no-speech') {
            updateStatus(`Speech Error: ${event.error}`, 'error');
        }
        stopListening();
    };

    recognition.onend = () => {
        if (isListening) stopListening();
    };

    return true;
}

function toggleListening() {
    if (!recognition && !initSpeechRecognition()) {
        alert('Voice recognition is not supported in this browser environment. Switching to Manual Typing mode.');
        switchMode('typing');
        return;
    }

    if (isListening) {
        stopListening();
    } else {
        try {
            recognition.start();
        } catch (err) {
            console.error('Start recognition error:', err);
            stopListening();
        }
    }
}

function stopListening() {
    isListening = false;
    if (recognition) {
        try { recognition.stop(); } catch (e) {}
    }
    micWrapper.classList.remove('active');
    statusPill.className = 'status-pill';
    statusText.textContent = 'Tap microphone to speak';
    micBtnLabel.textContent = 'Tap to Speak';
    stopVisualizer();

    if (currentTranscript.trim().length > 0) {
        autoProcessSpeech(currentTranscript);
    }
}

function renderTranscript() {
    if (!transcriptText) return;
    const fullText = (currentTranscript + ' ' + interimTranscript).trim();
    if (!fullText) {
        transcriptText.innerHTML = `<span class="transcript-placeholder">Spoken words will appear here in real-time...</span>`;
        if (processBtn) processBtn.disabled = true;
    } else {
        transcriptText.innerHTML = `
            <span>${escapeHTML(currentTranscript)}</span>
            <span class="interim-text">${escapeHTML(interimTranscript)}</span>
        `;
        if (processBtn) processBtn.disabled = false;
    }
}

function clearTranscript() {
    currentTranscript = '';
    interimTranscript = '';
    parsedData = null;
    renderTranscript();
    if (statusPill) statusPill.className = 'status-pill';
    if (statusText) statusText.textContent = 'Tap microphone to speak';
}

// 3. Parser Trigger & Synchronization
function autoProcessSpeech(text) {
    const textToParse = (text || currentTranscript + ' ' + interimTranscript).trim();
    if (!textToParse) return;

    const deptConfig = DEPT_CONFIG[currentDept] || DEPT_CONFIG.BCA;
    parsedData = parseAttendanceSpeech(textToParse, currentDept);
    if (!parsedData.subject) parsedData.subject = deptConfig.defaultSubject;
    console.log('Parsed Attendance Data:', parsedData);

    const todayStr = parsedData.date || getTodayISOString();

    const directDurationSelect = document.getElementById('directDurationSelect');
    const durationSelect = document.getElementById('durationSelect');
    const calculatedDur = (parsedData.endSlot && parsedData.endSlot > parsedData.slot) 
        ? Math.min(4, parsedData.endSlot - parsedData.slot + 1) 
        : 1;

    if (directDurationSelect) directDurationSelect.value = String(calculatedDur);
    if (durationSelect) durationSelect.value = String(calculatedDur);

    // Sync values into direct form
    directDateInput.value = todayStr;
    directRollInput.value = Array.isArray(parsedData.rollNumbers) ? parsedData.rollNumbers.join(', ') : parsedData.rollNumbers;
    directYearSelect.value = parsedData.year || 'First Year';
    directSectionSelect.value = parsedData.section || 'A';
    setSubjectValue(directSubjectInput, parsedData.subject || deptConfig.defaultSubject);
    directSlotSelect.value = parsedData.slot ? parsedData.slot.toString() : '1';
    checkLanguageElectiveAutoCombined(directSubjectInput.value, directSectionSelect, directYearSelect);

    const directMultiSlotWrapper = document.getElementById('directMultiSlotContainer');
    const directMultiSlotBreakdown = document.getElementById('directMultiSlotBreakdown');
    handleMultiSlotVisibility(directDurationSelect, directSlotSelect, directRollInput, directMultiSlotWrapper, directMultiSlotBreakdown);

    // Open Confirmation Modal Form
    openConfirmationModal(parsedData);
}

function handleTypedTextParse() {
    if (!manualTextInput) return;
    const typedText = manualTextInput.value.trim();
    if (!typedText) {
        alert('Please enter or paste attendance text to parse.');
        if (manualTextInput.focus) manualTextInput.focus();
        return;
    }
    autoProcessSpeech(typedText);
}

function openConfirmationModal(data) {
    if (!data) return;

    const deptConfig = DEPT_CONFIG[currentDept] || DEPT_CONFIG.BCA;

    dateInput.value = data.date || getTodayISOString();
    rollNumbersInput.value = Array.isArray(data.rollNumbers) ? data.rollNumbers.join(', ') : data.rollNumbers;
    yearSelect.value = data.year || 'First Year';
    sectionSelect.value = data.section || 'A';
    setSubjectValue(subjectInput, data.subject || deptConfig.defaultSubject);
    slotSelect.value = data.slot ? data.slot.toString() : '1';

    const durationSelect = document.getElementById('durationSelect');
    const modalMultiSlotWrapper = document.getElementById('modalMultiSlotContainer');
    const modalMultiSlotBreakdown = document.getElementById('modalMultiSlotBreakdown');
    const calculatedDur = (data.endSlot && data.endSlot > data.slot) ? Math.min(4, data.endSlot - data.slot + 1) : 1;
    if (durationSelect) durationSelect.value = String(calculatedDur);

    handleMultiSlotVisibility(durationSelect, slotSelect, rollNumbersInput, modalMultiSlotWrapper, modalMultiSlotBreakdown);

    updateModalDoubleEntryCheck();
    if (confirmationModal) confirmationModal.classList.add('active');
}

function closeConfirmationModal() {
    if (confirmationModal) confirmationModal.classList.remove('active');
    if (deleteBtn) deleteBtn.style.display = 'none';
    if (modalAlertBox) modalAlertBox.style.display = 'none';
    if (statusPill) statusPill.className = 'status-pill';
    if (statusText) statusText.textContent = 'Tap microphone to speak';
}

function showSlotConflictDialog(params) {
    return new Promise((resolve) => {
        const prevRollsArr = normalizeRollNumbers(params.existingRolls);
        const newRollsArr = normalizeRollNumbers(params.newRolls);
        const mergedRollsArr = Array.from(new Set([...prevRollsArr, ...newRollsArr])).sort((a, b) => a - b);
        const mergedStr = mergedRollsArr.length > 0 ? mergedRollsArr.join(', ') : 'NIL';

        const oldModal = document.getElementById('slotConflictModalDialog');
        if (oldModal && oldModal.parentNode) oldModal.parentNode.removeChild(oldModal);

        document.body.style.overflow = 'hidden';

        const dialog = document.createElement('div');
        dialog.id = 'slotConflictModalDialog';
        dialog.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100vw; height: 100vh; z-index: 9999999; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.88); padding: 16px; box-sizing: border-box; overflow-y: auto;';

        dialog.innerHTML = `
            <div class="modal-card" style="max-width: 480px; width: 100%; padding: 20px; border: 2px solid #eab308; background: #0f172a; color: #ffffff; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.9); box-sizing: border-box;">
                
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid #334155;">
                    <h3 style="margin: 0; font-size: 1.15rem; color: #f59e0b; font-weight: 800; display: flex; align-items: center; gap: 8px;">
                        ⚠️ Slot Entry Conflict (Slot ${escapeHTML(String(params.slot))})
                    </h3>
                </div>

                <div style="font-size: 0.88rem; line-height: 1.5; margin-bottom: 14px; color: #cbd5e1;">
                    An entry already exists for <strong>Slot ${escapeHTML(String(params.slot))}</strong> on <strong>${escapeHTML(params.date)}</strong> (${escapeHTML(params.year)} Sec ${escapeHTML(params.section)}).
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px;">
                    <div style="background: #1e293b; padding: 12px; border-radius: 10px; border-left: 4px solid #ef4444;">
                        <div style="font-weight: 700; color: #fca5a5; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.5px;">Previous Teacher / Slot Entry:</div>
                        <div style="font-size: 0.9rem; color: #ffffff; margin-top: 2px;">Subject: <strong>${escapeHTML(params.existingSubj || params.subject)}</strong></div>
                        <div style="font-size: 0.9rem; color: #f87171; font-weight: 700; margin-top: 2px;">Absentees: ${escapeHTML(params.existingRolls || 'NIL')}</div>
                    </div>

                    <div style="background: #1e293b; padding: 12px; border-radius: 10px; border-left: 4px solid #3b82f6;">
                        <div style="font-weight: 700; color: #93c5fd; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.5px;">Your Current Entry:</div>
                        <div style="font-size: 0.9rem; color: #ffffff; margin-top: 2px;">Subject: <strong>${escapeHTML(params.subject)}</strong></div>
                        <div style="font-size: 0.9rem; color: #60a5fa; font-weight: 700; margin-top: 2px;">Absentees: ${escapeHTML(params.newRolls || 'NIL')}</div>
                    </div>
                </div>

                <div style="background: #064e3b; border: 1px solid #10b981; padding: 12px; border-radius: 10px; margin-bottom: 16px; color: #ecfdf5;">
                    <div style="font-weight: 800; color: #34d399; font-size: 0.85rem; text-transform: uppercase;">🔀 Combined Result if Merged:</div>
                    <div style="font-size: 1rem; font-weight: 800; color: #6ee7b7; margin-top: 4px; word-break: break-word;">${escapeHTML(mergedStr)}</div>
                    <div style="font-size: 0.78rem; color: #a7f3d0; margin-top: 2px;">Total absentees combined: ${mergedRollsArr.length} students</div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button type="button" id="conflictMergeBtn" style="background: #059669; color: #ffffff; border: none; font-weight: 800; padding: 14px; font-size: 0.95rem; border-radius: 10px; cursor: pointer; width: 100%; min-height: 48px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3); touch-action: manipulation;">
                        🔀 MERGE BOTH ENTRIES (${mergedRollsArr.length} Absentees)
                    </button>
                    <button type="button" id="conflictReplaceBtn" style="background: #991b1b; color: #ffffff; border: none; font-weight: 700; padding: 12px; font-size: 0.88rem; border-radius: 10px; cursor: pointer; width: 100%; min-height: 44px; touch-action: manipulation;">
                        ✏️ Overwrite / Replace with My List Only
                    </button>
                    <button type="button" id="conflictCancelBtn" style="background: #334155; color: #cbd5e1; border: none; font-weight: 600; padding: 10px; font-size: 0.84rem; border-radius: 10px; cursor: pointer; width: 100%; min-height: 40px; touch-action: manipulation;">
                        ❌ Cancel Submission
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        const card = dialog.querySelector('.modal-card');
        if (card && card.scrollIntoView) {
            card.scrollIntoView({ block: 'center', behavior: 'instant' });
        }

        const cleanup = (choice) => {
            document.body.style.overflow = '';
            if (dialog && dialog.parentNode) {
                dialog.parentNode.removeChild(dialog);
            }
            resolve(choice);
        };

        const mBtn = dialog.querySelector('#conflictMergeBtn');
        const rBtn = dialog.querySelector('#conflictReplaceBtn');
        const cBtn = dialog.querySelector('#conflictCancelBtn');

        if (mBtn) mBtn.addEventListener('click', (e) => { e.preventDefault(); cleanup({ action: 'merge', mergedRolls: mergedStr, mergedArr: mergedRollsArr }); });
        if (rBtn) rBtn.addEventListener('click', (e) => { e.preventDefault(); cleanup({ action: 'replace', mergedRolls: params.newRolls, mergedArr: newRollsArr }); });
        if (cBtn) cBtn.addEventListener('click', (e) => { e.preventDefault(); cleanup({ action: 'cancel' }); });
    });
}

async function submitData(dateVal, rollNumbersRaw, yearVal, sectionVal, subjectVal, slotVal, btnElem, textElem, spinnerElem) {
    const cleanDate = dateVal || getTodayISOString();
    const cleanYear = String(yearVal || '').trim();
    if (!cleanYear) {
        alert('Please select a Year before submitting.');
        return { status: 'cancelled' };
    }
    yearVal = cleanYear;

    if (!String(sectionVal || '').trim()) {
        alert('Please select a Section before submitting.');
        return { status: 'cancelled' };
    }

    const parsedSlot = parseInt(slotVal, 10);
    if (!slotVal || isNaN(parsedSlot) || parsedSlot < 1) {
        alert('Please select a Slot before submitting.');
        return { status: 'cancelled' };
    }

    const cleanSlot = parsedSlot;
    let cleanSubject = (subjectVal || '').trim();
    let cleanSection = sectionVal;

    if (!cleanSubject) {
        alert('Please select a Subject before submitting.');
        return { status: 'cancelled' };
    }

    // Language / elective subjects are combined across sections
    if (isElectiveOrLanguageSubject(cleanSubject)) {
        cleanSection = 'ALL';
    }

    // Expand short 2–3 digit rolls with section prefix → sheet always gets full rolls
    // Today Edit uses confirm modal — prefer that modal's prefix field
    const useModalPrefix = isConfirmModalActive();
    const expandedRollsRaw = applyRollPrefixExpansion(rollNumbersRaw, yearVal, cleanSection, { preferModal: useModalPrefix });
    if (directRollInput && String(rollNumbersRaw || '') === String(directRollInput.value || '')) {
        try { if (expandedRollsRaw) directRollInput.value = expandedRollsRaw; } catch (e) {}
    }
    if (rollNumbersInput && String(rollNumbersRaw || '') === String(rollNumbersInput.value || '')) {
        try { if (expandedRollsRaw) rollNumbersInput.value = expandedRollsRaw; } catch (e) {}
    }

    const rollNumbersArray = normalizeRollNumbers(expandedRollsRaw);
    let formattedRolls = rollNumbersArray.length > 0 ? rollNumbersArray.join(', ') : 'NIL';

    // Local Storage conflict check (Instant 0ms)
    const history = JSON.parse(localStorage.getItem('mgmec_attendance_history') || '[]');
    const cleanStream = currentDept || 'BCA';
    const existingEntry = history.find(item => {
        if ((item.stream || 'BCA') !== cleanStream) return false;
        if (item.date !== cleanDate) return false;
        if (item.year !== yearVal) return false;
        if (parseInt(item.slot, 10) !== cleanSlot) return false;

        const sec1 = item.section || 'A';
        const sec2 = cleanSection || 'A';
        if (!isSectionOverlap(sec1, sec2)) return false;

        const isComb1 = sec1 === 'ALL' || sec1.toUpperCase() === 'ALL' || sec1.toLowerCase().includes('combin');
        const isComb2 = cleanSection === 'ALL' || (cleanSection || '').toUpperCase() === 'ALL' || (cleanSection || '').toLowerCase().includes('combin');
        const isElec1 = isElectiveOrLanguageSubject(item.subject);
        const isElec2 = isElectiveOrLanguageSubject(cleanSubject);

        if (isComb1 && isComb2 && isElec1 && isElec2 && item.subject.trim().toLowerCase() !== cleanSubject.toLowerCase()) {
            return false; // Parallel elective
        }

        return true;
    });

    // Always check Google Sheet too (other teachers / other devices)
    let sheetConflict = { exists: false };
    try {
        sheetConflict = await checkSheetSlotConflict(cleanDate, yearVal, cleanSection, cleanSlot, cleanSubject);
    } catch (e) {
        sheetConflict = { exists: false, offline: true };
    }

    const hasConflict = !!existingEntry || !!(sheetConflict.exists && !sheetConflict.offline);
    let finalRolls = formattedRolls;
    let finalRollsArr = rollNumbersArray;
    let conflictChoice = 'create';

    if (hasConflict) {
        // Prefer sheet truth when both exist (cross-device)
        const prevSubj = (sheetConflict.exists && sheetConflict.subject)
            ? sheetConflict.subject
            : (existingEntry ? existingEntry.subject : cleanSubject);
        const prevRolls = (sheetConflict.exists && sheetConflict.rollNumbers != null)
            ? sheetConflict.rollNumbers
            : (existingEntry ? existingEntry.rollNumbers : 'NIL');

        const userChoice = await showSlotConflictDialog({
            date: cleanDate,
            year: yearVal,
            section: cleanSection,
            slot: cleanSlot,
            subject: cleanSubject,
            existingSubj: prevSubj,
            existingRolls: prevRolls,
            newRolls: formattedRolls
        });

        if (!userChoice || userChoice.action === 'cancel') {
            return { status: 'cancelled' };
        }

        conflictChoice = userChoice.action;
        finalRolls = userChoice.mergedRolls;
        finalRollsArr = userChoice.mergedArr;
    }

    // Now disable button & show spinner during actual HTTP POST transmission
    if (btnElem) btnElem.disabled = true;
    if (textElem) textElem.style.opacity = '0.5';
    if (spinnerElem) spinnerElem.style.display = 'block';

    const isUpdate = hasConflict;
    const prevRollsArr = (sheetConflict.exists && !sheetConflict.offline)
        ? normalizeRollNumbers(sheetConflict.rollNumbers)
        : (existingEntry ? normalizeRollNumbers(existingEntry.rollNumbers) : []);
    const diff = computeRollDiff(prevRollsArr.join(', '), finalRolls);

    const payload = {
        action: isUpdate ? 'update' : 'create',
        isUpdate: isUpdate,
        stream: currentDept,
        date: cleanDate,
        rollNumbers: finalRolls,
        year: yearVal,
        section: cleanSection,
        subject: cleanSubject,
        slot: cleanSlot,
        previousRollNumbers: diff.prevRolls.length > 0 ? diff.prevRolls.join(', ') : 'NIL',
        addedRollNumbers: diff.addedRolls.length > 0 ? diff.addedRolls.join(', ') : 'NIL',
        deletedRollNumbers: diff.deletedRolls.length > 0 ? diff.deletedRolls.join(', ') : 'NIL',
        retainedRollNumbers: diff.retainedRolls.length > 0 ? diff.retainedRolls.join(', ') : 'NIL',
        changesSummary: isUpdate 
            ? (conflictChoice === 'merge' ? '🔀 Merged absentees from both entries' : '✏️ Replaced previous entry')
            : 'Initial Submission'
    };

    console.log('Submitting Attendance Payload:', payload);

    if (textElem) textElem.style.opacity = '0';
    if (spinnerElem) spinnerElem.style.display = 'block';

    try {
        const targetUrl = getWebhookUrl(currentDept);
        await postWithRetry(targetUrl, withAuth(payload), 2);

        // Sheet write already sent — show success now; confirm badge in background
        saveToLocalHistory({
            ...payload,
            offline: false,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        closeConfirmationModal();
        resetAllInputs();
        showSuccessToast(payload);

        setTimeout(() => {
            fetchTodayServerHistory();
        }, 800);
        return { status: 'ok' };

    } catch (error) {
        console.warn('Error submitting attendance (Saved Offline):', error);
        saveToLocalHistory({
            ...payload,
            offline: true,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        closeConfirmationModal();
        resetAllInputs();
        
        const rollCount = payload.rollNumbers === 'NIL' ? 0 : (normalizeRollNumbers(payload.rollNumbers).length);
        showCustomToast(
            'Attendance Recorded (Offline)',
            `${rollCount} absentee(s) saved on phone (Offline Pending). Will auto-sync when online.`
        );
        return { status: 'offline' };
    } finally {
        if (btnElem) btnElem.disabled = false;
        if (textElem) textElem.style.opacity = '1';
        if (spinnerElem) spinnerElem.style.display = 'none';
    }
}

function renderMultiSlotBreakdown(containerEl, startSlot, duration, masterRollVal) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    const endSlot = Math.min(8, startSlot + duration - 1);

    for (let slotNum = startSlot; slotNum <= endSlot; slotNum++) {
        const slotLabel = SLOT_TIME_LABELS[slotNum] || ('Slot ' + slotNum);
        const rowDiv = document.createElement('div');
        rowDiv.style.display = 'flex';
        rowDiv.style.alignItems = 'center';
        rowDiv.style.gap = '8px';
        rowDiv.style.marginTop = '4px';

        const label = document.createElement('span');
        label.style.fontSize = '0.78rem';
        label.style.fontWeight = '600';
        label.style.minWidth = '115px';
        label.style.color = '#93c5fd';
        label.textContent = `Slot ${slotNum} (${slotLabel}):`;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-input multi-slot-roll-input';
        input.dataset.slot = String(slotNum);
        input.placeholder = 'Absentees for Slot ' + slotNum + ' (or leave blank)';
        input.value = masterRollVal || '';
        input.style.fontSize = '0.82rem';
        input.style.padding = '5px 8px';
        input.style.flex = '1';

        rowDiv.appendChild(label);
        rowDiv.appendChild(input);
        containerEl.appendChild(rowDiv);
    }
}

function handleMultiSlotVisibility(durationSelectEl, slotSelectEl, masterRollInputEl, containerWrapperEl, breakdownEl) {
    if (!durationSelectEl || !containerWrapperEl) return;
    const duration = parseInt(durationSelectEl.value, 10) || 1;
    const startSlot = parseInt(slotSelectEl ? slotSelectEl.value : '1', 10) || 1;

    if (duration > 1) {
        containerWrapperEl.style.display = 'block';
        renderMultiSlotBreakdown(breakdownEl, startSlot, duration, masterRollInputEl ? masterRollInputEl.value : '');
    } else {
        containerWrapperEl.style.display = 'none';
        if (breakdownEl) breakdownEl.innerHTML = '';
    }
}

async function handleMultiSlotSubmit(dateVal, masterRollRaw, yearVal, sectionVal, subjectVal, startSlotVal, durationVal, breakdownEl, btnElem, textElem, spinnerElem) {
    const duration = parseInt(durationVal, 10) || 1;
    const startSlot = parseInt(startSlotVal, 10) || 1;

    if (duration <= 1) {
        return await submitData(dateVal, masterRollRaw, yearVal, sectionVal, subjectVal, startSlot, btnElem, textElem, spinnerElem);
    }

    const endSlot = Math.min(8, startSlot + duration - 1);
    let successCount = 0;
    let cancelledCount = 0;

    // CRITICAL: snapshot every slot's absentees BEFORE the first submit.
    // submitData → resetAllInputs() wipes the multi-slot DOM, so later slots
    // used to fall back to empty master → NIL (edit later still worked).
    const stream = currentDept || 'BCA';
    const useModalPrefix = isConfirmModalActive();
    const prefixHint = getActiveRollPrefixFromUI(useModalPrefix) || getStoredRollPrefix(stream, yearVal, sectionVal);
    const slotRollMap = {};
    for (let slotNum = startSlot; slotNum <= endSlot; slotNum++) {
        let slotRollRaw = masterRollRaw;
        if (breakdownEl) {
            const slotInput = breakdownEl.querySelector('input[data-slot="' + slotNum + '"]');
            if (slotInput) {
                slotRollRaw = slotInput.value;
            }
        }
        slotRollMap[slotNum] = applyRollPrefixExpansion(slotRollRaw, yearVal, sectionVal, {
            prefix: prefixHint,
            preferModal: useModalPrefix
        });
    }

    for (let slotNum = startSlot; slotNum <= endSlot; slotNum++) {
        const slotRollRaw = slotRollMap[slotNum];
        try {
            const result = await submitData(dateVal, slotRollRaw, yearVal, sectionVal, subjectVal, slotNum, btnElem, textElem, spinnerElem);
            if (result && result.status === 'cancelled') {
                cancelledCount++;
                break; // stop remaining slots if user cancelled a conflict
            }
            if (result && (result.status === 'ok' || result.status === 'offline')) {
                successCount++;
            }
        } catch (e) {
            console.warn('Error submitting slot ' + slotNum + ':', e);
        }
    }

    if (successCount > 0) {
        showCustomToast(
            '⚡ ' + successCount + '-Slot Lab Recorded!',
            'Absentees logged for Slots ' + startSlot + ' to ' + endSlot + ' (' + subjectVal + ').'
        );
    } else if (cancelledCount > 0) {
        showCustomToast('Submission cancelled', 'No lab slots were saved.');
    }
}

function submitModalForm() {
    const durationSelect = document.getElementById('durationSelect');
    const modalMultiSlotBreakdown = document.getElementById('modalMultiSlotBreakdown');
    handleMultiSlotSubmit(
        dateInput.value,
        rollNumbersInput.value,
        yearSelect.value,
        sectionSelect.value,
        subjectInput.value,
        slotSelect.value,
        durationSelect ? durationSelect.value : '1',
        modalMultiSlotBreakdown,
        submitBtn, submitBtnText, submitSpinner
    );
}

function submitDirectForm() {
    const directDurationSelect = document.getElementById('directDurationSelect');
    const directMultiSlotBreakdown = document.getElementById('directMultiSlotBreakdown');
    handleMultiSlotSubmit(
        directDateInput.value,
        directRollInput.value,
        directYearSelect.value,
        directSectionSelect.value,
        directSubjectInput.value,
        directSlotSelect.value,
        directDurationSelect ? directDurationSelect.value : '1',
        directMultiSlotBreakdown,
        directSubmitBtn, directSubmitBtnText, directSubmitSpinner
    );
}

// 5. Success Toast & Reset State
function showSuccessToast(payload) {
    const isUpdate = payload.isUpdate || payload.action === 'update';
    const rollCount = payload.rollNumbers === 'NIL' ? 0 : (normalizeRollNumbers(payload.rollNumbers).length);
    const actionLabel = isUpdate ? 'Attendance Updated!' : 'Attendance Recorded!';
    
    const toastTitleElem = document.querySelector('#successToast .toast-text');
    if (toastTitleElem) toastTitleElem.textContent = actionLabel;
    
    toastSubtext.textContent = `${rollCount} absentee(s) logged for ${payload.date} - ${payload.year} Sec ${payload.section} (${payload.subject})`;
    
    successToast.classList.add('active');

    setTimeout(() => {
        successToast.classList.remove('active');
    }, 2800);
}

function resetAllInputs() {
    clearTranscript();
    const todayStr = getTodayISOString();
    const deptConfig = DEPT_CONFIG[currentDept] || DEPT_CONFIG.BCA;
    if (manualTextInput) manualTextInput.value = '';
    if (directDateInput) directDateInput.value = todayStr;
    if (dateInput) dateInput.value = todayStr;
    if (directRollInput) directRollInput.value = '';
    if (rollNumbersInput) rollNumbersInput.value = '';
    if (directSubjectInput) directSubjectInput.value = '';
    if (subjectInput) subjectInput.value = '';
    if (directYearSelect) directYearSelect.value = '';
    if (yearSelect) yearSelect.value = '';
    if (directSectionSelect) directSectionSelect.value = '';
    if (sectionSelect) sectionSelect.value = '';
    if (directSlotSelect) directSlotSelect.value = '';
    if (slotSelect) slotSelect.value = '';

    document.querySelectorAll('.multi-slot-roll-input').forEach(inp => {
        if (inp) inp.value = '';
    });

    const directDurationSelect = document.getElementById('directDurationSelect');
    const durationSelect = document.getElementById('durationSelect');
    if (directDurationSelect) directDurationSelect.value = '1';
    if (durationSelect) durationSelect.value = '1';

    const directMultiSlotWrapper = document.getElementById('directMultiSlotContainer');
    const directMultiSlotBreakdown = document.getElementById('directMultiSlotBreakdown');
    handleMultiSlotVisibility(directDurationSelect, directSlotSelect, directRollInput, directMultiSlotWrapper, directMultiSlotBreakdown);

    const modalMultiSlotWrapper = document.getElementById('modalMultiSlotContainer');
    const modalMultiSlotBreakdown = document.getElementById('modalMultiSlotBreakdown');
    handleMultiSlotVisibility(durationSelect, slotSelect, rollNumbersInput, modalMultiSlotWrapper, modalMultiSlotBreakdown);

    if (deleteBtn) deleteBtn.style.display = 'none';
    if (modalAlertBox) modalAlertBox.style.display = 'none';
    if (directAlertBox) directAlertBox.style.display = 'none';
    if (submitBtnText) submitBtnText.textContent = 'Submit Absentee';
    if (directSubmitBtnText) directSubmitBtnText.textContent = 'Submit Absentee';
}

// Delete = app history + Raw Data row (section B/C formulas refresh to blank)
async function deleteData(dateVal, yearVal, sectionVal, subjectVal, slotVal, streamVal) {
    const cleanDate = dateVal || getTodayISOString();
    const cleanSlot = parseInt(slotVal, 10) || 1;

    const history = readAllHistory();
    const targetKey = entryKey({
        date: cleanDate,
        year: yearVal,
        section: sectionVal,
        subject: subjectVal,
        slot: cleanSlot
    });

    const cleanStream = streamVal || 
        (history.find(item => entryKey(item) === targetKey)?.stream) || 
        currentDept || 'BCA';

    const targetItem = history.find(item => 
        entryKey(item) === targetKey &&
        (item.stream || 'BCA') === cleanStream
    );

    const confirmDelete = confirm(
        'Delete this attendance from Google Sheets?\n\n' +
        'Date: ' + cleanDate + '\n' +
        'Slot: ' + cleanSlot + ' (' + subjectVal + ')\n' +
        'Year/Section: ' + yearVal + ' Sec ' + sectionVal + '\n\n' +
        'This will:\n' +
        '- Remove the row from Raw Data\n' +
        '- Section sheet subject/absentees go blank (formulas stay)\n' +
        '- Remove it from today\'s list on this phone\n\n' +
        'To only fix roll numbers, tap Cancel and use Edit/Submit instead.'
    );

    if (!confirmDelete) return;

    const prevRolls = targetItem ? normalizeRollNumbers(targetItem.rollNumbers) : [];
    const prevStr = prevRolls.length > 0 ? prevRolls.join(', ') : 'NIL';

    const updatedHistory = history.filter(item => 
        !(entryKey(item) === targetKey && (item.stream || 'BCA') === cleanStream)
    );
    localStorage.setItem('mgmec_attendance_history', JSON.stringify(updatedHistory));
    renderHistoryList();

    const payload = {
        action: 'delete',
        stream: cleanStream,
        dept: cleanStream,
        authStream: cleanStream,
        date: cleanDate,
        year: yearVal,
        section: sectionVal,
        subject: subjectVal,
        slot: cleanSlot,
        rollNumbers: 'NIL',
        previousRollNumbers: prevStr,
        deletedRollNumbers: prevStr,
        changesSummary: `Deleted Raw Data row (section formulas refresh; was: ${prevStr})`
    };

    console.log('Sending Delete Payload:', payload);

    try {
        const targetUrl = getWebhookUrl(cleanStream);
        await postWithRetry(targetUrl, withAuth(payload), 2);
    } catch (e) {
        console.error('Error sending delete request:', e);
        alert('Could not reach Google Sheets. Removed from app history on phone — check Raw Data / section sheet manually.');
    }

    closeConfirmationModal();
    resetAllInputs();

    const toastTitleElem = document.querySelector('#successToast .toast-text');
    if (toastTitleElem) toastTitleElem.textContent = 'Deleted from Sheets';
    toastSubtext.textContent = `Raw Data deleted — section formulas will clear (${cleanDate}, Slot ${cleanSlot})`;
    successToast.classList.add('active');
    setTimeout(() => successToast.classList.remove('active'), 2800);
}

function deleteHistoryEntry(index, sourceList) {
    const list = sourceList || getActiveDrawerEntries();
    const item = list[index];
    if (!item) return;
    deleteData(item.date, item.year, item.section, item.subject, item.slot, item.stream);
}

const MON_FRI_SLOT_TIMES = {
    1: '1:30 - 2:15 PM',
    2: '2:15 - 3:00 PM',
    3: '3:00 - 3:45 PM',
    4: '3:45 - 4:30 PM',
    5: '4:45 - 5:30 PM',
    6: '5:30 - 6:15 PM'
};

const SATURDAY_SLOT_TIMES = {
    1: '1:00 - 1:45 PM',
    2: '1:45 - 2:30 PM',
    3: '2:30 - 3:15 PM',
    4: '3:15 - 4:00 PM',
    5: '4:15 - 5:00 PM',
    6: '5:00 - 5:45 PM'
};

const MON_FRI_SHORT_TIMES = {
    1: '1.30-2.15',
    2: '2.15-3.00',
    3: '3.00-3.45',
    4: '3.45-4.30',
    5: '4.45-5.30',
    6: '5.30-6.15'
};

const SATURDAY_SHORT_TIMES = {
    1: '1.00-1.45',
    2: '1.45-2.30',
    3: '2.30-3.15',
    4: '3.15-4.00',
    5: '4.15-5.00',
    6: '5.00-5.45'
};

function isSaturdayDate(dateStr) {
    if (!dateStr) return false;
    const parts = String(dateStr).trim().split(/[-/]/);
    if (parts.length === 3 && parts[0].length === 4) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return d.getDay() === 6;
    }
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) && d.getDay() === 6;
}

function getSlotTimeLabels(dateStr) {
    return isSaturdayDate(dateStr) ? SATURDAY_SLOT_TIMES : MON_FRI_SLOT_TIMES;
}

function getSlotTimeShortLabels(dateStr) {
    return isSaturdayDate(dateStr) ? SATURDAY_SHORT_TIMES : MON_FRI_SHORT_TIMES;
}

const SLOT_TIME_LABELS = MON_FRI_SHORT_TIMES;

/** Normalize to YYYY-MM-DD for Today list matching. */
function normalizeHistoryDate(val) {
    if (!val && val !== 0) return '';
    if (val instanceof Date) {
        if (isNaN(val.getTime())) return '';
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, '0');
        const d = String(val.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    }
    const s = String(val).trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
    const datePart = s.split(/[\sT]/)[0];
    const parts = datePart.split(/[\/\.-]/);
    if (parts.length === 3) {
        const p0 = parseInt(parts[0], 10);
        const p1 = parseInt(parts[1], 10);
        const p2 = parseInt(parts[2], 10);
        if (p0 > 1000) {
            return p0 + '-' + String(p1).padStart(2, '0') + '-' + String(p2).padStart(2, '0');
        }
        if (p2 > 1000) {
            return p2 + '-' + String(p1).padStart(2, '0') + '-' + String(p0).padStart(2, '0');
        }
    }
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return normalizeHistoryDate(parsed);
    return s;
}

function entryKey(item) {
    return [
        normalizeHistoryDate(item.date) || '',
        item.year || '',
        item.section || '',
        (item.subject || '').trim().toLowerCase(),
        String(parseInt(item.slot, 10) || 1)
    ].join('|');
}

function readAllHistory() {
    try {
        return JSON.parse(localStorage.getItem('mgmec_attendance_history') || '[]');
    } catch (e) {
        return [];
    }
}

/**
 * Tidy local history without losing the offline sync queue.
 * - Always keep unsynced (offline:true) entries for ANY date.
 * - Keep up to 2000 total synced records so All History tab displays completely.
 */
function compactAttendanceHistory(history) {
    let offlineKept = 0;
    let syncedKept = 0;
    const MAX_OFFLINE = 100;
    const MAX_SYNCED_TOTAL = 2000;

    return (history || []).filter(item => {
        if (!item) return false;
        if (item.offline === true) {
            if (offlineKept >= MAX_OFFLINE) return false;
            offlineKept++;
            return true;
        }
        if (syncedKept >= MAX_SYNCED_TOTAL) return false;
        syncedKept++;
        return true;
    });
}

function saveHistoryToLocalStorage(history) {
    try { localStorage.setItem('mgmec_attendance_history', JSON.stringify(history)); } catch (e) {}
}

function pruneOldHistory() {
    const kept = compactAttendanceHistory(readAllHistory());
    saveHistoryToLocalStorage(kept);
    return kept;
}

function hodYearPrefix(yearVal) {
    const y = String(yearVal || '').trim().toUpperCase();
    if (!y) return 'I';
    if (/\bTHIRD\b|\b3RD\b|\bIII\b/.test(y) || y === '3' || y.startsWith('III')) return 'III';
    if (/\bSECOND\b|\b2ND\b|\bII\b/.test(y) || y === '2' || (y.startsWith('II') && !y.startsWith('III'))) return 'II';
    if (/\bFIRST\b|\b1ST\b/.test(y) || y === '1' || y === 'I') return 'I';
    if (y.indexOf('III') !== -1) return 'III';
    if (y.indexOf('II') !== -1) return 'II';
    return 'I';
}

function isYearMatching(itemYear, filterYear) {
    if (!filterYear || filterYear === 'ALL') return true;
    return hodYearPrefix(itemYear) === hodYearPrefix(filterYear);
}

function isSubjectMatching(sub1, sub2) {
    if (!sub1 || !sub2) return true;
    const s1 = String(sub1).toLowerCase().trim();
    const s2 = String(sub2).toLowerCase().trim();
    if (s1 === 'all' || s2 === 'all') return true;
    if (s1 === s2) return true;
    return s1.includes(s2) || s2.includes(s1);
}

function isStreamMatchEvening(s1, s2) {
    const norm = (v) => {
        let s = String(v || 'BCA').trim().toUpperCase();
        if (s === 'BCM' || s === 'B.COM' || s === 'COMMERCE') s = 'BCOM';
        return s;
    };
    return norm(s1) === norm(s2);
}

function getTodayEntries() {
    const today = getTodayISOString();
    const deptItems = readAllHistory().filter(item => (item.stream || 'BCA') === currentDept);
    // Show today's rows + any still-pending offline rows from other dates
    const pendingOtherDays = deptItems.filter(item => item.offline === true && normalizeHistoryDate(item.date) !== today);
    const todayItems = deptItems.filter(item => normalizeHistoryDate(item.date) === today);
    // Cap high enough for a full college day (was 30 — hid ~15 entries)
    return [...pendingOtherDays, ...todayItems].slice(0, 120);
}

function updateTodayBadge() {
    const badge = document.getElementById('todayCountBadge');
    const entries = getTodayEntries();
    const count = entries.length;
    const pendingOffline = entries.filter(item => item.offline === true).length;
    if (badge) {
        if (count > 0) {
            badge.hidden = false;
            badge.textContent = String(count);
        } else {
            badge.hidden = true;
            badge.textContent = '0';
        }
    }
    const sub = document.getElementById('todayDrawerSubtitle');
    if (sub) {
        if (count === 0) {
            sub.textContent = 'No classes marked yet today';
        } else if (pendingOffline > 0) {
            sub.textContent = count + ' entr' + (count === 1 ? 'y' : 'ies') +
                ' — ' + pendingOffline + ' waiting to sync to Google Sheet';
        } else {
            sub.textContent = count + ' class' + (count === 1 ? '' : 'es') +
                ' marked today — edit or delete any';
        }
    }
}

// Local log + durable offline queue (offline rows survive past midnight)
function saveToLocalHistory(entry) {
    const today = getTodayISOString();
    const entryDate = entry.date || today;
    let history = readAllHistory();

    const normalized = {
        ...entry,
        date: entryDate,
        stream: entry.stream || currentDept || 'BCA',
        timestamp: entry.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const existingIdx = history.findIndex(item =>
        entryKey(item) === entryKey(normalized) &&
        (item.stream || 'BCA') === (normalized.stream || 'BCA')
    );

    if (existingIdx !== -1) {
        history[existingIdx] = { ...history[existingIdx], ...normalized };
        const updated = history.splice(existingIdx, 1)[0];
        history.unshift(updated);
    } else {
        history.unshift(normalized);
    }

    history = compactAttendanceHistory(history);
    saveHistoryToLocalStorage(history);
    renderHistoryList();
}

function showCustomToast(title, subtitle) {
    if (!successToast) return;
    const toastTitleElem = document.querySelector('#successToast .toast-text');
    if (toastTitleElem) toastTitleElem.textContent = title;
    if (toastSubtext) toastSubtext.textContent = subtitle || '';
    successToast.classList.add('active');
    setTimeout(() => successToast.classList.remove('active'), 3500);
}

async function syncOfflineEntries() {
    const history = readAllHistory();
    const offlineItems = history.filter(item => item.offline === true);
    if (offlineItems.length === 0) {
        updateSyncButtonState();
        return 0;
    }

    const syncBtn = document.getElementById('syncOfflineBtn');
    if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.textContent = 'Syncing...';
    }

    let syncedCount = 0;
    for (let i = 0; i < history.length; i++) {
        if (history[i].offline) {
            const item = history[i];
            const targetUrl = getWebhookUrl(item.stream || currentDept);
            const payload = withAuth({
                action: item.action || 'create',
                isUpdate: !!(item.isUpdate || item.action === 'update'),
                stream: item.stream || currentDept || 'BCA',
                date: item.date,
                rollNumbers: Array.isArray(item.rollNumbers)
                    ? item.rollNumbers.join(', ')
                    : (item.rollNumbers == null || String(item.rollNumbers).trim() === '' ? 'NIL' : String(item.rollNumbers)),
                year: item.year,
                section: item.section,
                subject: item.subject,
                slot: String(parseInt(item.slot, 10) || 1),
                changesSummary: item.changesSummary || 'Synced from phone (was pending)'
            });

            try {
                // Raw Data may already have it — check first, don't re-upload
                const already = await verifyAttendanceOnSheet(payload);
                if (already.verified) {
                    history[i].offline = false;
                    syncedCount++;
                    continue;
                }
                await postWithRetry(targetUrl, payload, 1);
                const verify = await verifyAttendanceOnSheet(payload);
                if (verify.verified) {
                    history[i].offline = false;
                    syncedCount++;
                }
            } catch (err) {
                console.warn('Offline sync attempt failed for item:', item, err);
            }
        }
    }

    saveHistoryToLocalStorage(history);
    renderHistoryList();
    updateSyncButtonState();

    if (syncedCount > 0) {
        showCustomToast('⚡ Synced ' + syncedCount + ' entry(s)!', 'Confirmed on Google Sheet.');
    }
    return syncedCount;
}

function updateSyncButtonState() {
    const history = readAllHistory();
    const offlineCount = history.filter(item => item.offline === true).length;
    const syncBtn = document.getElementById('syncOfflineBtn');
    const pendingCountEl = document.getElementById('pendingSyncCount');

    if (syncBtn) {
        if (offlineCount > 0) {
            syncBtn.style.display = 'inline-flex';
            syncBtn.disabled = false;
            if (pendingCountEl) pendingCountEl.textContent = offlineCount;
        } else {
            syncBtn.style.display = 'none';
        }
    }
}

let isFetchingServerHistory = false;

function historyMatchKey(item) {
    return entryKey(item) + '|' + (item.stream || 'BCA');
}

function fetchTodayServerHistory() {
    if (isFetchingServerHistory) return;
    isFetchingServerHistory = true;

    const stream = currentDept || 'BCA';
    const dateVal = getTodayISOString();
    const targetUrl = getWebhookUrl(stream);
    const cbName = 'mgmec_history_server_cb_' + Date.now();

    const timeout = setTimeout(() => {
        isFetchingServerHistory = false;
        try { delete window[cbName]; } catch (e) {}
    }, 6000);

    window[cbName] = function (data) {
        clearTimeout(timeout);
        isFetchingServerHistory = false;
        try { delete window[cbName]; } catch (e) {}

        if (data && data.result === 'success' && Array.isArray(data.entries)) {
            const history = readAllHistory();
            const byKey = new Map();

            // 1. Keep ALL existing local items first (safeguards local records from being deleted)
            history.forEach(item => {
                const k = historyMatchKey(item);
                byKey.set(k, item);
            });

            // 2. Add or update with server entries (from other devices/sheet)
            data.entries.forEach(e => {
                if (!e) return;
                const sEntry = {
                    stream: stream,
                    date: dateVal,
                    year: e.year || 'First Year',
                    section: e.section || 'A',
                    subject: e.subject || '',
                    slot: parseInt(e.slot, 10) || 1,
                    rollNumbers: e.rollNumbers || 'NIL',
                    offline: false,
                    timestamp: 'From Sheet'
                };
                const k = historyMatchKey(sEntry);
                const existing = byKey.get(k);
                // Only overwrite if existing entry is absent or synced
                if (!existing || existing.offline === false) {
                    byKey.set(k, sEntry);
                }
            });

            const merged = compactAttendanceHistory(Array.from(byKey.values()));
            saveHistoryToLocalStorage(merged);
            renderHistoryList();
            updateSyncButtonState();
        }
    };

    const params = new URLSearchParams({
        action: 'get_absentees',
        stream: stream,
        date: dateVal,
        callback: cbName
    });
    appendAuthToParams(params);

    const scriptEl = document.createElement('script');
    scriptEl.src = targetUrl + (targetUrl.indexOf('?') >= 0 ? '&' : '?') + params.toString();
    scriptEl.onerror = function () {
        clearTimeout(timeout);
        isFetchingServerHistory = false;
        try { delete window[cbName]; } catch (e) {}
    };
    document.body.appendChild(scriptEl);
}

let currentHistoryTabMode = 'TODAY';
let isFetchingAllServerHistory = false;

function getActiveDrawerEntries() {
    const allItems = readAllHistory();
    if (currentHistoryTabMode === 'ALL') {
        const yearFilter = document.getElementById('allHistoryYearFilter');
        const dateFilter = document.getElementById('allHistoryDateFilter');

        const selYear = yearFilter ? yearFilter.value : 'ALL';
        const selDate = dateFilter && dateFilter.value ? normalizeHistoryDate(dateFilter.value) : '';

        const matched = allItems.filter(item => {
            if (!isStreamMatchEvening(item.stream, currentDept)) return false;
            if (selYear && selYear !== 'ALL' && isYearMatching(item.year, selYear) === false) return false;
            if (selDate && selDate !== '' && normalizeHistoryDate(item.date) !== selDate) return false;
            return true;
        });

        return matched.sort((a, b) => {
            const dA = normalizeHistoryDate(a.date) || '';
            const dB = normalizeHistoryDate(b.date) || '';
            if (dA !== dB) return dB.localeCompare(dA);
            return (parseInt(b.slot, 10) || 1) - (parseInt(a.slot, 10) || 1);
        });
    }
    return getTodayEntries();
}

function updateHistoryTabStyles() {
    const tabToday = document.getElementById('historyTabToday');
    const tabAll = document.getElementById('historyTabAll');
    const titleEl = document.getElementById('historyDrawerTitle');
    const subEl = document.getElementById('todayDrawerSubtitle');
    const filterRow = document.getElementById('allHistoryFilterRow');

    if (tabToday && tabAll) {
        if (currentHistoryTabMode === 'ALL') {
            tabToday.style.background = 'transparent';
            tabToday.style.color = 'var(--text-muted, #94a3b8)';
            tabAll.style.background = 'var(--primary-color, #6366f1)';
            tabAll.style.color = '#fff';
            if (titleEl) titleEl.textContent = 'All History';
            if (subEl) subEl.textContent = 'View, edit or delete any past class entry';
            if (filterRow) filterRow.style.display = 'flex';
        } else {
            tabToday.style.background = 'var(--primary-color, #6366f1)';
            tabToday.style.color = '#fff';
            tabAll.style.background = 'transparent';
            tabAll.style.color = 'var(--text-muted, #94a3b8)';
            if (titleEl) titleEl.textContent = 'Today’s entries';
            if (filterRow) filterRow.style.display = 'none';
        }
    }
}

function initHistoryDrawerTabs() {
    const tabToday = document.getElementById('historyTabToday');
    const tabAll = document.getElementById('historyTabAll');
    const clearFilterBtn = document.getElementById('clearAllHistoryFilterBtn');
    const yearFilter = document.getElementById('allHistoryYearFilter');
    const dateFilter = document.getElementById('allHistoryDateFilter');

    if (tabToday) {
        tabToday.onclick = (e) => {
            if (e) e.preventDefault();
            currentHistoryTabMode = 'TODAY';
            updateHistoryTabStyles();
            renderHistoryList();
        };
    }

    if (tabAll) {
        tabAll.onclick = (e) => {
            if (e) e.preventDefault();
            currentHistoryTabMode = 'ALL';
            updateHistoryTabStyles();
            renderHistoryList();
            if (navigator.onLine && typeof fetchAllServerHistory === 'function') {
                fetchAllServerHistory(() => {
                    renderHistoryList();
                });
            }
        };
    }

    if (yearFilter) {
        yearFilter.onchange = () => renderHistoryList();
    }

    if (dateFilter) {
        dateFilter.onchange = () => renderHistoryList();
    }

    if (clearFilterBtn) {
        clearFilterBtn.onclick = (e) => {
            if (e) e.preventDefault();
            if (yearFilter) yearFilter.value = 'ALL';
            if (dateFilter) dateFilter.value = '';
            renderHistoryList();
        };
    }
}

function fetchAllServerHistory(cb) {
    if (isFetchingAllServerHistory) {
        if (cb) cb();
        return;
    }
    isFetchingAllServerHistory = true;

    const stream = currentDept || 'BCA';
    const targetUrl = getWebhookUrl(stream);
    if (!targetUrl) {
        isFetchingAllServerHistory = false;
        if (cb) cb();
        return;
    }

    const cbName = 'mgmec_all_history_cb_' + Date.now();

    const timeout = setTimeout(() => {
        isFetchingAllServerHistory = false;
        try { delete window[cbName]; } catch (e) {}
        if (cb) cb();
    }, 8000);

    window[cbName] = function (data) {
        clearTimeout(timeout);
        isFetchingAllServerHistory = false;
        try { delete window[cbName]; } catch (e) {}

        if (data && data.result === 'success' && Array.isArray(data.entries)) {
            const serverEntries = data.entries.map(e => ({
                stream: stream,
                date: normalizeHistoryDate(e.date) || e.date || getTodayISOString(),
                year: e.year || 'First Year',
                section: e.section || 'A',
                subject: e.subject || 'Subject',
                slot: parseInt(e.slot, 10) || 1,
                rollNumbers: e.rollNumbers || 'NIL',
                offline: false,
                timestamp: 'From Sheet'
            }));

            const history = readAllHistory();
            const byKey = new Map();

            history.forEach(item => {
                const k = historyMatchKey(item);
                byKey.set(k, item);
            });

            serverEntries.forEach(sEntry => {
                const k = historyMatchKey(sEntry);
                const existing = byKey.get(k);
                if (!existing || existing.offline === false) {
                    byKey.set(k, sEntry);
                }
            });

            const merged = compactAttendanceHistory(Array.from(byKey.values()));
            saveHistoryToLocalStorage(merged);
            renderHistoryList();
            updateSyncButtonState();
        }
        if (cb) cb();
    };

    const params = new URLSearchParams({
        action: 'get_absentees',
        stream: stream,
        date: 'ALL',
        fromDate: '2020-01-01',
        toDate: '2030-12-31',
        callback: cbName
    });
    appendAuthToParams(params);

    const scriptEl = document.createElement('script');
    scriptEl.src = targetUrl + (targetUrl.indexOf('?') >= 0 ? '&' : '?') + params.toString();
    scriptEl.onerror = function () {
        clearTimeout(timeout);
        isFetchingAllServerHistory = false;
        try { delete window[cbName]; } catch (e) {}
        try { document.body.removeChild(scriptEl); } catch (e) {}
        if (cb) cb();
    };
    document.body.appendChild(scriptEl);
}

function renderHistoryList() {
    pruneOldHistory();
    const displayEntries = getActiveDrawerEntries();
    updateTodayBadge();
    updateSyncButtonState();
    updateHistoryTabStyles();

    const historyListEl = document.getElementById('historyList');
    if (!historyListEl) return;

    if (displayEntries.length === 0) {
        const emptyMsg = currentHistoryTabMode === 'ALL'
            ? 'No attendance history saved yet.'
            : 'No entries today — submit above.';
        historyListEl.innerHTML = '<p class="transcript-placeholder" style="text-align: center; margin-top: 20px;">' + emptyMsg + '</p>';
        return;
    }

    historyListEl.innerHTML = displayEntries.map((item, index) => {
        const slotNum = parseInt(item.slot, 10) || 1;
        const slotLabel = SLOT_TIME_LABELS[slotNum] || ('Slot ' + slotNum);
        const rolls = item.rollNumbers === 'NIL'
            ? '<span class="badge badge-nil">NIL (All Present)</span>'
            : (Array.isArray(item.rollNumbers) ? escapeHTML(item.rollNumbers.join(', ')) : escapeHTML(String(item.rollNumbers)));

        const dateLabel = item.date
            ? ' · ' + escapeHTML(item.date)
            : '';

        const statusBadge = item.offline 
            ? '<span class="badge badge-warning" style="background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.3);">Offline (Pending Sync)</span>'
            : '<span class="badge badge-success">Synced to Sheet</span>';

        return (
        '<div class="history-card">' +
            '<div class="history-top">' +
                '<span class="history-title">' + escapeHTML(item.year) + ' Sec ' + escapeHTML(item.section) + dateLabel + '</span>' +
                '<span class="history-time">' + escapeHTML(item.timestamp || '') + '</span>' +
            '</div>' +
            '<div class="history-details">' +
                '<span>Subject: <strong>' + escapeHTML(item.subject) + '</strong></span>' +
                '<span>Slot ' + slotNum + ': <strong>' + slotLabel + '</strong></span>' +
            '</div>' +
            '<div class="history-rolls">Absentees: ' + rolls + '</div>' +
            '<div style="margin-top: 6px; display: flex; justify-content: space-between; align-items: center;">' +
                statusBadge +
                '<div style="display: flex; gap: 6px;">' +
                    '<button type="button" class="btn-history-edit" data-index="' + index + '">Edit</button>' +
                    '<button type="button" class="btn-history-delete" data-index="' + index + '" title="Deletes Raw Data row; section formulas go blank">Delete</button>' +
                '</div>' +
            '</div>' +
        '</div>'
        );
    }).join('');

    document.querySelectorAll('.btn-history-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
            editHistoryEntry(idx, displayEntries);
        });
    });

    document.querySelectorAll('.btn-history-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
            deleteHistoryEntry(idx, displayEntries);
        });
    });
}

function editHistoryEntry(index, sourceList) {
    const list = sourceList || getActiveDrawerEntries();
    const item = list[index];
    if (!item) return;

    const deptConfig = DEPT_CONFIG[currentDept] || DEPT_CONFIG.BCA;
    dateInput.value = item.date || getTodayISOString();
    rollNumbersInput.value = item.rollNumbers === 'NIL' ? '' : (Array.isArray(item.rollNumbers) ? item.rollNumbers.join(', ') : item.rollNumbers);
    yearSelect.value = item.year || 'First Year';
    sectionSelect.value = item.section || 'A';
    setSubjectValue(subjectInput, item.subject || deptConfig.defaultSubject);
    slotSelect.value = item.slot ? item.slot.toString() : '1';

    directDateInput.value = dateInput.value;
    directRollInput.value = rollNumbersInput.value;
    directYearSelect.value = yearSelect.value;
    directSectionSelect.value = sectionSelect.value;
    setSubjectValue(directSubjectInput, subjectInput.value);
    directSlotSelect.value = slotSelect.value;

    if (deleteBtn) {
        deleteBtn.style.display = 'inline-block';
        deleteBtn.onclick = () => {
            deleteData(dateInput.value, yearSelect.value, sectionSelect.value, subjectInput.value, slotSelect.value, item.stream || currentDept);
        };
    }

    updateModalDoubleEntryCheck();
    historyDrawer.classList.remove('active');
    confirmationModal.classList.add('active');
    try { prepareRollPrefixForEdit(item); } catch (e) {}
}

// Sound Visualizer Animation
function startVisualizer() {
    if (!canvas || !canvasCtx) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    let step = 0;
    function draw() {
        if (!isListening || !canvasCtx) return;
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeStyle = '#6366f1';
        canvasCtx.beginPath();

        const width = canvas.width;
        const height = canvas.height;
        const sliceWidth = width / 100;
        let x = 0;

        for (let i = 0; i < 100; i++) {
            const v = Math.sin(step + i * 0.1) * (Math.random() * 12 + 4);
            const y = height / 2 + v;
            if (i === 0) canvasCtx.moveTo(x, y);
            else canvasCtx.lineTo(x, y);
            x += sliceWidth;
        }

        canvasCtx.stroke();
        step += 0.15;
        animationFrameId = requestAnimationFrame(draw);
    }
    draw();
}

function stopVisualizer() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (canvasCtx && canvas) canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
}

function updateStatus(msg, type) {
    if (statusText) statusText.textContent = msg;
    if (type === 'error' && statusPill) {
        statusPill.style.borderColor = 'var(--danger-color)';
        statusPill.style.color = 'var(--danger-color)';
    }
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

function restrictDateInputsToTodayAndPast() {
    const today = getTodayISOString();
    const dateInputs = [
        document.getElementById('directDateInput'),
        document.getElementById('dateInput'),
        document.getElementById('hodDatePicker')
    ];
    dateInputs.forEach(input => {
        if (!input) return;
        input.max = today;
    });
}

function enforceMaxTodayDateConstraint(inputElem) {
    if (!inputElem || !inputElem.value) return;
    const today = getTodayISOString();
    if (inputElem.value > today) {
        inputElem.value = today;
        showCustomToast(
            'Future Date Restricted',
            'Tomorrow and future dates are disabled because classes have not been conducted yet. Date reset to today.'
        );
        updateSlotDropdownOptions(today);
    }
}

let currentDateTrack = getTodayISOString();

function checkAndRefreshDate() {
    const freshDate = getTodayISOString();
    restrictDateInputsToTodayAndPast();
    if (freshDate !== currentDateTrack) {
        currentDateTrack = freshDate;
        if (dateInput) dateInput.value = freshDate;
        if (directDateInput) directDateInput.value = freshDate;
        if (todayBadge) {
            const options = { month: 'short', day: 'numeric', year: 'numeric' };
            todayBadge.textContent = 'Today - ' + new Date().toLocaleDateString(undefined, options);
        }
        pruneOldHistory();
        renderHistoryList();
    }
}


function getPasscodeStore() {
    try {
        const store = JSON.parse(localStorage.getItem('mgmec_custom_passcodes') || '{}');
        return {
            teacher: {
                BCA: store.teacherBCA || DEPT_CONFIG.BCA.passcode,
                BCOM: store.teacherBCOM || DEPT_CONFIG.BCOM.passcode,
                BBA: store.teacherBBA || DEPT_CONFIG.BBA.passcode
            },
            hod: {
                BCA: store.hodBCA || 'hodbca',
                BCOM: store.hodBCOM || 'hodbcom',
                BBA: store.hodBBA || 'hodbba'
            },
            ADMIN: store.ADMIN || 'admin2026'
        };
    } catch (e) {
        return {
            teacher: {
                BCA: DEPT_CONFIG.BCA.passcode,
                BCOM: DEPT_CONFIG.BCOM.passcode,
                BBA: DEPT_CONFIG.BBA.passcode
            },
            hod: {
                BCA: 'hodbca',
                BCOM: 'hodbcom',
                BBA: 'hodbba'
            },
            ADMIN: 'admin2026'
        };
    }
}

function savePasscodeStore(store) {
    localStorage.setItem('mgmec_custom_passcodes', JSON.stringify(store));
}

function initDepartmentManager() {
    const deptCards = document.querySelectorAll('.dept-card');
    let selectedDept = 'BCA';
    const rememberCheck = document.getElementById('rememberDeptCheck');
    const loginBtnEl = document.getElementById('deptLoginBtn');

    const setLoginBusy = (busy) => {
        if (loginBtnEl) {
            loginBtnEl.disabled = !!busy;
            const span = loginBtnEl.querySelector('span');
            if (span) span.textContent = busy ? 'Checking PIN…' : 'Enter Absentee Informer';
        }
    };

    const finishLoginSuccess = (role, loginDept, passcode, rememberChecked) => {
        selectedDept = loginDept;
        document.querySelectorAll('.dept-card').forEach(c => {
            c.classList.toggle('active', c.getAttribute('data-dept') === loginDept);
        });

        setAuthSession(passcode, role || 'TEACHER', loginDept, !!rememberChecked);
        subjectsAuthPrompted = false;
        // Parent Informer needs no separate HOD login — stream PIN unlocks both tabs
        isHODAuthenticated = true;
        currentRole = role || 'TEACHER';
        if (loginAlertBox) loginAlertBox.style.display = 'none';

        localStorage.setItem('mgmec_dept', loginDept);
        localStorage.setItem('mgmec_role', currentRole);

        selectDepartment(loginDept);
        applyRoleUI();
        try { switchMode('typing'); } catch (e) {}
        if (deptLoginModal) {
            deptLoginModal.classList.remove('active');
            deptLoginModal.style.display = '';
        }
        pendingHODTabSwitch = false;
        const cancelBtn = document.getElementById('cancelHODLoginBtn');
        if (cancelBtn) cancelBtn.style.display = 'none';
        setLoginBusy(false);
    };

    const runLogin = async () => {
        const activeCard = document.querySelector('.dept-card.active');
        if (activeCard && activeCard.getAttribute('data-dept')) {
            selectedDept = activeCard.getAttribute('data-dept');
        }
        const pass = deptPasscode ? String(deptPasscode.value || '').trim() : '';
        const remember = !!(rememberCheck && rememberCheck.checked);

        if (!pass) {
            if (loginAlertBox) {
                loginAlertBox.style.display = 'block';
                loginAlertBox.textContent = 'Enter the PIN for the selected stream.';
            }
            if (deptPasscode) deptPasscode.focus();
            return;
        }

        setLoginBusy(true);
        if (loginAlertBox) loginAlertBox.style.display = 'none';

        try {
            const res = await authenticateWithServer(selectedDept, pass);
            if (res && res.ok) {
                const loginStream = res.stream || selectedDept;
                if (res.matchedOtherStream && loginStream !== selectedDept) {
                    selectedDept = loginStream;
                }
                syncLocalPasscodeFromLogin(loginStream, res.role || 'TEACHER', pass);
                finishLoginSuccess(res.role || 'TEACHER', loginStream, pass, remember);
                return;
            }
            if (res && res.slow) {
                if (loginAlertBox) {
                    loginAlertBox.style.display = 'block';
                    loginAlertBox.textContent = res.message || 'Server slow — try again.';
                }
            } else if (res && res.offline) {
                if (loginAlertBox) {
                    loginAlertBox.style.display = 'block';
                    loginAlertBox.textContent = res.message || 'Offline — wrong PIN or no saved PIN for this stream.';
                }
            } else {
                if (loginAlertBox) {
                    loginAlertBox.style.display = 'block';
                    loginAlertBox.textContent = (res && res.message) || 'Invalid PIN for this stream.';
                }
            }
        } catch (e) {
            if (loginAlertBox) {
                loginAlertBox.style.display = 'block';
                loginAlertBox.textContent = 'Login failed. Check Wi‑Fi and try again.';
            }
        }
        setLoginBusy(false);
        if (deptPasscode) {
            deptPasscode.focus();
            deptPasscode.select();
        }
    };

    // Card click = select stream only (do not auto-enter)
    deptCards.forEach(card => {
        card.addEventListener('click', () => {
            deptCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            selectedDept = card.getAttribute('data-dept') || 'BCA';
            if (loginAlertBox) loginAlertBox.style.display = 'none';
            if (deptPasscode) deptPasscode.focus();
        });
    });

    if (deptLoginForm) {
        deptLoginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            runLogin();
        });
        if (loginBtnEl) {
            loginBtnEl.addEventListener('click', (e) => {
                e.preventDefault();
                runLogin();
            });
        }
    }

    const togglePassBtn = document.getElementById('togglePassBtn');
    if (togglePassBtn && deptPasscode) {
        togglePassBtn.addEventListener('click', () => {
            deptPasscode.type = deptPasscode.type === 'password' ? 'text' : 'password';
        });
    }

    if (activeDeptBadge) {
        activeDeptBadge.style.cursor = 'pointer';
        activeDeptBadge.title = 'Tap to switch stream (re-login with PIN)';
        activeDeptBadge.addEventListener('click', () => {
            wipeHODPortalState();
            if (loginAlertBox) loginAlertBox.style.display = 'none';
            document.querySelectorAll('.dept-card').forEach(c => {
                const d = c.getAttribute('data-dept');
                c.classList.toggle('active', d === currentDept);
                if (d === currentDept) selectedDept = currentDept;
            });
            if (deptPasscode) deptPasscode.value = '';
            if (deptLoginModal) {
                deptLoginModal.classList.add('active');
                deptLoginModal.style.display = '';
            }
            if (deptPasscode) deptPasscode.focus();
        });
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.style.display = '';
        logoutBtn.addEventListener('click', () => {
            isHODAuthenticated = false;
            pendingHODTabSwitch = false;
            clearAuthSession();
            localStorage.removeItem('mgmec_dept');
            localStorage.removeItem('mgmec_role');
            if (deptPasscode) deptPasscode.value = '';
            if (loginAlertBox) loginAlertBox.style.display = 'none';
            wipeHODPortalState();
            try { switchMode('typing'); } catch (e) {}
            if (deptLoginModal) {
                deptLoginModal.classList.add('active');
                deptLoginModal.style.display = '';
            }
            if (deptPasscode) deptPasscode.focus();
        });
    }

    // Remembered session: restore if PIN still valid
    const savedDept = localStorage.getItem('mgmec_dept') || localStorage.getItem('mgmec_auth_stream');
    const rememberedPass = localStorage.getItem('mgmec_remember_pass') || localStorage.getItem('mgmec_session_pass') || '';
    if (savedDept && DEPT_CONFIG[savedDept] && rememberedPass && rememberedPass !== 'open' && rememberedPass !== 'BYPASS') {
        restoreAuthSessionFromRemember();
        currentRole = localStorage.getItem('mgmec_role') || 'TEACHER';
        isHODAuthenticated = true;
        selectDepartment(savedDept);
        applyRoleUI();
        try { switchMode('typing'); } catch (e) {}
        if (deptLoginModal) {
            deptLoginModal.classList.remove('active');
            deptLoginModal.style.display = '';
        }

        if (navigator.onLine) {
            authenticateWithServer(savedDept, rememberedPass).then((res) => {
                if (res && res.ok) {
                    syncLocalPasscodeFromLogin(savedDept, res.role || currentRole, rememberedPass);
                    if (res.role) {
                        currentRole = res.role === 'HOD' ? 'TEACHER' : res.role;
                        localStorage.setItem('mgmec_role', currentRole);
                        applyRoleUI();
                    }
                    return;
                }
                if (res && !res.offline && !res.slow) {
                    clearAuthSession();
                    localStorage.removeItem('mgmec_dept');
                    isHODAuthenticated = false;
                    if (loginAlertBox) {
                        loginAlertBox.style.display = 'block';
                        loginAlertBox.textContent =
                            'PIN was changed. Enter the new stream PIN to continue.';
                    }
                    if (deptPasscode) deptPasscode.value = '';
                    if (deptLoginModal) deptLoginModal.classList.add('active');
                }
            }).catch(() => {});
        }
    } else {
        isHODAuthenticated = false;
        if (deptLoginModal) {
            deptLoginModal.classList.add('active');
            deptLoginModal.style.display = '';
        }
        selectDepartment('BCA');
        applyRoleUI();
        try { switchMode('typing'); } catch (e) {}
    }
}

function selectDepartment(deptCode) {
    const dept = (deptCode || 'BCA').toUpperCase();
    if (!DEPT_CONFIG[dept]) return;
    
    currentDept = dept;
    try { localStorage.setItem('mgmec_auth_stream', dept); } catch (e) {}
    try { localStorage.setItem('mgmec_dept', dept); } catch (e) {}

    const deptConfig = DEPT_CONFIG[dept];
    const deptSubtitle = document.getElementById('deptSubtitle');
    const activeDeptBadge = document.getElementById('activeDeptBadge');
    const activeDeptText = document.getElementById('activeDeptText');

    if (deptSubtitle) deptSubtitle.textContent = deptConfig.name;
    if (activeDeptText) activeDeptText.textContent = deptConfig.code;

    if (activeDeptBadge) {
        activeDeptBadge.className = 'dept-active-badge ' + deptConfig.badgeClass;
        activeDeptBadge.title = `Active: ${deptConfig.name} — Click to switch department`;
    }

    updateSectionDropdownOptions(dept);
    updateYearSelects(deptConfig);

    const initialDate = directDateInput ? directDateInput.value : getTodayISOString();
    updateSlotDropdownOptions(initialDate);

    const yr = directYearSelect ? directYearSelect.value : 'First Year';
    const sec = directSectionSelect ? directSectionSelect.value : (deptConfig.hasSections ? 'A' : 'ONLY');
    const yearSubjects = getSubjectsForActiveYear(dept, yr, sec);
    updateSubjectDropdowns(yearSubjects, deptConfig.defaultSubject);

    updateSamplePresetsUI();
    updateTodayBadge();

    const hodStreamSelect = document.getElementById('hodStreamSelect');
    if (hodStreamSelect && hodStreamSelect.value !== dept) {
        hodStreamSelect.value = dept;
    }

    applyRoleUI();
    fetchCloudSubjects();
    if (navigator.onLine) {
        fetchTodayServerHistory();
    }
}

function addSelectPlaceholder(selectEl, label) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = label;
    opt.disabled = true;
    opt.hidden = true;
    selectEl.appendChild(opt);
}

function updateSectionDropdownOptions(deptCode) {
    const dept = deptCode || currentDept || 'BCA';
    const deptConfig = DEPT_CONFIG[dept] || DEPT_CONFIG.BCA;

    const sectionSelects = [
        document.getElementById('directSectionSelect'),
        document.getElementById('sectionSelect'),
        document.getElementById('bulkSectionSelect')
    ];

    sectionSelects.forEach(sel => {
        if (!sel) return;
        const currentVal = sel.value;
        const isBulk = sel.id === 'bulkSectionSelect';
        sel.innerHTML = '';
        if (!isBulk) addSelectPlaceholder(sel, 'Select Section');
        if (deptConfig.hasSections) {
            // BCA: Sec A, Sec B, Combined
            const optA = document.createElement('option');
            optA.value = 'A'; optA.textContent = 'Section A';
            const optB = document.createElement('option');
            optB.value = 'B'; optB.textContent = 'Section B';
            const optAll = document.createElement('option');
            optAll.value = 'ALL'; optAll.textContent = 'Combined (Sec A & B / Electives)';

            sel.appendChild(optA);
            sel.appendChild(optB);
            sel.appendChild(optAll);

            if (isBulk) {
                sel.value = (currentVal === 'A' || currentVal === 'B' || currentVal === 'ALL') ? currentVal : 'A';
            } else {
                sel.value = (currentVal === 'A' || currentVal === 'B' || currentVal === 'ALL') ? currentVal : '';
            }
        } else {
            // BCom / BBA: Main Class (ONLY), Combined (ALL)
            const optMain = document.createElement('option');
            optMain.value = 'ONLY'; optMain.textContent = 'Main Class / Common';
            const optAll = document.createElement('option');
            optAll.value = 'ALL'; optAll.textContent = 'Combined (Elective / Language)';

            sel.appendChild(optMain);
            sel.appendChild(optAll);

            if (isBulk) {
                sel.value = (currentVal === 'ONLY' || currentVal === 'ALL') ? currentVal : 'ONLY';
            } else {
                sel.value = (currentVal === 'ONLY' || currentVal === 'ALL') ? currentVal : '';
            }
        }
    });
}

function updateSlotDropdownOptions(dateVal) {
    const times = getSlotTimeLabels(dateVal);
    const isSat = isSaturdayDate(dateVal);
    const headerPrefix = isSat ? 'Sat' : 'Mon-Fri';

    const slotSelects = [
        document.getElementById('directSlotSelect'),
        document.getElementById('slotSelect'),
        document.getElementById('bulkSlotSelect')
    ];

    slotSelects.forEach(sel => {
        if (!sel) return;
        const currentVal = sel.value;
        const isBulk = sel.id === 'bulkSlotSelect';
        sel.innerHTML = '';
        if (!isBulk) addSelectPlaceholder(sel, 'Select Slot');
        for (let i = 1; i <= 6; i++) {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = `Slot ${i} (${times[i]}) [${headerPrefix}]`;
            sel.appendChild(opt);
        }
        const slotNum = parseInt(currentVal, 10);
        if (isBulk) {
            sel.value = (slotNum >= 1 && slotNum <= 6) ? String(slotNum) : '1';
        } else {
            sel.value = (slotNum >= 1 && slotNum <= 6) ? String(slotNum) : '';
        }
    });
}

function updateSamplePresetsUI() {
    const presetContainer = document.querySelector('.preset-pills');
    if (!presetContainer) return;

    if (currentDept === 'BCA') {
        presetContainer.innerHTML = `
            <button class="preset-pill" data-phrase="26709 26717 English First Year Sec A Slot 1">
              "26709 26717 English 1st Yr Sec A Slot 1"
            </button>
            <button class="preset-pill" data-phrase="Roll numbers 26701, 26705 2nd Year BCA Sec B Java 2.15-3.00">
              "Roll 26701, 26705 2nd Yr Sec B Java 2.15-3.00"
            </button>
            <button class="preset-pill" data-phrase="Third year Combined Database slot 1 absentees 5 8 19">
              "3rd Yr Combined Database Slot 1 - Absentees 5, 8, 19"
            </button>`;
    } else if (currentDept === 'BCOM') {
        presetContainer.innerHTML = `
            <button class="preset-pill" data-phrase="101 105 Financial Accounting First Year Slot 1">
              "101 105 Financial Accounting 1st Yr Slot 1"
            </button>
            <button class="preset-pill" data-phrase="201 204 Corporate Accounting 2nd Year 2.15-3.00">
              "201 204 Corporate Accounting 2nd Yr 2.15-3.00"
            </button>
            <button class="preset-pill" data-phrase="3rd year Combined Kannada slot 1 absentees 12 15">
              "3rd Yr Combined Kannada Slot 1 - Absentees 12, 15"
            </button>`;
    } else if (currentDept === 'BBA') {
        presetContainer.innerHTML = `
            <button class="preset-pill" data-phrase="301 305 Principles of Management First Year Slot 1">
              "301 305 Principles of Management 1st Yr Slot 1"
            </button>
            <button class="preset-pill" data-phrase="401 405 Marketing Management 2nd Year 2.15-3.00">
              "401 405 Marketing Management 2nd Yr 2.15-3.00"
            </button>
            <button class="preset-pill" data-phrase="3rd year Combined Hindi slot 1 absentees 8 11">
              "3rd Yr Combined Hindi Slot 1 - Absentees 8, 11"
            </button>`;
    }

    presetContainer.querySelectorAll('.preset-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            const phrase = btn.getAttribute('data-phrase');
            if (phrase) autoProcessSpeech(phrase);
        });
    });
}

function applyRoleUI() {
    const hodRoleBadge = document.getElementById('hodRoleBadge');
    const hodStreamSelect = document.getElementById('hodStreamSelect');
    const shortageDeptSelect = document.getElementById('shortageDeptSelect');
    const hodFetchBtnText = document.getElementById('hodFetchBtnText');
    const deptConfig = DEPT_CONFIG[currentDept] || DEPT_CONFIG.BCA;
    const stream = currentDept || 'BCA';
    const deptLabel = stream === 'BCOM' ? 'B.Com' : stream;

    lockStreamSelectToDept(hodStreamSelect, stream);
    lockStreamSelectToDept(shortageDeptSelect, stream);

    if (hodRoleBadge) {
        hodRoleBadge.style.display = '';
        hodRoleBadge.className = 'badge badge-success';
        hodRoleBadge.textContent = '🔒 Parent Informer (' + deptLabel + ')';
    }

    if (hodFetchBtnText) {
        hodFetchBtnText.textContent = `🔄 Fetch ${deptLabel} Absentees`;
    }
}

/** Parent Informer / Shortage: only the logged-in stream (BCA→BCA, BCOM→BCOM, BBA→BBA). */
function lockStreamSelectToDept(selectEl, deptCode) {
    if (!selectEl) return;
    const dept = (deptCode || currentDept || 'BCA').toUpperCase();
    const labels = {
        BCA: 'BCA (Computer Applications)',
        BCOM: 'B.Com (Bachelor of Commerce)',
        BBA: 'BBA (Business Administration)'
    };
    const shortLabels = { BCA: 'BCA', BCOM: 'B.Com', BBA: 'BBA' };
    const isShortage = selectEl.id === 'shortageDeptSelect';
    selectEl.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = dept;
    opt.textContent = isShortage ? (shortLabels[dept] || dept) : (labels[dept] || dept);
    opt.selected = true;
    selectEl.appendChild(opt);
    selectEl.value = dept;
    selectEl.disabled = true;
    selectEl.title = 'Locked to your logged-in stream (' + (shortLabels[dept] || dept) + ')';
}

function applyDepartment(deptCode) {
    selectDepartment(deptCode);
}

function updateYearSelects(config) {
    const yearSelects = [directYearSelect, yearSelect];
    const streamLabel = (config && config.code) || 'BCA';

    yearSelects.forEach(selectEl => {
        if (!selectEl) return;
        const curVal = selectEl.value;
        selectEl.innerHTML = '';
        addSelectPlaceholder(selectEl, 'Select Year');
        const years = [
            { val: 'First Year', label: 'First Year ' + streamLabel },
            { val: 'Second Year', label: 'Second Year ' + streamLabel },
            { val: 'Third Year', label: 'Third Year ' + streamLabel }
        ];
        years.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y.val;
            opt.textContent = y.label;
            selectEl.appendChild(opt);
        });
        selectEl.value = years.some(y => y.val === curVal) ? curVal : '';
    });
}

function getCustomSubjectsStore() {
    try {
        return JSON.parse(localStorage.getItem('mgmec_custom_subjects') || '{}');
    } catch (e) {
        return {};
    }
}

function saveCustomSubjectsStore(store) {
    localStorage.setItem('mgmec_custom_subjects', JSON.stringify(store));
}

function getCloudSubjectsStore() {
    try {
        return JSON.parse(localStorage.getItem('mgmec_cloud_subjects') || '{}');
    } catch (e) {
        return {};
    }
}

function saveCloudSubjectsStore(store) {
    localStorage.setItem('mgmec_cloud_subjects', JSON.stringify(store));
}

function getElectiveFlagsStore() {
    try {
        return JSON.parse(localStorage.getItem('mgmec_elective_flags') || '{}');
    } catch (e) {
        return {};
    }
}

function saveElectiveFlagsStore(store) {
    localStorage.setItem('mgmec_elective_flags', JSON.stringify(store));
}

function sendSubjectToCloud(action, deptCode, yearStr, subjName, isElective, sectionStr, oldSubjectName, oldSectionStr) {
    const targetSec = sectionStr || 'COMMON';
    const payload = withAuth({
        action: action,
        stream: deptCode,
        year: yearStr,
        section: targetSec,
        subject: subjName,
        oldSubject: oldSubjectName || '',
        oldSection: oldSectionStr || '',
        isElective: isElective === true || isElective === 'true' || normalizeSectionCode(targetSec) === 'ALL'
    });
    const targetUrl = getWebhookUrl(deptCode);

    submitViaHiddenForm(targetUrl, payload).catch(e => console.warn('[SubjectSync] Hidden form submission error:', e));

    return new Promise((resolve) => {
        const cbName = 'mgmSubjSync_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
        let scriptEl = null;
        let completed = false;

        const cleanup = () => {
            if (scriptEl && scriptEl.parentNode) {
                try { scriptEl.parentNode.removeChild(scriptEl); } catch (e) {}
            }
            try { delete window[cbName]; } catch (e) {}
        };

        const timeout = setTimeout(() => {
            if (completed) return;
            completed = true;
            cleanup();
            resolve(false);
        }, 5000);

        window[cbName] = function (data) {
            if (completed) return;
            completed = true;
            clearTimeout(timeout);
            cleanup();
            console.log('[SubjectSync] Cloud response received via JSONP:', data);
            resolve(data && data.result === 'success');
        };

        const params = new URLSearchParams({
            action: action,
            stream: deptCode,
            year: yearStr,
            section: targetSec,
            subject: subjName,
            oldSubject: oldSubjectName || '',
            oldSection: oldSectionStr || '',
            isElective: payload.isElective ? 'true' : 'false',
            callback: cbName
        });
        appendAuthToParams(params);

        scriptEl = document.createElement('script');
        scriptEl.src = targetUrl + (targetUrl.indexOf('?') >= 0 ? '&' : '?') + params.toString();
        scriptEl.onerror = function () {
            if (completed) return;
            completed = true;
            clearTimeout(timeout);
            cleanup();
            resolve(false);
        };
        document.body.appendChild(scriptEl);
    }).finally(() => {
        try { localStorage.setItem('mgmec_subject_sync_trigger', String(Date.now())); } catch (e) {}
    });
}

let subjectsFetchInFlight = false;
let subjectsAuthPrompted = false;

if (typeof window !== 'undefined') {
    setInterval(() => {
        fetchCloudSubjects();
    }, 12000);
}

if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('storage', (e) => {
        if (e.key === 'mgmec_subject_sync_trigger') {
            fetchCloudSubjects();
        }
    });
}

function fetchCloudSubjects() {
    if (typeof document === 'undefined' || !document.createElement) return;
    if (subjectsFetchInFlight) return;

    subjectsFetchInFlight = true;
    const targetUrl = getWebhookUrl(currentDept);
    const cbName = 'mgmSubjectsCb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    let scriptEl = null;

    const finishFetch = () => {
        subjectsFetchInFlight = false;
        clearTimeout(timeout);
        try { delete window[cbName]; } catch (e) {}
        if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
    };

    const timeout = setTimeout(() => {
        finishFetch();
    }, 8000);

    window[cbName] = function (data) {
        finishFetch();

        if (data && data.result === 'success') {
            subjectsAuthPrompted = false;
            const deletedStore = getDeletedSubjectsStore();

            if (data.deletedSubjects) {
                // Merge cloud deletedSubjects with local deletedStore
                for (let dDept in data.deletedSubjects) {
                    if (!deletedStore[dDept]) deletedStore[dDept] = {};
                    for (let dYr in data.deletedSubjects[dDept]) {
                        if (!deletedStore[dDept][dYr]) deletedStore[dDept][dYr] = [];
                        const cloudDelArr = data.deletedSubjects[dDept][dYr] || [];
                        cloudDelArr.forEach(s => {
                            if (!deletedStore[dDept][dYr].some(x => x.toLowerCase() === s.toLowerCase())) {
                                deletedStore[dDept][dYr].push(s);
                            }
                        });
                    }
                }
                saveDeletedSubjectsStore(deletedStore);

                // Purge cloud-deleted subjects from local device customStore
                const customStore = getCustomSubjectsStore();
                let customChanged = false;
                for (let dDept in deletedStore) {
                    for (let dYr in deletedStore[dDept]) {
                        const delList = deletedStore[dDept][dYr] || [];
                        if (customStore[dDept] && customStore[dDept][dYr]) {
                            const beforeLen = customStore[dDept][dYr].length;
                            customStore[dDept][dYr] = customStore[dDept][dYr].filter(s => {
                                const item = extractSubjNameAndSection(s);
                                return !isSubjectTombstoned(delList, item.name, item.section);
                            });
                            if (customStore[dDept][dYr].length !== beforeLen) customChanged = true;
                        }
                    }
                }
                if (customChanged) {
                    saveCustomSubjectsStore(customStore);
                }
            }

            if (data.customSubjects) {
                // Sheet is source of truth. Active (ADD) subjects on the sheet undelete local tombstones
                // so a subject added on PC is not hidden forever on mobile after an old Clear All.
                let deletedChanged = false;
                const cleanedCloudSubjects = {};
                for (let deptKey in data.customSubjects) {
                    cleanedCloudSubjects[deptKey] = {};
                    for (let yrKey in data.customSubjects[deptKey]) {
                        const subjs = data.customSubjects[deptKey][yrKey] || [];
                        if (deletedStore[deptKey] && deletedStore[deptKey][yrKey]) {
                            const before = deletedStore[deptKey][yrKey].length;
                            const activeNames = subjs.map(s => extractSubjNameAndSection(s).name.toLowerCase());
                            const activeKeys = subjs.map(s => {
                                const it = extractSubjNameAndSection(s);
                                return subjectScopeKey(it.name, it.section).toLowerCase();
                            });
                            deletedStore[deptKey][yrKey] = deletedStore[deptKey][yrKey].filter(d => {
                                const dl = String(d || '').toLowerCase();
                                if (dl.indexOf('::') !== -1) return !activeKeys.includes(dl);
                                return !activeNames.includes(dl);
                            });
                            if (deletedStore[deptKey][yrKey].length !== before) deletedChanged = true;
                        }
                        const delList = (deletedStore[deptKey] && deletedStore[deptKey][yrKey]) ? deletedStore[deptKey][yrKey] : [];
                        cleanedCloudSubjects[deptKey][yrKey] = subjs.filter(s => {
                            const item = extractSubjNameAndSection(s);
                            return !isSubjectTombstoned(delList, item.name, item.section);
                        });
                    }
                }
                if (deletedChanged) saveDeletedSubjectsStore(deletedStore);
                saveCloudSubjectsStore(cleanedCloudSubjects);

                // Drop local cleared lock once sheet sync succeeds
                try {
                    const clearedStore = getClearedDeptsStore();
                    let clearedChanged = false;
                    for (let deptKey in data.customSubjects) {
                        if (clearedStore[deptKey]) {
                            delete clearedStore[deptKey];
                            clearedChanged = true;
                        }
                    }
                    if (clearedChanged) saveClearedDeptsStore(clearedStore);
                } catch (e) {}
            }

            if (data.electiveSubjects) {
                const flags = getElectiveFlagsStore();
                Object.assign(flags, data.electiveSubjects);
                saveElectiveFlagsStore(flags);
            }

            const activeYear = directYearSelect ? directYearSelect.value : 'First Year';
            refreshSubjectDropdowns();
            const subjectManageModal = document.getElementById('subjectManageModal');
            if (subjectManageModal && subjectManageModal.classList.contains('active')) {
                renderSubjectChips();
            }
        } else if (data && (data.error === 'Unauthorized' || data.result === 'error')) {
            console.warn('[Subjects] Cloud fetch failed:', data.message || data.error || '');
        }
    };

    const params = new URLSearchParams({
        action: 'get_subjects',
        callback: cbName
    });
    appendAuthToParams(params);

    scriptEl = document.createElement('script');
    scriptEl.src = targetUrl + (targetUrl.indexOf('?') >= 0 ? '&' : '?') + params.toString();
    scriptEl.onerror = function () {
        finishFetch();
    };
    document.body.appendChild(scriptEl);
}

function getClearedDeptsStore() {
    try {
        return JSON.parse(localStorage.getItem('mgmec_cleared_depts') || '{}');
    } catch (e) {
        return {};
    }
}

function saveClearedDeptsStore(store) {
    try {
        localStorage.setItem('mgmec_cleared_depts', JSON.stringify(store || {}));
    } catch (e) {}
}

function getDeletedSubjectsStore() {
    try {
        return JSON.parse(localStorage.getItem('mgmec_deleted_subjects') || '{}');
    } catch (e) {
        return {};
    }
}

function saveDeletedSubjectsStore(store) {
    localStorage.setItem('mgmec_deleted_subjects', JSON.stringify(store));
}

function beginSubjectEdit(subjName, sectionHint) {
    const activeYear = directYearSelect ? directYearSelect.value : 'First Year';
    const newSubjectInput = document.getElementById('newSubjectInput');
    const addSubjectBtn = document.getElementById('addSubjectBtn');
    const oldNameInput = document.getElementById('editingSubjectOldName');
    const oldSecInput = document.getElementById('editingSubjectOldSection');
    const electiveCheck = document.getElementById('newSubjectElectiveCheck');
    const secSelect = document.getElementById('newSubjectSectionSelect');
    const hint = document.getElementById('subjectEditHint');

    const item = typeof subjName === 'object' ? extractSubjNameAndSection(subjName) : { name: subjName, section: sectionHint || 'COMMON' };
    const tagInfo = formatSectionTagLabel(item.section || sectionHint || 'COMMON');
    const isElec = normalizeSectionCode(item.section) === 'ALL';

    if (oldNameInput) oldNameInput.value = item.name;
    if (oldSecInput) oldSecInput.value = item.section || 'COMMON';
    if (newSubjectInput) {
        newSubjectInput.value = item.name;
        newSubjectInput.focus();
    }
    if (addSubjectBtn) addSubjectBtn.textContent = 'Save';
    populateModalSectionOptions();
    if (secSelect) {
        const want = canonicalSectionStorage(item.section || 'COMMON');
        if (Array.from(secSelect.options).some(o => o.value === want)) secSelect.value = want;
        else if (Array.from(secSelect.options).some(o => normalizeSectionCode(o.value) === normalizeSectionCode(want))) {
            secSelect.value = Array.from(secSelect.options).find(o => normalizeSectionCode(o.value) === normalizeSectionCode(want)).value;
        }
    }
    if (electiveCheck) electiveCheck.checked = !!isElec;
    if (hint) {
        hint.style.display = 'block';
        hint.textContent = 'Editing "' + item.name + '" (' + tagInfo.label + '). Change name/scope, then Save.';
    }
}

function clearSubjectEditForm() {
    const newSubjectInput = document.getElementById('newSubjectInput');
    const addSubjectBtn = document.getElementById('addSubjectBtn');
    const oldNameInput = document.getElementById('editingSubjectOldName');
    const oldSecInput = document.getElementById('editingSubjectOldSection');
    const electiveCheck = document.getElementById('newSubjectElectiveCheck');
    const hint = document.getElementById('subjectEditHint');
    if (oldNameInput) oldNameInput.value = '';
    if (oldSecInput) oldSecInput.value = '';
    if (newSubjectInput) newSubjectInput.value = '';
    if (addSubjectBtn) addSubjectBtn.textContent = '+ Add';
    if (electiveCheck) electiveCheck.checked = false;
    if (hint) {
        hint.style.display = 'none';
        hint.textContent = '';
    }
}

function canonicalSectionStorage(sec) {
    const n = normalizeSectionCode(sec);
    if (n === 'C_AIML') return 'C (AIML)';
    if (n === 'C_TP') return 'C (TP)';
    if (n === 'C_AF') return 'C (AF)';
    if (n === 'COMMON') return 'COMMON';
    if (n === 'ALL') return 'ALL';
    if (n === 'A_B') return 'A_B';
    return n;
}

function upsertLocalSubject(deptCode, yearStr, name, section, isElective, oldName, oldSection) {
    const store = getCustomSubjectsStore();
    if (!store[deptCode]) store[deptCode] = {};
    if (!store[deptCode][yearStr]) store[deptCode][yearStr] = [];
    const secNorm = section || 'A_B';
    const oldSec = oldSection || secNorm;

    if (oldName) {
        store[deptCode][yearStr] = store[deptCode][yearStr].filter(s => {
            const item = extractSubjNameAndSection(s);
            const nameMatch = item.name.trim().toLowerCase() === oldName.toLowerCase();
            const secMatch = sectionsEqualForSubject(item.section, oldSec);
            return !(nameMatch && secMatch);
        });
        const cloudStore = getCloudSubjectsStore();
        if (cloudStore[deptCode] && cloudStore[deptCode][yearStr]) {
            cloudStore[deptCode][yearStr] = cloudStore[deptCode][yearStr].filter(s => {
                const item = extractSubjNameAndSection(s);
                const nameMatch = item.name.trim().toLowerCase() === oldName.toLowerCase();
                const secMatch = sectionsEqualForSubject(item.section, oldSec);
                return !(nameMatch && secMatch);
            });
            saveCloudSubjectsStore(cloudStore);
        }
        const flags = getElectiveFlagsStore();
        delete flags[(deptCode + '_' + yearStr + '_' + oldName).toLowerCase()];
        saveElectiveFlagsStore(flags);
    }

    const subjObj = { name: name, section: secNorm };
    const existingIdx = store[deptCode][yearStr].findIndex(s => {
        const item = extractSubjNameAndSection(s);
        return item.name.trim().toLowerCase() === name.toLowerCase() &&
            sectionsEqualForSubject(item.section, secNorm);
    });
    if (existingIdx !== -1) store[deptCode][yearStr][existingIdx] = subjObj;
    else store[deptCode][yearStr].push(subjObj);
    saveCustomSubjectsStore(store);

    const flags = getElectiveFlagsStore();
    flags[(deptCode + '_' + yearStr + '_' + name).toLowerCase()] = !!isElective || normalizeSectionCode(secNorm) === 'ALL';
    saveElectiveFlagsStore(flags);

    const deletedStore = getDeletedSubjectsStore();
    if (deletedStore[deptCode] && deletedStore[deptCode][yearStr]) {
        const dk = subjectScopeKey(name, secNorm);
        deletedStore[deptCode][yearStr] = deletedStore[deptCode][yearStr].filter(s =>
            s !== dk && s.toLowerCase() !== name.toLowerCase()
        );
        saveDeletedSubjectsStore(deletedStore);
    }
}

function deleteSubject(deptCode, yearStr, subjName, sectionHint) {
    if (!subjName) return;
    const itemIn = typeof subjName === 'string' ? { name: subjName.trim(), section: sectionHint || '' } : extractSubjNameAndSection(subjName);
    const targetName = itemIn.name.trim();
    if (!targetName) return;
    const targetSec = sectionHint || itemIn.section || '';

    const customStore = getCustomSubjectsStore();
    if (customStore[deptCode] && customStore[deptCode][yearStr]) {
        customStore[deptCode][yearStr] = customStore[deptCode][yearStr].filter(s => {
            const item = extractSubjNameAndSection(s);
            if (item.name.trim().toLowerCase() !== targetName.toLowerCase()) return true;
            if (targetSec) return !sectionsEqualForSubject(item.section, targetSec);
            return false;
        });
        saveCustomSubjectsStore(customStore);
    }

    const cloudStore = getCloudSubjectsStore();
    if (cloudStore[deptCode] && cloudStore[deptCode][yearStr]) {
        cloudStore[deptCode][yearStr] = cloudStore[deptCode][yearStr].filter(s => {
            const item = extractSubjNameAndSection(s);
            if (item.name.trim().toLowerCase() !== targetName.toLowerCase()) return true;
            if (targetSec) return !sectionsEqualForSubject(item.section, targetSec);
            return false;
        });
        saveCloudSubjectsStore(cloudStore);
    }

    const deletedStore = getDeletedSubjectsStore();
    if (!deletedStore[deptCode]) deletedStore[deptCode] = {};
    if (!deletedStore[deptCode][yearStr]) deletedStore[deptCode][yearStr] = [];
    const dk = subjectScopeKey(targetName, targetSec || 'ALL');
    if (!deletedStore[deptCode][yearStr].includes(dk)) {
        deletedStore[deptCode][yearStr].push(dk);
        saveDeletedSubjectsStore(deletedStore);
    }

    sendSubjectToCloud('delete_subject', deptCode, yearStr, targetName, false, targetSec || 'ALL')
        .catch(e => console.warn('Subject delete cloud sync error:', e));

    showCustomToast('Subject Deleted Across College', '"' + targetName + '" removed from ' + deptCode + ' ' + yearStr + ' on all devices.');
}

function extractSubjNameAndSection(subj) {
    if (!subj) return { name: '', section: 'ALL' };
    if (typeof subj === 'string') return { name: subj, section: 'ALL' };
    return { name: subj.name || subj.subject || '', section: subj.section || 'ALL' };
}

function normalizeSectionCode(sec) {
    if (!sec) return 'ALL';
    const s = String(sec).trim().toUpperCase();
    if (s === 'ALL' || s === 'COMBINED' || s === 'ANY' || s === 'ELECTIVE') return 'ALL';
    if (s === 'COMMON' || s === 'SECTION COMMON' || s === 'ALL CLASSES' || s === 'SHARED') return 'COMMON';
    if (s === 'A_B' || s === 'A&B' || s === 'A AND B' || s === 'AB') return 'A_B';
    if (s === 'C (AIML)' || s === 'C AIML' || s === 'AIML') return 'C_AIML';
    if (s === 'C (TP)' || s === 'C TP' || s === 'TP') return 'C_TP';
    if (s === 'C (AF)' || s === 'C AF' || s === 'AF' || s === 'D') return 'C_AF';
    if (s === 'A' || s === 'B' || s === 'C') return s;
    return s;
}

/**
 * Scope rules:
 * - ALL (Combined elective): Combined attendance only (Kannada/Hindi/Sanskrit)
 * - COMMON (all classes, not elective): Sec A, B, C — NOT Combined (English, CONST, FOC…)
 * - A_B: Sec A / B only
 * - C_AIML: Sec C (AIML) only
 */
function isCustomSubjectMatchingSection(subjObj, targetSec) {
    const sSec = normalizeSectionCode(subjObj.section || 'ALL');
    const target = normalizeSectionCode(targetSec || 'A');

    if (target === 'ALL') {
        return sSec === 'ALL';
    }

    // Combined electives never show under A/B/C or ONLY
    if (sSec === 'ALL') {
        return false;
    }

    // Single Main Class (BCom / BBA): matches any non-ALL subject
    if (target === 'ONLY') {
        return sSec !== 'ALL';
    }

    // Common core subjects: every concrete class section, not Combined
    if (sSec === 'COMMON') {
        return target === 'A' || target === 'B' || target === 'C' ||
            target === 'C_AIML' || target === 'C_TP' || target === 'C_AF' || target === 'A_B' || target === 'ONLY';
    }

    if (sSec === target) return true;

    if ((sSec === 'C_AIML' && target === 'C') || (sSec === 'C' && target === 'C_AIML')) {
        return true;
    }

    if (sSec === 'A_B' && (target === 'A' || target === 'B')) {
        return true;
    }

    if (target === 'A_B') {
        return sSec === 'A_B' || sSec === 'A' || sSec === 'B';
    }

    if (target === 'C_TP') return sSec === 'C_TP';
    if (target === 'C_AF') return sSec === 'C_AF';
    if (target === 'C_AIML') return sSec === 'C_AIML' || sSec === 'C';

    return false;
}

function subjectScopeKey(name, section) {
    return String(name || '').trim().toLowerCase() + '::' + normalizeSectionCode(section);
}

/** Tombstone may be name::SECTION or legacy bare name (hides all scopes of that name). */
function isSubjectTombstoned(deletedList, name, section) {
    const dk = subjectScopeKey(name, section).toLowerCase();
    const nameLower = String(name || '').trim().toLowerCase();
    return (deletedList || []).some(d => {
        const dl = String(d || '').toLowerCase();
        if (dl === dk) return true;
        if (dl.indexOf('::') !== -1) return false;
        return dl === nameLower;
    });
}

function sectionsEqualForSubject(a, b) {
    return normalizeSectionCode(a) === normalizeSectionCode(b);
}

function subjectListFingerprint(subjects) {
    return (subjects || []).map(s => String(s).toLowerCase()).join('\u0001');
}

function refreshSubjectDropdowns(preferredSubject) {
    const yr = directYearSelect ? directYearSelect.value : 'First Year';
    const sec = directSectionSelect ? directSectionSelect.value : 'A';
    const list = getSubjectsForActiveYear(currentDept, yr, sec);
    const config = DEPT_CONFIG[currentDept];
    updateSubjectDropdowns(list, preferredSubject || (config ? config.defaultSubject : null));
}

function getSubjectsForActiveYear(deptCode, yearStr, sectionStr) {
    const config = DEPT_CONFIG[deptCode];
    if (!config) return [];

    let baseSubjects = [];
    const sec = sectionStr || 'A';
    const targetNorm = normalizeSectionCode(sec);

    if (targetNorm !== 'ALL' && config.subjectsByYearAndSection && config.subjectsByYearAndSection[yearStr]) {
        const secMap = config.subjectsByYearAndSection[yearStr];

        const pushUnique = (arr) => {
            (arr || []).forEach(s => {
                if (!baseSubjects.some(x => x.toLowerCase() === String(s).toLowerCase())) {
                    baseSubjects.push(s);
                }
            });
        };

        // Exact key match
        for (let k in secMap) {
            if (normalizeSectionCode(k) === targetNorm) pushUnique(secMap[k]);
        }
        // A/B also get A_B pool from config if present
        if (targetNorm === 'A' || targetNorm === 'B') {
            for (let k in secMap) {
                if (normalizeSectionCode(k) === 'A_B') pushUnique(secMap[k]);
            }
        }
        // C (attendance) also try C / C (AIML) keys
        if (targetNorm === 'C' || targetNorm === 'C_AIML') {
            for (let k in secMap) {
                const nk = normalizeSectionCode(k);
                if (nk === 'C' || nk === 'C_AIML') pushUnique(secMap[k]);
            }
        }
    } else if (targetNorm !== 'ALL' && config.subjectsByYear && config.subjectsByYear[yearStr]) {
        baseSubjects = [...config.subjectsByYear[yearStr]];
    } else if (targetNorm !== 'ALL') {
        baseSubjects = [...(config.subjects || [])];
    } else {
        // Combined (ALL): Language electives for 1st & 2nd Year (Kannada & Hindi)
        if (yearStr === 'First Year' || yearStr === 'Second Year') {
            baseSubjects = ['Kannada', 'Hindi'];
        } else {
            baseSubjects = [];
        }
    }

    const deletedStore = getDeletedSubjectsStore();
    const deletedList = ((deletedStore[deptCode] || {})[yearStr]) || [];

    // Filter out any base pre-seeded subjects that were deleted by user
    baseSubjects = baseSubjects.filter(subjName => {
        return !isSubjectTombstoned(deletedList, subjName, sec);
    });

    const mergeList = (list) => {
        (list || []).forEach(subj => {
            const item = extractSubjNameAndSection(subj);
            if (!item.name) return;
            // Ignore Sanskrit if user did not explicitly add it
            if (isSubjectTombstoned(deletedList, item.name, item.section)) return;
            if (isCustomSubjectMatchingSection(item, sec)) {
                if (!baseSubjects.some(s => s.toLowerCase() === item.name.toLowerCase())) {
                    baseSubjects.push(item.name);
                }
            }
        });
    };

    const cloudStore = getCloudSubjectsStore();
    mergeList((cloudStore[deptCode] || {})[yearStr] || []);

    const customStore = getCustomSubjectsStore();
    mergeList((customStore[deptCode] || {})[yearStr] || []);

    return baseSubjects;
}

function getAllSubjectsForYearManage(deptCode, yearStr) {
    const entries = [];
    const seen = new Set();
    const deletedStore = getDeletedSubjectsStore();
    const deletedList = ((deletedStore[deptCode] || {})[yearStr]) || [];

    const add = (subj) => {
        const item = extractSubjNameAndSection(subj);
        const name = item.name.trim();
        if (!name) return;
        const dk = subjectScopeKey(name, item.section);
        if (isSubjectTombstoned(deletedList, name, item.section)) return;
        if (seen.has(dk)) return;
        seen.add(dk);
        entries.push({ name: name, section: item.section || 'A_B' });
    };

    const cloudStore = getCloudSubjectsStore();
    ((cloudStore[deptCode] || {})[yearStr] || []).forEach(add);
    const customStore = getCustomSubjectsStore();
    ((customStore[deptCode] || {})[yearStr] || []).forEach(add);

    return entries;
}

function updateSubjectDropdowns(subjects, defaultSubject) {
    const subjectSelects = [directSubjectInput, subjectInput];
    const nextFp = subjectListFingerprint(subjects);

    subjectSelects.forEach(selectEl => {
        if (!selectEl) return;

        const prev = selectEl.value;
        const curFp = subjectListFingerprint(
            Array.from(selectEl.options).map(o => o.value).filter(v => v)
        );

        // Skip DOM rebuild when options are unchanged (stops flash on open/sync)
        if (curFp === nextFp && subjects && subjects.length > 0) {
            if (prev && subjects.some(s => s.toLowerCase() === String(prev).toLowerCase())) {
                const match = subjects.find(s => s.toLowerCase() === String(prev).toLowerCase());
                if (match) selectEl.value = match;
            } else {
                selectEl.value = '';
            }
            return;
        }

        selectEl.innerHTML = '';
        addSelectPlaceholder(selectEl, 'Select Subject');
        if (subjects && Array.isArray(subjects) && subjects.length > 0) {
            subjects.forEach(subj => {
                const opt = document.createElement('option');
                opt.value = subj;
                opt.textContent = subj;
                selectEl.appendChild(opt);
            });
        } else {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '-- Add Subject via (+ Add Subject) button above --';
            opt.disabled = true;
            selectEl.appendChild(opt);
        }
        if (prev && subjects && subjects.some(s => s.toLowerCase() === String(prev).toLowerCase())) {
            selectEl.value = prev;
        } else {
            selectEl.value = '';
        }
    });
}

function isElectiveOrLanguageSubject(subjectVal, deptCode, yearStr) {
    if (!subjectVal) return false;
    const cleanSubj = subjectVal.trim().toLowerCase();
    const dept = deptCode || currentDept || 'BCA';
    const yr = yearStr || (directYearSelect ? directYearSelect.value : 'First Year');

    // Prefer explicit section tag from custom/cloud store
    const resolveStored = (list) => {
        for (let i = 0; i < (list || []).length; i++) {
            const item = extractSubjNameAndSection(list[i]);
            if (item.name.trim().toLowerCase() === cleanSubj) {
                return normalizeSectionCode(item.section) === 'ALL';
            }
        }
        return null;
    };
    const cloudList = ((getCloudSubjectsStore()[dept] || {})[yr]) || [];
    const customList = ((getCustomSubjectsStore()[dept] || {})[yr]) || [];
    const fromCloud = resolveStored(cloudList);
    if (fromCloud !== null) return fromCloud;
    const fromCustom = resolveStored(customList);
    if (fromCustom !== null) return fromCustom;

    const key = (dept + '_' + yr + '_' + cleanSubj).toLowerCase();
    const flags = getElectiveFlagsStore();
    if (flags[key] !== undefined) {
        return Boolean(flags[key]);
    }

    // Labs are never auto-elective
    if (/\b(lab|practical)\b/i.test(cleanSubj)) {
        return false;
    }

    // Name fallback only for known language/elective titles (not plain "English")
    return /\b(kannada|kanada|kanad|hindi|hindhi|sanskrit|sanskrith|sanskritha|sanskrut|sanskrutha|sanskritam|devops|wcms|digital\s*fluency|cyber\s*security|e-?filing|optional\s*english|human\s*rights)\b/i.test(cleanSubj);
}

function checkLanguageElectiveAutoCombined(subjectVal, sectionSelectElem, yearSelectElem, forceToast) {
    // Keep user's selected section completely intact. No auto-resetting of sections.
    return;
}

function setSubjectValue(selectEl, subjectVal) {
    if (!selectEl) return;
    if (!subjectVal) {
        selectEl.value = '';
        return;
    }
    if (!selectEl.options) return;
    let matchingOpt = Array.from(selectEl.options).find(o => o.value && o.value.toLowerCase() === subjectVal.toLowerCase());
    if (matchingOpt) {
        selectEl.value = matchingOpt.value;
    } else {
        const customOpt = document.createElement('option');
        customOpt.value = subjectVal;
        customOpt.textContent = subjectVal;
        selectEl.appendChild(customOpt);
        selectEl.value = subjectVal;
    }

    if (selectEl === directSubjectInput && directSectionSelect) {
        checkLanguageElectiveAutoCombined(subjectVal, directSectionSelect, directYearSelect);
    } else if (selectEl === subjectInput && sectionSelect) {
        checkLanguageElectiveAutoCombined(subjectVal, sectionSelect, yearSelect);
    }
}

function updateSectionSelects(hasSections, deptCode, yearStr) {
    const dept = deptCode || currentDept || 'BCA';
    const deptConfig = DEPT_CONFIG[dept] || DEPT_CONFIG.BCA;

    const sectionSelects = [directSectionSelect, sectionSelect];
    sectionSelects.forEach(selectEl => {
        if (!selectEl) return;
        const curVal = selectEl.value;
        selectEl.innerHTML = '';
        const formGroup = selectEl.closest('.form-group') || selectEl.parentElement;

        if (deptConfig.hasSections) {
            selectEl.disabled = false;
            if (formGroup) formGroup.style.display = '';
            addSelectPlaceholder(selectEl, 'Select Section');
            const options = [
                { val: 'A', label: 'Section A' },
                { val: 'B', label: 'Section B' },
                { val: 'ALL', label: 'Combined (Sec A & B / Electives)' }
            ];
            options.forEach(o => {
                const opt = document.createElement('option');
                opt.value = o.val;
                opt.textContent = o.label;
                selectEl.appendChild(opt);
            });
            selectEl.value = options.some(o => o.val === curVal) ? curVal : '';
        } else {
            selectEl.disabled = false;
            if (formGroup) formGroup.style.display = '';
            addSelectPlaceholder(selectEl, 'Select Section');
            const options = [
                { val: 'ONLY', label: 'Main Class / Common' },
                { val: 'ALL', label: 'Combined (Elective / Language)' }
            ];
            options.forEach(o => {
                const opt = document.createElement('option');
                opt.value = o.val;
                opt.textContent = o.label;
                selectEl.appendChild(opt);
            });
            selectEl.value = options.some(o => o.val === curVal) ? curVal : '';
        }
    });
}

function renderStreamPresets(config) {
    const presetPillsContainer = document.querySelector('.preset-pills');
    if (!presetPillsContainer || !config.samplePresets) return;

    presetPillsContainer.innerHTML = '';
    config.samplePresets.forEach(preset => {
        const btn = document.createElement('button');
        btn.className = 'preset-pill';
        btn.setAttribute('data-phrase', preset.phrase);
        btn.textContent = preset.label;
        btn.addEventListener('click', () => {
            if (manualTextInput) manualTextInput.value = preset.phrase;
            autoProcessSpeech(preset.phrase);
        });
        presetPillsContainer.appendChild(btn);
    });
}

// Event Initialization
document.addEventListener('DOMContentLoaded', () => {
    const todayStr = getTodayISOString();
    currentDateTrack = todayStr;
    if (dateInput) dateInput.value = todayStr;
    if (directDateInput) directDateInput.value = todayStr;
    if (todayBadge) {
        const options = { month: 'short', day: 'numeric', year: 'numeric' };
        todayBadge.textContent = 'Today - ' + new Date().toLocaleDateString(undefined, options);
    }

    initDepartmentManager();
    initSubjectManager();
    initPasscodeManager();
    initThemeToggle();

    // Auto-refresh date after midnight 12 AM when page is visible/focused
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkAndRefreshDate();
    });
    window.addEventListener('focus', checkAndRefreshDate);
    setInterval(checkAndRefreshDate, 60000);

    initSpeechRecognition();

    // Mode Switcher Tabs
    if (voiceModeTab) voiceModeTab.addEventListener('click', () => switchMode('voice'));
    if (typingModeTab) typingModeTab.addEventListener('click', () => switchMode('typing'));
    if (hodModeTab) hodModeTab.addEventListener('click', () => switchMode('hod'));

    initHODPortal();
    initShortageCalculator();
    initBulkGenerator();

    // Voice Actions
    if (micBtn) micBtn.addEventListener('click', toggleListening);
    if (clearTranscriptBtn) clearTranscriptBtn.addEventListener('click', clearTranscript);
    if (processBtn) processBtn.addEventListener('click', () => autoProcessSpeech());

    // Manual Typing Actions
    if (parseTypedTextBtn) parseTypedTextBtn.addEventListener('click', handleTypedTextParse);
    if (clearManualTextBtn) clearManualTextBtn.addEventListener('click', () => manualTextInput.value = '');
    if (directResetBtn) directResetBtn.addEventListener('click', resetAllInputs);
    if (directSubmitBtn) directSubmitBtn.addEventListener('click', submitDirectForm);

    // Modal Actions
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeConfirmationModal);
    if (cancelBtn) cancelBtn.addEventListener('click', () => {
        resetAllInputs();
        closeConfirmationModal();
    });
    if (submitBtn) submitBtn.addEventListener('click', submitModalForm);

    // Year / section changes: filter locally only (cloud poll already runs every 12s).
    // Avoid fetchCloudSubjects here — it rebuilt dropdowns mid-interaction and caused screen flash.
    if (directYearSelect) {
        directYearSelect.addEventListener('change', () => {
            const config = DEPT_CONFIG[currentDept];
            const hasSec = config ? config.hasSections : true;
            const yrVal = directYearSelect.value;
            updateSectionSelects(hasSec, currentDept, yrVal);
            refreshSubjectDropdowns(config ? config.defaultSubject : null);
            try { syncRollPrefixFieldsFromStorage(); } catch (e) {}
        });
    }

    if (yearSelect) {
        yearSelect.addEventListener('change', () => {
            const config = DEPT_CONFIG[currentDept];
            const hasSec = config ? config.hasSections : true;
            const yrVal = yearSelect.value;
            updateSectionSelects(hasSec, currentDept, yrVal);
            const secVal = sectionSelect ? sectionSelect.value : 'A';
            updateSubjectDropdowns(getSubjectsForActiveYear(currentDept, yrVal, secVal), config ? config.defaultSubject : null);
            try { syncRollPrefixFieldsFromStorage(); } catch (e) {}
        });
    }

    if (directSectionSelect) {
        directSectionSelect.addEventListener('change', () => {
            refreshSubjectDropdowns();
            try { syncRollPrefixFieldsFromStorage(); } catch (e) {}
        });
    }

    if (sectionSelect) {
        sectionSelect.addEventListener('change', () => {
            const config = DEPT_CONFIG[currentDept];
            const yrVal = yearSelect ? yearSelect.value : 'First Year';
            updateSubjectDropdowns(
                getSubjectsForActiveYear(currentDept, yrVal, sectionSelect.value),
                config ? config.defaultSubject : null
            );
            try { syncRollPrefixFieldsFromStorage(); } catch (e) {}
        });
    }

    restrictDateInputsToTodayAndPast();

    // Live Double Entry warning — SELECT uses change only (input on <select> causes flicker on mobile)
    [dateInput, yearSelect, sectionSelect, subjectInput, slotSelect, rollNumbersInput].forEach(elem => {
        if (elem) {
            const run = () => {
                if (elem === dateInput) {
                    enforceMaxTodayDateConstraint(dateInput);
                    updateSlotDropdownOptions(dateInput.value);
                }
                if (elem === subjectInput || elem === sectionSelect) checkLanguageElectiveAutoCombined(subjectInput.value, sectionSelect, yearSelect);
                updateModalDoubleEntryCheck();
            };
            elem.addEventListener('change', run);
            if (elem.tagName !== 'SELECT') elem.addEventListener('input', run);
        }
    });

    [directDateInput, directYearSelect, directSectionSelect, directSubjectInput, directSlotSelect, directRollInput].forEach(elem => {
        if (elem) {
            const run = () => {
                if (elem === directDateInput) {
                    enforceMaxTodayDateConstraint(directDateInput);
                    updateSlotDropdownOptions(directDateInput.value);
                }
                if (elem === directSubjectInput || elem === directSectionSelect) checkLanguageElectiveAutoCombined(directSubjectInput.value, directSectionSelect, directYearSelect);
                updateDirectDoubleEntryCheck();
            };
            elem.addEventListener('change', run);
            if (elem.tagName !== 'SELECT') elem.addEventListener('input', run);
        }
    });

    const directDurationSelect = document.getElementById('directDurationSelect');
    const durationSelect = document.getElementById('durationSelect');
    const directMultiSlotWrapper = document.getElementById('directMultiSlotContainer');
    const directMultiSlotBreakdown = document.getElementById('directMultiSlotBreakdown');
    const modalMultiSlotWrapper = document.getElementById('modalMultiSlotContainer');
    const modalMultiSlotBreakdown = document.getElementById('modalMultiSlotBreakdown');

    if (directDurationSelect) {
        directDurationSelect.addEventListener('change', () => {
            handleMultiSlotVisibility(directDurationSelect, directSlotSelect, directRollInput, directMultiSlotWrapper, directMultiSlotBreakdown);
        });
    }

    if (durationSelect) {
        durationSelect.addEventListener('change', () => {
            handleMultiSlotVisibility(durationSelect, slotSelect, rollNumbersInput, modalMultiSlotWrapper, modalMultiSlotBreakdown);
        });
    }

    if (directSlotSelect) {
        directSlotSelect.addEventListener('change', () => {
            handleMultiSlotVisibility(directDurationSelect, directSlotSelect, directRollInput, directMultiSlotWrapper, directMultiSlotBreakdown);
        });
    }

    if (slotSelect) {
        slotSelect.addEventListener('change', () => {
            handleMultiSlotVisibility(durationSelect, slotSelect, rollNumbersInput, modalMultiSlotWrapper, modalMultiSlotBreakdown);
        });
    }

    if (directRollInput) {
        directRollInput.addEventListener('input', () => {
            if (directDurationSelect && parseInt(directDurationSelect.value, 10) > 1) {
                handleMultiSlotVisibility(directDurationSelect, directSlotSelect, directRollInput, directMultiSlotWrapper, directMultiSlotBreakdown);
            }
            try { updateRollExpandPreview(false); } catch (e) {}
        });
        directRollInput.addEventListener('blur', () => {
            try {
                const year = directYearSelect ? directYearSelect.value : '';
                const sec = directSectionSelect ? directSectionSelect.value : '';
                const prefixEl = document.getElementById('directRollPrefix');
                const prefix = prefixEl ? prefixEl.value : '';
                const expanded = applyRollPrefixExpansion(directRollInput.value, year, sec, { prefix: prefix, preferModal: false });
                if (expanded) directRollInput.value = expanded;
                updateRollExpandPreview(false);
                updateDirectDoubleEntryCheck();
            } catch (e) {}
        });
    }

    if (rollNumbersInput) {
        rollNumbersInput.addEventListener('input', () => {
            if (durationSelect && parseInt(durationSelect.value, 10) > 1) {
                handleMultiSlotVisibility(durationSelect, slotSelect, rollNumbersInput, modalMultiSlotWrapper, modalMultiSlotBreakdown);
            }
            try { updateRollExpandPreview(true); } catch (e) {}
        });
        rollNumbersInput.addEventListener('blur', () => {
            try {
                const year = yearSelect ? yearSelect.value : '';
                const sec = sectionSelect ? sectionSelect.value : '';
                const prefixEl = document.getElementById('modalRollPrefix');
                const prefix = prefixEl ? prefixEl.value : '';
                const expanded = applyRollPrefixExpansion(rollNumbersInput.value, year, sec, { prefix: prefix, preferModal: true });
                if (expanded) rollNumbersInput.value = expanded;
                updateRollExpandPreview(true);
                updateModalDoubleEntryCheck();
            } catch (e) {}
        });
    }

    const directRollPrefix = document.getElementById('directRollPrefix');
    const modalRollPrefix = document.getElementById('modalRollPrefix');
    if (directRollPrefix) {
        directRollPrefix.addEventListener('input', () => {
            const year = directYearSelect ? directYearSelect.value : '';
            const sec = directSectionSelect ? directSectionSelect.value : '';
            setStoredRollPrefix(currentDept || 'BCA', year, sec, directRollPrefix.value);
            updateRollExpandPreview(false);
        });
    }
    if (modalRollPrefix) {
        modalRollPrefix.addEventListener('input', () => {
            const year = yearSelect ? yearSelect.value : '';
            const sec = sectionSelect ? sectionSelect.value : '';
            setStoredRollPrefix(currentDept || 'BCA', year, sec, modalRollPrefix.value);
            updateRollExpandPreview(true);
        });
    }

    try { syncRollPrefixFieldsFromStorage(); } catch (e) {}

    // Header Drawer & Theme Toggle
    const openHistory = () => {
        currentHistoryTabMode = 'TODAY';
        updateHistoryTabStyles();
        renderHistoryList();
        historyDrawer.classList.add('active');
        fetchTodayServerHistory();
        syncOfflineEntries();
    };

    if (historyBtn) historyBtn.addEventListener('click', openHistory);
    document.querySelectorAll('.history-open-btn').forEach(btn => {
        btn.addEventListener('click', openHistory);
    });

    if (closeHistoryBtn) closeHistoryBtn.addEventListener('click', () => historyDrawer.classList.remove('active'));

    initHistoryDrawerTabs();

    const syncOfflineBtn = document.getElementById('syncOfflineBtn');
    if (syncOfflineBtn) {
        syncOfflineBtn.addEventListener('click', syncOfflineEntries);
    }

    window.addEventListener('online', () => {
        console.log('[Network] Back online - triggering auto-sync...');
        syncOfflineEntries().then(() => fetchTodayServerHistory());
    });

    renderHistoryList();
    if (navigator.onLine) {
        setTimeout(() => {
            syncOfflineEntries().then(() => fetchTodayServerHistory());
        }, 2000);
    }

    // Preset Pills
    document.querySelectorAll('.preset-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            const phrase = btn.getAttribute('data-phrase');
            currentTranscript = phrase;
            if (manualTextInput) manualTextInput.value = phrase;
            interimTranscript = '';
            renderTranscript();
            autoProcessSpeech(phrase);
        });
    });

    renderHistoryList();

    // SW already registered from index.html bootstrap (versioned URL + auto-reload).
    // Keep a backup update check here in case bootstrap was bypassed.
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(function (reg) {
            if (reg) {
                try { reg.update(); } catch (e) {}
            }
        }).catch(function () {});
    }
});

function forceAppUpdate() {
    showCustomToast('🔄 Checking for App Updates...', 'All attendance history & offline logs remain 100% safe.');
    function isEveningCache(n) { return String(n || '').indexOf('mgmec-absentee-informer') === 0; }
    function isEveningSW(reg) {
        let u = '';
        try { u = ((reg.active || reg.waiting || reg.installing || {}).scriptURL || reg.scope || ''); } catch (e) { u = (reg && reg.scope) || ''; }
        return String(u).indexOf('att_College_app') === -1 && String(u).indexOf('/atbo/') === -1;
    }
    if ('caches' in window) {
        caches.keys().then(names => {
            return Promise.all(names.filter(isEveningCache).map(name => caches.delete(name)));
        }).then(() => {
            if (navigator.serviceWorker) {
                navigator.serviceWorker.getRegistrations().then(regs => {
                    regs.forEach(reg => { if (isEveningSW(reg)) reg.unregister(); });
                    setTimeout(() => window.location.reload(true), 500);
                });
            } else {
                setTimeout(() => window.location.reload(true), 500);
            }
        });
    } else {
        setTimeout(() => window.location.reload(true), 500);
    }
}

function populateModalSectionOptions() {
    const secSelect = document.getElementById('newSubjectSectionSelect') || document.getElementById('manageSubjectSection');
    if (!secSelect) return;

    secSelect.innerHTML = '';
    const dept = currentDept || 'BCA';
    const deptConfig = DEPT_CONFIG[dept] || DEPT_CONFIG.BCA;

    let options = [];
    if (deptConfig.hasSections) {
        // BCA: Sec A, Sec B, Common (Sec A & B), Combined (Electives)
        options = [
            { val: 'A', label: 'Section A only' },
            { val: 'B', label: 'Section B only' },
            { val: 'COMMON', label: 'Common to both Sections (A & B)' },
            { val: 'ALL', label: 'Combined (Kannada / Hindi / Sanskrit / Elective)' }
        ];
    } else {
        // BCom / BBA: Main Class, Combined
        options = [
            { val: 'ONLY', label: 'Main Class / Common' },
            { val: 'ALL', label: 'Combined (Kannada / Hindi / Sanskrit / Elective)' }
        ];
    }

    options.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.val;
        opt.textContent = o.label;
        secSelect.appendChild(opt);
    });
    secSelect.value = deptConfig.hasSections ? 'COMMON' : 'ONLY';
}

function updateSubjectManageSectionOptions(deptCode, yearStr) {
    populateModalSectionOptions();
}

function initSubjectManager() {
    const manageBtnVoice = document.getElementById('manageSubjectBtnVoice');
    const manageBtnHeader = document.getElementById('manageSubjectBtnHeader');
    const manageBtnDirect = document.getElementById('manageSubjectBtnDirect');
    const manageBtnModal = document.getElementById('manageSubjectBtnModal');
    const subjectManageModal = document.getElementById('subjectManageModal');
    const closeSubjectModalBtn = document.getElementById('closeSubjectModalBtn');
    const doneSubjectModalBtn = document.getElementById('doneSubjectModalBtn');
    const addSubjectBtn = document.getElementById('addSubjectBtn');
    const newSubjectInput = document.getElementById('newSubjectInput');
    const resetSubjectsBtn = document.getElementById('resetSubjectsBtn');

    const openModal = (e) => {
        if (e) e.preventDefault();
        const activeYear = directYearSelect ? directYearSelect.value : 'First Year';
        const modalDeptText = document.getElementById('subjectModalDeptText');
        const modalYearText = document.getElementById('subjectModalYearText');

        if (modalDeptText && DEPT_CONFIG[currentDept]) modalDeptText.textContent = DEPT_CONFIG[currentDept].code;
        if (modalYearText) modalYearText.textContent = activeYear;

        populateModalSectionOptions();
        clearSubjectEditForm();
        fetchCloudSubjects();
        renderSubjectChips();
        if (subjectManageModal) {
            subjectManageModal.classList.add('active');
        }
    };

    if (manageBtnHeader) manageBtnHeader.addEventListener('click', openModal);
    if (manageBtnVoice) manageBtnVoice.addEventListener('click', openModal);
    if (manageBtnDirect) manageBtnDirect.addEventListener('click', openModal);
    if (manageBtnModal) manageBtnModal.addEventListener('click', openModal);
    if (closeSubjectModalBtn) closeSubjectModalBtn.addEventListener('click', () => subjectManageModal.classList.remove('active'));
    if (doneSubjectModalBtn) doneSubjectModalBtn.addEventListener('click', () => subjectManageModal.classList.remove('active'));

    if (addSubjectBtn && newSubjectInput) {
        addSubjectBtn.addEventListener('click', (e) => {
            if (e) e.preventDefault();
            const val = newSubjectInput.value.trim();
            if (!val) {
                alert('Please type a subject name first.');
                newSubjectInput.focus();
                return;
            }
            const activeYear = directYearSelect ? directYearSelect.value : 'First Year';
            const secSelectModal = document.getElementById('newSubjectSectionSelect');
            const oldNameInput = document.getElementById('editingSubjectOldName');
            const oldSecInput = document.getElementById('editingSubjectOldSection');
            const oldName = oldNameInput ? oldNameInput.value.trim() : '';
            const oldSection = oldSecInput ? oldSecInput.value.trim() : '';
            let targetSection = canonicalSectionStorage(secSelectModal ? secSelectModal.value : 'COMMON');
            const isElecChecked = normalizeSectionCode(targetSection) === 'ALL';

            const targetSectionText = secSelectModal && secSelectModal.options[secSelectModal.selectedIndex]
                ? secSelectModal.options[secSelectModal.selectedIndex].text
                : targetSection;

            upsertLocalSubject(currentDept, activeYear, val, targetSection, isElecChecked, oldName || null, oldSection || null);

            // Allow cloud sync again for this dept (old subjects stay hidden via deletedStore tombstones)
            const clearedStore = getClearedDeptsStore();
            if (clearedStore[currentDept]) {
                delete clearedStore[currentDept];
                saveClearedDeptsStore(clearedStore);
            }

            const cloudAction = oldName ? 'rename_subject' : 'add_subject';
            clearSubjectEditForm();
            renderSubjectChips();
            refreshSubjectDropdowns(val);
            showCustomToast(
                oldName ? 'Subject Saved Locally' : 'Subject Saved Locally',
                '"' + val + '" — syncing to sheet…'
            );
            sendSubjectToCloud(cloudAction, currentDept, activeYear, val, isElecChecked, targetSection, oldName || '', oldSection || '')
                .then(ok => {
                    if (ok) {
                        showCustomToast(
                            oldName ? 'Subject Updated & Synced!' : 'Subject Added & Synced!',
                            '"' + val + '" saved — ' + targetSectionText
                        );
                    } else {
                        showCustomToast(
                            'Saved on this device only',
                            '"' + val + '" — cloud sync failed. Check login / Wi‑Fi, then re-open Manage Subjects.'
                        );
                    }
                })
                .catch(e => {
                    console.warn('Subject cloud sync error:', e);
                    showCustomToast('Saved on this device only', 'Cloud sync error — subject may not appear on other phones yet.');
                });
        });
    }

    if (resetSubjectsBtn) {
        resetSubjectsBtn.addEventListener('click', () => {
            if (confirm('Clear all stored subjects for ' + currentDept + '?\n\nThis removes them on this phone AND marks them deleted in Google Sheet so they will not come back on sync.')) {
                const dept = currentDept;
                const customStore = getCustomSubjectsStore();
                const cloudStore = getCloudSubjectsStore();
                const deletedStore = getDeletedSubjectsStore();
                if (!deletedStore[dept]) deletedStore[dept] = {};

                // Tombstone every known subject so a later cloud fetch cannot resurrect them
                const years = new Set([
                    ...Object.keys((customStore[dept] || {})),
                    ...Object.keys((cloudStore[dept] || {}))
                ]);
                years.forEach(yr => {
                    if (!deletedStore[dept][yr]) deletedStore[dept][yr] = [];
                    const lists = []
                        .concat((customStore[dept] && customStore[dept][yr]) || [])
                        .concat((cloudStore[dept] && cloudStore[dept][yr]) || []);
                    lists.forEach(s => {
                        const item = extractSubjNameAndSection(s);
                        const name = item.name.trim();
                        if (!name) return;
                        const dk = subjectScopeKey(name, item.section);
                        if (!deletedStore[dept][yr].some(d => String(d).toLowerCase() === dk.toLowerCase())) {
                            deletedStore[dept][yr].push(dk);
                        }
                    });
                });
                saveDeletedSubjectsStore(deletedStore);

                // Prefer sheet tombstones; cleared flag is only a local hint and no longer blocks fetch
                const clearedStore = getClearedDeptsStore();
                clearedStore[dept] = true;
                saveClearedDeptsStore(clearedStore);

                delete customStore[dept];
                saveCustomSubjectsStore(customStore);
                delete cloudStore[dept];
                saveCloudSubjectsStore(cloudStore);

                sendSubjectToCloud('clear_subjects', dept, 'ALL', '')
                    .catch(e => console.warn('Cloud subject clear error:', e));

                const activeYear = directYearSelect ? directYearSelect.value : 'First Year';
                renderSubjectChips();
                refreshSubjectDropdowns();
                showCustomToast('All Subjects Cleared!', 'Cleared for ' + dept + '. Old sheet subjects marked deleted so they stay gone.');
            }
        });
    }
}

// Version upgrade check to purge stale cached cloud subjects on GitHub Pages update
(function checkAppCacheVersion() {
    const APP_VER = 'v27.18_stream_pin_login';
    if (localStorage.getItem('mgmec_app_ver') !== APP_VER) {
        localStorage.removeItem('mgmec_cloud_subjects');
        localStorage.setItem('mgmec_app_ver', APP_VER);
        // One-time purge of stale mobile PWA caches after version bump
        try {
            if (window.caches && caches.keys) {
                caches.keys().then(function (names) {
                    return Promise.all(names.filter(function (n) {
                        return String(n || '').indexOf('mgmec-absentee-informer') === 0;
                    }).map(function (n) { return caches.delete(n); }));
                }).then(function () {
                    if (sessionStorage.getItem('mgmec_ver_reloaded') === APP_VER) return;
                    sessionStorage.setItem('mgmec_ver_reloaded', APP_VER);
                    window.location.reload();
                }).catch(function () {});
            }
        } catch (e) {}
    }
})();

function getSubjectSectionTagInfo(deptCode, yearStr, subjName) {
    if (!subjName) return formatSectionTagLabel('ALL');
    const targetName = typeof subjName === 'string' ? subjName.trim() : extractSubjNameAndSection(subjName).name.trim();

    const customStore = getCustomSubjectsStore();
    const deptCustom = customStore[deptCode] || {};
    const customList = deptCustom[yearStr] || [];
    for (let c of customList) {
        const item = extractSubjNameAndSection(c);
        if (item.name.trim().toLowerCase() === targetName.toLowerCase()) {
            return formatSectionTagLabel(item.section);
        }
    }

    const cloudStore = getCloudSubjectsStore();
    const deptCloud = cloudStore[deptCode] || {};
    const cloudList = deptCloud[yearStr] || [];
    for (let c of cloudList) {
        const item = extractSubjNameAndSection(c);
        if (item.name.trim().toLowerCase() === targetName.toLowerCase()) {
            return formatSectionTagLabel(item.section);
        }
    }

    const config = DEPT_CONFIG[deptCode];
    if (config && config.subjectsByYearAndSection && config.subjectsByYearAndSection[yearStr]) {
        const secMap = config.subjectsByYearAndSection[yearStr];
        for (let sKey in secMap) {
            if (secMap[sKey].some(s => s.toLowerCase() === targetName.toLowerCase())) {
                return formatSectionTagLabel(sKey);
            }
        }
    }

    return formatSectionTagLabel('ALL');
}

function formatSectionTagLabel(secCode) {
    const sec = secCode || 'COMMON';
    const n = normalizeSectionCode(sec);
    if (n === 'ALL') return { label: 'Combined elective', section: 'ALL', bg: 'rgba(234, 179, 8, 0.2)', color: '#eab308' };
    if (n === 'COMMON') return { label: 'Common (all classes)', section: 'COMMON', bg: 'rgba(52, 211, 153, 0.2)', color: '#34d399' };
    if (n === 'A_B') return { label: 'A & B only', section: 'A_B', bg: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' };
    if (n === 'C_AIML') return { label: 'C (AIML) only', section: 'C (AIML)', bg: 'rgba(168, 85, 247, 0.2)', color: '#c084fc' };
    if (n === 'C_TP') return { label: 'C (TP) only', section: 'C (TP)', bg: 'rgba(168, 85, 247, 0.2)', color: '#c084fc' };
    if (n === 'C_AF') return { label: 'C (AF) only', section: 'C (AF)', bg: 'rgba(168, 85, 247, 0.2)', color: '#c084fc' };
    return { label: 'Sec ' + sec, section: sec, bg: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' };
}

function renderSubjectChips() {
    const chipsContainer = document.getElementById('subjectChipsContainer');
    if (!chipsContainer) return;
    const activeYear = directYearSelect ? directYearSelect.value : 'First Year';
    const subjects = getAllSubjectsForYearManage(currentDept, activeYear);

    chipsContainer.innerHTML = '';
    if (subjects.length === 0) {
        chipsContainer.innerHTML = '<span style="font-size: 0.8rem; color: var(--text-dim);">No subjects available for ' + activeYear + '. Click "+ Add" above to add subjects.</span>';
        return;
    }

    subjects.forEach(entry => {
        const subj = entry.name;
        const sec = entry.section;
        const chip = document.createElement('div');
        chip.className = 'subject-chip-tag';
        chip.style.display = 'inline-flex';
        chip.style.alignItems = 'center';
        chip.style.gap = '6px';

        const tagInfo = formatSectionTagLabel(sec);

        const nameSpan = document.createElement('span');
        nameSpan.textContent = subj;
        chip.appendChild(nameSpan);

        const badgeSpan = document.createElement('span');
        badgeSpan.style.cssText = `font-size: 0.68rem; padding: 2px 6px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.2); font-weight: 600; line-height: 1; margin: 0; background: ${tagInfo.bg}; color: ${tagInfo.color};`;
        badgeSpan.textContent = tagInfo.label;
        chip.appendChild(badgeSpan);

        if (normalizeSectionCode(sec) === 'ALL') {
            const elecBadge = document.createElement('span');
            elecBadge.style.cssText = 'font-size: 0.65rem; padding: 2px 6px; border-radius: 12px; background: rgba(52,211,153,0.2); color: #34d399; font-weight: 600;';
            elecBadge.textContent = 'Elective';
            chip.appendChild(elecBadge);
        }

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'subject-chip-del';
        editBtn.textContent = 'Edit';
        editBtn.title = 'Rename / edit "' + subj + '"';
        editBtn.style.fontSize = '0.68rem';
        editBtn.style.padding = '2px 6px';
        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            beginSubjectEdit(subj, sec);
        });
        chip.appendChild(editBtn);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'subject-chip-del';
        delBtn.innerHTML = '&times;';
        delBtn.title = 'Delete "' + subj + '"';
        delBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteSubject(currentDept, activeYear, subj, sec);
            renderSubjectChips();
            refreshSubjectDropdowns();
        });
        chip.appendChild(delBtn);

        chipsContainer.appendChild(chip);
    });
}

/* BULK PAST CLASS GENERATOR (same flow as att_appAllstreams) */
function updateBulkSubjectDropdown() {
    const bYear = document.getElementById('bulkYearSelect');
    const bSec = document.getElementById('bulkSectionSelect');
    const bSubj = document.getElementById('bulkSubjectInput');
    if (bYear && bSec && bSubj) {
        const yrVal = bYear.value || 'Second Year';
        const secVal = bSec.value || (DEPT_CONFIG[currentDept] && !DEPT_CONFIG[currentDept].hasSections ? 'ONLY' : 'A');
        const list = getSubjectsForActiveYear(currentDept, yrVal, secVal);
        bSubj.innerHTML = list.map(s => `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join('');
    }
}

function openBulkGeneratorModal() {
    const modal = document.getElementById('bulkGeneratorModal');
    if (!modal) return;
    updateSectionDropdownOptions(currentDept);
    const startEl = document.getElementById('bulkStartDate');
    const endEl = document.getElementById('bulkEndDate');
    const today = getTodayISOString();
    if (startEl && !startEl.value) startEl.value = today;
    if (endEl && !endEl.value) endEl.value = today;
    updateSlotDropdownOptions((startEl && startEl.value) || today);
    updateBulkSubjectDropdown();
    modal.classList.add('active');
}

function closeBulkGeneratorModal() {
    const modal = document.getElementById('bulkGeneratorModal');
    if (modal) modal.classList.remove('active');
}

async function executeBulkPastGenerator() {
    const yearEl = document.getElementById('bulkYearSelect');
    const secEl = document.getElementById('bulkSectionSelect');
    const subjEl = document.getElementById('bulkSubjectInput');
    const slotEl = document.getElementById('bulkSlotSelect');
    const startEl = document.getElementById('bulkStartDate');
    const endEl = document.getElementById('bulkEndDate');

    const yearVal = yearEl ? yearEl.value : '';
    const secVal = secEl ? secEl.value : '';
    const subjVal = subjEl ? subjEl.value : '';
    const slotVal = slotEl ? slotEl.value : '1';
    const startVal = startEl ? startEl.value : '';
    const endVal = endEl ? endEl.value : '';
    const checkedDays = Array.from(document.querySelectorAll('.bulkDayCheck:checked')).map(c => parseInt(c.value, 10));

    if (!subjVal) {
        alert('Please select a Subject Name.');
        return;
    }
    if (!startVal || !endVal) {
        alert('Please select both Start Date and End Date.');
        return;
    }
    if (new Date(startVal) > new Date(endVal)) {
        alert('Start Date cannot be after End Date.');
        return;
    }
    if (checkedDays.length === 0) {
        alert('Please select at least one day of the week.');
        return;
    }

    const btnText = document.getElementById('submitBulkBtnText');
    const spinner = document.getElementById('submitBulkSpinner');
    const submitBtn = document.getElementById('submitBulkBtn');

    if (btnText) btnText.textContent = 'Generating...';
    if (spinner) spinner.style.display = 'inline-block';
    if (submitBtn) submitBtn.disabled = true;

    try {
        const parts1 = startVal.split('-');
        const parts2 = endVal.split('-');
        const startDate = new Date(parseInt(parts1[0], 10), parseInt(parts1[1], 10) - 1, parseInt(parts1[2], 10));
        const endDate = new Date(parseInt(parts2[0], 10), parseInt(parts2[1], 10) - 1, parseInt(parts2[2], 10));

        const generatedItems = [];
        const curr = new Date(startDate.getTime());

        while (curr.getTime() <= endDate.getTime()) {
            const dayOfWeek = curr.getDay();
            if (checkedDays.includes(dayOfWeek)) {
                const yyyy = curr.getFullYear();
                const mm = String(curr.getMonth() + 1).padStart(2, '0');
                const dd = String(curr.getDate()).padStart(2, '0');
                const dateStr = yyyy + '-' + mm + '-' + dd;

                generatedItems.push({
                    stream: currentDept || 'BCA',
                    date: dateStr,
                    year: yearVal,
                    section: secVal,
                    subject: subjVal,
                    slot: String(parseInt(slotVal, 10) || 1),
                    rollNumbers: 'NIL',
                    offline: false,
                    timestamp: 'Bulk Past Entry'
                });
            }
            curr.setDate(curr.getDate() + 1);
        }

        if (generatedItems.length === 0) {
            alert('No matching class days found in the selected date range.');
            return;
        }

        for (const item of generatedItems) {
            saveToLocalHistory(item);
        }

        closeBulkGeneratorModal();

        const secLabel = secVal === 'ONLY' ? 'Main' : (secVal === 'ALL' ? 'Combined' : ('Sec ' + secVal));
        showCustomToast('⚡ Created ' + generatedItems.length + ' Past Classes!', 'Added for ' + yearVal + ' ' + secLabel + ' (' + subjVal + '). Edit absentees as needed.');
        try { renderHistoryList(); } catch (e) {}
        try { updateTodayBadge(); } catch (e) {}

        (async () => {
            const targetUrl = getWebhookUrl(currentDept);
            if (!targetUrl) return;
            for (const item of generatedItems) {
                const payload = withAuth({
                    action: 'create',
                    isUpdate: false,
                    stream: item.stream,
                    date: item.date,
                    rollNumbers: 'NIL',
                    year: item.year,
                    section: item.section,
                    subject: item.subject,
                    slot: item.slot,
                    changesSummary: 'Bulk Past Class Entry'
                });
                try {
                    await postWithRetry(targetUrl, payload, 1);
                } catch (e) {
                    console.warn('Bulk item sheet sync error:', e);
                    try {
                        saveToLocalHistory({ ...item, offline: true, action: 'create', changesSummary: 'Bulk Past Class Entry (pending sync)' });
                    } catch (e2) {}
                }
            }
        })();

    } catch (err) {
        console.error('Bulk Generator Error:', err);
        alert('An error occurred while generating past classes.');
    } finally {
        if (btnText) btnText.textContent = '⚡ Generate Past Classes';
        if (spinner) spinner.style.display = 'none';
        if (submitBtn) submitBtn.disabled = false;
    }
}

function initBulkGenerator() {
    const openBulkBtn = document.getElementById('openBulkGeneratorModalBtn');
    const closeBulkBtn = document.getElementById('closeBulkModalBtn');
    const cancelBulkBtn = document.getElementById('cancelBulkModalBtn');
    const bulkForm = document.getElementById('bulkGeneratorForm');
    const bulkModal = document.getElementById('bulkGeneratorModal');
    const bulkYearSelect = document.getElementById('bulkYearSelect');
    const bulkSectionSelect = document.getElementById('bulkSectionSelect');
    const bulkStartDate = document.getElementById('bulkStartDate');

    if (openBulkBtn) openBulkBtn.addEventListener('click', openBulkGeneratorModal);
    if (closeBulkBtn) closeBulkBtn.addEventListener('click', closeBulkGeneratorModal);
    if (cancelBulkBtn) cancelBulkBtn.addEventListener('click', closeBulkGeneratorModal);
    if (bulkModal) {
        bulkModal.addEventListener('click', (e) => {
            if (e.target === bulkModal) closeBulkGeneratorModal();
        });
    }
    if (bulkYearSelect) bulkYearSelect.addEventListener('change', updateBulkSubjectDropdown);
    if (bulkSectionSelect) bulkSectionSelect.addEventListener('change', updateBulkSubjectDropdown);
    if (bulkStartDate) {
        bulkStartDate.addEventListener('change', () => {
            updateSlotDropdownOptions(bulkStartDate.value || getTodayISOString());
        });
    }
    if (bulkForm) {
        bulkForm.addEventListener('submit', (e) => {
            e.preventDefault();
            executeBulkPastGenerator();
        });
    }
}

/* HOD PORTAL & WHATSAPP GENERATOR LOGIC */
function initHODPortal() {
    const hodStreamSelect = document.getElementById('hodStreamSelect');
    const hodDatePicker = document.getElementById('hodDatePicker');
    const hodFetchBtn = document.getElementById('hodFetchBtn');
    const hodShareAllWaBtn = document.getElementById('hodShareAllWaBtn');

    if (hodDatePicker && !hodDatePicker.value) {
        hodDatePicker.value = getTodayISOString();
    }

    if (hodFetchBtn) {
        hodFetchBtn.addEventListener('click', fetchHODAbsentees);
    }

    if (hodStreamSelect) {
        hodStreamSelect.addEventListener('change', fetchHODAbsentees);
    }

    if (hodDatePicker) {
        hodDatePicker.max = getTodayISOString();
        hodDatePicker.addEventListener('change', () => {
            enforceMaxTodayDateConstraint(hodDatePicker);
            fetchHODAbsentees();
        });
    }

    if (hodShareAllWaBtn) {
        hodShareAllWaBtn.addEventListener('click', () => {
            // Container is replaced by year-group WhatsApp buttons after fetch;
            // if this seed button is still visible, point HOD to those buttons.
            const status = document.getElementById('hodStatusMessage');
            if (status) {
                status.style.display = 'block';
                status.textContent = 'Fetch absentees first — then use the year/section WhatsApp buttons above the cards.';
            }
        });
    }
}

function fetchHODAbsentees() {
    const hodStreamSelect = document.getElementById('hodStreamSelect');
    const hodDatePicker = document.getElementById('hodDatePicker');
    const hodFetchBtnText = document.getElementById('hodFetchBtnText');
    const hodFetchSpinner = document.getElementById('hodFetchSpinner');
    const hodStatusMessage = document.getElementById('hodStatusMessage');
    const container = document.getElementById('hodSectionCardsContainer');
    const globalShareContainer = document.getElementById('hodGlobalShareContainer');

    const stream = currentDept || 'BCA';
    const dateVal = hodDatePicker ? hodDatePicker.value : getTodayISOString();

    const activeLabel = stream === 'BCOM' ? 'B.Com' : stream;

    if (hodStreamSelect) {
        lockStreamSelectToDept(hodStreamSelect, stream);
    }

    if (hodFetchBtnText) hodFetchBtnText.textContent = 'Fetching ' + activeLabel + '...';
    if (hodFetchSpinner) hodFetchSpinner.style.display = 'inline-block';
    if (hodStatusMessage) hodStatusMessage.style.display = 'none';

    const targetUrl = getWebhookUrl(stream);
    const cbName = 'hod_callback_' + Date.now();

    window[cbName] = function (data) {
        delete window[cbName];
        if (hodFetchBtnText) hodFetchBtnText.textContent = '🔄 Fetch ' + activeLabel + ' Absentees';
        if (hodFetchSpinner) hodFetchSpinner.style.display = 'none';

        if (data && data.result === 'success') {
            currentHODData = data;
            renderHODSectionCards(data);
        } else {
            if (hodStatusMessage) {
                hodStatusMessage.style.display = 'flex';
                hodStatusMessage.innerHTML = '<span>⚠️ Failed to fetch absentees: ' + escapeHTML(data ? (data.error || data.message || 'Unknown error') : 'No response') + '</span>';
            }
            if (globalShareContainer) globalShareContainer.style.display = 'none';
        }
    };

    const params = new URLSearchParams({
        action: 'get_absentees',
        stream: stream,
        date: dateVal,
        callback: cbName
    });
    appendAuthToParams(params);

    const scriptEl = document.createElement('script');
    scriptEl.src = targetUrl + (targetUrl.indexOf('?') >= 0 ? '&' : '?') + params.toString();
    scriptEl.onerror = function () {
        delete window[cbName];
        if (hodFetchBtnText) hodFetchBtnText.textContent = '🔄 Fetch ' + activeLabel + ' Absentees';
        if (hodFetchSpinner) hodFetchSpinner.style.display = 'none';

        const localHistory = JSON.parse(localStorage.getItem('mgmec_attendance_history') || '[]');
        const filtered = localHistory.filter(item => item.date === dateVal && (item.stream || 'BCA') === stream);
        
        const fallbackData = {
            result: 'success',
            date: dateVal,
            stream: stream,
            entries: filtered.map(item => ({
                year: item.year || '',
                section: item.section || '',
                subject: item.subject || '',
                slot: parseInt(item.slot, 10) || 1,
                rollNumbers: Array.isArray(item.rollNumbers) ? item.rollNumbers.join(', ') : String(item.rollNumbers || 'NIL')
            }))
        };

        currentHODData = fallbackData;
        renderHODSectionCards(fallbackData);

        if (hodStatusMessage) {
            hodStatusMessage.style.display = 'flex';
            hodStatusMessage.innerHTML = '<span>📱 <em>Offline Mode: Showing local attendance logs stored on this device.</em></span>';
        }
    };

    document.body.appendChild(scriptEl);
}


function filterHODSectionCards(yearFilter) {
    currentHODYearFilter = yearFilter;
    const tabs = document.querySelectorAll('.year-filter-tab');
    tabs.forEach(t => {
        if (t.getAttribute('data-year-filter') === yearFilter) t.classList.add('active');
        else t.classList.remove('active');
    });

    const cards = document.querySelectorAll('.hod-section-card');
    cards.forEach(card => {
        const cardYr = card.getAttribute('data-year-prefix');
        if (yearFilter === 'ALL' || cardYr === yearFilter) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

function toggleHODCardAccordion(headerEl) {
    const card = headerEl.closest('.hod-section-card');
    if (card) {
        card.classList.toggle('collapsed');
    }
}

function getSlotTimeLabel(slotNum, dateVal) {
    const s = parseInt(slotNum, 10) || 1;
    const times = getSlotTimeLabels(dateVal);
    return times[s] || `Slot ${s}`;
}

function getSlotTimeShortLabel(slotNum, dateVal) {
    const s = parseInt(slotNum, 10) || 1;
    const times = getSlotTimeShortLabels(dateVal);
    return times[s] || (`Slot ${s}`);
}

function renderHODSectionCards(data) {
    const container = document.getElementById('hodSectionCardsContainer');
    const globalShareContainer = document.getElementById('hodGlobalShareContainer');
    if (!container) return;

    const stream = currentDept || data.stream || 'BCA';
    const dateVal = data.date || getTodayISOString();
    const entries = (data.entries || []).filter(entry => {
        const entryStream = String(entry.stream || '').toUpperCase();
        return !entryStream || entryStream === String(stream).toUpperCase();
    });

    if (entries.length === 0) {
        container.innerHTML = `
            <div class="hod-empty-state">
                <div style="font-size: 2.2rem; margin-bottom: 8px;">📭</div>
                <h4 style="font-size: 1rem; font-weight: 700; color: var(--text-main); margin-bottom: 4px;">No Attendance Entries Found</h4>
                <p style="font-size: 0.84rem; color: var(--text-muted);">No attendance was submitted for <strong>${escapeHTML(stream)}</strong> on <strong>${escapeHTML(dateVal)}</strong>.</p>
            </div>`;
        if (globalShareContainer) {
            globalShareContainer.style.display = 'none';
            globalShareContainer.innerHTML = '';
        }
        return;
    }

    const groupedBySec = {};
    const groupedByYear = {};
    const hasSections = DEPT_CONFIG[stream] ? DEPT_CONFIG[stream].hasSections : true;

    entries.forEach(entry => {
        const yrPrefix = entry.year.includes('First') || entry.year === '1' ? 'I' :
                         entry.year.includes('Second') || entry.year === '2' ? 'II' : 'III';
        
        const yearFullLabel = yrPrefix === 'I' ? '1st Year' : (yrPrefix === 'II' ? '2nd Year' : '3rd Year');

        let sectionTitle = `${yrPrefix} ${stream}`;
        if (hasSections && entry.section) {
            sectionTitle += ` - Section ${entry.section}`;
        }

        if (!groupedBySec[sectionTitle]) groupedBySec[sectionTitle] = [];
        groupedBySec[sectionTitle].push(entry);

        if (!groupedByYear[yearFullLabel]) groupedByYear[yearFullLabel] = [];
        groupedByYear[yearFullLabel].push(entry);
    });

    if (globalShareContainer) {
        globalShareContainer.innerHTML = buildGroupedWhatsAppButtons(stream, dateVal, entries);
        globalShareContainer.style.display = 'block';
    }

    Object.keys(groupedBySec).forEach(secKey => {
        groupedBySec[secKey].sort((a, b) => (parseInt(a.slot, 10) || 1) - (parseInt(b.slot, 10) || 1));
    });

    let html = '';
    const sectionKeys = Object.keys(groupedBySec);

    const yearsPresent = [...new Set(Object.keys(groupedByYear))].sort();
    if (yearsPresent.length > 0) {
        html += '<div class="year-filter-tabs">';
        html += `<button type="button" class="year-filter-tab ${currentHODYearFilter === 'ALL' ? 'active' : ''}" data-year-filter="ALL" onclick="filterHODSectionCards('ALL')">All Classes (${sectionKeys.length})</button>`;
        
        yearsPresent.forEach(yrLabel => {
            const yrCode = yrLabel.includes('1st') ? 'I' : (yrLabel.includes('2nd') ? 'II' : 'III');
            const count = Object.keys(groupedBySec).filter(k => k.startsWith(yrCode)).length;
            if (count > 0) {
                html += `<button type="button" class="year-filter-tab ${currentHODYearFilter === yrCode ? 'active' : ''}" data-year-filter="${yrCode}" onclick="filterHODSectionCards('${yrCode}')">${yrLabel} (${count})</button>`;
            }
        });
        html += '</div>';
    }

    sectionKeys.forEach((secTitle, index) => {
        const secEntries = groupedBySec[secTitle];
        const yrPrefix = secTitle.startsWith('I ') ? 'I' : (secTitle.startsWith('II ') ? 'II' : 'III');
        const isDisplay = (currentHODYearFilter === 'ALL' || currentHODYearFilter === yrPrefix) ? 'block' : 'none';
        const encodedMsg = encodeURIComponent(buildSectionWhatsAppMessage(secTitle, dateVal, secEntries));

        const isCollapsed = sectionKeys.length > 3 && index > 0 ? 'collapsed' : '';

        html += `
            <div class="hod-section-card ${isCollapsed}" data-year-prefix="${yrPrefix}" style="display: ${isDisplay};">
                <div class="hod-card-header" onclick="toggleHODCardAccordion(this)">
                    <div class="hod-card-title">
                        🏫 ${escapeHTML(secTitle)}
                        <span class="accordion-chevron">▼</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;" onclick="event.stopPropagation()">
                        <span class="hod-card-badge">${secEntries.length} slot${secEntries.length === 1 ? '' : 's'}</span>
                    </div>
                </div>
                <div class="hod-slots-list">`;

        secEntries.forEach(entry => {
            const slotNum = parseInt(entry.slot, 10) || 1;
            const timeLabel = getSlotTimeLabel(slotNum, dateVal);
            const rolls = entry.rollNumbers && entry.rollNumbers !== 'NIL' ? entry.rollNumbers : 'NIL (All Present)';
            
            html += `
                <div class="hod-slot-row">
                    <div class="hod-slot-top">
                        <div class="hod-slot-info">
                            <span class="hod-slot-badge">Slot ${slotNum} (${timeLabel})</span>
                            <span>${escapeHTML(entry.subject || 'Subject')}</span>
                        </div>
                    </div>
                    <div class="hod-slot-rolls">
                        <strong>Absentees:</strong> ${escapeHTML(rolls)}
                    </div>
                </div>`;
        });

        html += `
                </div>
                <button type="button" class="btn-whatsapp-section" onclick="openWhatsAppShare('${encodedMsg}')">
                    📱 Send Detailed WhatsApp Notice for ${escapeHTML(secTitle)}
                </button>
            </div>`;
    });

    container.innerHTML = html;
}

function buildGroupedWhatsAppButtons(stream, dateVal, entries) {
    let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
    const yrPrefixes = ['I', 'II', 'III'];
    const deptConfig = DEPT_CONFIG[stream] || DEPT_CONFIG.BCA;

    yrPrefixes.forEach(yrCode => {
        const yrEntries = entries.filter(e => {
            const yr = String(e.year || '').toUpperCase();
            if (yrCode === 'I') return yr.includes('FIRST') || yr.includes('1');
            if (yrCode === 'II') return yr.includes('SECOND') || yr.includes('2');
            if (yrCode === 'III') return yr.includes('THIRD') || yr.includes('3');
            return false;
        });

        if (yrEntries.length === 0) return;

        const yrLabel = yrCode === 'I' ? '1st Year' : (yrCode === 'II' ? '2nd Year' : '3rd Year');

        if (deptConfig.hasSections) {
            // BCA: Section A & B Combined
            const abEntries = yrEntries.filter(e => {
                const sec = String(e.section || '').toUpperCase();
                return sec === 'A' || sec === 'B' || sec === 'ALL' || sec === 'COMBINED';
            });
            if (abEntries.length > 0) {
                const title = `${yrLabel} BCA - Section A & B Combined`;
                const msg = buildCombinedGroupWhatsAppMessage(title, dateVal, abEntries);
                html += `<button type="button" class="btn-whatsapp-global" onclick="openWhatsAppShare('${encodeURIComponent(msg)}')">
                    📱 Share ${escapeHTML(title)} Report
                </button>`;
            }
        } else {
            // BCom / BBA: Main Class Attendance
            const title = `${yrLabel} ${deptConfig.code} Attendance Report`;
            const msg = buildCombinedGroupWhatsAppMessage(title, dateVal, yrEntries);
            html += `<button type="button" class="btn-whatsapp-global" onclick="openWhatsAppShare('${encodeURIComponent(msg)}')">
                📱 Share ${escapeHTML(title)} Report
            </button>`;
        }
    });

    html += '</div>';
    return html;
}

function formatWhatsAppDateDDMMYYYY(dateStr) {
    if (!dateStr) return '';
    try {
        const parts = String(dateStr).trim().split(/[-/]/);
        if (parts.length === 3 && parts[0].length === 4) {
            const dd = String(parts[2]).padStart(2, '0');
            const mm = String(parts[1]).padStart(2, '0');
            return dd + '-' + mm + '-' + parts[0];
        }
        if (parts.length === 3) {
            const dd = String(parts[0]).padStart(2, '0');
            const mm = String(parts[1]).padStart(2, '0');
            const yyyy = parts[2].length === 2 ? ('20' + parts[2]) : parts[2];
            return dd + '-' + mm + '-' + yyyy;
        }
    } catch (e) {}
    return String(dateStr);
}

function formatWhatsAppRolls(rollNumbers) {
    const raw = (rollNumbers == null || String(rollNumbers).trim() === '') ? 'NIL' : String(rollNumbers).trim();
    if (!raw || raw.toUpperCase() === 'NIL' || raw.toUpperCase() === 'NONE') {
        return '*NIL*';
    }
    const cleaned = raw.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean).join(', ');
    return '*' + (cleaned || raw) + '*';
}

function isWhatsAppSlotEntry(entry) {
    return !!(entry && (entry.subject || entry.slot || entry.rollNumbers != null));
}

function formatWhatsAppPeriodLine(entry, includeSecTag, dateVal) {
    const slotNum = parseInt(entry.slot, 10) || 1;
    const timeLabel = getSlotTimeShortLabel(slotNum, dateVal || entry.date);
    const subject = String(entry.subject || 'Subject').trim();
    let secTag = '';
    if (includeSecTag && entry.section && entry.section !== 'ONLY') {
        const secU = String(entry.section).trim().toUpperCase();
        if (secU === 'ALL' || secU.indexOf('COMBIN') !== -1) {
            secTag = ' [Combined]';
        } else {
            secTag = ' [Sec ' + String(entry.section).trim() + ']';
        }
    }
    return timeLabel + secTag + ' *' + subject + '*: ' + formatWhatsAppRolls(entry.rollNumbers);
}

function entriesSpanMultipleSections(entries) {
    const secs = new Set();
    (entries || []).forEach(e => {
        const s = String(e.section || '').trim().toUpperCase();
        if (s) secs.add(s);
    });
    return secs.size > 1;
}

function buildCombinedGroupWhatsAppMessage(groupTitle, dateStr, entries) {
    const formattedDate = formatWhatsAppDateDDMMYYYY(dateStr);
    let msg = '*MGM EVENING COLLEGE — ABSENTEE NOTICE*\n';
    msg += groupTitle + '\n';
    msg += formattedDate + '\n\n';

    const list = (entries || []).filter(isWhatsAppSlotEntry);
    list.sort((a, b) => {
        const slotDiff = (parseInt(a.slot, 10) || 1) - (parseInt(b.slot, 10) || 1);
        if (slotDiff !== 0) return slotDiff;
        const secA = String(a.section || '').toUpperCase();
        const secB = String(b.section || '').toUpperCase();
        if (secA !== secB) return secA.localeCompare(secB);
        return String(a.subject || '').localeCompare(String(b.subject || ''));
    });

    if (list.length === 0) {
        msg += 'No absentees recorded.\n';
        return msg.trim();
    }

    const showSec = entriesSpanMultipleSections(list);
    list.forEach((e, idx) => {
        if (idx > 0) msg += '\n';
        msg += formatWhatsAppPeriodLine(e, showSec, dateStr) + '\n';
    });

    return msg.trim();
}

function buildSectionWhatsAppMessage(sectionTitle, dateStr, entries) {
    const formattedDate = formatWhatsAppDateDDMMYYYY(dateStr);
    let msg = '*MGM EVENING COLLEGE — ABSENTEE NOTICE*\n';
    msg += sectionTitle + '\n';
    msg += formattedDate + '\n\n';

    const list = (entries || []).filter(isWhatsAppSlotEntry);
    list.sort((a, b) => {
        const slotDiff = (parseInt(a.slot, 10) || 1) - (parseInt(b.slot, 10) || 1);
        if (slotDiff !== 0) return slotDiff;
        return String(a.subject || '').localeCompare(String(b.subject || ''));
    });

    if (list.length === 0) {
        msg += 'No absentees recorded.\n';
        return msg.trim();
    }

    list.forEach((e, idx) => {
        if (idx > 0) msg += '\n';
        msg += formatWhatsAppPeriodLine(e, true, dateStr) + '\n';
    });

    return msg.trim();
}

function buildYearWhatsAppMessage(yearLabel, stream, dateStr, entries) {
    const formattedDate = formatWhatsAppDateDDMMYYYY(dateStr);
    const yrPrefix = yearLabel.includes('1st') || yearLabel === 'I' ? 'I' :
                     yearLabel.includes('2nd') || yearLabel === 'II' ? 'II' : 'III';

    let msg = '*MGM EVENING COLLEGE — ABSENTEE NOTICE*\n';
    msg += yrPrefix + ' ' + stream + '\n';
    msg += formattedDate + '\n\n';
    msg += yrPrefix + ' ' + stream + '\n';
    msg += formattedDate + '\n\n';

    const groupedBySec = {};
    (entries || []).filter(isWhatsAppSlotEntry).forEach(e => {
        const sec = e.section || 'A';
        const secU = String(sec).toUpperCase();
        const key = (secU === 'ALL' || secU.indexOf('COMBIN') !== -1) ? 'Combined' : ('Sec ' + sec);
        if (!groupedBySec[key]) groupedBySec[key] = [];
        groupedBySec[key].push(e);
    });

    const secKeys = Object.keys(groupedBySec).sort();
    if (secKeys.length === 0) {
        msg += 'No absentees recorded.\n';
        return msg.trim();
    }

    secKeys.forEach(secKey => {
        msg += '*' + yrPrefix + ' ' + stream + ' — ' + secKey + '*\n';
        const secEntries = groupedBySec[secKey];
        secEntries.sort((a, b) => (parseInt(a.slot, 10) || 1) - (parseInt(b.slot, 10) || 1));
        secEntries.forEach((e, idx) => {
            if (idx > 0) msg += '\n';
            msg += formatWhatsAppPeriodLine(e, true) + '\n';
        });
        msg += '\n';
    });

    return msg.trim();
}

function openWhatsAppShare(encodedMsg) {
    const waUrl = `https://wa.me/?text=${encodedMsg}`;
    window.open(waUrl, '_blank');
}

function formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    try {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const d = new Date(parts[0], parts[1] - 1, parts[2]);
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        }
    } catch (e) {}
    return dateStr;
}

function initPasscodeManager() {
    const loginBtn = document.getElementById('loginPasscodeSettingsBtn');
    const hodBtn = document.getElementById('hodPasscodeSettingsBtn');
    const modal = document.getElementById('passcodeSettingsModal');
    const closeBtn = document.getElementById('closePasscodeModalBtn');
    const form = document.getElementById('passcodeSettingsForm');
    const resetBtn = document.getElementById('resetPasscodesBtn');

    const passTeacher_BCA = document.getElementById('passTeacher_BCA');
    const passHOD_BCA = document.getElementById('passHOD_BCA');
    const passTeacher_BCOM = document.getElementById('passTeacher_BCOM');
    const passHOD_BCOM = document.getElementById('passHOD_BCOM');
    const passTeacher_BBA = document.getElementById('passTeacher_BBA');
    const passHOD_BBA = document.getElementById('passHOD_BBA');
    const passADMIN = document.getElementById('passADMIN');

    const titleEl = document.getElementById('passcodeModalTitle');
    const subtitleEl = document.getElementById('passcodeModalSubtitle');

    const openPasscodeModal = (e) => {
        if (e) e.preventDefault();
        const store = getPasscodeStore();

        if (passTeacher_BCA) passTeacher_BCA.value = store.teacher.BCA;
        if (passHOD_BCA) passHOD_BCA.value = store.hod.BCA;
        if (passTeacher_BCOM) passTeacher_BCOM.value = store.teacher.BCOM;
        if (passHOD_BCOM) passHOD_BCOM.value = store.hod.BCOM;
        if (passTeacher_BBA) passTeacher_BBA.value = store.teacher.BBA;
        if (passHOD_BBA) passHOD_BBA.value = store.hod.BBA;
        if (passADMIN) passADMIN.value = store.ADMIN;

        const groupADMIN = document.getElementById('groupADMIN');

        if (titleEl) titleEl.textContent = 'Manage Department Passcodes';
        if (subtitleEl) subtitleEl.textContent = 'Update Teacher passcodes or Master Admin passcode.';

        if (modal) modal.classList.add('active');
    };

    if (loginBtn) loginBtn.addEventListener('click', openPasscodeModal);
    if (hodBtn) hodBtn.addEventListener('click', openPasscodeModal);
    if (closeBtn && modal) closeBtn.addEventListener('click', () => modal.classList.remove('active'));

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const store = getPasscodeStore();
            const updatedCustom = {
                teacherBCA: passTeacher_BCA ? passTeacher_BCA.value.trim() : store.teacher.BCA,
                hodBCA: passHOD_BCA ? passHOD_BCA.value.trim() : store.hod.BCA,
                teacherBCOM: passTeacher_BCOM ? passTeacher_BCOM.value.trim() : store.teacher.BCOM,
                hodBCOM: passHOD_BCOM ? passHOD_BCOM.value.trim() : store.hod.BCOM,
                teacherBBA: passTeacher_BBA ? passTeacher_BBA.value.trim() : store.teacher.BBA,
                hodBBA: passHOD_BBA ? passHOD_BBA.value.trim() : store.hod.BBA,
                ADMIN: currentRole === 'ADMIN' ? (passADMIN ? passADMIN.value.trim() : store.ADMIN) : store.ADMIN
            };
            savePasscodeStore(updatedCustom);

            (function syncPasscodesToServer(storeObj) {
                const targetUrl = getWebhookUrl(currentDept);
                const payload = withAuth(Object.assign({ action: 'set_passcodes' }, storeObj));
                submitViaHiddenForm(targetUrl, payload).catch(function () {});
                const cbName = 'mgmPassSync_' + Date.now();
                window[cbName] = function (data) {
                    try { delete window[cbName]; } catch (err) {}
                    if (data && data.result === 'success') {
                        showCustomToast('Passcodes saved', 'Updated on this device and Google Sheet server.');
                    }
                };
                const params = new URLSearchParams(Object.assign({
                    action: 'set_passcodes',
                    callback: cbName
                }, storeObj));
                appendAuthToParams(params);
                const scriptEl = document.createElement('script');
                scriptEl.src = targetUrl + (targetUrl.indexOf('?') >= 0 ? '&' : '?') + params.toString();
                document.body.appendChild(scriptEl);
            })(updatedCustom);

            if (modal) modal.classList.remove('active');
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('Reset Teacher & HOD passcodes to defaults?')) {
                localStorage.removeItem('mgmec_custom_passcodes');
                const store = getPasscodeStore();
                if (passTeacher_BCA) passTeacher_BCA.value = store.teacher.BCA;
                if (passHOD_BCA) passHOD_BCA.value = store.hod.BCA;
                if (passTeacher_BCOM) passTeacher_BCOM.value = store.teacher.BCOM;
                if (passHOD_BCOM) passHOD_BCOM.value = store.hod.BCOM;
                if (passTeacher_BBA) passTeacher_BBA.value = store.teacher.BBA;
                if (passHOD_BBA) passHOD_BBA.value = store.hod.BBA;
                if (passADMIN) passADMIN.value = store.ADMIN;
                alert('Passcodes reset to default!');
            }
        });
    }
}

function initThemeToggle() {
    const themeToggleBtn = document.getElementById('themeToggle');
    const savedTheme = localStorage.getItem('mgmec_theme') || 'dark';

    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', currentTheme);
            localStorage.setItem('mgmec_theme', currentTheme);
            updateThemeIcon(currentTheme);
        });
    }
}

function updateThemeIcon(theme) {
    const themeToggleBtn = document.getElementById('themeToggle');
    if (!themeToggleBtn) return;
    if (theme === 'light') {
        themeToggleBtn.innerHTML = `
          <svg class="moon-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>`;
        themeToggleBtn.title = 'Switch to Dark Mode';
    } else {
        themeToggleBtn.innerHTML = `
          <svg class="sun-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>`;
        themeToggleBtn.title = 'Switch to Light Mode';
    }
}




// PWA Installation 1-Tap Handler
let deferredPWAInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPWAInstallPrompt = e;
    const pwaBtn = document.getElementById('pwaInstallBtn');
    if (pwaBtn) pwaBtn.style.display = 'inline-flex';
});

document.addEventListener('DOMContentLoaded', () => {
    const pwaBtn = document.getElementById('pwaInstallBtn');
    if (pwaBtn) {
        pwaBtn.addEventListener('click', async () => {
            if (deferredPWAInstallPrompt) {
                deferredPWAInstallPrompt.prompt();
                const choice = await deferredPWAInstallPrompt.userChoice;
                if (choice && choice.outcome === 'accepted') {
                    showCustomToast('Installing App', 'Follow the prompt on screen to add to home screen.');
                }
                deferredPWAInstallPrompt = null;
                pwaBtn.style.display = 'none';
            } else {
                showCustomToast('Install App', 'Tap the 3 dots menu in Chrome/Edge or Share icon in Safari, then select "Add to Home Screen" or "Install App".');
            }
        });
    }
});

window.addEventListener('appinstalled', () => {
    deferredPWAInstallPrompt = null;
    const pwaBtn = document.getElementById('pwaInstallBtn');
    if (pwaBtn) pwaBtn.style.display = 'none';
    showCustomToast('App Installed', 'MGM Evening College Absentee Informer installed on your Home Screen!');
});

function getShortageDept() {
    return currentDept || 'BCA';
}

function updateShortageSectionDropdown(deptCode) {
    const secSelect = document.getElementById('shortageSectionSelect');
    if (!secSelect) return;
    const dept = deptCode || getShortageDept();
    const config = DEPT_CONFIG[dept] || DEPT_CONFIG.BCA;
    const prev = secSelect.value;
    if (config.hasSections) {
        secSelect.innerHTML =
            '<option value="A">Section A</option>' +
            '<option value="B">Section B</option>' +
            '<option value="ALL">Combined (Sec A &amp; B / Electives)</option>';
    } else {
        secSelect.innerHTML =
            '<option value="ONLY">Main Class</option>' +
            '<option value="ALL">Combined (Electives)</option>';
    }
    if (prev && Array.from(secSelect.options).some(o => o.value === prev)) {
        secSelect.value = prev;
    }
}

function updateShortageSubjectDropdown() {
    const yrSelect = document.getElementById('shortageYearSelect');
    const secSelect = document.getElementById('shortageSectionSelect');
    const subjSelect = document.getElementById('shortageSubjectSelect');
    if (!subjSelect) return;

    const dept = getShortageDept();
    const yr = yrSelect ? yrSelect.value : 'First Year';
    const sec = secSelect ? secSelect.value : 'A';
    const subjects = getSubjectsForActiveYear(dept, yr, sec);

    const history = readAllHistory();
    const historySubjs = new Set();
    history.forEach(item => {
        if (!item.subject) return;
        if (!isStreamMatchEvening(item.stream, dept)) return;
        if (item.year && !isYearMatching(item.year, yr)) return;
        if (item.section && !sectionsEqualForSubject(item.section, sec)) return;
        historySubjs.add(item.subject.trim());
    });

    const allSubjs = Array.from(new Set([...subjects, ...historySubjs])).sort();
    let html = '<option value="ALL" selected>All Subjects (Overall)</option>';
    allSubjs.forEach(sub => {
        html += '<option value="' + escapeHTML(sub) + '">' + escapeHTML(sub) + '</option>';
    });
    subjSelect.innerHTML = html;
}

function fetchServerHistoryForShortage(stream, period, fVal, tVal, callback) {
    const targetUrl = getWebhookUrl(stream || currentDept || 'BCA');
    if (!targetUrl) {
        if (callback) callback();
        return;
    }

    let dateParam = 'ALL';
    if (period === 'CUSTOM') {
        if (fVal && tVal && fVal === tVal) dateParam = fVal;
        else if (fVal) dateParam = fVal;
    }

    const cbName = 'mgmec_shortage_history_cb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    let done = false;

    const timeout = setTimeout(() => {
        if (done) return;
        done = true;
        try { delete window[cbName]; } catch (e) {}
        if (callback) callback();
    }, 8000);

    window[cbName] = function (res) {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        try { delete window[cbName]; } catch (e) {}

        if (res && (res.result === 'success' || res.status === 'ok') && Array.isArray(res.entries)) {
            const history = readAllHistory();
            const byKey = new Map();
            history.forEach(item => {
                const k = historyMatchKey(item);
                if (k) byKey.set(k, item);
            });

            res.entries.forEach(srv => {
                const normalizedDate = normalizeHistoryDate(srv.date);
                if (!normalizedDate) return;
                const formattedRolls = Array.isArray(srv.rollNumbers) ? srv.rollNumbers.join(', ') : String(srv.rollNumbers || '');
                const srvObj = {
                    action: 'create',
                    stream: stream || currentDept || 'BCA',
                    date: normalizedDate,
                    year: srv.year || 'First Year',
                    section: srv.section || 'A',
                    subject: srv.subject || '',
                    slot: String(parseInt(srv.slot, 10) || 1),
                    rollNumbers: formattedRolls,
                    offline: false,
                    timestamp: srv.timestamp || 'From Sheet'
                };
                const k = historyMatchKey(srvObj);
                const existing = byKey.get(k);
                if (k && (!existing || existing.offline === false)) {
                    byKey.set(k, srvObj);
                }
            });

            saveHistoryToLocalStorage(compactAttendanceHistory(Array.from(byKey.values())));
        }

        if (callback) callback();
    };

    const params = new URLSearchParams({
        action: 'get_absentees',
        stream: stream || currentDept || 'BCA',
        date: dateParam,
        fromDate: fVal || (period === 'ALL' ? '2020-01-01' : ''),
        toDate: tVal || (period === 'ALL' ? '2030-12-31' : ''),
        callback: cbName
    });
    appendAuthToParams(params);

    const scriptEl = document.createElement('script');
    scriptEl.src = targetUrl + (targetUrl.indexOf('?') >= 0 ? '&' : '?') + params.toString();
    scriptEl.onerror = function () {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        try { delete window[cbName]; } catch (e) {}
        if (callback) callback();
    };
    document.body.appendChild(scriptEl);
}

function parseShortageRollNumbers(sRollStr, eRollStr) {
    const sStr = (sRollStr || '').trim();
    const eStr = (eRollStr || '').trim();

    let rawInput = '';
    if (sStr && eStr) {
        if (!sStr.includes('-') && !sStr.includes(',')) {
            const eParts = eStr.split(',').map(p => p.trim());
            const firstEndPart = eParts[0];
            if (firstEndPart && !firstEndPart.includes('-')) {
                const remainingEParts = eParts.slice(1).join(', ');
                rawInput = sStr + '-' + firstEndPart + (remainingEParts ? ', ' + remainingEParts : '');
            } else {
                rawInput = sStr + ', ' + eStr;
            }
        } else {
            rawInput = sStr + ', ' + eStr;
        }
    } else {
        rawInput = sStr || eStr;
    }

    const rollObjects = [];
    const seenNums = new Set();

    rawInput.split(',').forEach(part => {
        part = part.trim();
        if (!part) return;

        if (part.includes('-')) {
            const [startPart, endPart] = part.split('-').map(p => p.trim());
            const prefixMatch = startPart.match(/^([A-Za-z]+)?(\d+)$/);
            const prefix = prefixMatch && prefixMatch[1] ? prefixMatch[1].toUpperCase() : '';
            const padLen = prefixMatch && prefixMatch[2] ? prefixMatch[2].length : 0;

            const sNum = parseInt(startPart.replace(/\D/g, ''), 10);
            const eNum = parseInt(endPart.replace(/\D/g, ''), 10);

            if (!isNaN(sNum) && !isNaN(eNum)) {
                const minNum = Math.min(sNum, eNum);
                const maxNum = Math.max(sNum, eNum);
                for (let num = minNum; num <= maxNum; num++) {
                    if (!seenNums.has(num)) {
                        seenNums.add(num);
                        const code = prefix ? prefix + String(num).padStart(padLen, '0') : String(num);
                        rollObjects.push({ code: code, num: num });
                    }
                }
            }
        } else {
            const prefixMatch = part.match(/^([A-Za-z]+)?(\d+)$/);
            const prefix = prefixMatch && prefixMatch[1] ? prefixMatch[1].toUpperCase() : '';
            const padLen = prefixMatch && prefixMatch[2] ? prefixMatch[2].length : 0;
            const num = parseInt(part.replace(/\D/g, ''), 10);

            if (!isNaN(num) && !seenNums.has(num)) {
                seenNums.add(num);
                const code = prefix ? prefix + String(num).padStart(padLen, '0') : String(num);
                rollObjects.push({ code: code, num: num });
            }
        }
    });

    return rollObjects;
}

function initShortageCalculator() {
    const subTabDaily = document.getElementById('subTabDailyInformer');
    const subTabShortage = document.getElementById('subTabShortageCalculator');
    const dailyContainer = document.getElementById('hodDailyInformerContainer');
    const shortageContainer = document.getElementById('hodShortageContainer');

    const startRollInput = document.getElementById('shortageStartRoll');
    const endRollInput = document.getElementById('shortageEndRoll');
    const deptSelect = document.getElementById('shortageDeptSelect');
    const yearSelectEl = document.getElementById('shortageYearSelect');
    const sectionSelect = document.getElementById('shortageSectionSelect');
    const subjectSelect = document.getElementById('shortageSubjectSelect');
    const cutoffSelect = document.getElementById('shortageCutoffSelect');
    const periodSelect = document.getElementById('shortagePeriodSelect');
    const customDateRow = document.getElementById('shortageCustomDateRow');
    const fromDateInput = document.getElementById('shortageFromDate');
    const toDateInput = document.getElementById('shortageToDate');
    const calcBtn = document.getElementById('shortageCalculateBtn');
    const calcBtnText = document.getElementById('shortageCalculateBtnText');
    const spinner = document.getElementById('shortageSpinner');
    const container = document.getElementById('shortageResultsContainer');

    if (subTabDaily && subTabShortage && dailyContainer && shortageContainer) {
        subTabDaily.addEventListener('click', () => {
            subTabDaily.classList.add('active');
            subTabShortage.classList.remove('active');
            dailyContainer.style.display = 'block';
            shortageContainer.style.display = 'none';
        });

        subTabShortage.addEventListener('click', () => {
            subTabShortage.classList.add('active');
            subTabDaily.classList.remove('active');
            shortageContainer.style.display = 'block';
            dailyContainer.style.display = 'none';
            lockStreamSelectToDept(deptSelect, currentDept);
            updateShortageSectionDropdown(getShortageDept());
            updateShortageSubjectDropdown();
        });
    }

    if (!calcBtn) return;

    if (periodSelect && customDateRow) {
        periodSelect.addEventListener('change', () => {
            if (periodSelect.value === 'CUSTOM') {
                customDateRow.style.display = 'flex';
                if (fromDateInput && !fromDateInput.value) fromDateInput.value = getTodayISOString();
                if (toDateInput && !toDateInput.value) toDateInput.value = getTodayISOString();
            } else {
                customDateRow.style.display = 'none';
            }
        });
    }

    const refreshShortageFilters = () => {
        updateShortageSectionDropdown(getShortageDept());
        updateShortageSubjectDropdown();
    };

    if (deptSelect) deptSelect.addEventListener('change', refreshShortageFilters);
    if (sectionSelect) sectionSelect.addEventListener('change', updateShortageSubjectDropdown);
    if (yearSelectEl) yearSelectEl.addEventListener('change', updateShortageSubjectDropdown);
    refreshShortageFilters();

    calcBtn.addEventListener('click', () => {
        const dept = getShortageDept();
        const yrVal = yearSelectEl ? yearSelectEl.value : 'First Year';
        const secVal = sectionSelect ? sectionSelect.value : 'A';
        const subjFilter = subjectSelect ? subjectSelect.value : 'ALL';
        const sRollStr = startRollInput ? startRollInput.value.trim() : '';
        const eRollStr = endRollInput ? endRollInput.value.trim() : '';
        const cutoff = cutoffSelect ? parseFloat(cutoffSelect.value) || 75 : 75;
        const period = periodSelect ? periodSelect.value : 'ALL';

        if (!sRollStr && !eRollStr) {
            alert('Please enter Roll No. range or list (e.g. 26701 to 26760 or 26701-26760, 26810).');
            if (startRollInput) startRollInput.focus();
            return;
        }

        const initialRollCheck = parseShortageRollNumbers(sRollStr, eRollStr);
        if (initialRollCheck.length === 0) {
            alert('Invalid roll numbers entered. Example formats: 26701 to 26760 OR 26701-26760, 26810.');
            if (startRollInput) startRollInput.focus();
            return;
        }

        if (spinner) spinner.style.display = 'inline-block';
        if (calcBtnText) calcBtnText.textContent = 'Calculating Shortage...';
        calcBtn.disabled = true;

        const fVal = fromDateInput ? fromDateInput.value : '';
        const tVal = toDateInput ? toDateInput.value : '';

        fetchServerHistoryForShortage(dept, period, fVal, tVal, () => {
            const history = readAllHistory();
            const now = new Date();
            const currentMonthStr = getTodayISOString().substring(0, 7);

            let periodLabel = 'All Time (Cumulative)';
            if (period === 'MONTH') periodLabel = 'This Month (' + currentMonthStr + ')';
            else if (period === 'WEEK') periodLabel = 'This Week (Last 7 Days)';
            else if (period === 'CUSTOM') {
                periodLabel = 'Custom (' + (fVal || 'Start') + ' to ' + (tVal || 'End') + ')';
            }

            const matchingSessions = history.filter(item => {
                const yrMatch = isYearMatching(item.year, yrVal);
                const secMatch = !item.section || sectionsEqualForSubject(item.section, secVal);
                const streamMatch = isStreamMatchEvening(item.stream, dept);
                if (!yrMatch || !secMatch || !streamMatch) return false;

                if (subjFilter !== 'ALL' && !isSubjectMatching(item.subject, subjFilter)) return false;

                const itemDateStr = normalizeHistoryDate(item.date) || getTodayISOString();
                if (period === 'MONTH') {
                    return itemDateStr.substring(0, 7) === currentMonthStr;
                }
                if (period === 'WEEK') {
                    const itemTime = new Date(itemDateStr).getTime();
                    const weekAgo = now.getTime() - (7 * 24 * 60 * 60 * 1000);
                    return !isNaN(itemTime) && itemTime >= weekAgo;
                }
                if (period === 'CUSTOM') {
                    if (fVal && itemDateStr < fVal) return false;
                    if (tVal && itemDateStr > tVal) return false;
                }
                return true;
            });

            const rollObjects = parseShortageRollNumbers(sRollStr, eRollStr);
            const totalConducted = matchingSessions.length;
            const absenceCountMap = {};
            const subjectStatsMap = {};

            rollObjects.forEach(rObj => {
                absenceCountMap[rObj.code] = 0;
                subjectStatsMap[rObj.code] = {};
            });

            matchingSessions.forEach(item => {
                const itemSubj = (item.subject || 'General').trim();
                const rolls = normalizeRollNumbers(item.rollNumbers);

                rollObjects.forEach(rObj => {
                    if (!subjectStatsMap[rObj.code][itemSubj]) {
                        subjectStatsMap[rObj.code][itemSubj] = { conducted: 0, missed: 0 };
                    }
                    subjectStatsMap[rObj.code][itemSubj].conducted++;
                });

                rolls.forEach(rStr => {
                    const cleanR = String(rStr).trim().toUpperCase();
                    const rNum = parseInt(cleanR.replace(/\D/g, ''), 10);

                    rollObjects.forEach(rObj => {
                        const codeMatch = cleanR === rObj.code;
                        const numMatch = !isNaN(rNum) && rNum === rObj.num;

                        let suffixMatch = false;
                        if (!isNaN(rNum) && rNum > 0) {
                            const str1 = String(rNum);
                            const str2 = String(rObj.num);
                            if (str1.length >= 2 && str2.length >= 2) {
                                suffixMatch = str1.endsWith(str2) || str2.endsWith(str1);
                            }
                        }

                        if (codeMatch || numMatch || suffixMatch) {
                            absenceCountMap[rObj.code] = (absenceCountMap[rObj.code] || 0) + 1;
                            if (subjectStatsMap[rObj.code][itemSubj]) {
                                subjectStatsMap[rObj.code][itemSubj].missed++;
                            }
                        }
                    });
                });
            });

            const shortageList = [];
            rollObjects.forEach(rObj => {
                const missed = absenceCountMap[rObj.code] || 0;
                const attended = Math.max(0, totalConducted - missed);
                const pct = totalConducted > 0 ? (attended / totalConducted) * 100 : 100;
                const roundedPct = Math.round(pct * 10) / 10;

                const subjBreakdown = [];
                const sMap = subjectStatsMap[rObj.code] || {};
                for (let sName in sMap) {
                    const sCond = sMap[sName].conducted;
                    const sMiss = sMap[sName].missed;
                    const sAtt = Math.max(0, sCond - sMiss);
                    const sPct = sCond > 0 ? Math.round((sAtt / sCond) * 1000) / 10 : 100;
                    subjBreakdown.push({
                        subject: sName,
                        conducted: sCond,
                        missed: sMiss,
                        attended: sAtt,
                        percent: sPct
                    });
                }

                if (roundedPct < cutoff || cutoff === 100) {
                    shortageList.push({
                        roll: rObj.code,
                        total: totalConducted,
                        missed: missed,
                        attended: attended,
                        percent: roundedPct,
                        subjectBreakdown: subjBreakdown
                    });
                }
            });

            shortageList.sort((a, b) => a.percent - b.percent);

            if (spinner) spinner.style.display = 'none';
            if (calcBtnText) calcBtnText.textContent = '📊 Calculate Shortage Report';
            calcBtn.disabled = false;

            renderShortageResults(container, dept, yrVal, secVal, subjFilter, sRollStr, eRollStr, totalConducted, cutoff, shortageList, periodLabel);
        });
    });
}

function renderShortageResults(container, dept, yearStr, sectionStr, subjectFilter, startRoll, endRoll, totalClasses, cutoff, shortageList, periodLabel) {
    if (!container) return;
    container.style.display = 'block';

    const pLabel = periodLabel || 'All Time (Cumulative)';
    const count = shortageList.length;
    const subjHeader = subjectFilter === 'ALL' ? 'All Subjects (Overall)' : subjectFilter;
    const deptLabel = (DEPT_CONFIG[dept] && DEPT_CONFIG[dept].code) || dept || 'BCA';

    let html = `
    <div style="background: var(--card-bg, #1e293b); border: 1px solid var(--border-color, #334155); border-radius: 10px; padding: 14px; margin-top: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
            <div>
                <h4 style="margin: 0; font-size: 0.98rem; font-weight: 800; color: var(--text-main);">
                    📋 Shortage Results: ${escapeHTML(deptLabel)} ${escapeHTML(yearStr)} - Sec ${escapeHTML(sectionStr)}
                </h4>
                <div style="font-size: 0.78rem; color: #60a5fa; margin-top: 2px;">
                    📚 Subject: <strong>${escapeHTML(subjHeader)}</strong>
                </div>
                <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">
                    Period: <strong>${escapeHTML(pLabel)}</strong> | Roll Range: ${escapeHTML(startRoll)} – ${escapeHTML(endRoll)} | Classes Logged: <strong>${totalClasses}</strong>
                </div>
            </div>
            <span class="badge ${count > 0 ? 'badge-danger' : 'badge-success'}" style="font-weight: 800; font-size: 0.78rem;">
                ${count} Student(s) < ${cutoff}%
            </span>
        </div>`;

    if (count === 0) {
        html += `
        <div style="text-align: center; padding: 16px; color: #34d399; background: rgba(52, 211, 153, 0.1); border-radius: 8px;">
            🎉 <strong>No Students Below ${cutoff}% Attendance!</strong><br>
            All students in roll range ${escapeHTML(startRoll)}–${escapeHTML(endRoll)} have clean attendance records for ${escapeHTML(subjHeader)} (${escapeHTML(pLabel)}).
        </div>`;
    } else {
        html += `
        <button type="button" class="btn-whatsapp-global" id="shortageShareWaBtn" style="margin-bottom: 12px; width: 100%; font-weight: 700;">
            📱 Share Shortage List (${count} Students) to WhatsApp
        </button>
        <div style="display: flex; flex-direction: column; gap: 10px; max-height: 400px; overflow-y: auto;">`;

        shortageList.forEach(item => {
            let badgeColor = '#ef4444';
            let badgeBg = 'rgba(239, 68, 68, 0.15)';
            let statusLabel = 'Critical Shortage';

            if (item.percent >= 75) {
                badgeColor = '#10b981';
                badgeBg = 'rgba(16, 185, 129, 0.15)';
                statusLabel = 'Sufficient';
            } else if (item.percent >= 60) {
                badgeColor = '#f59e0b';
                badgeBg = 'rgba(245, 158, 11, 0.15)';
                statusLabel = 'Warning Shortage';
            }

            let breakdownPillsHtml = '';
            if (subjectFilter === 'ALL' && item.subjectBreakdown && item.subjectBreakdown.length > 0) {
                breakdownPillsHtml = '<div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;">';
                item.subjectBreakdown.forEach(sb => {
                    const sbColor = sb.percent >= 75 ? '#34d399' : (sb.percent >= 60 ? '#fbbf24' : '#f87171');
                    breakdownPillsHtml += `<span style="font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: rgba(0,0,0,0.3); color: ${sbColor}; border: 1px solid ${sbColor};">
                        ${escapeHTML(sb.subject)}: <strong>${sb.percent}%</strong> (${sb.attended}/${sb.conducted})
                    </span>`;
                });
                breakdownPillsHtml += '</div>';
            }

            html += `
            <div style="padding: 10px 12px; background: rgba(0,0,0,0.25); border-left: 4px solid ${badgeColor}; border-radius: 6px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong style="font-size: 0.92rem; color: var(--text-main);">Roll ${item.roll}</strong>
                        <div style="font-size: 0.76rem; color: var(--text-muted);">
                            Attended: ${item.attended} / ${item.total} classes (${item.missed} missed)
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 1.05rem; font-weight: 800; color: ${badgeColor};">${item.percent}%</div>
                        <span style="font-size: 0.68rem; padding: 2px 6px; border-radius: 4px; background: ${badgeBg}; color: ${badgeColor}; font-weight: 700;">${statusLabel}</span>
                    </div>
                </div>
                ${breakdownPillsHtml}
            </div>`;
        });

        html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;

    const waBtn = document.getElementById('shortageShareWaBtn');
    if (waBtn) {
        waBtn.addEventListener('click', () => {
            const waText = buildShortageWhatsAppText(deptLabel, yearStr, sectionStr, subjectFilter, startRoll, endRoll, totalClasses, cutoff, shortageList, pLabel);
            const waUrl = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(waText);
            window.open(waUrl, '_blank');
        });
    }
}

function buildShortageWhatsAppText(deptLabel, yearStr, sectionStr, subjectFilter, startRoll, endRoll, totalClasses, cutoff, shortageList, periodLabel) {
    const pLabel = periodLabel || 'All Time (Cumulative)';
    const subjHeader = subjectFilter === 'ALL' ? 'All Subjects (Overall)' : subjectFilter;

    let msg = `⚠️ *ATTENDANCE SHORTAGE REPORT (< ${cutoff}%)*\n`;
    msg += `📍 *MGM Evening College — ${deptLabel} ${yearStr} Sec ${sectionStr}*\n`;
    msg += `📚 *Subject: ${subjHeader}*\n`;
    msg += `📅 *Period: ${pLabel}*\n`;
    msg += `📊 *Total Classes Logged: ${totalClasses}*\n`;
    msg += `🔢 *Roll Range: ${startRoll} – ${endRoll}*\n`;
    msg += `------------------------------------\n\n`;

    if (shortageList.length === 0) {
        msg += `✅ *All students have attendance above ${cutoff}%. No shortage detected.*\n`;
    } else {
        shortageList.forEach((item, idx) => {
            msg += `${idx + 1}. *Roll ${item.roll}* — *${item.percent}%* (${item.attended}/${item.total} classes)\n`;
            if (subjectFilter === 'ALL' && item.subjectBreakdown && item.subjectBreakdown.length > 0) {
                const subStrs = item.subjectBreakdown.map(sb => `${sb.subject}: ${sb.percent}%`).join(', ');
                msg += `   └ _[${subStrs}]_\n`;
            }
        });
        msg += `\n------------------------------------\n`;
        msg += `_Please contact the department coordinator regarding attendance shortage rectification._`;
    }
    return msg;
}
