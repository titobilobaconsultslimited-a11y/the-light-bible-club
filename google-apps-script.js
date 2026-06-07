// =====================================================
// THE LIGHT BIBLE CLUB — Google Apps Script
// Paste this into Extensions > Apps Script in your
// Google Sheet, then deploy as a Web App.
// =====================================================

const SHEET_NAME = "Registrations";

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName(SHEET_NAME);

    const data = JSON.parse(e.postData.contents);

    sheet.appendRow([
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
    ]);

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
