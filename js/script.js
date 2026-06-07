/* ===== THE LIGHT BIBLE CLUB — Main JavaScript v2.0 ===== */

/* --------- Navbar scroll effect --------- */
const navbar = document.querySelector('.navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });
}

/* --------- Mobile Nav --------- */
const hamburger = document.querySelector('.hamburger');
const navLinks  = document.querySelector('.nav-links');

if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    navLinks.classList.toggle('open');
  });
  // close nav when a link is clicked
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      navLinks.classList.remove('open');
    });
  });
}

/* --------- Active Nav Link --------- */
(function markActiveLink() {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === page || (page === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });
})();

/* --------- FAQ Accordion --------- */
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const answer = btn.nextElementSibling;
    const isOpen = btn.classList.contains('open');

    // close all
    document.querySelectorAll('.faq-question').forEach(b => {
      b.classList.remove('open');
      b.nextElementSibling.classList.remove('open');
    });

    if (!isOpen) {
      btn.classList.add('open');
      answer.classList.add('open');
    }
  });
});

/* --------- Registration Form --------- */
// 🔧 REPLACE THIS URL with your deployed Google Apps Script Web App URL
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxFqCLe3DW20ce47VzqeNdzHcidByUvUF0TrhxVmKXCGvnr0_jHC06DqXPFmWVlsFBx/exec';

const regForm = document.getElementById('registrationForm');
if (regForm) {
  regForm.addEventListener('submit', async e => {
    e.preventDefault();

    // Basic validation
    const required = regForm.querySelectorAll('[required]');
    let valid = true;
    required.forEach(field => {
      if (field.type === 'checkbox') {
        if (!field.checked) {
          field.closest('.form-group, label').style.outline = '2px solid #EF4444';
          valid = false;
        } else {
          field.closest('.form-group, label').style.outline = '';
        }
      } else if (!field.value.trim()) {
        field.style.borderColor = '#EF4444';
        valid = false;
      } else {
        field.style.borderColor = '';
      }
    });

    if (!valid) {
      const firstBad = regForm.querySelector('[style*="EF4444"]');
      if (firstBad) firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Gather form data
    const data = {
      childFirstName: regForm.childFirstName.value.trim(),
      childLastName:  regForm.childLastName.value.trim(),
      childAge:       regForm.childAge.value,
      childGender:    regForm.childGender.value,
      schoolGrade:    regForm.schoolGrade.value,
      parentName:     regForm.parentName.value.trim(),
      parentRelation: regForm.parentRelation.value,
      parentEmail:    regForm.parentEmail.value.trim(),
      parentPhone:    regForm.parentPhone.value.trim(),
      country:        regForm.country.value,
      howHeard:       regForm.howHeard.value,
      medicalNotes:   regForm.medicalNotes.value.trim()
    };

    // Show loading state
    const submitBtn = regForm.querySelector('[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting…';
    submitBtn.disabled = true;

    try {
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        // Send as text/plain to avoid CORS preflight issues with Google Apps Script
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(data)
      });

      // Show success message
      regForm.style.display = 'none';
      document.getElementById('formSuccess').style.display = 'block';
      document.getElementById('formSuccess').scrollIntoView({ behavior: 'smooth', block: 'center' });

    } catch (err) {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
      alert('Something went wrong. Please try again or contact us directly.');
      console.error('Form submission error:', err);
    }
  });
}

/* --------- Contact Form --------- */
const contactForm = document.getElementById('contactForm');
if (contactForm) {
  contactForm.addEventListener('submit', e => {
    e.preventDefault();

    const required = contactForm.querySelectorAll('[required]');
    let valid = true;
    required.forEach(field => {
      if (!field.value.trim()) {
        field.style.borderColor = '#EF4444';
        valid = false;
      } else {
        field.style.borderColor = '';
      }
    });

    if (!valid) return;

    contactForm.style.display = 'none';
    document.getElementById('contactSuccess').style.display = 'block';
    document.getElementById('contactSuccess').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

/* --------- Scroll Reveal (simple) --------- */
function revealOnScroll() {
  const revealEls = document.querySelectorAll('.reveal');
  const trigger = window.innerHeight * 0.88;

  revealEls.forEach(el => {
    const top = el.getBoundingClientRect().top;
    if (top < trigger) {
      el.classList.add('revealed');
    }
  });
}

window.addEventListener('scroll', revealOnScroll);
revealOnScroll();

/* --------- Counter Animation --------- */
function animateCounters() {
  document.querySelectorAll('.stat-num[data-target]').forEach(el => {
    const target = parseInt(el.dataset.target);
    let current = 0;
    const step = Math.ceil(target / 60);
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = current + (el.dataset.suffix || '');
      if (current >= target) clearInterval(timer);
    }, 25);
  });
}

// Trigger counter when hero is visible
const heroStats = document.querySelector('.hero-stats');
if (heroStats) {
  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      animateCounters();
      observer.disconnect();
    }
  }, { threshold: 0.5 });
  observer.observe(heroStats);
}

/* --------- Bible Quiz --------- */
const quizData = [
  {
    q: 'Who built the Ark?',
    options: ['Moses', 'Noah', 'Abraham', 'David'],
    answer: 1,
    emoji: '🚢'
  },
  {
    q: 'How many days did God take to create the world?',
    options: ['4 days', '5 days', '6 days', '7 days'],
    answer: 2,
    emoji: '🌍'
  },
  {
    q: 'Who was swallowed by a big fish?',
    options: ['Daniel', 'Jonah', 'Elijah', 'Isaiah'],
    answer: 1,
    emoji: '🐟'
  },
  {
    q: 'What did Jesus feed 5,000 people with?',
    options: ['Bread alone', '5 loaves & 2 fish', 'Manna', 'Fruit & water'],
    answer: 1,
    emoji: '🍞'
  },
  {
    q: 'Which boy was known for killing a giant named Goliath?',
    options: ['Solomon', 'Samson', 'David', 'Gideon'],
    answer: 2,
    emoji: '🗿'
  }
];

let quizIndex   = 0;
let quizScore   = 0;

const quizContainer = document.getElementById('quizContainer');

function renderQuiz() {
  if (!quizContainer) return;

  if (quizIndex >= quizData.length) {
    const pct = Math.round((quizScore / quizData.length) * 100);
    let badge = '🌟';
    let msg   = 'Great effort!';
    if (pct === 100) { badge = '🏆'; msg = 'Perfect score! You are a Scripture Champion!'; }
    else if (pct >= 80) { badge = '⭐'; msg = 'Excellent! You know your Bible very well!'; }
    else if (pct >= 60) { badge = '😊'; msg = 'Good job! Keep reading your Bible!'; }

    quizContainer.innerHTML = `
      <div class="quiz-result">
        <div class="quiz-badge">${badge}</div>
        <h2 class="quiz-score-title">${quizScore} / ${quizData.length} Correct!</h2>
        <p>${msg}</p>
        <button class="btn btn-primary" onclick="restartQuiz()">Try Again 🔄</button>
      </div>`;
    return;
  }

  const q = quizData[quizIndex];
  quizContainer.innerHTML = `
    <div class="quiz-card">
      <div class="quiz-top">
        <span class="quiz-progress">Question ${quizIndex + 1} of ${quizData.length}</span>
        <span class="quiz-score-badge">Score: ${quizScore}</span>
      </div>
      <div class="quiz-emoji">${q.emoji}</div>
      <h3 class="quiz-question">${q.q}</h3>
      <div class="quiz-options">
        ${q.options.map((opt, i) => `
          <button class="quiz-option" onclick="selectAnswer(${i})">${opt}</button>
        `).join('')}
      </div>
    </div>`;
}

function selectAnswer(index) {
  const q = quizData[quizIndex];
  const buttons = quizContainer.querySelectorAll('.quiz-option');

  buttons.forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.answer)   btn.classList.add('correct');
    if (i === index && i !== q.answer) btn.classList.add('wrong');
  });

  if (index === q.answer) quizScore++;

  setTimeout(() => {
    quizIndex++;
    renderQuiz();
  }, 900);
}

function restartQuiz() {
  quizIndex = 0;
  quizScore = 0;
  renderQuiz();
}

renderQuiz();

// expose globally
window.selectAnswer = selectAnswer;
window.restartQuiz  = restartQuiz;
