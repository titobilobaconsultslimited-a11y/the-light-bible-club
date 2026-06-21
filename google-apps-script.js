// =====================================================
// THE LIGHT BIBLE CLUB — Google Apps Script
// Paste this into Extensions > Apps Script in your
// Google Sheet, then deploy as a Web App.
// =====================================================

// Change this to your email address to receive notifications
const NOTIFICATION_EMAIL = "lightspeechconsults@gmail.com";

const SHEET_REGISTRATIONS = "Registrations";
const SHEET_CONTACT = "ContactMessages";
const SHEET_ATTENDANCE = "Attendance";
const SHEET_ASSIGNMENTS = "Assignments";

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = JSON.parse(e.postData.contents);
    
    // Determine action
    const action = data.action;
    
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
    
    // Default action: return all dashboard data
    const registrationsSheet = ss.getSheetByName(SHEET_REGISTRATIONS);
    const attendanceSheet = ss.getSheetByName(SHEET_ATTENDANCE);
    const assignmentsSheet = ss.getSheetByName(SHEET_ASSIGNMENTS);
    
    const data = {
      registrations: [],
      attendance: [],
      assignments: []
    };
    
    if (registrationsSheet) {
      const rows = registrationsSheet.getDataRange().getValues();
      const headers = rows[0];
      for (let i = 1; i < rows.length; i++) {
        const item = { id: i }; // Row index is the unique ID
        headers.forEach((header, colIndex) => {
          const propName = toCamelCase(header);
          item[propName] = rows[i][colIndex];
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
    
    return ContentService
      .createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
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
