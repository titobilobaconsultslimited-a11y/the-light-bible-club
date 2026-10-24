require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 15000
});

// Month map for dates
const MONTHS = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12'
};

function cleanPhone(phone) {
  if (!phone) return '';
  let str = String(phone).trim();
  if (str.includes('E') || str.includes('e')) {
    const num = Number(str);
    if (!isNaN(num)) {
      str = Math.round(num).toString();
      if (str.length === 10) str = '0' + str;
    }
  }
  return str.replace(/\s+/g, ' ');
}

function cleanText(val) {
  return String(val || '').trim().replace(/\s+/g, ' ');
}

function excelSerialToDate(serial) {
  if (!serial) return new Date();
  const num = parseFloat(serial);
  if (isNaN(num)) return new Date();
  const ms = Math.round((num - 25569) * 86400 * 1000);
  return new Date(ms);
}

function parseDob(dobStr, approxAge = 8, refYear = 2026) {
  if (!dobStr) return null;
  let str = dobStr.toLowerCase().trim()
    .replace(/(\d+)(st|nd|rd|th)/g, '$1')
    .replace(/[,\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    let [_, p1, p2, yr] = m;
    let day = parseInt(p1, 10);
    let month = parseInt(p2, 10);
    if (day <= 12 && month > 12) {
      [day, month] = [month, day];
    }
    return `${yr}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  m = str.match(/^(\d{1,2})[\/\-]0?1(\d{4})$/);
  if (m) {
    return `${m[2]}-01-${String(m[1]).padStart(2, '0')}`;
  }

  m = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }

  m = str.match(/^(\d{1,2})[\/\)\-](\d{1,2})(?:[\/\-](\d{4}))?$/);
  if (m) {
    let day = parseInt(m[1], 10);
    let month = parseInt(m[2], 10);
    let yr = m[3] ? parseInt(m[3], 10) : (refYear - (approxAge || 8));
    return `${yr}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  for (const [name, mm] of Object.entries(MONTHS)) {
    if (str.includes(name)) {
      const nums = str.match(/\d+/g);
      let day = 1;
      let yr = refYear - (approxAge || 8);
      if (nums) {
        if (nums.length >= 2) {
          const n1 = parseInt(nums[0], 10);
          const n2 = parseInt(nums[1], 10);
          if (n2 > 1900 && n2 < 2030) {
            day = n1;
            yr = n2;
          } else if (n1 > 1900 && n1 < 2030) {
            yr = n1;
            day = n2;
          } else {
            day = n1;
          }
        } else if (nums.length === 1) {
          const n = parseInt(nums[0], 10);
          if (n <= 31) day = n;
        }
      }
      return `${yr}-${mm}-${String(day).padStart(2, '0')}`;
    }
  }

  return `${refYear - (approxAge || 8)}-01-01`;
}

function parseAge(ageStr) {
  if (!ageStr) return 7;
  const str = String(ageStr).toLowerCase().trim();
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  for (const [w, val] of Object.entries(words)) {
    if (str.includes(w)) return val;
  }
  const m = str.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  return 7;
}

function deduceGrade(age) {
  if (!age || age < 4) return 'Toddler / Nursery';
  if (age <= 5) return 'Reception / KG';
  if (age === 6) return 'Grade 1';
  if (age === 7) return 'Grade 2';
  if (age === 8) return 'Grade 3';
  if (age === 9) return 'Grade 4';
  if (age === 10) return 'Grade 5';
  if (age === 11) return 'Grade 6 / Year 7';
  return 'Middle School / JSS 1';
}

function deduceGender(name) {
  const n = String(name).toLowerCase();
  const boys = ['daniel', 'dominic', 'michael', 'samuel', 'david', 'joshua', 'enoch', 'abraham', 'zuriel', 'ademola', 'fiyinfoluwa', 'tobiloba', 'marvin', 'eli', 'elliot', 'othniel', 'jesse', 'brian', 'kamsy', 'kamsiriochukwu', 'king-david', 'nathaniel', 'caleb', 'kaito', 'oluwasetemi'];
  const girls = ['dorcas', 'mercy', 'emmanuella', 'elizabeth', 'joanna', 'moyoninuoluwa', 'erifeoluwa', 'rebecca', 'flora', 'daniella', 'elyana', 'arinola', 'oluwsanmisire', 'toluwanimi', 'deborah', 'viola', 'jemimah', 'abimbola', 'mojolaoluwa', 'princess', 'chloe', 'benita', 'mary', 'emmanella', 'emelia', 'joan', 'jasmine'];
  for (const b of boys) if (n.includes(b)) return 'Boy';
  for (const g of girls) if (n.includes(g)) return 'Girl';
  return 'Child';
}

function deriveParentName(email, childLastName) {
  const PARENT_NAMES = {
    'yommiefatore@gmail.com': 'Yommie Fatore',
    'comfydom2016@gmail.com': 'Comfort Dominic',
    'afamodun88@gmai.com': 'Afamodun Oni',
    'ritaeweje@gmail.com': 'Rita Eweje',
    'itunukolapo27@gmail.com': 'Itunu Kolapo',
    'ogunleyefolashade1505@gmail.com': 'Folashade Ogunleye',
    'titobilobaconsultslimited@gmail.com': 'Titobiloba',
    'okeomowunmi19@yahoo.com': 'Omowunmi Oke',
    'omogwefe@yahoo.com': 'Mrs. Harrison-Omogwefe',
    'esthereniolataiwo@gmail.com': 'Esther Taiwo',
    'edimercy1295@gmail.com': 'Mercy Edi',
    'ifeoluwaoshinowo@gmail.com': 'Ifeoluwa Oshinowo',
    'kofocole07@gmail.com': 'Kofo Cole',
    'hollarh12@gmail.com': 'Mrs. Afolabi',
    'bklolubayode@gmail.com': 'Mrs. Olubayode',
    'ruthndedigwe@gmail.com': 'Ruth Ndedigwe',
    'olusolaakintayo32@gmail.com': 'Olusola Akintayo',
    'sinmile17@gmail.com': 'Sinmile Oyero',
    'kennynaija200@yahoo.com': 'Kenny Salami',
    'yettymee2006@gmail.com': 'Yetunde Adebose',
    'olamilekanajulo96@gmail.com': 'Olamilekan Ajulo',
    'shenaikeomolola@gmail.com': 'Omolola Shenaike',
    'josephaderonkeabiodun@gmail.com': 'Aderonke Joseph',
    'debbytalk2me@gmail.com': 'Deborah Olayiwola',
    'otitolayetoluse@gmail.com': 'Toluse Otitolaye',
    's.adebimpe6@gmail.com': 'Adebimpe Solarin',
    'adedolapo.asabi@gmail.com': 'Adedolapo Adeniji',
    'oluwatosinpeters02@gmail.com': 'Oluwatosin Peters',
    'temitopequadri427@gmail.com': 'Temitope Quadri',
    'akinwaleabidemi77@gmail.com': 'Abidemi Akinwale',
    'aanuoluwasefunmi@gmail.com': 'Aanuoluwasefunmi Onalo',
    'faithademiluyi@gmail.com': 'Faith Ademiluyi',
    'idebbylive@gmail.com': 'Debby Salako',
    'olabimpeadenike43@gmail.com': 'Adenike Adebayo',
    'bernardolamide1234@gmail.com': 'Olamide Bernard',
    'oluwatosinajayi1986@gmail.com': 'Oluwatosin Ajayi',
    'officialhopeebiriene10@gmail.com': 'Hope Ebiriene',
    'hannahigwe94@gmail.com': 'Hannah Igwe',
    'ayonife333@gmail.com': 'Ayonife Adeoye',
    'jummytriumph93@gmail.com': 'Jumoke Lawrence',
    'oluwaseyi.jawando@gmail.com': 'Oluwaseyi Jawando',
    'farinloyeag@gmail.com': 'Mrs. Farinloye',
    'abdulzaynab96@gmail.com': 'Zaynab Abdul',
    'ojarikrejusty@yahoo.com': 'Justin Ojarikre',
    'carolinekings321@gmail.com': 'Caroline Kings',
    'adedayomary18@gmail.com': 'Mary Adedayo',
    'bukolaakindele830@gmail.com': 'Bukola Akindele',
    'victra222@gmail.com': 'Victoria Adigwe',
    'talk2ritzy@yahoo.com': 'Rita Chukwu',
    'blessinganurika46@gmail.com': 'Blessing Anurika',
    'titilayomodupe1@gmail.com': 'Titilayo Modupe',
    'ifeoluwapelumi78@gmail.com': 'Ifeoluwa Pelumi',
    'ujumomah2001@yahoo.com': 'Uju Momah',
    'funmiopawale01@gmail.com': 'Funmi Opawale',
    'jesseeichie@gmail.com': 'Jesse Eichie',
    'omolaraolojede9@gmail.com': 'Omolara Olojede',
    'maryakande0304@gmail.com': 'Mary Akande',
    'emegharajustina@gmail.com': 'Justina Emeghara',
    'preciousoluwapelumi@gmail.com': 'Precious Oluwapelumi',
    'adaogba85@gmail.com': 'Ada Ogba',
    'adetolasoye@gmail.com': 'Adetola Soye',
    'ogbeoladunni14@gmail.com': 'Oladunni Ogbe',
    'beauttariusservices@gmail.com': 'Mrs. Peter',
    'faromofaith@gmail.com': 'Faith Faromo',
    'mosede201@gmail.com': 'Mosede Omorogbe',
    'aduniay3@gmail.com': 'Adunni Afuye',
    'josephabimbolav@gmail.com': 'Abimbola Joseph',
    'kachy2ohabs@gmail.com': 'Kachy Ohabs',
    'oluwadamilolaasunbo@gmail.com': 'Damilola Asunbo'
  };

  if (email && PARENT_NAMES[email.toLowerCase()]) {
    return PARENT_NAMES[email.toLowerCase()];
  }

  if (email) {
    const prefix = email.split('@')[0];
    const cleanEmailName = prefix
      .replace(/[0-9_\.\-]+/g, ' ')
      .trim()
      .split(' ')
      .filter(s => s.length > 1)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ');
    if (cleanEmailName && cleanEmailName.length >= 3) return cleanEmailName;
  }

  return childLastName ? `${childLastName} Family` : 'Parent / Guardian';
}

function cleanCountry(loc) {
  if (!loc) return 'Nigeria';
  const l = loc.toLowerCase();
  if (l.includes('uk') || l.includes('london') || l.includes('bristol') || l.includes('sheffield') || l.includes('chesterfield') || l.includes('wales') || l.includes('england') || l.includes('kent')) return 'United Kingdom';
  if (l.includes('ghana')) return 'Ghana';
  if (l.includes('france')) return 'France';
  if (l.includes('usa') || l.includes('united states') || l.includes('alaska')) return 'United States';
  if (l.includes('canada') || l.includes('toronto')) return 'Canada';
  if (l.includes('lagos') || l.includes('ogun') || l.includes('abuja') || l.includes('akure') || l.includes('portharcourt') || l.includes('ondo') || l.includes('osun') || l.includes('ibadan') || l.includes('nigeria')) return 'Nigeria';
  return loc.trim();
}

async function main() {
  const rowsPath = path.join(__dirname, '..', 'Documents', 'extracted_rows.json');
  if (!fs.existsSync(rowsPath)) {
    throw new Error('Extracted rows file not found at: ' + rowsPath);
  }
  const rows = JSON.parse(fs.readFileSync(rowsPath, 'utf8'));
  console.log(`Loaded ${rows.length - 1} rows from Contact Information.`);

  const records = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = r._row;
    const rawName = cleanText(r.C);
    const rawDob = cleanText(r.D);
    const rawAge = cleanText(r.E);
    const email = cleanText(r.F || r.B).toLowerCase();
    const phone = cleanPhone(r.H);
    const location = cleanText(r.G);
    const country = cleanCountry(location);
    const mentorship = cleanText(r.I) || 'No';
    const prayer = cleanText(r.J);
    const timestamp = excelSerialToDate(r.A).toISOString();

    // Specific multi-child cases
    if (rowNum === 2) {
      const kids = [
        { first: 'Daniel', last: 'Fatore', age: 12, dob: '2013-10-27', gender: 'Boy', idx: 1 },
        { first: 'Dorcas', last: 'Fatore', age: 10, dob: '2015-09-08', gender: 'Girl', idx: 2 },
        { first: 'Mercy', last: 'Fatore', age: 8, dob: '2018-02-16', gender: 'Girl', idx: 3 },
        { first: 'Dominic', last: 'Fatore', age: 5, dob: '2020-09-22', gender: 'Boy', idx: 4 }
      ];
      for (const k of kids) {
        records.push({
          sourceRow: rowNum * 10 + k.idx,
          createdAt: timestamp,
          firstName: k.first,
          lastName: k.last,
          age: k.age,
          gender: k.gender,
          dateOfBirth: k.dob,
          schoolGrade: deduceGrade(k.age),
          parentName: 'Yommie Fatore',
          parentRelation: 'Parent / Guardian',
          parentEmail: email,
          parentMobile: phone,
          parentWhatsApp: phone,
          mentorship,
          country,
          howHeard: location,
          medicalNotes: prayer
        });
      }
      continue;
    }

    if (rowNum === 3) {
      records.push({
        sourceRow: rowNum * 10 + 1,
        createdAt: timestamp,
        firstName: 'Emmanuella',
        lastName: 'Dominic',
        age: 8,
        gender: 'Girl',
        dateOfBirth: '2017-03-08',
        schoolGrade: 'Grade 3',
        parentName: 'Comfort Dominic',
        parentRelation: 'Parent / Guardian',
        parentEmail: email,
        parentMobile: phone,
        parentWhatsApp: phone,
        mentorship,
        country,
        howHeard: location,
        medicalNotes: prayer
      });
      records.push({
        sourceRow: rowNum * 10 + 2,
        createdAt: timestamp,
        firstName: 'Elizabeth',
        lastName: 'Dominic',
        age: 5,
        gender: 'Girl',
        dateOfBirth: '2020-09-06',
        schoolGrade: 'Reception / KG',
        parentName: 'Comfort Dominic',
        parentRelation: 'Parent / Guardian',
        parentEmail: email,
        parentMobile: phone,
        parentWhatsApp: phone,
        mentorship,
        country,
        howHeard: location,
        medicalNotes: prayer
      });
      continue;
    }

    if (rowNum === 10) {
      records.push({
        sourceRow: rowNum * 10 + 1,
        createdAt: timestamp,
        firstName: 'Iredele',
        lastName: 'Sangoyinka',
        age: 6,
        gender: 'Child',
        dateOfBirth: '2019-06-15',
        schoolGrade: 'Grade 1',
        parentName: 'Eniola Sangoyinka',
        parentRelation: 'Parent / Guardian',
        parentEmail: email,
        parentMobile: phone,
        parentWhatsApp: phone,
        mentorship,
        country,
        howHeard: location,
        medicalNotes: prayer
      });
      records.push({
        sourceRow: rowNum * 10 + 2,
        createdAt: timestamp,
        firstName: 'Murewa',
        lastName: 'Sangoyinka',
        age: 3,
        gender: 'Child',
        dateOfBirth: '2022-03-08',
        schoolGrade: 'Toddler / Nursery',
        parentName: 'Eniola Sangoyinka',
        parentRelation: 'Parent / Guardian',
        parentEmail: email,
        parentMobile: phone,
        parentWhatsApp: phone,
        mentorship,
        country,
        howHeard: location,
        medicalNotes: prayer
      });
      continue;
    }

    if (rowNum === 14) {
      records.push({
        sourceRow: rowNum * 10 + 1,
        createdAt: timestamp,
        firstName: 'Micheal',
        lastName: 'Ighoghoja',
        age: 7,
        gender: 'Boy',
        dateOfBirth: '2018-09-17',
        schoolGrade: 'Grade 2',
        parentName: 'Ighoghoja Family',
        parentRelation: 'Parent / Guardian',
        parentEmail: email,
        parentMobile: phone,
        parentWhatsApp: phone,
        mentorship,
        country,
        howHeard: location,
        medicalNotes: prayer
      });
      records.push({
        sourceRow: rowNum * 10 + 2,
        createdAt: timestamp,
        firstName: 'Samuel',
        lastName: 'Ighoghoja',
        age: 6,
        gender: 'Boy',
        dateOfBirth: '2020-02-01',
        schoolGrade: 'Grade 1',
        parentName: 'Ighoghoja Family',
        parentRelation: 'Parent / Guardian',
        parentEmail: email,
        parentMobile: phone,
        parentWhatsApp: phone,
        mentorship,
        country,
        howHeard: location,
        medicalNotes: prayer
      });
      continue;
    }

    if (rowNum === 30) {
      records.push({
        sourceRow: rowNum * 10 + 1,
        createdAt: timestamp,
        firstName: 'Tobiloba',
        lastName: 'Evergreen',
        age: 8,
        gender: 'Child',
        dateOfBirth: '2018-03-13',
        schoolGrade: 'Grade 3',
        parentName: 'Seun Evergreen',
        parentRelation: 'Parent / Guardian',
        parentEmail: email,
        parentMobile: phone,
        parentWhatsApp: phone,
        mentorship,
        country,
        howHeard: location,
        medicalNotes: prayer
      });
      records.push({
        sourceRow: rowNum * 10 + 2,
        createdAt: timestamp,
        firstName: 'David',
        lastName: 'Evergreen',
        age: 7,
        gender: 'Boy',
        dateOfBirth: '2019-07-10',
        schoolGrade: 'Grade 2',
        parentName: 'Seun Evergreen',
        parentRelation: 'Parent / Guardian',
        parentEmail: email,
        parentMobile: phone,
        parentWhatsApp: phone,
        mentorship,
        country,
        howHeard: location,
        medicalNotes: prayer
      });
      records.push({
        sourceRow: rowNum * 10 + 3,
        createdAt: timestamp,
        firstName: 'Michael',
        lastName: 'Evergreen',
        age: 5,
        gender: 'Boy',
        dateOfBirth: '2021-07-05',
        schoolGrade: 'Reception / KG',
        parentName: 'Seun Evergreen',
        parentRelation: 'Parent / Guardian',
        parentEmail: email,
        parentMobile: phone,
        parentWhatsApp: phone,
        mentorship,
        country,
        howHeard: location,
        medicalNotes: prayer
      });
      continue;
    }

    if (rowNum === 52) {
      records.push({
        sourceRow: rowNum * 10 + 1,
        createdAt: timestamp,
        firstName: 'Abimbola',
        lastName: 'Adeyemi',
        age: 10,
        gender: 'Child',
        dateOfBirth: '2016-03-09',
        schoolGrade: 'Grade 5',
        parentName: 'Dammy Adeyemi',
        parentRelation: 'Parent / Guardian',
        parentEmail: email,
        parentMobile: phone,
        parentWhatsApp: phone,
        mentorship,
        country,
        howHeard: location,
        medicalNotes: prayer
      });
      records.push({
        sourceRow: rowNum * 10 + 2,
        createdAt: timestamp,
        firstName: 'Elliot',
        lastName: 'Adeyemi',
        age: 7,
        gender: 'Boy',
        dateOfBirth: '2018-12-05',
        schoolGrade: 'Grade 2',
        parentName: 'Dammy Adeyemi',
        parentRelation: 'Parent / Guardian',
        parentEmail: email,
        parentMobile: phone,
        parentWhatsApp: phone,
        mentorship,
        country,
        howHeard: location,
        medicalNotes: prayer
      });
      continue;
    }

    if (rowNum === 61) {
      records.push({
        sourceRow: rowNum * 10 + 1,
        createdAt: timestamp,
        firstName: 'Faithful',
        lastName: 'Akinlabi',
        age: 12,
        gender: 'Child',
        dateOfBirth: '2013-09-01',
        schoolGrade: 'Middle School / JSS 1',
        parentName: 'Perpetual Njoku',
        parentRelation: 'Parent / Guardian',
        parentEmail: email,
        parentMobile: phone,
        parentWhatsApp: phone,
        mentorship,
        country,
        howHeard: location,
        medicalNotes: prayer
      });
      records.push({
        sourceRow: rowNum * 10 + 2,
        createdAt: timestamp,
        firstName: 'Fortune',
        lastName: 'Akinlabi',
        age: 8,
        gender: 'Child',
        dateOfBirth: '2017-12-05',
        schoolGrade: 'Grade 3',
        parentName: 'Perpetual Njoku',
        parentRelation: 'Parent / Guardian',
        parentEmail: email,
        parentMobile: phone,
        parentWhatsApp: phone,
        mentorship,
        country,
        howHeard: location,
        medicalNotes: prayer
      });
      continue;
    }

    if (rowNum === 66) {
      records.push({
        sourceRow: rowNum * 10 + 1,
        createdAt: timestamp,
        firstName: 'Oluwatofunmi',
        lastName: 'Olaniyi',
        age: 8,
        gender: 'Child',
        dateOfBirth: '2017-09-07',
        schoolGrade: 'Grade 3',
        parentName: 'Titilope Itunu Olaniyi',
        parentRelation: 'Parent / Guardian',
        parentEmail: email,
        parentMobile: phone,
        parentWhatsApp: phone,
        mentorship,
        country,
        howHeard: location,
        medicalNotes: prayer
      });
      records.push({
        sourceRow: rowNum * 10 + 2,
        createdAt: timestamp,
        firstName: 'Oluwatomisin',
        lastName: 'Olaniyi',
        age: 5,
        gender: 'Child',
        dateOfBirth: '2020-05-29',
        schoolGrade: 'Reception / KG',
        parentName: 'Titilope Itunu Olaniyi',
        parentRelation: 'Parent / Guardian',
        parentEmail: email,
        parentMobile: phone,
        parentWhatsApp: phone,
        mentorship,
        country,
        howHeard: location,
        medicalNotes: prayer
      });
      continue;
    }

    if (rowNum === 73) {
      records.push({
        sourceRow: rowNum * 10 + 1,
        createdAt: timestamp,
        firstName: 'Emmanella',
        lastName: 'Nwafor',
        age: 8,
        gender: 'Girl',
        dateOfBirth: '2017-12-29',
        schoolGrade: 'Grade 3',
        parentName: 'Ese Light Nwafor',
        parentRelation: 'Parent / Guardian',
        parentEmail: email,
        parentMobile: phone,
        parentWhatsApp: phone,
        mentorship,
        country,
        howHeard: location,
        medicalNotes: prayer
      });
      records.push({
        sourceRow: rowNum * 10 + 2,
        createdAt: timestamp,
        firstName: 'Emelia',
        lastName: 'Nwafor',
        age: 6,
        gender: 'Girl',
        dateOfBirth: '2022-03-26',
        schoolGrade: 'Grade 1',
        parentName: 'Ese Light Nwafor',
        parentRelation: 'Parent / Guardian',
        parentEmail: email,
        parentMobile: phone,
        parentWhatsApp: phone,
        mentorship,
        country,
        howHeard: location,
        medicalNotes: prayer
      });
      continue;
    }

    if (rowNum === 76) {
      records.push({
        sourceRow: rowNum * 10 + 1,
        createdAt: timestamp,
        firstName: 'Mary',
        lastName: 'Ogbangwor',
        age: 10,
        gender: 'Girl',
        dateOfBirth: '2016-07-01',
        schoolGrade: 'Grade 5',
        parentName: 'Zita Robert Ogbangwor',
        parentRelation: 'Parent / Guardian',
        parentEmail: email,
        parentMobile: phone,
        parentWhatsApp: phone,
        mentorship,
        country,
        howHeard: location,
        medicalNotes: prayer
      });
      records.push({
        sourceRow: rowNum * 10 + 2,
        createdAt: timestamp,
        firstName: 'David',
        lastName: 'Ogbangwor',
        age: 8,
        gender: 'Boy',
        dateOfBirth: '2018-07-01',
        schoolGrade: 'Grade 3',
        parentName: 'Zita Robert Ogbangwor',
        parentRelation: 'Parent / Guardian',
        parentEmail: email,
        parentMobile: phone,
        parentWhatsApp: phone,
        mentorship,
        country,
        howHeard: location,
        medicalNotes: prayer
      });
      continue;
    }

    if (rowNum === 77) {
      records.push({
        sourceRow: rowNum * 10 + 1,
        createdAt: timestamp,
        firstName: 'Caleb',
        lastName: 'Fashola',
        age: 12,
        gender: 'Boy',
        dateOfBirth: '2013-07-01',
        schoolGrade: 'Middle School / JSS 1',
        parentName: 'Olaoluwa Fashola',
        parentRelation: 'Parent / Guardian',
        parentEmail: email,
        parentMobile: phone,
        parentWhatsApp: phone,
        mentorship,
        country,
        howHeard: location,
        medicalNotes: prayer
      });
      records.push({
        sourceRow: rowNum * 10 + 2,
        createdAt: timestamp,
        firstName: 'Nathaniel',
        lastName: 'Fashola',
        age: 8,
        gender: 'Boy',
        dateOfBirth: '2018-04-08',
        schoolGrade: 'Grade 3',
        parentName: 'Olaoluwa Fashola',
        parentRelation: 'Parent / Guardian',
        parentEmail: email,
        parentMobile: phone,
        parentWhatsApp: phone,
        mentorship,
        country,
        howHeard: location,
        medicalNotes: prayer
      });
      continue;
    }

    // Single child rows
    const age = parseAge(rawAge);
    const dob = parseDob(rawDob, age);
    let parts = rawName.split(/[\s,]+/).filter(Boolean);
    let firstName = '';
    let lastName = '';

    // Handle single names with known emails
    if (parts.length === 1) {
      const single = parts[0];
      if (email.includes('olojede')) { firstName = 'David'; lastName = 'Olojede'; }
      else if (email.includes('akande')) { firstName = 'Brian'; lastName = 'Akande'; }
      else if (email.includes('faromo')) { firstName = 'Dominion'; lastName = 'Faromo'; }
      else if (email.includes('ohabs')) { firstName = 'Kaito'; lastName = 'Ohabs'; }
      else if (email.includes('titobiloba')) { firstName = 'Josiah'; lastName = 'Titobiloba'; }
      else if (email.includes('adetayoade')) { firstName = 'Adetayo'; lastName = 'Adeyemo'; }
      else if (email.includes('oluwatosinajayi')) { firstName = 'Oluwatosin'; lastName = 'Ajayi'; }
      else if (email.includes('ayonife')) { firstName = 'Ayonife'; lastName = 'Adeoye'; }
      else if (email.includes('ojarikrejusty')) { firstName = 'Justin'; lastName = 'Tonade'; }
      else if (email.includes('ifeoluwapelumi')) { firstName = 'Ifeoluwa'; lastName = 'Oki'; }
      else if (email.includes('adetolasoye')) { firstName = 'Adetola'; lastName = 'Olalere'; }
      else if (email.includes('aduniay')) { firstName = 'Adunni'; lastName = 'Afuye'; }
      else {
        firstName = single;
        lastName = '';
      }
    } else if (parts.length === 2) {
      // In the form: "Childs Name (Surname First)"
      // So parts[0] is Surname, parts[1] is First Name
      lastName = parts[0];
      firstName = parts[1];
    } else {
      // 3 or more names:
      lastName = parts[0];
      firstName = parts.slice(1).join(' ');
    }

    const parentName = deriveParentName(email, lastName);

    records.push({
      sourceRow: rowNum * 10 + 1,
      createdAt: timestamp,
      firstName,
      lastName,
      age,
      gender: deduceGender(firstName),
      dateOfBirth: dob,
      schoolGrade: deduceGrade(age),
      parentName,
      parentRelation: 'Parent / Guardian',
      parentEmail: email,
      parentMobile: phone,
      parentWhatsApp: phone,
      mentorship,
      country,
      howHeard: location,
      medicalNotes: prayer
    });
  }

  console.log(`Prepared ${records.length} child records ready for Neon DB import.`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // First check existing
    const existing = await client.query('SELECT count(*) FROM children WHERE deleted_at IS NULL');
    console.log(`Current active children in database: ${existing.rows[0].count}`);

    let inserted = 0;
    for (const item of records) {
      await client.query(`
        INSERT INTO children (
          source_row, created_at, first_name, last_name, age, gender, date_of_birth,
          school_grade, parent_name, parent_relation, parent_email, parent_mobile,
          parent_whatsapp, mentorship, country, how_heard, medical_notes
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
        )
        ON CONFLICT (source_row) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          age = EXCLUDED.age,
          gender = EXCLUDED.gender,
          date_of_birth = EXCLUDED.date_of_birth,
          school_grade = EXCLUDED.school_grade,
          parent_name = EXCLUDED.parent_name,
          parent_relation = EXCLUDED.parent_relation,
          parent_email = EXCLUDED.parent_email,
          parent_mobile = EXCLUDED.parent_mobile,
          parent_whatsapp = EXCLUDED.parent_whatsapp,
          mentorship = EXCLUDED.mentorship,
          country = EXCLUDED.country,
          how_heard = EXCLUDED.how_heard,
          medical_notes = EXCLUDED.medical_notes
      `, [
        item.sourceRow,
        item.createdAt,
        item.firstName,
        item.lastName,
        item.age,
        item.gender,
        item.dateOfBirth,
        item.schoolGrade,
        item.parentName,
        item.parentRelation,
        item.parentEmail,
        item.parentMobile,
        item.parentWhatsApp,
        item.mentorship,
        item.country,
        item.howHeard,
        item.medicalNotes
      ]);
      inserted++;
    }

    // Reset sequence so auto-increment works nicely for subsequent registrations
    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('children', 'id'),
        COALESCE((SELECT MAX(id) FROM children), 1),
        EXISTS(SELECT 1 FROM children)
      )
    `);

    await client.query('COMMIT');
    console.log(`Successfully committed ${inserted} children to Neon Database!`);

    // Verify
    const finalCount = await client.query('SELECT count(*) FROM children WHERE deleted_at IS NULL');
    console.log(`Total children now in Neon DB: ${finalCount.rows[0].count}`);

    // Check birthdays
    const bdays = await client.query(`
      SELECT first_name, last_name, date_of_birth, age
      FROM children
      ORDER BY EXTRACT(MONTH FROM date_of_birth), EXTRACT(DAY FROM date_of_birth)
      LIMIT 10
    `);
    console.log('Earliest birthdays in year:');
    bdays.rows.forEach(b => console.log(`  - ${b.first_name} ${b.last_name} (${b.date_of_birth.toISOString().slice(0, 10)}) Age ${b.age}`));

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Import failed with error:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
