/**
 * 🎁 JCW NEW YEAR GIFT GAME — Backend (Google Apps Script)
 * "14 Roman Cards (I–XIV). 14 Destinies. 1 Unbroken Chain."
 *
 * Chain Rule & Anti-Loop Engine (Hamiltonian Single Cycle):
 * 1. Player 1 starts the chain.
 * 2. Whoever's gift is revealed on the opened card becomes the NEXT drawer immediately!
 * 3. For turns 1..(N-1), the system prevents drawing:
 *    - Yourself (self-draw)
 *    - Anyone who has already drawn (including the very first starter, which would close the loop early!)
 *    If the chosen card contains an invalid name for the chain, the backend transparently swaps its
 *    assigned name with another unopened valid card BEFORE revealing and locking it.
 * 4. On the final turn (turn N), the last player naturally draws the 1st starter's gift, completing a perfect circle!
 */

const SHEET_NAME = 'GiftCards';
const LOG_SHEET_NAME = 'ActivityLog';
const ADMIN_PASS_PROP = 'ADMIN_PASSWORD';
const CHAIN_STARTER_PROP = 'CHAIN_STARTER';
const CHAIN_CURRENT_PROP = 'CHAIN_CURRENT_DRAWER';
const DEFAULT_ADMIN_PASS = 'JCW2026';

const DEFAULT_CARDS = [
  { id: 1,  letter: 'I',    theme: 'Christmas Tree', employee: 'K.จินดา',         status: 'AVAILABLE' },
  { id: 2,  letter: 'II',   theme: 'Gift',           employee: 'K.จ้ำ',           status: 'AVAILABLE' },
  { id: 3,  letter: 'III',  theme: 'Star',           employee: 'K.เพียว',         status: 'AVAILABLE' },
  { id: 4,  letter: 'IV',   theme: 'Snowflake',      employee: 'K.นุ๊ก',          status: 'AVAILABLE' },
  { id: 5,  letter: 'V',    theme: 'Reindeer',       employee: 'K.อาร์ม',         status: 'AVAILABLE' },
  { id: 6,  letter: 'VI',   theme: 'Bell',           employee: 'K.ชิต',           status: 'AVAILABLE' },
  { id: 7,  letter: 'VII',  theme: 'Santa',          employee: 'K.ซัน',           status: 'AVAILABLE' },
  { id: 8,  letter: 'VIII', theme: 'Gingerbread',    employee: 'K.พี',            status: 'AVAILABLE' },
  { id: 9,  letter: 'IX',   theme: 'Candle',         employee: 'K.ฟ้า',           status: 'AVAILABLE' },
  { id: 10, letter: 'X',    theme: 'Ribbon',         employee: 'K.บู๊ทธ์',        status: 'AVAILABLE' },
  { id: 11, letter: 'XI',   theme: 'Celebration',    employee: 'K.เจ',            status: 'AVAILABLE' },
  { id: 12, letter: 'XII',  theme: 'Magic Star',     employee: 'ผู้เข้าร่วมงาน 1', status: 'AVAILABLE' },
  { id: 13, letter: 'XIII', theme: 'Royal Crown',    employee: 'ผู้เข้าร่วมงาน 2', status: 'AVAILABLE' },
  { id: 14, letter: 'XIV',  theme: 'Lucky Diamond',  employee: 'ผู้เข้าร่วมงาน 3', status: 'AVAILABLE' }
];

function doGet(e) {
  ensureSheetSetup_();
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('JCW — NEW YEAR GIFT GAME 🎁')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Ensures the Google Sheet has the required tabs and initial 14 Roman cards (I-XIV).
 * Automatically upgrades legacy A-L sheets to I-XIV (14 cards).
 */
function ensureSheetSetup_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return null;

  let sheet = ss.getSheetByName(SHEET_NAME);
  const headers = ['card_id', 'card_letter', 'theme', 'employee_name', 'status', 'drawn_by', 'revealed_at'];

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#0f172a')
      .setFontColor('#f8fafc');

    const rows = DEFAULT_CARDS.map(c => [c.id, c.letter, c.theme, c.employee, c.status, '', '']);
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  } else if (sheet.getLastRow() < 2) {
    const rows = DEFAULT_CARDS.map(c => [c.id, c.letter, c.theme, c.employee, c.status, '', '']);
    sheet.getRange(2, 1, rows.length, 7).setValues(rows);
  } else {
    // Auto-migrate if sheet still uses A-L or has fewer than 14 cards
    const firstLetter = String(sheet.getRange(2, 2).getValue() || '').trim();
    const rowCount = sheet.getLastRow() - 1;
    if (firstLetter === 'A' || rowCount < DEFAULT_CARDS.length) {
      const existingData = sheet.getDataRange().getValues();
      const newRows = DEFAULT_CARDS.map((c, idx) => {
        const oldRow = existingData[idx + 1];
        const existingEmp = oldRow && oldRow[3] && String(oldRow[3]).trim() !== 'พี่สมชาย'
          ? String(oldRow[3]).trim()
          : c.employee;
        const existingStatus = oldRow && oldRow[4] ? String(oldRow[4]).trim() : 'AVAILABLE';
        const existingDrawnBy = oldRow && oldRow[5] ? String(oldRow[5]).trim() : '';
        const existingRevAt = oldRow && oldRow[6] ? String(oldRow[6]).trim() : '';
        return [c.id, c.letter, c.theme, existingEmp, existingStatus, existingDrawnBy, existingRevAt];
      });
      sheet.getRange(2, 1, newRows.length, 7).setValues(newRows);
    }
    sheet.getRange(1, 6).setValue('drawn_by');
  }

  let logSheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!logSheet) {
    logSheet = ss.insertSheet(LOG_SHEET_NAME);
    const logHeaders = ['timestamp', 'action', 'card_letter', 'details'];
    logSheet.getRange(1, 1, 1, logHeaders.length).setValues([logHeaders]);
    logSheet.getRange(1, 1, 1, logHeaders.length)
      .setFontWeight('bold')
      .setBackground('#0f172a')
      .setFontColor('#f8fafc');
    logSheet.setFrozenRows(1);
  }

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty(ADMIN_PASS_PROP)) {
    props.setProperty(ADMIN_PASS_PROP, DEFAULT_ADMIN_PASS);
  }

  return sheet;
}

function logActivity_(action, cardLetter, details) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;
    const logSheet = ss.getSheetByName(LOG_SHEET_NAME);
    if (!logSheet) return;
    const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
    logSheet.appendRow([now, action, cardLetter || '-', details || '']);
  } catch (err) {
    // non-blocking log
  }
}

/**
 * Helper to compute current chain state from sheet & properties.
 */
function getChainState_(data, props) {
  const allParticipants = [];
  const drawnBySet = {};
  let usedCount = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[1]) continue;
    const emp = String(row[3] || '').trim();
    if (emp && allParticipants.indexOf(emp) === -1) {
      allParticipants.push(emp);
    }
    const status = String(row[4] || 'AVAILABLE').trim().toUpperCase();
    const drawnBy = String(row[5] || '').trim();
    if (status !== 'AVAILABLE') {
      usedCount++;
      if (drawnBy) drawnBySet[drawnBy] = true;
    }
  }

  let chainStarter = String(props.getProperty(CHAIN_STARTER_PROP) || '').trim();
  let currentDrawer = String(props.getProperty(CHAIN_CURRENT_PROP) || '').trim();

  if (usedCount === 0) {
    if (chainStarter && allParticipants.indexOf(chainStarter) === -1) {
      chainStarter = '';
      currentDrawer = '';
      props.deleteProperty(CHAIN_STARTER_PROP);
      props.deleteProperty(CHAIN_CURRENT_PROP);
    }
  } else if (usedCount >= allParticipants.length) {
    currentDrawer = '';
  }

  return {
    allParticipants: allParticipants,
    chainStarter: chainStarter,
    currentDrawer: currentDrawer,
    usedCount: usedCount,
    totalCount: allParticipants.length,
    isFinished: usedCount >= allParticipants.length && allParticipants.length > 0
  };
}

/**
 * PUBLIC API: Returns ONLY card_id, card_letter, theme, public status,
 * AND the current chain turn info (WITHOUT exposing which card belongs to whom!).
 */
function getPublicCards() {
  const sheet = ensureSheetSetup_();
  const data = sheet.getDataRange().getValues();
  const props = PropertiesService.getScriptProperties();
  const cards = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[1]) continue;
    const rawStatus = String(row[4] || 'AVAILABLE').toUpperCase();
    const isAvailable = (rawStatus === 'AVAILABLE');
    cards.push({
      card_id: row[0],
      card_letter: String(row[1]).trim(),
      theme: String(row[2] || ''),
      status: isAvailable ? 'AVAILABLE' : 'LOCKED'
    });
  }

  const chain = getChainState_(data, props);

  return {
    ok: true,
    cards: cards,
    chain: chain,
    serverTime: new Date().toISOString()
  };
}

/**
 * PUBLIC API: Sets the very first drawer (Starter) when 0 cards have been opened.
 */
function setFirstDrawer(starterName) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cleanStarter = String(starterName || '').trim();
    const sheet = ensureSheetSetup_();
    const data = sheet.getDataRange().getValues();
    const props = PropertiesService.getScriptProperties();
    const chain = getChainState_(data, props);

    if (chain.usedCount > 0) {
      return {
        ok: false,
        message: 'เกมเริ่มไปแล้ว ไม่สามารถเปลี่ยนคนเริ่มคนแรกได้ (ตอนนี้เป็นคิวของ ' + chain.currentDrawer + ')'
      };
    }

    if (chain.allParticipants.indexOf(cleanStarter) === -1) {
      return {
        ok: false,
        message: 'ไม่พบรายชื่อนี้ในระบบ'
      };
    }

    props.setProperty(CHAIN_STARTER_PROP, cleanStarter);
    props.setProperty(CHAIN_CURRENT_PROP, cleanStarter);
    logActivity_('SET_STARTER', '-', 'First drawer set to: ' + cleanStarter);

    return getPublicCards();
  } finally {
    lock.releaseLock();
  }
}

/**
 * PUBLIC API: Atomically opens a card for the current drawer, guarantees NO premature loop
 * and NO self-draw (Single Hamiltonian Cycle), locks the card, and advances the turn
 * to the revealed gift owner!
 */
function openAndLockCard(cardLetter, drawerNameFromClient) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return {
      ok: false,
      code: 'BUSY',
      message: 'ระบบกำลังประมวลผลผู้เล่นท่านอื่น กรุณาลองอีกครั้งในอีกสักครู่'
    };
  }

  try {
    const cleanLetter = String(cardLetter || '').trim().toUpperCase();
    const sheet = ensureSheetSetup_();
    const data = sheet.getDataRange().getValues();
    const props = PropertiesService.getScriptProperties();
    const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');

    const chain = getChainState_(data, props);
    let activeDrawer = chain.currentDrawer || String(drawerNameFromClient || '').trim();

    if (!activeDrawer) {
      return {
        ok: false,
        code: 'NO_DRAWER',
        message: 'กรุณาเลือกชื่อ "คนแรกที่จะเริ่มจับ" ก่อนเปิดไพ่ใบแรกครับ'
      };
    }

    let starterName = chain.chainStarter;
    if (chain.usedCount === 0) {
      starterName = activeDrawer;
      props.setProperty(CHAIN_STARTER_PROP, starterName);
      props.setProperty(CHAIN_CURRENT_PROP, activeDrawer);
    }

    const availableRows = [];
    const alreadyDrawnSet = {};
    let chosenIdxInAvailable = -1;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const letter = String(row[1] || '').trim().toUpperCase();
      if (!letter) continue;
      const status = String(row[4] || 'AVAILABLE').trim().toUpperCase();
      const emp = String(row[3] || '').trim();
      const drawnBy = String(row[5] || '').trim();

      if (status !== 'AVAILABLE') {
        if (drawnBy) alreadyDrawnSet[drawnBy] = true;
      } else {
        const item = {
          rowIndex: i + 1,
          cardId: row[0],
          letter: letter,
          theme: String(row[2] || ''),
          employee: emp
        };
        if (letter === cleanLetter) {
          chosenIdxInAvailable = availableRows.length;
        }
        availableRows.push(item);
      }
    }

    alreadyDrawnSet[activeDrawer] = true;

    if (chosenIdxInAvailable === -1) {
      return {
        ok: false,
        code: 'ALREADY_USED',
        message: 'การ์ดใบนี้ถูกเปิดและล็อกไปแล้ว กรุณาเลือกการ์ดใบอื่น'
      };
    }

    const chosenCard = availableRows[chosenIdxInAvailable];
    const remainingCount = availableRows.length;

    const isCandidateValid = function(candidateName) {
      if (!candidateName) return false;
      if (candidateName === activeDrawer) return false;
      if (remainingCount > 1) {
        if (candidateName === starterName) return false;
        if (alreadyDrawnSet[candidateName]) return false;
      }
      return true;
    };

    if (!isCandidateValid(chosenCard.employee)) {
      const validSwapIndices = [];
      for (let k = 0; k < availableRows.length; k++) {
        if (k !== chosenIdxInAvailable && isCandidateValid(availableRows[k].employee)) {
          validSwapIndices.push(k);
        }
      }

      if (validSwapIndices.length === 0) {
        for (let k = 0; k < availableRows.length; k++) {
          if (k !== chosenIdxInAvailable && availableRows[k].employee !== activeDrawer) {
            validSwapIndices.push(k);
          }
        }
      }

      if (validSwapIndices.length > 0) {
        const swapIdx = validSwapIndices[Math.floor(Math.random() * validSwapIndices.length)];
        const swapTarget = availableRows[swapIdx];

        const tempEmp = chosenCard.employee;
        chosenCard.employee = swapTarget.employee;
        swapTarget.employee = tempEmp;

        sheet.getRange(swapTarget.rowIndex, 4).setValue(swapTarget.employee);
        sheet.getRange(chosenCard.rowIndex, 4).setValue(chosenCard.employee);
      }
    }

    const revealedOwner = chosenCard.employee;

    sheet.getRange(chosenCard.rowIndex, 5).setValue('LOCKED');
    sheet.getRange(chosenCard.rowIndex, 6).setValue(activeDrawer);
    sheet.getRange(chosenCard.rowIndex, 7).setValue(now);

    const isFinalCard = (remainingCount === 1);
    const nextDrawer = isFinalCard ? '' : revealedOwner;
    props.setProperty(CHAIN_CURRENT_PROP, nextDrawer);

    SpreadsheetApp.flush();

    logActivity_(
      'REVEAL_AND_LOCK',
      cleanLetter,
      activeDrawer + ' ได้รับของขวัญจาก ' + revealedOwner + (isFinalCard ? ' (ครบทุกคน จบวงจรสมบูรณ์!)' : ' -> คนจับต่อไป: ' + nextDrawer)
    );

    const updatedData = sheet.getDataRange().getValues();
    const updatedChain = getChainState_(updatedData, props);

    return {
      ok: true,
      card: {
        card_id: chosenCard.cardId,
        card_letter: cleanLetter,
        theme: chosenCard.theme,
        employee_name: revealedOwner,
        drawn_by: activeDrawer,
        next_drawer: nextDrawer,
        is_final_card: isFinalCard,
        chain_starter: starterName,
        status: 'LOCKED',
        revealed_at: now
      },
      chain: updatedChain
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Verifies admin password against ScriptProperties.
 */
function checkAdminAuth_(password) {
  const props = PropertiesService.getScriptProperties();
  const savedPass = props.getProperty(ADMIN_PASS_PROP) || DEFAULT_ADMIN_PASS;
  return String(password || '').trim() === String(savedPass).trim();
}

/**
 * ADMIN API: Login & get full dashboard data.
 */
function adminGetDashboard(password) {
  if (!checkAdminAuth_(password)) {
    return { ok: false, message: 'รหัสผ่าน Admin ไม่ถูกต้อง (ค่าเริ่มต้น: JCW2026)' };
  }

  const sheet = ensureSheetSetup_();
  const data = sheet.getDataRange().getValues();
  const props = PropertiesService.getScriptProperties();
  const cards = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[1]) continue;
    cards.push({
      card_id: row[0],
      card_letter: String(row[1]).trim(),
      theme: String(row[2] || ''),
      employee_name: String(row[3] || ''),
      status: String(row[4] || 'AVAILABLE').toUpperCase(),
      drawn_by: row[5] ? String(row[5]) : '',
      revealed_at: row[6] ? String(row[6]) : ''
    });
  }

  return {
    ok: true,
    cards: cards,
    chain: getChainState_(data, props)
  };
}

/**
 * ADMIN API: Update single card (employee name and/or status).
 */
function adminUpdateCard(password, cardLetter, employeeName, newStatus) {
  if (!checkAdminAuth_(password)) {
    return { ok: false, message: 'รหัสผ่าน Admin ไม่ถูกต้อง' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cleanLetter = String(cardLetter || '').trim().toUpperCase();
    const sheet = ensureSheetSetup_();
    const data = sheet.getDataRange().getValues();
    const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]).trim().toUpperCase() === cleanLetter) {
        const rowIndex = i + 1;
        if (employeeName !== undefined && employeeName !== null) {
          sheet.getRange(rowIndex, 4).setValue(String(employeeName).trim());
        }
        if (newStatus) {
          const normStatus = String(newStatus).trim().toUpperCase();
          sheet.getRange(rowIndex, 5).setValue(normStatus);
          if (normStatus === 'AVAILABLE') {
            sheet.getRange(rowIndex, 6).setValue('');
            sheet.getRange(rowIndex, 7).setValue('');
          } else if (!data[i][6]) {
            sheet.getRange(rowIndex, 7).setValue(now);
          }
        }
        SpreadsheetApp.flush();
        logActivity_('ADMIN_UPDATE_CARD', cleanLetter, 'Updated name/status to ' + newStatus);
        return adminGetDashboard(password);
      }
    }
    return { ok: false, message: 'ไม่พบการ์ด ' + cleanLetter };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ADMIN API: Bulk update all 14 employee names at once.
 */
function adminBulkUpdateNames(password, namesList) {
  if (!checkAdminAuth_(password)) {
    return { ok: false, message: 'รหัสผ่าน Admin ไม่ถูกต้อง' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = ensureSheetSetup_();
    const data = sheet.getDataRange().getValues();
    const cleanNames = Array.isArray(namesList) ? namesList.map(n => String(n || '').trim()) : [];

    for (let i = 1; i < data.length && (i - 1) < cleanNames.length; i++) {
      if (cleanNames[i - 1]) {
        sheet.getRange(i + 1, 4).setValue(cleanNames[i - 1]);
      }
    }
    SpreadsheetApp.flush();
    logActivity_('ADMIN_BULK_NAMES', 'ALL', 'Updated employee names list');
    return adminGetDashboard(password);
  } finally {
    lock.releaseLock();
  }
}

/**
 * ADMIN API: Reset all cards back to AVAILABLE and clear the chain turn state.
 */
function adminResetAllCards(password) {
  if (!checkAdminAuth_(password)) {
    return { ok: false, message: 'รหัสผ่าน Admin ไม่ถูกต้อง' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = ensureSheetSetup_();
    const lastRow = sheet.getLastRow();
    for (let r = 2; r <= lastRow; r++) {
      sheet.getRange(r, 5).setValue('AVAILABLE');
      sheet.getRange(r, 6).setValue('');
      sheet.getRange(r, 7).setValue('');
    }
    const props = PropertiesService.getScriptProperties();
    props.deleteProperty(CHAIN_STARTER_PROP);
    props.deleteProperty(CHAIN_CURRENT_PROP);

    SpreadsheetApp.flush();
    logActivity_('ADMIN_RESET_ALL', 'ALL', 'Reset all cards to AVAILABLE & cleared chain state');
    return adminGetDashboard(password);
  } finally {
    lock.releaseLock();
  }
}

/**
 * ADMIN API: Randomly shuffle employee_name mapping across cards on the backend.
 */
function adminShuffleMapping(password, onlyAvailable) {
  if (!checkAdminAuth_(password)) {
    return { ok: false, message: 'รหัสผ่าน Admin ไม่ถูกต้อง' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = ensureSheetSetup_();
    const data = sheet.getDataRange().getValues();
    const targetRows = [];
    const namesPool = [];

    for (let i = 1; i < data.length; i++) {
      const status = String(data[i][4] || 'AVAILABLE').toUpperCase();
      if (!onlyAvailable || status === 'AVAILABLE') {
        targetRows.push(i + 1);
        namesPool.push(String(data[i][3] || '').trim());
      }
    }

    for (let i = namesPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = namesPool[i];
      namesPool[i] = namesPool[j];
      namesPool[j] = temp;
    }

    for (let k = 0; k < targetRows.length; k++) {
      const r = targetRows[k];
      sheet.getRange(r, 4).setValue(namesPool[k]);
      if (!onlyAvailable) {
        sheet.getRange(r, 5).setValue('AVAILABLE');
        sheet.getRange(r, 6).setValue('');
        sheet.getRange(r, 7).setValue('');
      }
    }

    if (!onlyAvailable) {
      const props = PropertiesService.getScriptProperties();
      props.deleteProperty(CHAIN_STARTER_PROP);
      props.deleteProperty(CHAIN_CURRENT_PROP);
    }

    SpreadsheetApp.flush();
    logActivity_('ADMIN_SHUFFLE_MAPPING', onlyAvailable ? 'AVAILABLE_ONLY' : 'ALL', 'Shuffled card-to-employee mapping');
    return adminGetDashboard(password);
  } finally {
    lock.releaseLock();
  }
}
