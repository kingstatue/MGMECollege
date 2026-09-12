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
/** Set when editing from History — used to gate bulk-past same-slot peer subjects. */
let editingOriginalEntry = null;
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
                try { rollNumbersInput.focus({ preventScroll: true }); } catch (e2) {
                    try { rollNumbersInput.focus(); } catch (e3) {}
                }
                try {
                    window.scrollTo(0, 0);
                    document.documentElement.scrollTop = 0;
                    document.body.scrollTop = 0;
                } catch (e4) {}
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

function subjectsAreSame(subj1, subj2) {
    const a = String(subj1 || '').trim().toLowerCase();
    const b = String(subj2 || '').trim().toLowerCase();
    if (!a || !b) return false;
    return a === b;
}

function isSameAttendanceIdentity(a, b) {
    if (!a || !b) return false;
    return normalizeHistoryDate(a.date) === normalizeHistoryDate(b.date)
        && String(a.year || '') === String(b.year || '')
        && normalizeSectionCode(a.section) === normalizeSectionCode(b.section)
        && subjectsAreSame(a.subject, b.subject)
        && (parseInt(a.slot, 10) || 1) === (parseInt(b.slot, 10) || 1)
        && (a.stream || 'BCA') === (b.stream || 'BCA');
}

/** Bulk Past Generator rows (shortage backfill). */
function isBulkPastEntry(entry) {
    if (!entry) return false;
    if (entry.bulkPast === true) return true;
    return String(entry.timestamp || '') === 'Bulk Past Entry';
}

function checkDoubleEntryLive(dateVal, yearVal, sectionVal, subjectVal, slotVal, rollVal, alertBoxElem, submitBtnTextElem) {
    if (!alertBoxElem) return null;

    const cleanDate = dateVal || getTodayISOString();
    const cleanSlot = parseInt(slotVal, 10) || 1;
    const cleanSubject = (subjectVal || '').trim();
    const cleanYear = yearVal || 'First Year';
    const cleanStream = currentDept || 'BCA';
    const skipSelf = editingOriginalEntry;

    const localHistory = JSON.parse(localStorage.getItem('mgmec_attendance_history') || '[]');
    
    // Find any existing entry for same Date + Stream + Year + Slot with overlapping Section
    const existingEntry = localHistory.find(item => {
        if ((item.stream || 'BCA') !== cleanStream) return false;
        if (item.date !== cleanDate) return false;
        if (item.year !== cleanYear) return false;
        if (parseInt(item.slot, 10) !== cleanSlot) return false;
        if (skipSelf && isSameAttendanceIdentity(item, skipSelf)) return false;

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
    try { lockAppScroll(true); } catch (e) {}
}

function closeConfirmationModal() {
    if (confirmationModal) confirmationModal.classList.remove('active');
    if (deleteBtn) deleteBtn.style.display = 'none';
    if (modalAlertBox) modalAlertBox.style.display = 'none';
    if (statusPill) statusPill.className = 'status-pill';
    if (statusText) statusText.textContent = 'Tap microphone to speak';
    try { lockAppScroll(false); } catch (e) {}
    try { restoreAppViewport({ force: true }); } catch (e) {}
}

/** Keep header / mode tabs visible after edit/modals (prevents page shift). */
function isEditableFocused() {
    try {
        const active = document.activeElement;
        if (!active || active === document.body || active === document.documentElement) return false;
        const tag = String(active.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (active.isContentEditable) return true;
    } catch (e) {}
    return false;
}

function restoreAppViewport(opts) {
    opts = opts || {};
    try {
        // Keyboard open triggers resize — never steal focus while typing
        if (isEditableFocused() && !opts.force) return;

        window.scrollTo(0, 0);
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
        const frame = document.getElementById('appFrame') || document.querySelector('.app-frame');
        if (frame) frame.scrollTop = 0;
        if (!isEditableFocused()) {
            const appBody = document.querySelector('.app-body');
            if (appBody) appBody.scrollTop = 0;
        }
        // Only clear focus left inside a closed overlay (not live typing fields)
        if (opts.force) {
            const active = document.activeElement;
            if (active && active.closest && typeof active.blur === 'function') {
                const dead = active.closest('.modal-overlay:not(.active), .history-drawer:not(.active)');
                if (dead) active.blur();
            }
        }
    } catch (e) {}
}

function lockAppScroll(locked) {
    try {
        const anyOverlay = document.querySelector(
            '.modal-overlay.active, .history-drawer.active, .toast-overlay.active, .dept-login-overlay.active, #slotConflictModalDialog, #deleteConfirmModalDialog, #alertModalDialog, #missingComboModalDialog'
        );
        if (locked || anyOverlay) {
            document.documentElement.style.overflow = 'hidden';
            document.body.style.overflow = 'hidden';
        } else {
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
            restoreAppViewport({ force: true });
        }
    } catch (e) {}
}

function setHistoryDrawerOpen(isOpen) {
    const drawer = document.getElementById('historyDrawer') || historyDrawer;
    if (drawer) {
        if (isOpen) drawer.classList.add('active');
        else drawer.classList.remove('active');
    }
    try {
        document.body.classList.toggle('history-drawer-open', !!isOpen);
        lockAppScroll(!!isOpen);
        if (!isOpen) restoreAppViewport({ force: true });
    } catch (e) {}
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
            card.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        }
        try { window.scrollTo(0, 0); } catch (e) {}

        const cleanup = (choice) => {
            try { lockAppScroll(false); } catch (e) {}
            if (dialog && dialog.parentNode) {
                dialog.parentNode.removeChild(dialog);
            }
            try { restoreAppViewport(); } catch (e) {}
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

async function submitData(dateVal, rollNumbersRaw, yearVal, sectionVal, subjectVal, slotVal, btnElem, textElem, spinnerElem, opts) {
    opts = opts || {};
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
    const editOrig = editingOriginalEntry;

    // Prefer same-subject row (edit/update own paper) over a peer on the same slot
    let existingEntry = history.find(item => {
        if ((item.stream || 'BCA') !== cleanStream) return false;
        if (item.date !== cleanDate) return false;
        if (item.year !== yearVal) return false;
        if (parseInt(item.slot, 10) !== cleanSlot) return false;
        const sec1 = item.section || 'A';
        const sec2 = cleanSection || 'A';
        if (!isSectionOverlap(sec1, sec2)) return false;
        return subjectsAreSame(item.subject, cleanSubject);
    });

    if (!existingEntry) {
        existingEntry = history.find(item => {
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
    }

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

    // Quiet update when editing own subject from History
    const editingOwnSubject = !!(editOrig && (
        (existingEntry && subjectsAreSame(existingEntry.subject, cleanSubject)) ||
        (sheetConflict.exists && subjectsAreSame(sheetConflict.subject, cleanSubject)) ||
        (!existingEntry && !sheetConflict.exists)
    ) && subjectsAreSame(editOrig.subject, cleanSubject));

    if (hasConflict && !editingOwnSubject) {
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
    } else if (editingOwnSubject || !!editOrig) {
        conflictChoice = 'replace';
    }

    // Now disable button & show spinner during actual HTTP POST transmission
    if (btnElem) btnElem.disabled = true;
    if (textElem) textElem.style.opacity = '0.5';
    if (spinnerElem) spinnerElem.style.display = 'block';

    const isUpdate = hasConflict || !!editOrig || editingOwnSubject;
    const prevRollsArr = (sheetConflict.exists && !sheetConflict.offline && !sheetConflict.bulkPastPeer)
        ? normalizeRollNumbers(sheetConflict.rollNumbers)
        : (existingEntry ? normalizeRollNumbers(existingEntry.rollNumbers) : (editOrig ? normalizeRollNumbers(editOrig.rollNumbers) : []));
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
            bulkPast: !!(editOrig && isBulkPastEntry(editOrig)),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        editingOriginalEntry = null;
        if (!opts.skipReset) {
            closeConfirmationModal();
            resetAllInputs();
        }
        if (!opts.silent) {
            showSuccessToast(payload);
        }

        if (!opts.skipRefresh) {
            setTimeout(() => {
                fetchTodayServerHistory();
            }, 800);
        }
        return { status: 'ok' };

    } catch (error) {
        console.warn('Error submitting attendance (Saved Offline):', error);
        saveToLocalHistory({
            ...payload,
            offline: true,
            bulkPast: !!(editOrig && isBulkPastEntry(editOrig)),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        editingOriginalEntry = null;
        if (!opts.skipReset) {
            closeConfirmationModal();
            resetAllInputs();
        }
        
        const rollCount = payload.rollNumbers === 'NIL' ? 0 : (normalizeRollNumbers(payload.rollNumbers).length);
        if (!opts.silent) {
            showCustomToast(
                'Attendance Recorded (Offline)',
                `${rollCount} absentee(s) saved on phone (Offline Pending). Will auto-sync when online.`
            );
        }
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
        try { restoreAppViewport(); } catch (e) {}
    }, 2800);
}

function resetAllInputs() {
    editingOriginalEntry = null;
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
    const s1 = String(sub1).toLowerCase().replace(/\s+/g, ' ').trim();
    const s2 = String(sub2).toLowerCase().replace(/\s+/g, ' ').trim();
    if (s1 === 'all' || s2 === 'all') return true;
    // Exact paper only — "DBMS" must not count "DBMS Lab", "FOC Lab" must not count "FOC".
    return s1 === s2;
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

/** True when timestamp is a status placeholder, not a real clock time. */
function isPlaceholderHistoryTime(ts) {
    const s = String(ts || '').trim();
    if (!s) return true;
    const u = s.toLowerCase();
    return u === 'from sheet' ||
        u === 'bulk past entry' ||
        u.indexOf('pending') !== -1 ||
        u.indexOf('synced from phone') !== -1;
}

/** Prefer local submit clock time; else sheet Timestamp; never keep "From Sheet". */
function resolveHistoryTimestamp(serverTs, prevItem) {
    if (prevItem && prevItem.timestamp && !isPlaceholderHistoryTime(prevItem.timestamp)) {
        return String(prevItem.timestamp);
    }
    const raw = serverTs != null ? String(serverTs).trim() : '';
    if (raw && !isPlaceholderHistoryTime(raw)) return raw;
    try {
        if (raw && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
            const d = new Date(raw);
            if (!isNaN(d.getTime())) {
                return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
        }
    } catch (e) {}
    return '';
}

function mapServerHistoryEntry(e, stream, fallbackDate) {
    return {
        stream: stream || 'BCA',
        date: normalizeHistoryDate(e.date) || e.date || fallbackDate || getTodayISOString(),
        year: e.year || 'First Year',
        section: e.section || 'A',
        subject: e.subject || 'Subject',
        slot: parseInt(e.slot, 10) || 1,
        rollNumbers: e.rollNumbers || 'NIL',
        offline: false,
        timestamp: resolveHistoryTimestamp(e.timestamp || e.time || e.submittedAt || '', null)
    };
}

function mergeServerHistoryEntry(sEntry, prev) {
    if (prev && typeof isBulkPastEntry === 'function' && isBulkPastEntry(prev)) {
        sEntry.bulkPast = true;
        if (String(prev.timestamp || '') === 'Bulk Past Entry') {
            sEntry.timestamp = prev.timestamp;
            return sEntry;
        }
    }
    sEntry.timestamp = resolveHistoryTimestamp(sEntry.timestamp, prev);
    return sEntry;
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
                const sEntry = mapServerHistoryEntry(e, stream, dateVal);
                const k = historyMatchKey(sEntry);
                const existing = byKey.get(k);
                // Only overwrite if existing entry is absent or synced
                if (!existing || existing.offline === false) {
                    byKey.set(k, mergeServerHistoryEntry(sEntry, existing));
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

function historyYearSortRank(yearVal) {
    const p = (typeof hodYearPrefix === 'function') ? hodYearPrefix(yearVal) : String(yearVal || '');
    if (p === 'I' || p === '1') return 1;
    if (p === 'II' || p === '2') return 2;
    if (p === 'III' || p === '3') return 3;
    return 9;
}

function historyGroupKey(item) {
    return historyYearSortRank(item.year) + '|' +
        ((typeof hodYearPrefix === 'function') ? hodYearPrefix(item.year) : String(item.year || '')) + '|' +
        normalizeSectionCode(item.section || '');
}

function historyCardSectionLabel(section) {
    const sec = section || 'A';
    const secNorm = normalizeSectionCode(sec);
    if (secNorm === 'ONLY' || String(sec).trim().toUpperCase() === 'ONLY') return 'Main Class';
    if (secNorm === 'ALL') return 'Combined';
    return 'Sec ' + sec;
}

function historyGroupLabel(item) {
    const yr = item.year || 'Year';
    const sec = item.section || 'A';
    const secNorm = normalizeSectionCode(sec);
    if (secNorm === 'ONLY' || String(sec).trim().toUpperCase() === 'ONLY') {
        return yr + ' — Main Class';
    }
    if (secNorm === 'ALL') {
        return yr + ' — Combined';
    }
    return yr + ' — Sec ' + sec;
}

function sortHistoryEntriesGrouped(matched) {
    return matched.sort((a, b) => {
        const yA = historyYearSortRank(a.year);
        const yB = historyYearSortRank(b.year);
        if (yA !== yB) return yA - yB;
        const sA = normalizeSectionCode(a.section || '');
        const sB = normalizeSectionCode(b.section || '');
        if (sA !== sB) return sA.localeCompare(sB);
        const dA = normalizeHistoryDate(a.date) || '';
        const dB = normalizeHistoryDate(b.date) || '';
        if (dA !== dB) return dB.localeCompare(dA);
        return (parseInt(b.slot, 10) || 1) - (parseInt(a.slot, 10) || 1);
    });
}

/** On Today: keep Pending Sync rows first, then year/section groups. */
function finalizeHistoryDrawerOrder(matched) {
    const list = Array.isArray(matched) ? matched.slice() : [];
    if (currentHistoryTabMode !== 'TODAY') {
        return sortHistoryEntriesGrouped(list);
    }
    const pending = list.filter(item => item && item.offline === true);
    const rest = list.filter(item => !(item && item.offline === true));
    return sortHistoryEntriesGrouped(pending).concat(sortHistoryEntriesGrouped(rest));
}

function historySectionsEquivalent(a, b) {
    const na = normalizeSectionCode(a || '');
    const nb = normalizeSectionCode(b || '');
    if (na === nb) return true;
    if ((na === 'C' && nb === 'C_AIML') || (na === 'C_AIML' && nb === 'C')) return true;
    return false;
}

/** Section options for history drawer only (does not touch mark-absentees selects). */
function populateHistorySectionFilter() {
    const sectionFilter = document.getElementById('allHistorySectionFilter');
    if (!sectionFilter) return;

    const dept = currentDept || 'BCA';
    const cfg = DEPT_CONFIG[dept] || DEPT_CONFIG.BCA;
    const prev = sectionFilter.value || 'ALL';
    let options = [{ val: 'ALL', label: 'All Sections' }];

    if (cfg && Array.isArray(cfg.sections) && cfg.sections.length) {
        cfg.sections.forEach(sec => {
            const label = (sec === 'ONLY') ? 'Class (No Section)' : ('Section ' + sec);
            options.push({ val: sec, label: label });
        });
    } else {
        options = options.concat([
            { val: 'A', label: 'Section A' },
            { val: 'B', label: 'Section B' }
        ]);
    }
    options.push({ val: '__COMBINED__', label: 'Combined only' });

    sectionFilter.innerHTML = '';
    options.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.val;
        opt.textContent = o.label;
        sectionFilter.appendChild(opt);
    });

    const stillValid = Array.from(sectionFilter.options).some(o => o.value === prev);
    sectionFilter.value = stillValid ? prev : 'ALL';
}

function historySectionFilterMatches(itemSection, filterVal) {
    if (!filterVal || filterVal === 'ALL') return true;
    const itemNorm = normalizeSectionCode(itemSection || '');
    if (filterVal === '__COMBINED__') return itemNorm === 'ALL';
    return historySectionsEquivalent(itemSection, filterVal);
}

function historySubjectFilterMatches(itemSubject, filterVal) {
    if (!filterVal || filterVal === 'ALL') return true;
    if (typeof subjectsAreSame === 'function') return subjectsAreSame(itemSubject, filterVal);
    return String(itemSubject || '').trim().toLowerCase() === String(filterVal || '').trim().toLowerCase();
}

/** Subject options for history drawer only — from current year/section/date slice. */
function populateHistorySubjectFilter() {
    const subjectFilter = document.getElementById('allHistorySubjectFilter');
    if (!subjectFilter) return;

    const yearFilter = document.getElementById('allHistoryYearFilter');
    const sectionFilter = document.getElementById('allHistorySectionFilter');
    const dateFilter = document.getElementById('allHistoryDateFilter');
    const selYear = yearFilter ? yearFilter.value : 'ALL';
    const selSection = sectionFilter ? sectionFilter.value : 'ALL';
    const selDate = (currentHistoryTabMode === 'ALL' && dateFilter && dateFilter.value)
        ? normalizeHistoryDate(dateFilter.value)
        : '';
    const prev = subjectFilter.value || 'ALL';

    let base = [];
    if (currentHistoryTabMode === 'ALL') {
        base = readAllHistory().filter(item => isStreamMatchEvening(item.stream, currentDept));
    } else {
        base = getTodayEntries();
    }

    const subjects = [];
    const seen = new Set();
    base.forEach(item => {
        if (selYear && selYear !== 'ALL' && isYearMatching(item.year, selYear) === false) return;
        if (!historySectionFilterMatches(item.section, selSection)) return;
        if (selDate && selDate !== '' && normalizeHistoryDate(item.date) !== selDate) return;
        const subj = String(item.subject || '').trim();
        if (!subj) return;
        const low = subj.toLowerCase();
        if (seen.has(low)) return;
        seen.add(low);
        subjects.push(subj);
    });
    subjects.sort((a, b) => a.localeCompare(b));

    subjectFilter.innerHTML = '';
    const allOpt = document.createElement('option');
    allOpt.value = 'ALL';
    allOpt.textContent = 'All Subjects';
    subjectFilter.appendChild(allOpt);
    subjects.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        subjectFilter.appendChild(opt);
    });

    let keep = 'ALL';
    if (prev && prev !== 'ALL') {
        const match = Array.from(subjectFilter.options).find(o =>
            o.value === prev || historySubjectFilterMatches(o.value, prev)
        );
        if (match) keep = match.value;
    }
    subjectFilter.value = keep;
}

function getActiveDrawerEntries() {
    const allItems = readAllHistory();
    const yearFilter = document.getElementById('allHistoryYearFilter');
    const sectionFilter = document.getElementById('allHistorySectionFilter');
    const subjectFilter = document.getElementById('allHistorySubjectFilter');
    const dateFilter = document.getElementById('allHistoryDateFilter');

    const selYear = yearFilter ? yearFilter.value : 'ALL';
    const selSection = sectionFilter ? sectionFilter.value : 'ALL';
    const selSubject = subjectFilter ? subjectFilter.value : 'ALL';
    const selDate = (currentHistoryTabMode === 'ALL' && dateFilter && dateFilter.value)
        ? normalizeHistoryDate(dateFilter.value)
        : '';

    let base = [];
    if (currentHistoryTabMode === 'ALL') {
        base = allItems.filter(item => isStreamMatchEvening(item.stream, currentDept));
    } else {
        base = getTodayEntries();
    }

    const matched = base.filter(item => {
        if (selYear && selYear !== 'ALL' && isYearMatching(item.year, selYear) === false) return false;
        if (!historySectionFilterMatches(item.section, selSection)) return false;
        if (!historySubjectFilterMatches(item.subject, selSubject)) return false;
        if (selDate && selDate !== '' && normalizeHistoryDate(item.date) !== selDate) return false;
        return true;
    });

    return finalizeHistoryDrawerOrder(matched);
}

function updateHistoryTabStyles() {
    const tabToday = document.getElementById('historyTabToday');
    const tabAll = document.getElementById('historyTabAll');
    const titleEl = document.getElementById('historyDrawerTitle');
    const subEl = document.getElementById('todayDrawerSubtitle');
    const filterRow = document.getElementById('allHistoryFilterRow');
    const dateFilter = document.getElementById('allHistoryDateFilter');

    if (tabToday && tabAll) {
        if (currentHistoryTabMode === 'ALL') {
            tabToday.style.background = 'transparent';
            tabToday.style.color = 'var(--text-muted, #94a3b8)';
            tabAll.style.background = 'var(--primary-color, #6366f1)';
            tabAll.style.color = '#fff';
            if (titleEl) titleEl.textContent = 'All History';
            if (subEl) subEl.textContent = 'Grouped by year & section — edit or delete any entry';
            if (filterRow) filterRow.style.display = 'flex';
            if (dateFilter) dateFilter.style.display = '';
        } else {
            tabToday.style.background = 'var(--primary-color, #6366f1)';
            tabToday.style.color = '#fff';
            tabAll.style.background = 'transparent';
            tabAll.style.color = 'var(--text-muted, #94a3b8)';
            if (titleEl) titleEl.textContent = 'Today’s entries';
            if (subEl) subEl.textContent = 'Grouped by year & section — correct any class marked today';
            if (filterRow) filterRow.style.display = 'flex';
            if (dateFilter) dateFilter.style.display = 'none';
        }
    }
}

function initHistoryDrawerTabs() {
    const tabToday = document.getElementById('historyTabToday');
    const tabAll = document.getElementById('historyTabAll');
    const clearFilterBtn = document.getElementById('clearAllHistoryFilterBtn');
    const yearFilter = document.getElementById('allHistoryYearFilter');
    const sectionFilter = document.getElementById('allHistorySectionFilter');
    const subjectFilter = document.getElementById('allHistorySubjectFilter');
    const dateFilter = document.getElementById('allHistoryDateFilter');

    try { populateHistorySectionFilter(); } catch (e) {}
    try { populateHistorySubjectFilter(); } catch (e) {}

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
        yearFilter.onchange = () => {
            try { populateHistorySectionFilter(); } catch (e) {}
            try { populateHistorySubjectFilter(); } catch (e) {}
            renderHistoryList();
        };
    }

    if (sectionFilter) {
        sectionFilter.onchange = () => {
            try { populateHistorySubjectFilter(); } catch (e) {}
            renderHistoryList();
        };
    }

    if (subjectFilter) {
        subjectFilter.onchange = () => renderHistoryList();
    }

    if (dateFilter) {
        dateFilter.onchange = () => {
            try { populateHistorySubjectFilter(); } catch (e) {}
            renderHistoryList();
        };
    }

    if (clearFilterBtn) {
        clearFilterBtn.onclick = (e) => {
            if (e) e.preventDefault();
            if (yearFilter) yearFilter.value = 'ALL';
            if (sectionFilter) sectionFilter.value = 'ALL';
            if (subjectFilter) subjectFilter.value = 'ALL';
            if (dateFilter) dateFilter.value = '';
            try { populateHistorySectionFilter(); } catch (e2) {}
            try { populateHistorySubjectFilter(); } catch (e3) {}
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
            const serverEntries = data.entries.map(e => mapServerHistoryEntry(e, stream, null));

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
                    byKey.set(k, mergeServerHistoryEntry(Object.assign({}, sEntry), existing));
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
    try { populateHistorySubjectFilter(); } catch (e) {}
    const displayEntries = getActiveDrawerEntries();
    updateTodayBadge();
    updateSyncButtonState();
    updateHistoryTabStyles();

    const historyListEl = document.getElementById('historyList');
    if (!historyListEl) return;

    if (displayEntries.length === 0) {
        const emptyMsg = currentHistoryTabMode === 'ALL'
            ? 'No attendance history for this filter.'
            : 'No entries today for this filter — submit above.';
        historyListEl.innerHTML = '<p class="transcript-placeholder" style="text-align: center; margin-top: 20px;">' + emptyMsg + '</p>';
        return;
    }

    let html = '';
    let lastGroup = null;
    displayEntries.forEach((item, index) => {
        const gKey = historyGroupKey(item);
        if (gKey !== lastGroup) {
            lastGroup = gKey;
            const count = displayEntries.filter(x => historyGroupKey(x) === gKey).length;
            html += '<div class="history-group-header" style="margin: 12px 0 6px; padding: 6px 10px; border-radius: 8px; background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.25); font-size: 0.8rem; font-weight: 700; color: var(--text-primary, #e2e8f0); display: flex; justify-content: space-between; align-items: center;">' +
                '<span>' + escapeHTML(historyGroupLabel(item)) + '</span>' +
                '<span style="font-weight: 600; opacity: 0.75; font-size: 0.72rem;">' + count + ' entr' + (count === 1 ? 'y' : 'ies') + '</span>' +
            '</div>';
        }

        const slotNum = parseInt(item.slot, 10) || 1;
        const slotLabel = SLOT_TIME_LABELS[slotNum] || ('Slot ' + slotNum);
        const rolls = item.rollNumbers === 'NIL'
            ? '<span class="badge badge-nil">NIL (All Present)</span>'
            : (Array.isArray(item.rollNumbers) ? escapeHTML(item.rollNumbers.join(', ')) : escapeHTML(String(item.rollNumbers)));

        const dateLabel = item.date
            ? ' · ' + escapeHTML(item.date)
            : '';

        const timeShown = (!isPlaceholderHistoryTime(item.timestamp) && item.timestamp)
            ? String(item.timestamp)
            : '';

        const statusBadge = item.offline 
            ? '<span class="badge badge-warning" style="background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.3);">Pending Sync</span>'
            : '<span class="badge badge-success">Synced to Sheet</span>';

        html += (
        '<div class="history-card">' +
            '<div class="history-top">' +
                '<span class="history-title">' + escapeHTML(item.year) + ' ' + escapeHTML(historyCardSectionLabel(item.section)) + dateLabel + '</span>' +
                '<span class="history-time">' + escapeHTML(timeShown) + '</span>' +
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
    });
    historyListEl.innerHTML = html;

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

    editingOriginalEntry = {
        date: item.date,
        year: item.year,
        section: item.section,
        subject: item.subject,
        slot: item.slot,
        stream: item.stream || currentDept || 'BCA',
        rollNumbers: item.rollNumbers,
        bulkPast: isBulkPastEntry(item),
        timestamp: item.timestamp || ''
    };

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
    setHistoryDrawerOpen(false);
    try { restoreAppViewport(); } catch (e) {}
    confirmationModal.classList.add('active');
    try { lockAppScroll(true); } catch (e) {}
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
    try { populateHistorySectionFilter(); } catch (e) {}
    try { renderHistoryList(); } catch (e) {}
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
        if (!sel || sel.tagName === 'INPUT') return;
        const currentVal = sel.value;
        sel.innerHTML = '';
        addSelectPlaceholder(sel, 'Select Slot');
        for (let i = 1; i <= 6; i++) {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = `Slot ${i} (${times[i]}) [${headerPrefix}]`;
            sel.appendChild(opt);
        }
        const slotNum = parseInt(currentVal, 10);
        sel.value = (slotNum >= 1 && slotNum <= 6) ? String(slotNum) : '';
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
    try { restoreAppViewport(); } catch (e) {}
    try {
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                if (!isEditableFocused()) restoreAppViewport({ force: true });
            }, 120);
        });
        window.addEventListener('resize', () => {
            if (isEditableFocused()) return;
            if (!document.querySelector('.modal-overlay.active, .history-drawer.active')) {
                restoreAppViewport();
            }
        });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                if (isEditableFocused()) return;
                try {
                    window.scrollTo(0, 0);
                    document.documentElement.scrollTop = 0;
                    document.body.scrollTop = 0;
                } catch (e2) {}
            });
        }
    } catch (e) {}
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
    initInternalMarksModule();
    initBulkGenerator();
    initPaperPasteLoader();

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
        setHistoryDrawerOpen(true);
        fetchTodayServerHistory();
        syncOfflineEntries();
    };

    if (historyBtn) historyBtn.addEventListener('click', openHistory);
    document.querySelectorAll('.history-open-btn').forEach(btn => {
        btn.addEventListener('click', openHistory);
    });

    if (closeHistoryBtn) closeHistoryBtn.addEventListener('click', () => setHistoryDrawerOpen(false));

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
    const reloadSoon = () => setTimeout(() => window.location.reload(true), 500);
    const clearOwn = () => {
        if (!('caches' in window)) return Promise.resolve();
        return caches.keys().then(names => Promise.all(names.filter(isEveningCache).map(name => caches.delete(name))));
    };
    const unregisterOwn = () => {
        if (!navigator.serviceWorker || !navigator.serviceWorker.getRegistration) return Promise.resolve();
        // Only this page's SW scope — never unregister Day College / Allstreams
        return navigator.serviceWorker.getRegistration().then(reg => (reg ? reg.unregister() : undefined));
    };
    clearOwn().then(unregisterOwn).then(reloadSoon).catch(reloadSoon);
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
    const APP_VER = 'v27.27_paste_prefix';
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

/** Bulk only: another paper already occupies this date+section+slot (regular submit unchanged). */
function collectBulkSlotConflicts(generatedItems) {
    const history = readAllHistory();
    const conflicts = [];
    const seen = {};
    (generatedItems || []).forEach(item => {
        const stream = item.stream || currentDept || 'BCA';
        const date = normalizeHistoryDate(item.date);
        const slot = parseInt(item.slot, 10) || 1;
        const occupant = history.find(h => {
            if (!isStreamMatchEvening(h.stream, stream)) return false;
            if (normalizeHistoryDate(h.date) !== date) return false;
            if (!isYearMatching(h.year, item.year)) return false;
            if ((parseInt(h.slot, 10) || 1) !== slot) return false;
            if (subjectsAreSame(h.subject, item.subject)) return false;
            if (!isSectionOverlap(h.section || 'A', item.section || 'A')) return false;
            return true;
        });
        if (!occupant) return;
        const key = date + '|' + String(occupant.subject || '').toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        conflicts.push({
            date: date,
            slot: slot,
            existingSubject: occupant.subject,
            existingSection: occupant.section
        });
    });
    return conflicts;
}

function alertBulkSlotConflicts(conflicts, newSubject, slotVal) {
    const lines = conflicts.slice(0, 8).map(c => {
        const sec = c.existingSection;
        const secLabel = sec === 'ONLY' ? 'Main' : (sec === 'ALL' ? 'Combined' : ('Sec ' + (sec || '?')));
        return '• ' + c.date + ' — ' + (c.existingSubject || 'Subject') + ' (' + secLabel + ')';
    });
    const extra = conflicts.length > 8 ? '\n… and ' + (conflicts.length - 8) + ' more date(s)' : '';
    alert(
        'Cannot generate ' + newSubject + ' on Slot ' + slotVal + '.\n\n' +
        'That slot already has another subject on ' + conflicts.length + ' date(s):\n\n' +
        lines.join('\n') + extra + '\n\n' +
        'Choose a different slot. Generating the same subject on this slot is allowed.'
    );
}

async function executeBulkPastGenerator() {
    const yearEl = document.getElementById('bulkYearSelect');
    const secEl = document.getElementById('bulkSectionSelect');
    const subjEl = document.getElementById('bulkSubjectInput');
    const startEl = document.getElementById('bulkStartDate');
    const endEl = document.getElementById('bulkEndDate');

    const yearVal = yearEl ? yearEl.value : '';
    const secVal = secEl ? secEl.value : '';
    const subjVal = subjEl ? subjEl.value : '';
    const slotEl = document.getElementById('bulkSlotSelect');
    const slotVal = slotEl ? String(parseInt(slotEl.value, 10) || 1) : '1';
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
                    slot: slotVal,
                    rollNumbers: 'NIL',
                    bulkPast: true,
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

        const bulkConflicts = collectBulkSlotConflicts(generatedItems);
        if (bulkConflicts.length > 0) {
            alertBulkSlotConflicts(bulkConflicts, subjVal, slotVal);
            return;
        }

        for (const item of generatedItems) {
            saveToLocalHistory(item);
        }

        closeBulkGeneratorModal();

        const secLabel = secVal === 'ONLY' ? 'Main' : (secVal === 'ALL' ? 'Combined' : ('Sec ' + secVal));
        showCustomToast('⚡ Created ' + generatedItems.length + ' Past Classes!', 'Added for ' + yearVal + ' ' + secLabel + ' (' + subjVal + ') Slot ' + slotVal + '. You can now edit absentees.');
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
                    bulkPast: true,
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

function paperPasteMaxSlot() {
    if (typeof SLOT_TIME_LABELS === 'object' && SLOT_TIME_LABELS) {
        const nums = Object.keys(SLOT_TIME_LABELS).map(Number).filter(n => n > 0);
        if (nums.length) return Math.max.apply(null, nums);
    }
    return 6;
}

function paperPasteCloneSelect(fromId, toId) {
    const from = document.getElementById(fromId);
    const to = document.getElementById(toId);
    if (!from || !to) return;
    const prev = to.value;
    to.innerHTML = from.innerHTML;
    if (from.value) to.value = from.value;
    else if (prev && Array.from(to.options).some(o => o.value === prev)) to.value = prev;
}

function paperPasteDefaultCalendarYear() {
    try {
        if (typeof getTodayISOString === 'function') {
            const y = parseInt(String(getTodayISOString()).slice(0, 4), 10);
            if (y > 2000) return y;
        }
    } catch (e) {}
    return new Date().getFullYear();
}

function paperPasteMonthNum(name) {
    const m = String(name || '').toLowerCase().replace(/\./g, '').slice(0, 3);
    const map = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
    };
    return map[m] || 0;
}

function paperPasteIsoFromParts(day, month, year) {
    let d = parseInt(day, 10);
    let mo = parseInt(month, 10);
    let y = parseInt(year, 10);
    if (!y || isNaN(y)) y = paperPasteDefaultCalendarYear();
    if (y < 100) y += (y > 50 ? 1900 : 2000);
    if (!(d >= 1 && d <= 31 && mo >= 1 && mo <= 12)) return '';
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return '';
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

/** Flexible dates: 2026-08-01, 1/8/26, 1/8, 1 Aug, 1 Aug 2026, Aug 1 */
function paperPasteParseDate(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    let m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (m) {
        let d = m[1];
        let mo = m[2];
        let y = m[3];
        if (parseInt(mo, 10) > 12 && parseInt(d, 10) <= 12) {
            const tmp = d; d = mo; mo = tmp;
        }
        return paperPasteIsoFromParts(d, mo, y);
    }

    m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})$/);
    if (m) {
        let d = m[1];
        let mo = m[2];
        if (parseInt(mo, 10) > 12 && parseInt(d, 10) <= 12) {
            const tmp = d; d = mo; mo = tmp;
        }
        return paperPasteIsoFromParts(d, mo, paperPasteDefaultCalendarYear());
    }

    m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s*(\d{2,4})?$/i);
    if (m) {
        const mo = paperPasteMonthNum(m[2]);
        if (mo) return paperPasteIsoFromParts(m[1], mo, m[3] || paperPasteDefaultCalendarYear());
    }

    m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s*(\d{2,4})?$/i);
    if (m) {
        const mo = paperPasteMonthNum(m[1]);
        if (mo) return paperPasteIsoFromParts(m[2], mo, m[3] || paperPasteDefaultCalendarYear());
    }

    return '';
}

function paperPasteExtractDateToken(line) {
    const raw = String(line || '');
    const patterns = [
        /\b(\d{4}-\d{2}-\d{2})\b/,
        /\b(\d{1,2}\s+[A-Za-z]{3,9}\.?,?\s*\d{2,4})\b/i,
        /\b([A-Za-z]{3,9}\.?\s+\d{1,2},?\s*\d{2,4})\b/i,
        /\b(\d{1,2}\s+[A-Za-z]{3,9}\.?)\b/i,
        /\b([A-Za-z]{3,9}\.?\s+\d{1,2})\b/i,
        /\b(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\b/,
        /\b(\d{1,2}[\/.\-]\d{1,2})\b/
    ];
    for (let i = 0; i < patterns.length; i++) {
        const m = raw.match(patterns[i]);
        if (!m) continue;
        const iso = paperPasteParseDate(m[1]);
        if (iso) {
            return { iso: iso, index: m.index, length: m[0].length, raw: m[1] };
        }
    }
    return null;
}

function paperPasteLineHasDate(line) {
    return !!paperPasteExtractDateToken(line);
}

function paperPasteParseDataLine(line, defaultSlot) {
    const raw = String(line || '').trim();
    if (!raw) return null;

    if (raw.indexOf('\t') !== -1) {
        const parts = raw.split('\t').map(p => p.trim()).filter(Boolean);
        const date = paperPasteParseDate(parts[0]);
        if (!date) return null;
        let slot = '';
        let rollsParts = [];
        if (parts.length >= 3) {
            slot = paperPasteParseSlot(parts[1]) || '';
            rollsParts = parts.slice(slot ? 2 : 1);
            if (!slot) rollsParts = parts.slice(1);
        } else if (parts.length === 2) {
            const maybeSlot = paperPasteParseSlot(parts[1]);
            if (maybeSlot && /^slot\s*\d+$/i.test(parts[1].replace(/\s+/g, ' ').trim())) {
                slot = maybeSlot;
                rollsParts = [];
            } else if (maybeSlot && parts[1].replace(/\s/g, '').length <= 1) {
                slot = maybeSlot;
                rollsParts = [];
            } else {
                rollsParts = [parts[1]];
            }
        }
        return {
            date: date,
            slot: slot || defaultSlot || '',
            rolls: rollsParts.join(', ').trim() || 'NIL'
        };
    }

    const found = paperPasteExtractDateToken(raw);
    if (!found) return null;
    const date = found.iso;

    let rest = (raw.slice(0, found.index) + ' ' + raw.slice(found.index + found.length)).trim();
    rest = rest.replace(/^[\s,;|\-]+|[\s,;|\-]+$/g, '').trim();

    let slot = '';
    const namedSlot = rest.match(/\bslot\s*(\d+)\b/i);
    if (namedSlot) {
        slot = paperPasteParseSlot(namedSlot[0]) || namedSlot[1];
        rest = (rest.slice(0, namedSlot.index) + ' ' + rest.slice(namedSlot.index + namedSlot[0].length)).trim();
    }

    let rolls = rest.replace(/^[,;]+/, '').trim();
    if (!rolls || /^nil$/i.test(rolls) || /^none$/i.test(rolls) || /^all present$/i.test(rolls)) {
        rolls = 'NIL';
    }

    return {
        date: date,
        slot: slot || defaultSlot || '',
        rolls: rolls
    };
}

function paperPasteParseYear(raw) {
    const s = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!s) return '';
    if (/^(first|1st|i|fy|year 1|1 year|1)$/.test(s) || s.indexOf('first') !== -1) return 'First Year';
    if (/^(second|2nd|ii|sy|year 2|2 year|2)$/.test(s) || s.indexOf('second') !== -1) return 'Second Year';
    if (/^(third|3rd|iii|ty|year 3|3 year|3)$/.test(s) || s.indexOf('third') !== -1) return 'Third Year';
    return '';
}

function paperPasteParseSlot(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    const m = s.match(/slot\s*(\d+)/i) || s.match(/^(\d+)$/);
    if (!m) return '';
    const n = parseInt(m[1], 10);
    const max = paperPasteMaxSlot();
    if (n >= 1 && n <= max) return String(n);
    return '';
}

function paperPasteParseSection(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    const u = s.toUpperCase();
    const sel = document.getElementById('paperPasteSection') || document.getElementById('directSectionSelect');
    const opts = sel ? Array.from(sel.options).map(o => o.value).filter(Boolean) : [];
    const exact = opts.find(v => v.toUpperCase() === u);
    if (exact) return exact;
    if (u === 'COMBINED' || u === 'ALL SECTIONS' || u === 'ELECTIVE') return opts.indexOf('ALL') !== -1 ? 'ALL' : 'ALL';
    if (u === 'MAIN' || u === 'COMMON' || u === 'ONLY') return opts.indexOf('ONLY') !== -1 ? 'ONLY' : s;
    if (/^SEC(TION)?\s*/i.test(s)) {
        return paperPasteParseSection(s.replace(/^SEC(TION)?\s*/i, ''));
    }
    return s;
}

function paperPasteResolveSubject(raw, year, section) {
    const t = String(raw || '').trim();
    if (!t) return '';
    const stream = currentDept || 'BCA';
    const list = (typeof getSubjectsForActiveYear === 'function')
        ? (getSubjectsForActiveYear(stream, year, section) || [])
        : [];
    const low = t.toLowerCase();
    for (let i = 0; i < list.length; i++) {
        if (String(list[i]).toLowerCase() === low) return list[i];
    }
    for (let i = 0; i < list.length; i++) {
        if (typeof isSubjectMatching === 'function' && isSubjectMatching(list[i], t)) return list[i];
    }
    for (let i = 0; i < list.length; i++) {
        const s = String(list[i]).toLowerCase();
        if (s.indexOf(low) !== -1 || low.indexOf(s) !== -1) return list[i];
    }
    return t;
}

function paperPasteLooksLikeRolls(s) {
    const t = String(s || '').trim();
    if (!t) return true;
    if (/^nil$/i.test(t) || /^none$/i.test(t) || /^all present$/i.test(t)) return true;
    if (/year|section|subject|slot/i.test(t) && !/\d/.test(t)) return false;
    return /^[\dA-Za-z\s,;.\-\/]+$/.test(t) && (/\d/.test(t) || /^nil$/i.test(t));
}

function paperPasteSplitHeaderParts(line) {
    const raw = String(line || '').trim();
    if (!raw) return [];
    if (raw.indexOf('|') !== -1) return raw.split('|').map(p => p.trim()).filter(Boolean);
    if (raw.indexOf('\t') !== -1) return raw.split('\t').map(p => p.trim()).filter(Boolean);
    if (/\s+\/\s+/.test(raw)) return raw.split(/\s+\/\s+/).map(p => p.trim()).filter(Boolean);
    if (raw.indexOf(',') !== -1) {
        const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
        if (parts.length >= 3 && paperPasteParseYear(parts[0])) return parts;
    }
    return [];
}

function paperPasteNormalizePrefixValue(raw) {
    let s = String(raw || '').trim();
    if (!s) return '';
    s = s.replace(/^(?:prefix|pref|pfx)\s*[:=\-]?\s*/i, '').trim();
    return s;
}

function paperPasteLooksLikePrefix(s) {
    const t = String(s || '').trim();
    if (!t || t.length > 12) return false;
    if (/^(?:prefix|pref|pfx)\b/i.test(t)) return true;
    const bare = paperPasteNormalizePrefixValue(t);
    if (!bare || bare.length > 10) return false;
    return /^[A-Za-z]{0,4}\d{1,5}[A-Za-z]{0,2}$/.test(bare);
}

function paperPasteStripPrefixFromSubject(subject) {
    const s = String(subject || '').trim();
    const m = s.match(/^(.*?)\s+(?:prefix|pref|pfx)\s*[:=\-]?\s*(\S+)\s*$/i);
    if (m && m[1].trim()) {
        return { subject: m[1].trim(), prefix: paperPasteNormalizePrefixValue(m[2]) };
    }
    return { subject: s, prefix: '' };
}

function paperPasteExpandRolls(rolls, prefix) {
    const raw = String(rolls == null ? '' : rolls).trim() || 'NIL';
    if (/^nil$/i.test(raw) || /^none$/i.test(raw) || /^all present$/i.test(raw)) return 'NIL';
    const p = String(prefix || '').trim();
    if (!p || typeof expandShortRollNumbers !== 'function') return raw;
    const expanded = expandShortRollNumbers(raw, p);
    return expanded || raw;
}

function paperPasteReadDefaultPrefix() {
    const el = document.getElementById('paperPastePrefix');
    return el ? String(el.value || '').trim() : '';
}

function paperPastePrefillPrefixField() {
    const el = document.getElementById('paperPastePrefix');
    if (!el) return;
    if (String(el.value || '').trim()) return;
    let fromUi = '';
    try {
        if (typeof getActiveRollPrefixFromUI === 'function') fromUi = getActiveRollPrefixFromUI(false) || '';
    } catch (e) {}
    if (fromUi) {
        el.value = fromUi;
        return;
    }
    try {
        const yEl = document.getElementById('directYearSelect');
        const sEl = document.getElementById('directSectionSelect');
        const year = yEl && yEl.value;
        const sec = sEl && sEl.value;
        if (year && sec && typeof getStoredRollPrefix === 'function') {
            const stored = getStoredRollPrefix(currentDept || 'BCA', year, sec);
            if (stored) el.value = stored;
        }
    } catch (e2) {}
}

/** Header line: Year · Section · Subject [· Prefix] (no class date). */
function paperPasteParseBlockHeader(line) {
    const raw = String(line || '').trim();
    if (!raw) return null;
    if (paperPasteParseDate(raw) && /^\d/.test(raw)) return null;

    let parts = paperPasteSplitHeaderParts(raw);
    if (parts.length >= 3) {
        const year = paperPasteParseYear(parts[0]) || parts[0];
        let sectionRaw = parts[1].replace(/^SEC(TION)?\s*/i, '').trim();
        const section = paperPasteParseSection(sectionRaw) || sectionRaw;
        let prefix = '';
        let subjectParts = parts.slice(2);
        if (subjectParts.length >= 2 && paperPasteLooksLikePrefix(subjectParts[subjectParts.length - 1])) {
            prefix = paperPasteNormalizePrefixValue(subjectParts[subjectParts.length - 1]);
            subjectParts = subjectParts.slice(0, -1);
        }
        let subject = subjectParts.join(' ').trim();
        const stripped = paperPasteStripPrefixFromSubject(subject);
        if (stripped.prefix) {
            subject = stripped.subject;
            if (!prefix) prefix = stripped.prefix;
        }
        if (year && section && subject) {
            return {
                year: paperPasteParseYear(year) || year,
                section: section,
                subject: subject,
                prefix: prefix
            };
        }
    }

    const year = paperPasteParseYear(raw);
    if (!year) return null;
    let rest = raw.replace(/first\s*year|second\s*year|third\s*year|1st\s*year|2nd\s*year|3rd\s*year|\bI\b|\bII\b|\bIII\b/ig, ' ').trim();
    rest = rest.replace(/^[\s\-–,|\/]+/, '').trim();
    const secMatch = rest.match(/^(?:sec(?:tion)?\s*)?([A-Za-z0-9()+\-_\/ ]{1,24}?)(?:\s{2,}|\s+)(.+)$/i);
    if (!secMatch) return null;
    const section = paperPasteParseSection(secMatch[1].trim()) || secMatch[1].trim();
    let subject = String(secMatch[2] || '').trim();
    let prefix = '';
    const stripped = paperPasteStripPrefixFromSubject(subject);
    if (stripped.prefix) {
        subject = stripped.subject;
        prefix = stripped.prefix;
    }
    if (!section || !subject || paperPasteParseDate(subject)) return null;
    return { year: year, section: section, subject: subject, prefix: prefix };
}

function paperPasteReadDefaultSlot() {
    const slotEl = document.getElementById('paperPasteSlot');
    return (slotEl && slotEl.value) || (typeof directSlotSelect !== 'undefined' && directSlotSelect && directSlotSelect.value) || '1';
}

/**
 * Header-block paste (flexible dates + default slot + roll prefix):
 *   First Year | A | DBMS | Prefix 25A
 *   1/8  09, 17
 *   5 Aug  NIL
 */
function parsePaperPasteText(text) {
    const defaultSlot = paperPasteReadDefaultSlot();
    const defaultPrefix = paperPasteReadDefaultPrefix();
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const errors = [];
    const rows = [];
    if (!lines.length) return { rows, errors: ['Paste at least one header and one date line.'] };

    let current = null;
    let blockNo = 0;

    lines.forEach((line, idx) => {
        const lineNo = idx + 1;
        const asHeader = !paperPasteLineHasDate(line) ? paperPasteParseBlockHeader(line) : null;
        if (asHeader) {
            blockNo++;
            let prefix = String(asHeader.prefix || '').trim();
            if (!prefix) prefix = defaultPrefix;
            if (!prefix && typeof getStoredRollPrefix === 'function') {
                try {
                    prefix = getStoredRollPrefix(currentDept || 'BCA', asHeader.year, asHeader.section) || '';
                } catch (e) { prefix = ''; }
            }
            current = {
                year: asHeader.year,
                section: asHeader.section,
                subject: paperPasteResolveSubject(asHeader.subject, asHeader.year, asHeader.section),
                prefix: prefix
            };
            return;
        }

        const data = paperPasteParseDataLine(line, defaultSlot);
        if (!data) {
            errors.push('Line ' + lineNo + ': expected a header (Year | Section | Subject) or a date line (Date Slot rolls).');
            return;
        }
        if (!current) {
            errors.push('Line ' + lineNo + ': add a Year | Section | Subject header before date lines.');
            return;
        }

        const rollsRaw = data.rolls || 'NIL';
        const rolls = paperPasteExpandRolls(rollsRaw, current.prefix);
        const row = {
            date: data.date,
            year: current.year,
            section: current.section,
            subject: current.subject,
            slot: data.slot || defaultSlot,
            rolls: rolls,
            rollsRaw: rollsRaw,
            prefix: current.prefix || '',
            block: blockNo
        };
        row.subject = paperPasteResolveSubject(row.subject, row.year, row.section);

        const missing = [];
        if (!row.date) missing.push('date');
        if (!row.year) missing.push('year');
        if (!row.section) missing.push('section');
        if (!row.subject) missing.push('subject');
        if (!row.slot) missing.push('slot');
        if (missing.length) errors.push('Line ' + lineNo + ' missing: ' + missing.join(', '));
        if (typeof isAttendanceDateAllowed === 'function' && row.date && !isAttendanceDateAllowed(row.date)) {
            errors.push('Line ' + lineNo + ': future dates are not allowed (' + row.date + ').');
        }
        rows.push(row);
    });

    if (!rows.length && !errors.length) {
        errors.push('No class lines found. Use a header, then date lines under it.');
    }
    return { rows, errors };
}

function renderPaperPastePreview(parsed) {
    const box = document.getElementById('paperPastePreview');
    if (!box) return;
    box.hidden = false;
    box.style.display = 'block';

    if (!parsed || !parsed.rows || !parsed.rows.length) {
        box.innerHTML =
            '<div class="paper-paste-preview-title">Parsed preview</div>' +
            '<div class="paper-paste-preview-empty">Nothing to load. Check header blocks (Year | Section | Subject) and date lines.</div>';
        try { box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
        return;
    }

    let html = '<div class="paper-paste-preview-title">Parsed preview (' + parsed.rows.length + ' class' + (parsed.rows.length === 1 ? '' : 'es') + ')</div>';
    if (parsed.errors && parsed.errors.length) {
        html += '<div class="paper-paste-preview-warn">' + parsed.errors.map(e => escapeHTML(e)).join('<br>') + '</div>';
    }
    html += '<div class="paper-paste-preview-scroll"><table class="paper-paste-preview-table"><thead><tr>' +
        '<th>Date</th><th>Year</th><th>Sec</th><th>Subject</th><th>Slot</th><th>Prefix</th><th>Absentees</th>' +
        '</tr></thead><tbody>';
    parsed.rows.forEach(r => {
        const rollsCell = (r.rollsRaw && r.rolls && r.rollsRaw !== r.rolls)
            ? (escapeHTML(r.rolls) + '<div style="opacity:0.7;font-size:0.68rem;margin-top:2px;">from ' + escapeHTML(r.rollsRaw) + '</div>')
            : escapeHTML(r.rolls || 'NIL');
        html += '<tr><td>' + escapeHTML(r.date) + '</td><td>' + escapeHTML(r.year) + '</td><td>' +
            escapeHTML(r.section) + '</td><td>' + escapeHTML(r.subject) + '</td><td>' +
            escapeHTML(r.slot) + '</td><td>' + escapeHTML(r.prefix || '—') + '</td><td>' + rollsCell + '</td></tr>';
    });
    html += '</tbody></table></div>';
    box.innerHTML = html;
    try { box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e2) {}
}

function openPaperPasteModal() {
    const modal = document.getElementById('paperPasteModal');
    if (!modal) return;
    paperPasteCloneSelect('directSlotSelect', 'paperPasteSlot');
    paperPastePrefillPrefixField();
    const box = document.getElementById('paperPastePreview');
    if (box) {
        box.hidden = true;
        box.style.display = 'none';
        box.innerHTML = '';
    }
    modal.classList.add('active');
}

function closePaperPasteModal() {
    const modal = document.getElementById('paperPasteModal');
    if (modal) modal.classList.remove('active');
}

async function loadPaperPasteToSheet() {
    const textEl = document.getElementById('paperPasteText');
    const parsed = parsePaperPasteText(textEl ? textEl.value : '');
    renderPaperPastePreview(parsed);
    const ready = parsed.rows.filter(r => r.date && r.year && r.section && r.subject && r.slot);
    if (!ready.length) {
        alert('Fix the header blocks and date lines (Date / Year / Section / Subject / Slot), then try again.');
        return;
    }
    if (parsed.errors.length) {
        const go = confirm(parsed.errors.join('\n') + '\n\nLoad the complete rows anyway?');
        if (!go) return;
    }

    const loadBtn = document.getElementById('paperPasteLoadBtn');
    const loadText = document.getElementById('paperPasteLoadBtnText');
    const spinner = document.getElementById('paperPasteLoadSpinner');
    if (loadBtn) loadBtn.disabled = true;
    if (loadText) loadText.textContent = 'Loading…';
    if (spinner) spinner.style.display = 'block';

    let ok = 0, offline = 0, cancelled = 0, failed = 0;
    const submitOpts = { skipReset: true, silent: true, skipRefresh: true };
    for (let i = 0; i < ready.length; i++) {
        const row = ready[i];
        try {
            if (row.prefix && typeof setStoredRollPrefix === 'function') {
                try { setStoredRollPrefix(currentDept || 'BCA', row.year, row.section, row.prefix); } catch (ePref) {}
            }
            const result = await submitData(row.date, row.rolls, row.year, row.section, row.subject, row.slot, null, null, null, submitOpts);
            if (result && result.status === 'ok') ok++;
            else if (result && result.status === 'offline') offline++;
            else cancelled++;
        } catch (e) {
            failed++;
        }
    }

    if (loadBtn) loadBtn.disabled = false;
    if (loadText) loadText.textContent = 'Load to Sheet';
    if (spinner) spinner.style.display = 'none';

    if (typeof fetchTodayServerHistory === 'function') {
        setTimeout(fetchTodayServerHistory, 800);
    }
    if (typeof renderHistoryList === 'function') {
        try { renderHistoryList(); } catch (e) {}
    }

    const bits = [];
    if (ok) bits.push(ok + ' saved');
    if (offline) bits.push(offline + ' offline');
    if (cancelled) bits.push(cancelled + ' skipped');
    if (failed) bits.push(failed + ' failed');
    if (typeof showCustomToast === 'function') {
        showCustomToast('Paste load finished', bits.join(' · ') || 'No rows loaded');
    } else {
        alert('Paste load finished: ' + (bits.join(', ') || 'No rows loaded'));
    }
    if (ok + offline > 0) closePaperPasteModal();
}

function initPaperPasteLoader() {
    const openBtn = document.getElementById('openPaperPasteModalBtn');
    const closeBtn = document.getElementById('closePaperPasteModalBtn');
    const modal = document.getElementById('paperPasteModal');
    const previewBtn = document.getElementById('paperPastePreviewBtn');
    const loadBtn = document.getElementById('paperPasteLoadBtn');
    if (openBtn) openBtn.addEventListener('click', openPaperPasteModal);
    if (closeBtn) closeBtn.addEventListener('click', closePaperPasteModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closePaperPasteModal();
        });
    }
    if (previewBtn) {
        previewBtn.addEventListener('click', () => {
            const textEl = document.getElementById('paperPasteText');
            renderPaperPastePreview(parsePaperPasteText(textEl ? textEl.value : ''));
        });
    }
    if (loadBtn) loadBtn.addEventListener('click', loadPaperPasteToSheet);
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
                    timestamp: resolveHistoryTimestamp(srv.timestamp || srv.time || '', null)
                };
                const k = historyMatchKey(srvObj);
                const existing = byKey.get(k);
                if (k && (!existing || existing.offline === false)) {
                    byKey.set(k, mergeServerHistoryEntry(srvObj, existing));
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
    const marksContainer = document.getElementById('hodInternalMarksContainer');
    const subTabMarks = document.getElementById('subTabInternalMarks');

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
            if (subTabMarks) subTabMarks.classList.remove('active');
            dailyContainer.style.display = 'block';
            shortageContainer.style.display = 'none';
            if (marksContainer) marksContainer.style.display = 'none';
        });

        subTabShortage.addEventListener('click', () => {
            subTabShortage.classList.add('active');
            subTabDaily.classList.remove('active');
            if (subTabMarks) subTabMarks.classList.remove('active');
            shortageContainer.style.display = 'block';
            dailyContainer.style.display = 'none';
            if (marksContainer) marksContainer.style.display = 'none';
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
            try {
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
                const monthHeldMap = {};
                const monthMissedMap = {};

                rollObjects.forEach(rObj => {
                    absenceCountMap[rObj.code] = 0;
                    subjectStatsMap[rObj.code] = {};
                    monthMissedMap[rObj.code] = {};
                });

                matchingSessions.forEach(item => {
                    const itemSubj = (item.subject || 'General').trim();
                    const itemDateStr = normalizeHistoryDate(item.date) || getTodayISOString();
                    const monthKey = itemDateStr.substring(0, 7);
                    monthHeldMap[monthKey] = (monthHeldMap[monthKey] || 0) + 1;
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
                                monthMissedMap[rObj.code][monthKey] = (monthMissedMap[rObj.code][monthKey] || 0) + 1;
                            }
                        });
                    });
                });

                const monthKeys = Object.keys(monthHeldMap).sort();
                const monthColumns = [];
                let runningHeld = 0;
                monthKeys.forEach(mk => {
                    runningHeld += monthHeldMap[mk] || 0;
                    monthColumns.push({
                        key: mk,
                        label: formatShortageMonthLabel(mk),
                        held: monthHeldMap[mk] || 0,
                        cumHeld: runningHeld
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

                    const monthAttendedCum = {};
                    let runningAtt = 0;
                    monthKeys.forEach(mk => {
                        const held = monthHeldMap[mk] || 0;
                        const missM = (monthMissedMap[rObj.code] || {})[mk] || 0;
                        runningAtt += Math.max(0, held - missM);
                        monthAttendedCum[mk] = runningAtt;
                    });

                    if (roundedPct < cutoff || cutoff === 100) {
                        shortageList.push({
                            roll: rObj.code,
                            total: totalConducted,
                            missed: missed,
                            attended: attended,
                            percent: roundedPct,
                            subjectBreakdown: subjBreakdown,
                            monthAttendedCum: monthAttendedCum
                        });
                    }
                });

                shortageList.sort((a, b) => a.percent - b.percent);
                renderShortageResults(container, dept, yrVal, secVal, subjFilter, sRollStr, eRollStr, totalConducted, cutoff, shortageList, periodLabel, monthColumns);
            } catch (err) {
                console.error('Error calculating shortage:', err);
                if (container) {
                    container.innerHTML = '<div style="color: #ef4444; padding: 12px; text-align: center; font-weight: 600;">An error occurred while calculating shortage. Please try again.</div>';
                    container.style.display = 'block';
                }
            } finally {
                if (spinner) spinner.style.display = 'none';
                if (calcBtnText) calcBtnText.textContent = '📊 Calculate Shortage Report';
                calcBtn.disabled = false;
            }
        });
    });
}

function renderShortageResults(container, dept, yearStr, sectionStr, subjectFilter, startRoll, endRoll, totalClasses, cutoff, shortageList, periodLabel, monthColumns) {
    if (!container) return;
    container.style.display = 'block';

    const pLabel = periodLabel || 'All Time (Cumulative)';
    const count = shortageList.length;
    const subjHeader = subjectFilter === 'ALL' ? 'All Subjects (Overall)' : subjectFilter;
    const deptLabel = (DEPT_CONFIG[dept] && DEPT_CONFIG[dept].code) || dept || 'BCA';
    const sheetMeta = {
        yearStr: yearStr,
        sectionStr: sectionStr,
        subjectFilter: subjectFilter,
        cutoff: cutoff,
        periodLabel: pLabel,
        stream: dept || currentDept || 'BCA',
        monthColumns: Array.isArray(monthColumns) ? monthColumns : []
    };

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
        <div class="shortage-export-row">
            <button type="button" class="btn-whatsapp-global" id="shortageShareWaBtn" style="margin-bottom: 0; width: 100%; font-weight: 700;">
                📱 Share Shortage List (${count} Students) to WhatsApp
            </button>
            <button type="button" class="btn-secondary shortage-export-btn" id="shortagePrintBtn" style="width: 100%; font-weight: 700; padding: 10px 14px;">
                🖨️ Print Official Form
            </button>
            <button type="button" class="btn-secondary shortage-export-btn" id="shortageExcelBtn" style="width: 100%; font-weight: 700; padding: 10px 14px; background: rgba(16, 185, 129, 0.14); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.35);">
                📊 Download Excel
            </button>
        </div>
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

    const printBtn = document.getElementById('shortagePrintBtn');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            printOfficialShortageSheet(sheetMeta, shortageList);
        });
    }
    const excelBtn = document.getElementById('shortageExcelBtn');
    if (excelBtn) {
        excelBtn.addEventListener('click', () => {
            downloadOfficialShortageExcel(sheetMeta, shortageList);
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

const MGMEC_OFFICIAL_COLLEGE_NAME = 'MAHATMA GANDHI MEMORIAL EVENING COLLEGE, UDUPI-2';

function formatShortageMonthLabel(ym) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const m = parseInt(String(ym || '').substring(5, 7), 10);
    return months[m - 1] || '';
}

function shortageStreamShortLabel(stream) {
    const s = String(stream || (typeof currentDept !== 'undefined' ? currentDept : '') || 'BCA').toUpperCase();
    if (s === 'BCOM' || s === 'BCM') return 'B.Com';
    if (s === 'BBA') return 'BBA';
    return 'BCA';
}

function shortageClassLabel(yearStr, sectionStr, stream) {
    const roman = { 'First Year': 'I', 'Second Year': 'II', 'Third Year': 'III' };
    const r = roman[yearStr] || yearStr || '';
    const streamLabel = shortageStreamShortLabel(stream);
    let sec = sectionStr || '';
    if (!sec || sec === 'ALL') sec = 'Combined';
    else if (sec === 'ONLY') sec = 'Main';
    return r + ' ' + streamLabel + ' ' + sec;
}

function shortageSheetSubjectLabel(subjectFilter) {
    if (!subjectFilter || subjectFilter === 'ALL') return 'ALL SUBJECTS';
    return subjectFilter;
}

function shortageAcademicYearParts() {
    const iso = typeof getTodayISOString === 'function' ? getTodayISOString() : '';
    const y = parseInt((iso || '').substring(0, 4), 10) || new Date().getFullYear();
    const m = parseInt((iso || '').substring(5, 7), 10) || (new Date().getMonth() + 1);
    const start = m >= 6 ? y : y - 1;
    return { startYY: String(start).slice(-2), endYY: String(start + 1).slice(-2) };
}

function padShortageMonthColumns(monthColumns) {
    const cols = Array.isArray(monthColumns) ? monthColumns.slice() : [];
    while (cols.length < 8) {
        cols.push({ key: '', label: '', held: '', cumHeld: '' });
    }
    return cols;
}

function sortShortageByRoll(list) {
    return (list || []).slice().sort((a, b) => {
        const na = parseInt(String(a.roll || '').replace(/\D/g, ''), 10);
        const nb = parseInt(String(b.roll || '').replace(/\D/g, ''), 10);
        if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
        return String(a.roll || '').localeCompare(String(b.roll || ''));
    });
}

function shortageRemarksText(item, cutoff) {
    if (!item) return '';
    const limit = (cutoff === 100) ? 75 : cutoff;
    if (item.percent < limit) return item.percent + '% Shortage';
    return '';
}

function buildOfficialAttendanceSheetTable(meta, shortageList) {
    const cols = padShortageMonthColumns(meta && meta.monthColumns);
    const students = sortShortageByRoll(shortageList);
    const ay = shortageAcademicYearParts();
    const classLabel = escapeHTML(shortageClassLabel(meta.yearStr, meta.sectionStr, meta.stream));
    const subj = escapeHTML(shortageSheetSubjectLabel(meta.subjectFilter));
    const cutoff = meta.cutoff;
    const colCount = cols.length;
    const footerSpan = colCount;

    let monthHeads = '';
    let heldCells = '';
    cols.forEach(col => {
        monthHeads += `<th style="border:1px solid #000;padding:4px 6px;font-size:12px;font-weight:700;width:56px;">${escapeHTML(col.label || '')}</th>`;
        const heldVal = col.key ? col.cumHeld : '';
        heldCells += `<td style="border:1px solid #000;padding:4px 6px;text-align:center;font-size:12px;">${heldVal === '' ? '' : heldVal}</td>`;
    });

    let studentRows = '';
    students.forEach(item => {
        let attCells = '';
        cols.forEach(col => {
            let val = '';
            if (col.key && item.monthAttendedCum && item.monthAttendedCum[col.key] != null) {
                val = item.monthAttendedCum[col.key];
            }
            attCells += `<td style="border:1px solid #000;padding:3px 6px;text-align:center;font-size:12px;">${val}</td>`;
        });
        const remarks = escapeHTML(shortageRemarksText(item, cutoff));
        studentRows += `<tr>
            <td style="border:1px solid #000;padding:3px 6px;font-size:12px;font-weight:700;">${escapeHTML(item.roll || '')}</td>
            ${attCells}
            <td style="border:1px solid #000;padding:3px 6px;font-size:11px;">${remarks}</td>
        </tr>`;
    });

    return `
    <table style="width:100%;border-collapse:collapse;border:1px solid #000;font-family:'Times New Roman',Times,serif;color:#000;background:#fff;">
        <tr>
            <td colspan="${colCount + 2}" style="border:1px solid #000;padding:8px 6px 2px;text-align:center;font-size:16px;font-weight:800;letter-spacing:0.3px;">
                ${escapeHTML(MGMEC_OFFICIAL_COLLEGE_NAME)}
            </td>
        </tr>
        <tr>
            <td colspan="${colCount + 2}" style="border:1px solid #000;padding:2px 6px 8px;text-align:center;font-size:14px;font-weight:700;">
                Attendance Records for the year 20${ay.startYY} - 20${ay.endYY}
            </td>
        </tr>
        <tr>
            <td colspan="${Math.ceil((colCount + 2) / 2)}" style="border:1px solid #000;padding:6px;font-size:13px;font-weight:700;">
                CLASS: ${classLabel}
            </td>
            <td colspan="${Math.floor((colCount + 2) / 2)}" style="border:1px solid #000;padding:6px;font-size:13px;font-weight:700;">
                SUBJECT: ${subj}
            </td>
        </tr>
        <tr>
            <td colspan="${colCount + 2}" style="border:1px solid #000;padding:4px 6px;font-size:11px;font-style:italic;">
                Note: Number of Lectures held &amp; Number of Lectures attended should be prepared in Cumulative Order
            </td>
        </tr>
        <tr>
            <th style="border:1px solid #000;padding:4px 6px;font-size:12px;text-align:left;">Month</th>
            ${monthHeads}
            <th rowspan="2" style="border:1px solid #000;padding:4px 6px;font-size:12px;width:90px;">Remarks</th>
        </tr>
        <tr>
            <th style="border:1px solid #000;padding:4px 6px;font-size:11px;text-align:left;">No. of Lects. held</th>
            ${heldCells}
        </tr>
        <tr>
            <th style="border:1px solid #000;padding:4px 6px;font-size:12px;">Roll Nos.</th>
            <th colspan="${colCount}" style="border:1px solid #000;padding:4px 6px;font-size:12px;">Number of Lectures attended</th>
            <th style="border:1px solid #000;"></th>
        </tr>
        ${studentRows}
        <tr>
            <td colspan="2" style="border:1px solid #000;padding:18px 6px 6px;font-size:12px;vertical-align:bottom;">Initial of the Faculty</td>
            <td colspan="${footerSpan}" style="border:1px solid #000;"></td>
        </tr>
        <tr>
            <td colspan="2" style="border:1px solid #000;padding:18px 6px 6px;font-size:12px;vertical-align:bottom;">Name of the HOD</td>
            <td colspan="${footerSpan}" style="border:1px solid #000;padding:18px 6px 6px;font-size:12px;text-align:right;vertical-align:bottom;">Signature of the HOD</td>
        </tr>
    </table>`;
}

function buildOfficialAttendanceSheetDocument(meta, shortageList) {
    const table = buildOfficialAttendanceSheetTable(meta, shortageList);
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>MGM Evening College Attendance Records</title>
<style>
    body { font-family: 'Times New Roman', Times, serif; color: #000; background: #fff; margin: 16px; }
    .no-print { margin-bottom: 12px; }
    .no-print button { padding: 8px 14px; font-weight: 700; cursor: pointer; }
    @media print {
        .no-print { display: none !important; }
        body { margin: 8mm; }
        @page { size: A4 portrait; margin: 10mm; }
    }
</style>
</head>
<body>
    <div class="no-print">
        <button type="button" onclick="window.print()">Print</button>
    </div>
    ${table}
</body>
</html>`;
}

function printOfficialShortageSheet(meta, shortageList) {
    const html = buildOfficialAttendanceSheetDocument(meta, shortageList);
    const w = window.open('', '_blank');
    if (!w) {
        alert('Please allow pop-ups to print the official attendance form.');
        return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(function () {
        try { w.print(); } catch (e) {}
    }, 400);
}

function downloadOfficialShortageExcel(meta, shortageList) {
    const table = buildOfficialAttendanceSheetTable(meta, shortageList);
    const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>' + table + '</body></html>';
    const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel' });
    const a = document.createElement('a');
    const classPart = shortageClassLabel(meta.yearStr, meta.sectionStr, meta.stream).replace(/\s+/g, '_');
    const subjPart = shortageSheetSubjectLabel(meta.subjectFilter).replace(/[^\w]+/g, '_');
    a.href = URL.createObjectURL(blob);
    a.download = 'MGM_Evening_' + classPart + '_' + subjPart + '_Attendance.xls';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
}

// ==========================================
// INTERNAL MARKS (2 tests, max 10) + ACADEMIC PERFORMANCE FINAL REPORT
// Attendance / shortage above is unchanged. Works for logged-in stream (BCA/BCOM/BBA).
// ==========================================

const IA_MAX_MARKS = 10;
const IA_MARKS_STORE_KEY = 'mgmec_internal_marks';
const IA_ROSTER_KEY = 'mgmec_student_roster';
let currentIaRollObjects = [];

function iaCurrentStream() {
    return String((typeof currentDept !== 'undefined' && currentDept) ? currentDept : 'BCA').toUpperCase();
}

function readInternalMarksStore() {
    try {
        const raw = localStorage.getItem(IA_MARKS_STORE_KEY);
        const obj = raw ? JSON.parse(raw) : {};
        return obj && typeof obj === 'object' ? obj : {};
    } catch (e) { return {}; }
}

function writeInternalMarksStore(store) {
    try { localStorage.setItem(IA_MARKS_STORE_KEY, JSON.stringify(store || {})); } catch (e) {}
}

function iaRecordKey(yearStr, sectionStr, subject, roll) {
    return [iaCurrentStream(), yearStr || '', sectionStr || '', String(subject || '').trim().toLowerCase(), String(roll || '').trim().toUpperCase()].join('|');
}

function clampIaMark(val) {
    if (val === '' || val == null) return '';
    const s = String(val).trim();
    if (!s) return '';
    if (/^ab(s(ent)?)?$/i.test(s)) return 'AB';
    const n = parseFloat(s);
    if (isNaN(n)) return '';
    if (n < 0) return 0;
    if (n > IA_MAX_MARKS) return IA_MAX_MARKS;
    return Math.round(n * 10) / 10;
}

function iaMarkIsNumeric(val) {
    const v = clampIaMark(val);
    return v !== '' && v !== 'AB' && !isNaN(parseFloat(v));
}

function iaInternalTotal(ia1, ia2) {
    const a = clampIaMark(ia1);
    const b = clampIaMark(ia2);
    const n1 = iaMarkIsNumeric(a) ? parseFloat(a) : null;
    const n2 = iaMarkIsNumeric(b) ? parseFloat(b) : null;
    if (n1 == null && n2 == null) return '';
    return (n1 || 0) + (n2 || 0);
}

function readStudentRoster() {
    try {
        const raw = localStorage.getItem(IA_ROSTER_KEY);
        const obj = raw ? JSON.parse(raw) : {};
        return obj && typeof obj === 'object' ? obj : {};
    } catch (e) { return {}; }
}

function writeStudentRoster(store) {
    try { localStorage.setItem(IA_ROSTER_KEY, JSON.stringify(store || {})); } catch (e) {}
}

function iaRosterKey(yearStr, sectionStr, roll) {
    return [iaCurrentStream(), yearStr || '', sectionStr || '', String(roll || '').trim().toUpperCase()].join('|');
}

function getStudentRosterEntry(yearStr, sectionStr, roll) {
    const store = readStudentRoster();
    return store[iaRosterKey(yearStr, sectionStr, roll)] || { name: '', regNo: '' };
}

function setStudentRosterEntry(yearStr, sectionStr, roll, name, regNo) {
    const store = readStudentRoster();
    const prev = store[iaRosterKey(yearStr, sectionStr, roll)] || {};
    store[iaRosterKey(yearStr, sectionStr, roll)] = {
        name: name != null ? String(name).trim() : (prev.name || ''),
        regNo: regNo != null ? String(regNo).trim() : (prev.regNo || '')
    };
    writeStudentRoster(store);
}

function parseMarksRollNumbers(sRollStr, eRollStr) {
    return parseShortageRollNumbers(sRollStr, eRollStr);
}

function defaultIaSemester(yearStr) {
    const iso = typeof getTodayISOString === 'function' ? getTodayISOString() : '';
    const m = parseInt((iso || '').substring(5, 7), 10) || (new Date().getMonth() + 1);
    const odd = m >= 6 && m <= 11;
    if (yearStr === 'First Year') return odd ? 'I' : 'II';
    if (yearStr === 'Second Year') return odd ? 'III' : 'IV';
    return odd ? 'V' : 'VI';
}

function updateIaSectionDropdown() {
    const secSelect = document.getElementById('iaSectionSelect');
    if (!secSelect) return;
    const dept = iaCurrentStream();
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

function updateIaSubjectDropdown() {
    const yrSelect = document.getElementById('iaYearSelect');
    const secSelect = document.getElementById('iaSectionSelect');
    const subjSelect = document.getElementById('iaSubjectSelect');
    if (!subjSelect) return;
    const yr = yrSelect ? yrSelect.value : 'First Year';
    const sec = secSelect ? secSelect.value : 'A';
    const stream = iaCurrentStream();
    const subjects = getSubjectsForActiveYear(stream, yr, sec) || [];
    const history = readAllHistory();
    const historySubjs = new Set();
    history.forEach(item => {
        if (!item.subject) return;
        if (item.stream && !isStreamMatchEvening(item.stream, stream)) return;
        if (item.year && !isYearMatching(item.year, yr)) return;
        if (item.section && typeof sectionsEqualForSubject === 'function' && !sectionsEqualForSubject(item.section, sec)) return;
        historySubjs.add(item.subject.trim());
    });
    const store = readInternalMarksStore();
    const prefix = stream + '|' + yr + '|' + sec + '|';
    Object.keys(store).forEach(k => {
        if (k.indexOf(prefix) !== 0) return;
        const parts = k.split('|');
        if (parts[3]) historySubjs.add(parts[3]);
    });
    const allSubjs = Array.from(new Set([].concat(subjects, Array.from(historySubjs)))).filter(Boolean).sort();
    const prev = subjSelect.value;
    let html = '<option value="">Select subject</option>';
    allSubjs.forEach(sub => {
        html += '<option value="' + escapeHTML(sub) + '">' + escapeHTML(sub) + '</option>';
    });
    subjSelect.innerHTML = html;
    if (prev && allSubjs.indexOf(prev) !== -1) subjSelect.value = prev;
}

function monthBelongsToSemester(ym, sem) {
    const mo = parseInt(String(ym || '').substring(5, 7), 10);
    if (!mo) return false;
    const odd = (sem === 'I' || sem === 'III' || sem === 'V');
    if (odd) return mo >= 6 && mo <= 11;
    return mo === 12 || mo <= 5;
}

function iaSubjectKeyPart(subject) {
    return String(subject || '').trim().toLowerCase();
}

function iaSubjectsLooselyEqual(a, b) {
    const s1 = iaSubjectKeyPart(a);
    const s2 = iaSubjectKeyPart(b);
    if (!s1 || !s2) return false;
    if (s1 === s2) return true;
    if (typeof extractSubjNameAndSection === 'function') {
        const b1 = extractSubjNameAndSection(a).name.trim().toLowerCase();
        const b2 = extractSubjNameAndSection(b).name.trim().toLowerCase();
        if (b1 && b2 && b1 === b2) return true;
    }
    return false;
}

function getIaMark(yearStr, sectionStr, subject, roll) {
    const store = readInternalMarksStore();
    const exact = store[iaRecordKey(yearStr, sectionStr, subject, roll)];
    if (exact) return exact;
    if (sectionStr && sectionStr !== 'ALL') {
        const allSec = store[iaRecordKey(yearStr, 'ALL', subject, roll)];
        if (allSec) return allSec;
    }
    const stream = iaCurrentStream();
    const rollU = String(roll || '').trim().toUpperCase();
    const year = yearStr || '';
    let found = null;
    Object.keys(store).forEach(function (k) {
        if (found) return;
        const parts = k.split('|');
        if (parts.length < 5) return;
        if (parts[0] !== stream || parts[1] !== year || parts[4] !== rollU) return;
        const keySec = parts[2] || '';
        const keySub = parts[3] || '';
        const secOk = keySec === (sectionStr || '') ||
            keySec === 'ALL' ||
            (typeof sectionsEqualForSubject === 'function' && sectionsEqualForSubject(keySec, sectionStr));
        if (!secOk) return;
        if (iaSubjectsLooselyEqual(keySub, subject)) found = store[k];
    });
    return found || { ia1: '', ia2: '' };
}

function upsertIaMark(yearStr, sectionStr, subject, roll, ia1, ia2, name, regNo) {
    const store = readInternalMarksStore();
    store[iaRecordKey(yearStr, sectionStr, subject, roll)] = {
        ia1: clampIaMark(ia1),
        ia2: clampIaMark(ia2),
        updated: new Date().toISOString()
    };
    writeInternalMarksStore(store);
    if (name != null || regNo != null) setStudentRosterEntry(yearStr, sectionStr, roll, name, regNo);
}

function renderIaMarksGrid(yearStr, sectionStr, subject, rollObjects) {
    const tbody = document.getElementById('iaMarksTableBody');
    const card = document.getElementById('iaMarksEntryCard');
    const heading = document.getElementById('iaEntryHeading');
    if (!tbody) return;
    tbody.innerHTML = '';
    rollObjects.forEach(rObj => {
        const rec = getIaMark(yearStr, sectionStr, subject, rObj.code);
        const roster = getStudentRosterEntry(yearStr, sectionStr, rObj.code);
        const ia1 = rec.ia1 === '' || rec.ia1 == null ? '' : rec.ia1;
        const ia2 = rec.ia2 === '' || rec.ia2 == null ? '' : rec.ia2;
        const total = iaInternalTotal(ia1, ia2);
        const tr = document.createElement('tr');
        tr.innerHTML =
            '<td style="font-weight:700;">' + escapeHTML(rObj.code) + '</td>' +
            '<td><input type="text" class="form-input ia-meta-input" data-roll="' + escapeHTML(rObj.code) + '" data-which="regNo" placeholder="Reg. No" value="' + escapeHTML(roster.regNo || '') + '" /></td>' +
            '<td><input type="text" class="form-input ia-meta-input" data-roll="' + escapeHTML(rObj.code) + '" data-which="name" placeholder="Name" value="' + escapeHTML(roster.name || '') + '" /></td>' +
            '<td><input type="text" inputmode="decimal" class="form-input ia-mark-input" data-roll="' + escapeHTML(rObj.code) + '" data-which="ia1" placeholder="0–10 / AB" value="' + escapeHTML(String(ia1)) + '" /></td>' +
            '<td><input type="text" inputmode="decimal" class="form-input ia-mark-input" data-roll="' + escapeHTML(rObj.code) + '" data-which="ia2" placeholder="0–10 / AB" value="' + escapeHTML(String(ia2)) + '" /></td>' +
            '<td class="ia-total-cell" data-roll="' + escapeHTML(rObj.code) + '">' + (total === '' ? '' : total) + '</td>';
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.ia-mark-input').forEach(inp => {
        inp.addEventListener('input', () => {
            const roll = inp.getAttribute('data-roll');
            let a = '', b = '';
            tbody.querySelectorAll('.ia-mark-input[data-roll="' + roll + '"]').forEach(el => {
                if (el.getAttribute('data-which') === 'ia1') a = el.value;
                if (el.getAttribute('data-which') === 'ia2') b = el.value;
            });
            const cell = tbody.querySelector('.ia-total-cell[data-roll="' + roll + '"]');
            if (cell) {
                const tot = iaInternalTotal(a, b);
                cell.textContent = tot === '' ? '' : tot;
            }
        });
    });
    if (card) card.style.display = 'block';
    if (heading) heading.textContent = iaCurrentStream() + ' · ' + subject + ' — ' + yearStr + ' ' + sectionStr + ' (' + rollObjects.length + ')';
}

function collectIaGridRows() {
    const tbody = document.getElementById('iaMarksTableBody');
    if (!tbody) return [];
    const byRoll = {};
    tbody.querySelectorAll('.ia-mark-input, .ia-meta-input').forEach(inp => {
        const roll = inp.getAttribute('data-roll');
        if (!byRoll[roll]) byRoll[roll] = { roll: roll, ia1: '', ia2: '', name: '', regNo: '' };
        byRoll[roll][inp.getAttribute('data-which')] = inp.value;
    });
    return Object.keys(byRoll).map(k => byRoll[k]);
}

function iaLooksLikeRegNo(s) {
    const t = String(s || '').trim();
    if (!t) return false;
    if (/^u\d/i.test(t) || /mg\d/i.test(t)) return true;
    return /^[A-Za-z0-9\/-]{8,}$/.test(t) && /\d/.test(t) && /[A-Za-z]/.test(t);
}

function iaLooksLikeHeader(parts) {
    const joined = parts.join(' ').toLowerCase();
    return joined.indexOf('roll') !== -1 || joined.indexOf('name') !== -1 || joined.indexOf('reg') !== -1;
}

function iaFindRollObject(token, rollObjects) {
    const clean = String(token || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!clean || !rollObjects) return null;
    const num = parseInt(clean.replace(/\D/g, ''), 10);
    for (let i = 0; i < rollObjects.length; i++) {
        const rObj = rollObjects[i];
        if (rObj.code === clean) return rObj;
        if (!isNaN(num) && rObj.num === num) return rObj;
        if (!isNaN(num) && num > 0) {
            const str1 = String(num);
            const str2 = String(rObj.num);
            if (str1.length >= 2 && str2.length >= 2 && (str1.endsWith(str2) || str2.endsWith(str1))) return rObj;
        }
    }
    return null;
}

function parseIaClassListText(text) {
    const rows = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
        line = line.trim();
        if (!line) return;
        const parts = (line.indexOf('\t') !== -1 ? line.split('\t') : line.split(',')).map(function (p) { return p.trim(); }).filter(Boolean);
        if (parts.length < 2 || iaLooksLikeHeader(parts)) return;
        let roll = '', regNo = '', name = '';
        const firstNum = parseInt(String(parts[0]).replace(/\D/g, ''), 10);
        const firstIsSerial = parts.length >= 3 && !isNaN(firstNum) && firstNum > 0 && firstNum <= 200 && String(parts[0]).replace(/\D/g, '').length <= 3;
        if (firstIsSerial) {
            roll = parts[1] || '';
            if (parts.length >= 4) { regNo = parts[2] || ''; name = parts.slice(3).join(' '); }
            else if (parts.length === 3) { if (iaLooksLikeRegNo(parts[2])) regNo = parts[2]; else name = parts[2]; }
        } else {
            roll = parts[0];
            if (parts.length === 2) name = parts[1];
            else if (iaLooksLikeRegNo(parts[1])) { regNo = parts[1]; name = parts.slice(2).join(' '); }
            else name = parts.slice(1).join(' ');
        }
        if (roll) rows.push({ roll: roll, regNo: regNo, name: name });
    });
    return rows;
}

function applyIaClassListToGrid(text, yearStr, sectionStr, rollObjects) {
    const parsed = parseIaClassListText(text);
    if (!parsed.length) return 0;
    const tbody = document.getElementById('iaMarksTableBody');
    let filled = 0;
    parsed.forEach(function (row) {
        const rObj = iaFindRollObject(row.roll, rollObjects);
        const rollCode = rObj ? rObj.code : String(row.roll || '').trim().toUpperCase();
        if (!rollCode) return;
        setStudentRosterEntry(yearStr, sectionStr, rollCode, row.name, row.regNo);
        if (tbody) {
            const nameInp = tbody.querySelector('.ia-meta-input[data-roll="' + rollCode + '"][data-which="name"]');
            const regInp = tbody.querySelector('.ia-meta-input[data-roll="' + rollCode + '"][data-which="regNo"]');
            if (nameInp && row.name) nameInp.value = row.name;
            if (regInp && row.regNo) regInp.value = row.regNo;
            if (nameInp || regInp) filled++;
        } else filled++;
    });
    return filled;
}

function saveIaMarksFromGrid(yearStr, sectionStr, subject) {
    const rows = collectIaGridRows();
    rows.forEach(row => {
        upsertIaMark(yearStr, sectionStr, subject, row.roll, row.ia1, row.ia2, row.name, row.regNo);
    });
    const stream = iaCurrentStream();
    const targetUrl = getWebhookUrl(stream);
    if (targetUrl && typeof postWithRetry === 'function') {
        const payload = withAuth({
            action: 'save_internal_marks',
            stream: stream,
            year: yearStr,
            section: sectionStr,
            subject: subject,
            max: IA_MAX_MARKS,
            marks: rows.map(r => ({
                roll: r.roll,
                ia1: clampIaMark(r.ia1),
                ia2: clampIaMark(r.ia2),
                name: r.name || '',
                regNo: r.regNo || ''
            }))
        });
        postWithRetry(targetUrl, payload).catch(function () {});
    }
    return rows.length;
}

function fetchIaMarksFromSheet(yearStr, sectionStr, subject, callback) {
    const stream = iaCurrentStream();
    const targetUrl = getWebhookUrl(stream);
    if (!targetUrl) { if (callback) callback(); return; }
    const cbName = 'mgmec_ia_marks_cb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    let done = false;
    const timeout = setTimeout(function () { if (done) return; done = true; if (callback) callback(); }, 12000);
    window[cbName] = function (res) {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        try { delete window[cbName]; } catch (e) {}
        if (res && (res.result === 'success' || res.status === 'ok') && Array.isArray(res.marks)) {
            const store = readInternalMarksStore();
            res.marks.forEach(function (m) {
                const roll = String(m.roll || '').trim().toUpperCase();
                const subj = m.subject || subject;
                if (!roll) return;
                store[iaRecordKey(yearStr, sectionStr, subj, roll)] = {
                    ia1: clampIaMark(m.ia1),
                    ia2: clampIaMark(m.ia2),
                    updated: m.updated || new Date().toISOString()
                };
                if (m.name || m.regNo) setStudentRosterEntry(yearStr, sectionStr, roll, m.name || '', m.regNo || '');
            });
            writeInternalMarksStore(store);
        }
        if (callback) callback();
    };
    const params = new URLSearchParams({
        action: 'get_internal_marks',
        stream: stream,
        year: yearStr,
        section: sectionStr,
        subject: subject,
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

function iaAcademicYearLabel() {
    const ay = shortageAcademicYearParts();
    return '20' + ay.startYY + '-' + ay.endYY;
}

function buildOfficialIaMarksTable(yearStr, sectionStr, subject, rollObjects, semester) {
    const sem = semester || defaultIaSemester(yearStr);
    const streamLab = shortageStreamShortLabel(iaCurrentStream());
    let secLab = sectionStr || '';
    if (!secLab || secLab === 'ALL') secLab = 'Combined';
    else if (secLab === 'ONLY') secLab = 'Main';
    const title = 'Internal Marks ' + iaAcademicYearLabel() + ', ' + sem + ' Sem. ' + streamLab + ' (' + secLab + ')';
    const td = 'border:1px solid #000;padding:4px 6px;font-size:12px;';
    let rows = '';
    rollObjects.forEach(function (rObj, idx) {
        const rec = getIaMark(yearStr, sectionStr, subject, rObj.code);
        const roster = getStudentRosterEntry(yearStr, sectionStr, rObj.code);
        const ia1 = clampIaMark(rec.ia1);
        const ia2 = clampIaMark(rec.ia2);
        const internal = iaInternalTotal(ia1, ia2);
        rows += '<tr>' +
            '<td style="' + td + 'text-align:center;">' + (idx + 1) + '</td>' +
            '<td style="' + td + 'text-align:center;font-weight:700;">' + escapeHTML(rObj.code) + '</td>' +
            '<td style="' + td + '">' + escapeHTML(roster.regNo || '') + '</td>' +
            '<td style="' + td + 'text-align:left;">' + escapeHTML(roster.name || '') + '</td>' +
            '<td style="' + td + 'text-align:center;font-weight:700;">' + escapeHTML(String(ia1)) + '</td>' +
            '<td style="' + td + 'text-align:center;font-weight:700;">' + escapeHTML(String(ia2)) + '</td>' +
            '<td style="' + td + '"></td><td style="' + td + '"></td>' +
            '<td style="' + td + 'text-align:center;font-weight:700;">' + (internal === '' ? '' : internal) + '</td></tr>';
    });
    return '<div style="font-family:\'Times New Roman\',Times,serif;color:#000;background:#fff;">' +
        '<table style="width:100%;border-collapse:collapse;border:1px solid #000;">' +
        '<tr><td colspan="9" style="' + td + 'font-size:15px;font-weight:800;text-align:center;">' + escapeHTML(MGMEC_OFFICIAL_COLLEGE_NAME) + '</td></tr>' +
        '<tr><td colspan="6" style="' + td + 'font-size:14px;font-weight:800;">' + escapeHTML(title) + '</td>' +
        '<td colspan="3" style="' + td + 'font-size:13px;font-weight:700;text-align:right;">Subject: ' + escapeHTML(subject || '') + '</td></tr>' +
        '<tr><th rowspan="2" style="' + td + '">Sl.<br>No</th><th rowspan="2" style="' + td + '">Roll<br>No.</th><th rowspan="2" style="' + td + '">REG.No.</th><th rowspan="2" style="' + td + 'text-align:left;">Name</th>' +
        '<th colspan="2" style="' + td + '">INT MARKS OUT OF</th><th style="' + td + '"></th><th style="' + td + '"></th><th rowspan="2" style="' + td + '">Internal</th></tr>' +
        '<tr><th style="' + td + '">10<br>I TEST</th><th style="' + td + '">10<br>II TEST</th><th style="' + td + '"></th><th style="' + td + '"></th></tr>' +
        rows + '</table></div>';
}

function iaAbsenteeMatchesRoll(absentStr, rObj) {
    const cleanR = String(absentStr).trim().toUpperCase();
    const rNum = parseInt(cleanR.replace(/\D/g, ''), 10);
    if (cleanR === rObj.code) return true;
    if (!isNaN(rNum) && rNum === rObj.num) return true;
    if (!isNaN(rNum) && rNum > 0) {
        const str1 = String(rNum);
        const str2 = String(rObj.num);
        if (str1.length >= 2 && str2.length >= 2) {
            return str1.endsWith(str2) || str2.endsWith(str1);
        }
    }
    return false;
}

function collectIaSubjectAttendance(yearStr, sectionStr, rollObj) {
    const stream = iaCurrentStream();
    const history = readAllHistory();
    const bySubj = {};
    history.forEach(item => {
        if (item.stream && !isStreamMatchEvening(item.stream, stream)) return;
        if (!isYearMatching(item.year, yearStr)) return;
        if (item.section && typeof sectionsEqualForSubject === 'function' && !sectionsEqualForSubject(item.section, sectionStr)) return;
        const subj = String(item.subject || '').trim();
        if (!subj) return;
        const dateStr = (typeof normalizeHistoryDate === 'function' ? normalizeHistoryDate(item.date) : item.date) || (typeof getTodayISOString === 'function' ? getTodayISOString() : '');
        const mk = String(dateStr || '').substring(0, 7);
        if (!bySubj[subj]) bySubj[subj] = { months: {}, held: 0, missed: 0 };
        bySubj[subj].held++;
        if (!bySubj[subj].months[mk]) bySubj[subj].months[mk] = { held: 0, missed: 0 };
        bySubj[subj].months[mk].held++;
        const rolls = normalizeRollNumbers(item.rollNumbers);
        const missed = rolls.some(r => iaAbsenteeMatchesRoll(r, rollObj));
        if (missed) {
            bySubj[subj].missed++;
            bySubj[subj].months[mk].missed++;
        }
    });
    return bySubj;
}

function isIaLabSubject(subj) {
    return /\b(lab|practical)\b/i.test(String(subj || ''));
}

function isIaEnglishCoreSubject(subj) {
    const s = String(subj || '').trim().toLowerCase();
    if (!s) return false;
    if (/\boptional\s*english\b/i.test(s)) return false;
    return /\benglish\b/i.test(s);
}

function isIaLanguageElectiveSubject(subj) {
    return /\b(kannada|kanada|kanad|hindi|hindhi|sanskrit|sanskrith|sanskritha|sanskrut|sanskrutha|sanskritam)\b/i.test(String(subj || ''));
}

function iaFinalReportSubjectRank(subj, yearStr) {
    const lab = isIaLabSubject(subj);
    if (yearStr === 'Third Year') {
        return lab ? 2 : 1;
    }
    if (isIaLanguageElectiveSubject(subj)) return 1;
    if (isIaEnglishCoreSubject(subj)) return 2;
    if (lab) return 4;
    return 3;
}

function sortIaFinalReportSubjects(subjects, yearStr) {
    return (subjects || []).slice().sort(function (a, b) {
        const ra = iaFinalReportSubjectRank(a, yearStr);
        const rb = iaFinalReportSubjectRank(b, yearStr);
        if (ra !== rb) return ra - rb;
        return String(a).localeCompare(String(b));
    });
}

function listIaReportSubjects(yearStr, sectionStr) {
    const stream = iaCurrentStream();
    const fromConfig = getSubjectsForActiveYear(stream, yearStr, sectionStr) || [];
    const store = readInternalMarksStore();
    const fromMarks = [];
    Object.keys(store).forEach(k => {
        const parts = k.split('|');
        if (parts.length < 5 || parts[0] !== stream || parts[1] !== yearStr) return;
        const keySec = parts[2] || '';
        const secOk = keySec === (sectionStr || '') ||
            keySec === 'ALL' ||
            (typeof sectionsEqualForSubject === 'function' && sectionsEqualForSubject(keySec, sectionStr));
        if (!secOk) return;
        const subj = parts[3];
        if (subj) fromMarks.push(subj);
    });
    const history = readAllHistory();
    const fromHist = [];
    history.forEach(item => {
        if (!item.subject) return;
        if (item.stream && !isStreamMatchEvening(item.stream, stream)) return;
        if (!isYearMatching(item.year, yearStr)) return;
        if (item.section && typeof sectionsEqualForSubject === 'function' && !sectionsEqualForSubject(item.section, sectionStr)) return;
        fromHist.push(item.subject.trim());
    });
    const seen = new Set();
    const out = [];
    [].concat(fromConfig, fromMarks, fromHist).forEach(s => {
        const name = String(s || '').trim();
        if (!name) return;
        const low = name.toLowerCase();
        if (seen.has(low)) return;
        let display = name;
        if (fromMarks.indexOf(name) !== -1 && name === low) {
            const nicer = [].concat(fromConfig, fromHist).find(function (x) {
                return String(x || '').trim().toLowerCase() === low;
            });
            if (nicer) display = String(nicer).trim();
        }
        seen.add(low);
        out.push(display);
    });
    return sortIaFinalReportSubjects(out, yearStr);
}

function buildAcademicPerformanceExcelTable(yearStr, sectionStr, semester, rollObj, subjects) {
    const attMap = collectIaSubjectAttendance(yearStr, sectionStr, rollObj);
    const monthSet = {};
    Object.keys(attMap).forEach(function (subj) {
        Object.keys(attMap[subj].months || {}).forEach(function (mk) {
            if (monthBelongsToSemester(mk, semester)) monthSet[mk] = true;
        });
    });
    let monthKeys = Object.keys(monthSet).sort();
    if (monthKeys.length === 0) {
        Object.keys(attMap).forEach(function (subj) {
            Object.keys(attMap[subj].months || {}).forEach(function (mk) { monthSet[mk] = true; });
        });
        monthKeys = Object.keys(monthSet).sort();
    }
    if (monthKeys.length > 4) monthKeys = monthKeys.slice(-4);
    while (monthKeys.length < 4) monthKeys.push('');

    const td = 'border:1px solid #000;padding:4px 6px;font-size:12px;';
    const th = td + 'font-weight:700;background:#eee;';
    let headMonths = '';
    monthKeys.forEach(function (mk) {
        const lab = mk ? formatShortageMonthLabel(mk) : '';
        headMonths += '<th style="' + th + '">' + escapeHTML(lab) + ' Held</th><th style="' + th + '">' + escapeHTML(lab) + ' Att</th>';
    });

    let bodyRows = '';
    const rowSubjects = subjects.slice();
    while (rowSubjects.length < 12) rowSubjects.push('');
    rowSubjects.forEach(function (subj) {
        let ia1 = '', ia2 = '';
        if (subj) {
            const rec = getIaMark(yearStr, sectionStr, subj, rollObj.code);
            ia1 = clampIaMark(rec.ia1);
            ia2 = clampIaMark(rec.ia2);
        }
        let attCells = '';
        monthKeys.forEach(function (mk) {
            let held = '', att = '';
            if (subj && mk && attMap[subj] && attMap[subj].months[mk]) {
                held = attMap[subj].months[mk].held;
                att = Math.max(0, held - (attMap[subj].months[mk].missed || 0));
            } else if (subj && mk) {
                Object.keys(attMap).forEach(function (attSubj) {
                    if (!iaSubjectsLooselyEqual(attSubj, subj)) return;
                    if (!attMap[attSubj].months[mk]) return;
                    held = attMap[attSubj].months[mk].held;
                    att = Math.max(0, held - (attMap[attSubj].months[mk].missed || 0));
                });
            }
            attCells += '<td style="' + td + 'text-align:center;">' + held + '</td><td style="' + td + 'text-align:center;">' + att + '</td>';
        });
        bodyRows += '<tr>' +
            '<td style="' + td + 'text-align:left;">' + escapeHTML(subj) + '</td>' +
            '<td style="' + td + 'text-align:center;font-weight:700;">' + escapeHTML(String(ia1)) + '</td>' +
            '<td style="' + td + 'text-align:center;font-weight:700;">' + escapeHTML(String(ia2)) + '</td>' +
            attCells + '</tr>';
    });

    const roster = getStudentRosterEntry(yearStr, sectionStr, rollObj.code);
    const classLabel = escapeHTML(shortageClassLabel(yearStr, sectionStr, iaCurrentStream()));
    const nameBit = roster.name ? (' | Name: ' + escapeHTML(roster.name)) : '';
    const regBit = roster.regNo ? (' | REG.No: ' + escapeHTML(roster.regNo)) : '';
    const colCount = 3 + (monthKeys.length * 2);

    return '<table style="width:100%;border-collapse:collapse;border:1px solid #000;margin-bottom:22px;font-family:Times New Roman,Times,serif;">' +
        '<tr><td colspan="' + colCount + '" style="' + td + 'font-weight:800;text-align:center;">' + escapeHTML(MGMEC_OFFICIAL_COLLEGE_NAME) + '</td></tr>' +
        '<tr><td colspan="' + colCount + '" style="' + td + 'font-weight:800;text-align:center;">' + escapeHTML(semester) + ' Semester — Academic Performance</td></tr>' +
        '<tr><td colspan="' + colCount + '" style="' + td + '">CLASS: ' + classLabel + ' | ROLL: ' + escapeHTML(rollObj.code) + nameBit + regBit + '</td></tr>' +
        '<tr><th style="' + th + '">Subject</th><th style="' + th + '">Test I (/10)</th><th style="' + th + '">Test II (/10)</th>' + headMonths + '</tr>' +
        bodyRows +
        '</table>';
}

function buildAcademicPerformanceExcelHtml(yearStr, sectionStr, semester, rollObjects) {
    const subjects = listIaReportSubjects(yearStr, sectionStr);
    let html = '';
    rollObjects.forEach(function (rObj) {
        html += buildAcademicPerformanceExcelTable(yearStr, sectionStr, semester, rObj, subjects);
    });
    return html;
}

function buildAcademicPerformancePage(yearStr, sectionStr, semester, rollObj, subjects) {
    const attMap = collectIaSubjectAttendance(yearStr, sectionStr, rollObj);
    const monthSet = {};
    Object.keys(attMap).forEach(function (subj) {
        Object.keys(attMap[subj].months || {}).forEach(function (mk) {
            if (monthBelongsToSemester(mk, semester)) monthSet[mk] = true;
        });
    });
    let monthKeys = Object.keys(monthSet).sort();
    if (monthKeys.length === 0) {
        Object.keys(attMap).forEach(function (subj) {
            Object.keys(attMap[subj].months || {}).forEach(function (mk) { monthSet[mk] = true; });
        });
        monthKeys = Object.keys(monthSet).sort();
    }
    if (monthKeys.length > 4) monthKeys = monthKeys.slice(-4);
    while (monthKeys.length < 4) monthKeys.push('');

    let monthHead = '';
    let pairHead = '';
    monthKeys.forEach(function (mk) {
        const lab = mk ? formatShortageMonthLabel(mk) : '';
        monthHead += '<th colspan="2" style="border:1px solid #000;padding:3px 4px;font-size:11px;">' + escapeHTML(lab) + '</th>';
        pairHead += '<th style="border:1px solid #000;padding:2px 4px;font-size:10px;width:28px;">1</th><th style="border:1px solid #000;padding:2px 4px;font-size:10px;width:28px;">2</th>';
    });

    let bodyRows = '';
    const rowSubjects = subjects.slice();
    while (rowSubjects.length < 12) rowSubjects.push('');
    rowSubjects.forEach(function (subj) {
        let ia1 = '', ia2 = '';
        if (subj) {
            const rec = getIaMark(yearStr, sectionStr, subj, rollObj.code);
            ia1 = clampIaMark(rec.ia1);
            ia2 = clampIaMark(rec.ia2);
        }
        let attCells = '';
        monthKeys.forEach(function (mk) {
            let held = '', att = '';
            if (subj && mk && attMap[subj] && attMap[subj].months[mk]) {
                held = attMap[subj].months[mk].held;
                att = Math.max(0, held - (attMap[subj].months[mk].missed || 0));
            } else if (subj && mk) {
                Object.keys(attMap).forEach(function (attSubj) {
                    if (!iaSubjectsLooselyEqual(attSubj, subj)) return;
                    if (!attMap[attSubj].months[mk]) return;
                    held = attMap[attSubj].months[mk].held;
                    att = Math.max(0, held - (attMap[attSubj].months[mk].missed || 0));
                });
            }
            attCells += '<td style="border:1px solid #000;padding:3px 4px;text-align:center;font-size:11px;">' + held + '</td>' +
                '<td style="border:1px solid #000;padding:3px 4px;text-align:center;font-size:11px;">' + att + '</td>';
        });
        bodyRows += '<tr><td style="border:1px solid #000;padding:3px 6px;font-size:12px;">' + escapeHTML(subj) + '</td>' +
            '<td style="border:1px solid #000;padding:3px 4px;text-align:center;font-size:12px;">' + escapeHTML(String(ia1)) + '</td>' +
            '<td style="border:1px solid #000;padding:3px 4px;text-align:center;font-size:12px;">' + escapeHTML(String(ia2)) + '</td>' +
            attCells + '</tr>';
    });

    const roster = getStudentRosterEntry(yearStr, sectionStr, rollObj.code);
    const classLabel = escapeHTML(shortageClassLabel(yearStr, sectionStr, iaCurrentStream()));
    const nameLine = roster.name ? (' &nbsp; <strong>NAME:</strong> ' + escapeHTML(roster.name)) : '';
    const regLine = roster.regNo ? (' &nbsp; <strong>REG.No:</strong> ' + escapeHTML(roster.regNo)) : '';
    return '<div class="ap-page" style="page-break-after:always;margin-bottom:18px;">' +
        '<div style="text-align:center;font-weight:800;font-size:15px;margin-bottom:2px;">' + escapeHTML(MGMEC_OFFICIAL_COLLEGE_NAME) + '</div>' +
        '<div style="text-align:center;font-weight:800;font-size:16px;">' + escapeHTML(semester) + ' Semester</div>' +
        '<div style="text-align:center;font-weight:700;font-size:15px;margin-bottom:8px;">Academic Performance</div>' +
        '<div style="font-size:13px;margin-bottom:8px;"><strong>CLASS:</strong> ' + classLabel +
        ' &nbsp; <strong>ROLL:</strong> ' + escapeHTML(rollObj.code) + nameLine + regLine + '</div>' +
        '<table style="width:100%;border-collapse:collapse;border:1px solid #000;font-family:Times New Roman,Times,serif;">' +
        '<tr><th rowspan="3" style="border:1px solid #000;padding:4px;font-size:12px;width:28%;">Subject</th>' +
        '<th colspan="2" style="border:1px solid #000;padding:4px;font-size:12px;">Test / Assignment</th>' +
        '<th colspan="8" style="border:1px solid #000;padding:4px;font-size:12px;">Attendance *</th></tr>' +
        '<tr><th colspan="2" style="border:1px solid #000;padding:3px;font-size:11px;"></th>' + monthHead + '</tr>' +
        '<tr><th style="border:1px solid #000;padding:3px;font-size:11px;">I</th><th style="border:1px solid #000;padding:3px;font-size:11px;">II</th>' + pairHead + '</tr>' +
        bodyRows +
        '<tr><td style="border:1px solid #000;padding:14px 6px 6px;font-size:12px;">Signature of the Parent</td><td style="border:1px solid #000;"></td><td style="border:1px solid #000;"></td><td colspan="8" style="border:1px solid #000;"></td></tr>' +
        '<tr><td style="border:1px solid #000;padding:14px 6px 6px;font-size:12px;">Signature of the Academic Advisor</td><td colspan="10" style="border:1px solid #000;"></td></tr>' +
        '</table>' +
        '<div style="font-size:11px;margin-top:6px;font-style:italic;">* 1. Maximum Classes held &nbsp;&nbsp; 2. Number of Classes attended &nbsp;&nbsp; Tests: Max 10 each</div>' +
        '</div>';
}

function buildAcademicPerformancePagesHtml(yearStr, sectionStr, semester, rollObjects) {
    const subjects = listIaReportSubjects(yearStr, sectionStr);
    let pages = '';
    rollObjects.forEach(function (rObj) {
        pages += buildAcademicPerformancePage(yearStr, sectionStr, semester, rObj, subjects);
    });
    return pages;
}

function printAcademicPerformanceReport(yearStr, sectionStr, semester, rollObjects) {
    const pages = buildAcademicPerformancePagesHtml(yearStr, sectionStr, semester, rollObjects);
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Academic Performance</title>' +
        '<style>body{font-family:Times New Roman,Times,serif;color:#000;background:#fff;margin:12px;} .no-print{margin-bottom:12px;} @media print{.no-print{display:none!important;} .ap-page{page-break-after:always;} @page{size:A4 portrait;margin:10mm;}}</style></head><body>' +
        '<div class="no-print"><button type="button" onclick="window.print()">Print</button></div>' +
        pages + '</body></html>';
    printHtmlInNewWindow(html);
}

function printHtmlInNewWindow(html) {
    const w = window.open('', '_blank');
    if (!w) { alert('Please allow pop-ups to print.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(function () { try { w.print(); } catch (e) {} }, 400);
}

function downloadHtmlAsExcel(innerHtml, filename) {
    const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Report</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>' + innerHtml + '</body></html>';
    const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel' });
    const fname = filename || 'MGM_Evening_Internal_Marks.xls';
    if (window.navigator && typeof window.navigator.msSaveOrOpenBlob === 'function') {
        window.navigator.msSaveOrOpenBlob(blob, fname);
        return;
    }
    const a = document.createElement('a');
    a.download = fname;
    a.rel = 'noopener';
    document.body.appendChild(a);
    const reader = new FileReader();
    reader.onload = function () {
        a.href = reader.result;
        a.click();
        document.body.removeChild(a);
    };
    reader.onerror = function () {
        a.href = URL.createObjectURL(blob);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    };
    reader.readAsDataURL(blob);
}

function initInternalMarksModule() {
    const subTabMarks = document.getElementById('subTabInternalMarks');
    const marksContainer = document.getElementById('hodInternalMarksContainer');
    const subTabDaily = document.getElementById('subTabDailyInformer');
    const subTabShortage = document.getElementById('subTabShortageCalculator');
    const dailyContainer = document.getElementById('hodDailyInformerContainer');
    const shortageContainer = document.getElementById('hodShortageContainer');
    const yearSelect = document.getElementById('iaYearSelect');
    const sectionSelect = document.getElementById('iaSectionSelect');
    const subjectSelect = document.getElementById('iaSubjectSelect');
    const semSelect = document.getElementById('iaSemesterSelect');
    const startRoll = document.getElementById('iaStartRoll');
    const endRoll = document.getElementById('iaEndRoll');
    const loadBtn = document.getElementById('iaLoadRollsBtn');
    const saveBtn = document.getElementById('iaSaveMarksBtn');
    const applyListBtn = document.getElementById('iaApplyClassListBtn');
    const classListPaste = document.getElementById('iaClassListPaste');
    const printClassBtn = document.getElementById('iaPrintClassBtn');
    const excelClassBtn = document.getElementById('iaExcelClassBtn');
    const printFinalBtn = document.getElementById('iaPrintFinalBtn');
    const excelFinalBtn = document.getElementById('iaExcelFinalBtn');

    if (subTabMarks && marksContainer) {
        subTabMarks.addEventListener('click', function () {
            subTabMarks.classList.add('active');
            if (subTabDaily) subTabDaily.classList.remove('active');
            if (subTabShortage) subTabShortage.classList.remove('active');
            marksContainer.style.display = 'block';
            if (dailyContainer) dailyContainer.style.display = 'none';
            if (shortageContainer) shortageContainer.style.display = 'none';
            updateIaSectionDropdown();
            updateIaSubjectDropdown();
            if (yearSelect && semSelect) semSelect.value = defaultIaSemester(yearSelect.value);
        });
    }

    if (yearSelect) {
        yearSelect.addEventListener('change', function () {
            updateIaSectionDropdown();
            updateIaSubjectDropdown();
            if (semSelect) semSelect.value = defaultIaSemester(yearSelect.value);
        });
    }
    if (sectionSelect) sectionSelect.addEventListener('change', updateIaSubjectDropdown);
    updateIaSectionDropdown();
    updateIaSubjectDropdown();
    if (yearSelect && semSelect) semSelect.value = defaultIaSemester(yearSelect.value);

    if (loadBtn) {
        loadBtn.addEventListener('click', function () {
            const yr = yearSelect ? yearSelect.value : 'First Year';
            const sec = sectionSelect ? sectionSelect.value : 'A';
            const subj = subjectSelect ? subjectSelect.value : '';
            const sRoll = startRoll ? startRoll.value.trim() : '';
            const eRoll = endRoll ? endRoll.value.trim() : '';
            if (!subj) { alert('Please select a subject.'); if (subjectSelect) subjectSelect.focus(); return; }
            if (!sRoll && !eRoll) { alert('Please enter a roll range.'); if (startRoll) startRoll.focus(); return; }
            const rolls = parseMarksRollNumbers(sRoll, eRoll);
            if (!rolls.length) { alert('Invalid roll numbers. Example: 26701-26760'); return; }
            currentIaRollObjects = rolls;
            const btnText = document.getElementById('iaLoadRollsBtnText');
            if (btnText) btnText.textContent = 'Loading…';
            fetchIaMarksFromSheet(yr, sec, subj, function () {
                renderIaMarksGrid(yr, sec, subj, rolls);
                if (btnText) btnText.textContent = '📋 Load Students for Marks Entry';
            });
        });
    }

    if (applyListBtn) {
        applyListBtn.addEventListener('click', function () {
            const yr = yearSelect ? yearSelect.value : 'First Year';
            const sec = sectionSelect ? sectionSelect.value : 'A';
            const text = classListPaste ? classListPaste.value : '';
            if (!String(text || '').trim()) { alert('Paste the class list first (Roll, REG.No, Name).'); return; }
            if (!currentIaRollObjects.length) { alert('Load students first, then paste the class list.'); return; }
            const n = applyIaClassListToGrid(text, yr, sec, currentIaRollObjects);
            if (typeof showCustomToast === 'function') showCustomToast('Class list applied', n + ' name(s) filled for this section.');
            else alert('Filled ' + n + ' name(s).');
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', function () {
            const yr = yearSelect ? yearSelect.value : 'First Year';
            const sec = sectionSelect ? sectionSelect.value : 'A';
            const subj = subjectSelect ? subjectSelect.value : '';
            if (!subj || !currentIaRollObjects.length) { alert('Load students first, then save marks.'); return; }
            const n = saveIaMarksFromGrid(yr, sec, subj);
            if (typeof showCustomToast === 'function') showCustomToast('Internal marks saved', n + ' students · ' + subj);
            else alert('Saved marks for ' + n + ' students.');
        });
    }

    if (printClassBtn) {
        printClassBtn.addEventListener('click', function () {
            const yr = yearSelect ? yearSelect.value : 'First Year';
            const sec = sectionSelect ? sectionSelect.value : 'A';
            const subj = subjectSelect ? subjectSelect.value : '';
            const sem = semSelect ? semSelect.value : defaultIaSemester(yr);
            if (!subj || !currentIaRollObjects.length) { alert('Load students first.'); return; }
            saveIaMarksFromGrid(yr, sec, subj);
            const table = buildOfficialIaMarksTable(yr, sec, subj, currentIaRollObjects, sem);
            printHtmlInNewWindow('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Internal Marks</title><style>body{font-family:Times New Roman,Times,serif;margin:14px;} .no-print{margin-bottom:12px;} @media print{.no-print{display:none!important;} @page{size:A4 landscape;margin:8mm;}}</style></head><body><div class="no-print"><button type="button" onclick="window.print()">Print</button></div>' + table + '</body></html>');
        });
    }

    if (excelClassBtn) {
        excelClassBtn.addEventListener('click', function () {
            const yr = yearSelect ? yearSelect.value : 'First Year';
            const sec = sectionSelect ? sectionSelect.value : 'A';
            const subj = subjectSelect ? subjectSelect.value : '';
            const sem = semSelect ? semSelect.value : defaultIaSemester(yr);
            if (!subj || !currentIaRollObjects.length) { alert('Load students first.'); return; }
            saveIaMarksFromGrid(yr, sec, subj);
            const table = buildOfficialIaMarksTable(yr, sec, subj, currentIaRollObjects, sem);
            downloadHtmlAsExcel(table, 'MGM_Evening_Internal_Marks_' + iaCurrentStream() + '_' + String(subj).replace(/[^\w]+/g, '_') + '.xls');
        });
    }

    if (printFinalBtn) {
        printFinalBtn.addEventListener('click', function () {
            const yr = yearSelect ? yearSelect.value : 'First Year';
            const sec = sectionSelect ? sectionSelect.value : 'A';
            const sem = semSelect ? semSelect.value : 'I';
            const sRoll = startRoll ? startRoll.value.trim() : '';
            const eRoll = endRoll ? endRoll.value.trim() : '';
            let rolls = currentIaRollObjects;
            if (!rolls.length) rolls = parseMarksRollNumbers(sRoll, eRoll);
            if (!rolls.length) {
                alert('Enter a roll range and load students (or print after loading).');
                return;
            }
            const subj = subjectSelect ? subjectSelect.value : '';
            if (subj && rolls.length) saveIaMarksFromGrid(yr, sec, subj);
            printAcademicPerformanceReport(yr, sec, sem, rolls);
        });
    }

    if (excelFinalBtn) {
        excelFinalBtn.addEventListener('click', function () {
            const yr = yearSelect ? yearSelect.value : 'First Year';
            const sec = sectionSelect ? sectionSelect.value : 'A';
            const sem = semSelect ? semSelect.value : 'I';
            const sRoll = startRoll ? startRoll.value.trim() : '';
            const eRoll = endRoll ? endRoll.value.trim() : '';
            let rolls = currentIaRollObjects;
            if (!rolls.length) rolls = parseMarksRollNumbers(sRoll, eRoll);
            if (!rolls.length) {
                alert('Enter a roll range and load students first.');
                return;
            }
            const subj = subjectSelect ? subjectSelect.value : '';
            if (subj && rolls.length) saveIaMarksFromGrid(yr, sec, subj);
            const pages = buildAcademicPerformanceExcelHtml(yr, sec, sem, rolls);
            downloadHtmlAsExcel(pages, 'MGM_Evening_Academic_Performance_' + iaCurrentStream() + '_' + sem + '_Sem.xls');
        });
    }
}

