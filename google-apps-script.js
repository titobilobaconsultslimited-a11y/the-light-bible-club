// =====================================================
// THE LIGHT BIBLE CLUB — Google Apps Script
// Paste this into Extensions > Apps Script in your
// Google Sheet, then deploy as a Web App.
// Set ADMIN_EMAIL and a unique ADMIN_PASSWORD in Project Settings > Script Properties.
// =====================================================

// Change this to your email address to receive notifications
const NOTIFICATION_EMAIL = "thelightonlinebibleclub@gmail.com";

const SHEET_REGISTRATIONS = "Registrations";
const SHEET_CONTACT = "ContactMessages";
const SHEET_ATTENDANCE = "Attendance";
const SHEET_ASSIGNMENTS = "Assignments";
const SHEET_BIRTHDAY_EMAILS = "BirthdayEmailLog";
const ADMIN_SESSION_TTL_SECONDS = 21600;

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function isAdminAuthorized(token) {
  return Boolean(token && CacheService.getScriptCache().get(`admin_session_${token}`));
}

function getAdminData(ss) {
  const registrationsSheet = ss.getSheetByName(SHEET_REGISTRATIONS);
  const attendanceSheet = ss.getSheetByName(SHEET_ATTENDANCE);
  const assignmentsSheet = ss.getSheetByName(SHEET_ASSIGNMENTS);
  const data = { registrations: [], attendance: [], assignments: [], birthdayEmails: [] };

  if (registrationsSheet) {
    const rows = registrationsSheet.getDataRange().getValues();
    const headers = rows[0] || [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === "DELETED" || rows[i][0] === "") continue;
      const item = { id: i };
      headers.forEach((header, colIndex) => {
        item[toCamelCase(header)] = rows[i][colIndex];
      });
      data.registrations.push(item);
    }
  }

  if (attendanceSheet) {
    const rows = attendanceSheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      data.attendance.push({
        childId: rows[i][1],
        childName: rows[i][2],
        date: rows[i][3],
        status: rows[i][4]
      });
    }
  }

  if (assignmentsSheet) {
    const rows = assignmentsSheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      data.assignments.push({
        childId: rows[i][1],
        childName: rows[i][2],
        week: rows[i][3],
        status: rows[i][4]
      });
    }
  }

  const emailLog = ss.getSheetByName(SHEET_BIRTHDAY_EMAILS);
  if (emailLog && emailLog.getLastRow() > 1) {
    const rows = emailLog.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      data.birthdayEmails.push({ childId: Number(rows[i][1]), year: Number(rows[i][3]) });
    }
  }

  return data;
}

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = JSON.parse(e.postData.contents);
    
    // Determine action
    const action = data.action;

    if (action === "adminLogin") {
      const properties = PropertiesService.getScriptProperties();
      const adminEmail = properties.getProperty("ADMIN_EMAIL");
      const adminPassword = properties.getProperty("ADMIN_PASSWORD");
      if (!adminEmail || !adminPassword) {
        return jsonResponse({ result: "error", message: "Admin credentials are not configured." });
      }

      const emailMatches = String(data.email || "").trim().toLowerCase() === adminEmail.trim().toLowerCase();
      const passwordMatches = String(data.password || "") === adminPassword;
      if (!emailMatches || !passwordMatches) {
        return jsonResponse({ result: "error", message: "Invalid admin email or password." });
      }

      const token = Utilities.getUuid();
      CacheService.getScriptCache().put(`admin_session_${token}`, adminEmail, ADMIN_SESSION_TTL_SECONDS);
      return jsonResponse({ result: "success", token: token });
    }

    const adminActions = [
      "adminData", "addRegistration", "editRegistration", "deleteRegistration",
      "importRegistrations", "markAttendance", "markAssignment", "sendBirthdayEmail", "adminLogout"
    ];
    if (adminActions.indexOf(action) !== -1 && !isAdminAuthorized(data.authToken)) {
      return jsonResponse({ result: "error", message: "Admin session expired. Please sign in again." });
    }

    if (action === "adminData") {
      return jsonResponse(getAdminData(ss));
    }

    if (action === "adminLogout") {
      CacheService.getScriptCache().remove(`admin_session_${data.authToken}`);
      return jsonResponse({ result: "success" });
    }

    if (action === "sendBirthdayEmail") {
      const childId = Number(data.childId);
      const registrationsSheet = ss.getSheetByName(SHEET_REGISTRATIONS);
      const rowId = childId + 1;
      if (!registrationsSheet || !Number.isInteger(childId) || childId < 1 || rowId > registrationsSheet.getLastRow()) {
        return jsonResponse({ result: "error", message: "Registration not found." });
      }

      const headers = registrationsSheet.getRange(1, 1, 1, registrationsSheet.getLastColumn()).getValues()[0];
      const values = registrationsSheet.getRange(rowId, 1, 1, headers.length).getValues()[0];
      if (values[0] === "DELETED" || values[0] === "") {
        return jsonResponse({ result: "error", message: "Registration not found." });
      }
      const registration = {};
      headers.forEach((header, index) => {
        registration[toCamelCase(header)] = values[index];
      });

      const parentEmail = String(registration.parentEmail || "").trim();
      if (!parentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
        return jsonResponse({ result: "error", message: "A valid parent/guardian email address is not on file." });
      }

      const lock = LockService.getScriptLock();
      if (!lock.tryLock(10000)) {
        return jsonResponse({ result: "error", message: "Another birthday email is being processed. Please try again." });
      }

      try {
        let emailLog = ss.getSheetByName(SHEET_BIRTHDAY_EMAILS);
        if (!emailLog) {
          emailLog = ss.insertSheet(SHEET_BIRTHDAY_EMAILS);
          emailLog.appendRow(["Timestamp", "Child ID", "Child Name", "Birthday Year", "Parent Email"]);
        }

        const birthdayYear = Number(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy"));
        const logRows = emailLog.getDataRange().getValues();
        const alreadySent = logRows.slice(1).some(row => Number(row[1]) === childId && Number(row[3]) === birthdayYear);
        if (alreadySent) {
          return jsonResponse({ result: "error", message: "A birthday email has already been sent for this child this year." });
        }

        const childName = `${registration.childFirstName || ""} ${registration.childLastName || ""}`.trim();
        const parentName = registration.parentName || "Parent/Guardian";
        const firstName = registration.childFirstName || "your child";
        MailApp.sendEmail({
          to: parentEmail,
          subject: `Happy Birthday to ${firstName}!`,
          body: `Dear ${parentName},\n\nWishing ${firstName} a very happy birthday from everyone at The Light Bible Club! May their special day be filled with joy, love, and many blessings. We are grateful to have them as part of our club family.\n\nWith warm wishes,\nThe Light Bible Club`
        });
        emailLog.appendRow([new Date(), childId, childName, birthdayYear, parentEmail]);
        return jsonResponse({ result: "success" });
      } finally {
        lock.releaseLock();
      }
    }
    
    if (action === "addRegistration") {
      let sheet = ss.getSheetByName(SHEET_REGISTRATIONS);
      if (!sheet) {
        sheet = ss.insertSheet(SHEET_REGISTRATIONS);
        sheet.appendRow([
          "Timestamp", "Child First Name", "Child Last Name", "Age", "Gender", 
          "Date of Birth", "School Grade", "Parent Name", "Relationship", "Parent Email", 
          "Parent Mobile Line", "Parent WhatsApp Line", "Personal Paid Mentorship", "Country", 
          "How Heard", "Medical Notes"
        ]);
      }
      
      const rowData = [
        new Date().toLocaleString(),
        data.childFirstName || "",
        data.childLastName || "",
        data.childAge || "",
        data.childGender || "",
        data.childDOB || "",
        data.schoolGrade || "",
        data.parentName || "",
        data.parentRelation || "",
        data.parentEmail || "",
        data.parentMobile || "",
        data.parentWhatsApp || "",
        data.mentorship || "",
        data.country || "",
        data.howHeard || "",
        data.medicalNotes || ""
      ];
      
      sheet.appendRow(rowData);
      const newId = sheet.getLastRow();
      
      return ContentService.createTextOutput(JSON.stringify({ result: "success", id: newId })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "editRegistration") {
      let sheet = ss.getSheetByName(SHEET_REGISTRATIONS);
      const rowId = Number(data.id) + 1;
      
      if (!sheet || rowId <= 1 || rowId > sheet.getLastRow()) {
        return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "Invalid ID" })).setMimeType(ContentService.MimeType.JSON);
      }
      
      const values = [
        data.timestamp || new Date().toLocaleString(),
        data.childFirstName || "",
        data.childLastName || "",
        data.childAge || "",
        data.childGender || "",
        data.childDOB || "",
        data.schoolGrade || "",
        data.parentName || "",
        data.parentRelation || "",
        data.parentEmail || "",
        data.parentMobile || "",
        data.parentWhatsApp || "",
        data.mentorship || "",
        data.country || "",
        data.howHeard || "",
        data.medicalNotes || ""
      ];
      
      sheet.getRange(rowId, 1, 1, values.length).setValues([values]);
      
      return ContentService.createTextOutput(JSON.stringify({ result: "success" })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "deleteRegistration") {
      let sheet = ss.getSheetByName(SHEET_REGISTRATIONS);
      const rowId = Number(data.id) + 1;
      
      if (!sheet || rowId <= 1 || rowId > sheet.getLastRow()) {
        return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "Invalid ID" })).setMimeType(ContentService.MimeType.JSON);
      }
      
      sheet.getRange(rowId, 1).setValue("DELETED");
      
      return ContentService.createTextOutput(JSON.stringify({ result: "success" })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "importRegistrations") {
      let sheet = ss.getSheetByName(SHEET_REGISTRATIONS);
      if (!sheet) {
        sheet = ss.insertSheet(SHEET_REGISTRATIONS);
        sheet.appendRow([
          "Timestamp", "Child First Name", "Child Last Name", "Age", "Gender", 
          "Date of Birth", "School Grade", "Parent Name", "Relationship", "Parent Email", 
          "Parent Mobile Line", "Parent WhatsApp Line", "Personal Paid Mentorship", "Country", 
          "How Heard", "Medical Notes"
        ]);
      }
      
      const records = data.records;
      records.forEach(item => {
        sheet.appendRow([
          item.timestamp || new Date().toLocaleString(),
          item.childFirstName  || "",
          item.childLastName   || "",
          item.childAge        || "",
          item.childGender     || "",
          item.childDOB        || "",
          item.schoolGrade     || "",
          item.parentName      || "",
          item.parentRelation  || "",
          item.parentEmail     || "",
          item.parentMobile    || "",
          item.parentWhatsApp  || "",
          item.mentorship      || "",
          item.country         || "",
          item.howHeard        || "",
          item.medicalNotes    || ""
        ]);
      });
      
      return ContentService.createTextOutput(JSON.stringify({ result: "success", count: records.length })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "markAttendance") {
      let sheet = ss.getSheetByName(SHEET_ATTENDANCE);
      if (!sheet) {
        sheet = ss.insertSheet(SHEET_ATTENDANCE);
        sheet.appendRow(["Timestamp", "Child ID", "Child Name", "Date", "Status"]);
      }
      
      const dateStr = data.date;
      const childId = data.childId;
      const status = data.status;
      const childName = data.childName;
      
      const rows = sheet.getDataRange().getValues();
      let foundRow = -1;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][1] == childId && rows[i][3] == dateStr) {
          foundRow = i + 1;
          break;
        }
      }
      
      if (foundRow > -1) {
        sheet.getRange(foundRow, 5).setValue(status);
      } else {
        sheet.appendRow([new Date().toLocaleString(), childId, childName, dateStr, status]);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ result: "success" })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "markAssignment") {
      let sheet = ss.getSheetByName(SHEET_ASSIGNMENTS);
      if (!sheet) {
        sheet = ss.insertSheet(SHEET_ASSIGNMENTS);
        sheet.appendRow(["Timestamp", "Child ID", "Child Name", "Week", "Status"]);
      }
      
      const weekStr = data.week;
      const childId = data.childId;
      const status = data.status;
      const childName = data.childName;
      
      const rows = sheet.getDataRange().getValues();
      let foundRow = -1;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][1] == childId && rows[i][3] == weekStr) {
          foundRow = i + 1;
          break;
        }
      }
      
      if (foundRow > -1) {
        sheet.getRange(foundRow, 5).setValue(status);
      } else {
        sheet.appendRow([new Date().toLocaleString(), childId, childName, weekStr, status]);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ result: "success" })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Default action: handle normal form submissions (registration or contact)
    const isContactForm = data.contactName !== undefined;
    
    if (isContactForm) {
      // 1. Get or Create ContactMessages sheet
      let sheet = ss.getSheetByName(SHEET_CONTACT);
      if (!sheet) {
        sheet = ss.insertSheet(SHEET_CONTACT);
        sheet.appendRow(["Timestamp", "Name", "Email", "Subject", "Message"]);
      }
      
      const rowData = [
        new Date().toLocaleString(),
        data.contactName || "",
        data.contactEmail || "",
        data.contactSubject || "",
        data.contactMessage || ""
      ];
      
      sheet.appendRow(rowData);
      
      // 2. Send email notification
      if (NOTIFICATION_EMAIL) {
        MailApp.sendEmail({
          to: NOTIFICATION_EMAIL,
          subject: `New Contact Message: ${data.contactSubject || 'No Subject'}`,
          body: `You have received a new contact message from the website:\n\n` +
                `Name: ${data.contactName}\n` +
                `Email: ${data.contactEmail}\n` +
                `Subject: ${data.contactSubject}\n` +
                `Message: ${data.contactMessage}\n\n` +
                `This message was saved to the "${SHEET_CONTACT}" sheet.`
        });
      }
      
    } else {
      // 1. Get or Create Registrations sheet
      let sheet = ss.getSheetByName(SHEET_REGISTRATIONS);
      if (!sheet) {
        sheet = ss.insertSheet(SHEET_REGISTRATIONS);
        sheet.appendRow([
          "Timestamp", "Child First Name", "Child Last Name", "Age", "Gender", 
          "Date of Birth", "School Grade", "Parent Name", "Relationship", "Parent Email", 
          "Parent Mobile Line", "Parent WhatsApp Line", "Personal Paid Mentorship", "Country", 
          "How Heard", "Medical Notes"
        ]);
      }
      
      const rowData = [
        new Date().toLocaleString(),   // Timestamp
        data.childFirstName  || "",
        data.childLastName   || "",
        data.childAge        || "",
        data.childGender     || "",
        data.childDOB        || "",
        data.schoolGrade     || "",
        data.parentName      || "",
        data.parentRelation  || "",
        data.parentEmail     || "",
        data.parentMobile    || "",
        data.parentWhatsApp  || "",
        data.mentorship      || "",
        data.country         || "",
        data.howHeard        || "",
        data.medicalNotes    || ""
      ];
      
      sheet.appendRow(rowData);
      
      // 2. Send email notification
      if (NOTIFICATION_EMAIL) {
        MailApp.sendEmail({
          to: NOTIFICATION_EMAIL,
          subject: `New Bible Club Registration: ${data.childFirstName} ${data.childLastName}`,
          body: `A new child has been registered for The Light Bible Club!\n\n` +
                `CHILD DETAILS:\n` +
                `- Name: ${data.childFirstName} ${data.childLastName}\n` +
                `- Age: ${data.childAge}\n` +
                `- Gender: ${data.childGender}\n` +
                `- Date of Birth: ${data.childDOB}\n` +
                `- School Grade: ${data.schoolGrade}\n\n` +
                `PARENT/GUARDIAN DETAILS:\n` +
                `- Name: ${data.parentName} (${data.parentRelation})\n` +
                `- Email: ${data.parentEmail}\n` +
                `- Mobile: ${data.parentMobile}\n` +
                `- WhatsApp: ${data.parentWhatsApp}\n` +
                `- Paid Mentorship Requested: ${data.mentorship}\n` +
                `- Country: ${data.country}\n\n` +
                `ADDITIONAL INFO:\n` +
                `- How they heard: ${data.howHeard || 'N/A'}\n` +
                `- Medical/Special Needs: ${data.medicalNotes || 'None'}\n\n` +
                `This registration was saved to the "${SHEET_REGISTRATIONS}" sheet.`
        });
      }
    }

    return ContentService
      .createTextOutput(JSON.stringify({ result: "success" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: "error", message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (action === "todayBirthdays") {
      const sheet = ss.getSheetByName(SHEET_REGISTRATIONS);
      if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
      
      const rows = sheet.getDataRange().getValues();
      const headers = rows[0];
      const dobColIndex = headers.indexOf("Date of Birth");
      const firstNameColIndex = headers.indexOf("Child First Name");
      
      if (dobColIndex === -1 || firstNameColIndex === -1) {
        return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
      }
      
      const today = new Date();
      const todayMonth = today.getMonth(); // 0-based
      const todayDate = today.getDate();
      
      const celebrants = [];
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === "DELETED" || rows[i][0] === "") continue;
        const dobVal = rows[i][dobColIndex];
        if (dobVal) {
          const dob = new Date(dobVal);
          if (!isNaN(dob.getTime())) {
            if (dob.getMonth() === todayMonth && dob.getDate() === todayDate) {
              celebrants.push(rows[i][firstNameColIndex]);
            }
          }
        }
      }
      
      return ContentService
        .createTextOutput(JSON.stringify(celebrants))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return jsonResponse({ result: "error", message: "Use the authenticated admin session." });
      
  } catch (err) {
    return jsonResponse({ result: "error", message: err.message });
  }
}

function toCamelCase(str) {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
    })
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9]/g, '');
}
