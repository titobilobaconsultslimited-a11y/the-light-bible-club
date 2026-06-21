// =====================================================
// THE LIGHT BIBLE CLUB — Google Apps Script
// Paste this into Extensions > Apps Script in your
// Google Sheet, then deploy as a Web App.
// =====================================================

// Change this to your email address to receive notifications
const NOTIFICATION_EMAIL = "lightspeechconsults@gmail.com";

const SHEET_REGISTRATIONS = "Registrations";
const SHEET_CONTACT = "ContactMessages";

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = JSON.parse(e.postData.contents);
    
    // Determine form type based on fields
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
          "School Grade", "Parent Name", "Relationship", "Parent Email", 
          "Parent Phone", "Country", "How Heard", "Medical Notes"
        ]);
      }
      
      const rowData = [
        new Date().toLocaleString(),   // Timestamp
        data.childFirstName  || "",
        data.childLastName   || "",
        data.childAge        || "",
        data.childGender     || "",
        data.schoolGrade     || "",
        data.parentName      || "",
        data.parentRelation  || "",
        data.parentEmail     || "",
        data.parentPhone     || "",
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
                `- School Grade: ${data.schoolGrade}\n\n` +
                `PARENT/GUARDIAN DETAILS:\n` +
                `- Name: ${data.parentName} (${data.parentRelation})\n` +
                `- Email: ${data.parentEmail}\n` +
                `- Phone: ${data.parentPhone}\n` +
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

// Allow cross-origin requests from your site
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "ok" }))
    .setMimeType(ContentService.MimeType.JSON);
}
