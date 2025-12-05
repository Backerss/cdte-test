/**
 * Landing Page JavaScript - CDTE System
 * Animations, Interactions, and Smooth Scrolling
 */

// ========== Initialize AOS (Animate On Scroll) ==========
document.addEventListener('DOMContentLoaded', function() {
  // startApp initializes AOS (if available) and all page interactions.
  function startApp() {
    if (window.AOS && typeof AOS.init === 'function') {
      try {
        AOS.init({
          duration: 800,
          easing: 'ease-out-cubic',
          once: true,
          offset: 100,
          delay: 100
        });
      } catch (err) {
        console.warn('AOS init failed:', err);
      }
    }

    // Initialize all other features (safe even if AOS missing)
    try {
      initNavbar();
      initSmoothScroll();
      initScrollTop();
      initMobileMenu();
      initCounterAnimation();
      initParallax();
    } catch (err) {
      console.error('Landing page initialization error:', err);
    }
  }

  // If AOS is already present, start immediately.
  if (window.AOS) {
    startApp();
    return;
  }

  // Otherwise, attempt to find an existing AOS script tag (loaded from the page)
  const existingAosScript = Array.from(document.scripts).find(s => s.src && s.src.includes('unpkg.com/aos'));
  if (existingAosScript) {
    if (existingAosScript.hasAttribute('data-loaded')) {
      // already loaded
      startApp();
    } else {
      existingAosScript.addEventListener('load', function onload() {
        existingAosScript.setAttribute('data-loaded', '1');
        startApp();
      });
      existingAosScript.addEventListener('error', function() {
        console.warn('AOS script failed to load from existing tag. Continuing without AOS.');
        startApp();
      });
    }
    return;
  }

  // No AOS present in DOM: load it dynamically but continue even if it fails.
  const s = document.createElement('script');
  s.src = 'https://unpkg.com/aos@2.3.1/dist/aos.js';
  s.async = true;
  s.addEventListener('load', () => {
    s.setAttribute('data-loaded', '1');
    startApp();
  });
  s.addEventListener('error', () => {
    console.warn('Failed to load AOS from CDN; continuing without AOS.');
    startApp();
  });
  document.head.appendChild(s);
});

// ========== Navbar Scroll Effect ==========
function initNavbar() {
  const navbar = document.getElementById('navbar');
  
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });
}

// ========== Smooth Scroll ==========
function initSmoothScroll() {
  const links = document.querySelectorAll('a[href^="#"]');
  
  links.forEach(link => {
    link.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      
      // Skip if href is just "#"
      if (href === '#') return;
      
      e.preventDefault();
      
      const target = document.querySelector(href);
      if (target) {
        const offsetTop = target.offsetTop - 80; // Account for navbar height
        
        window.scrollTo({
          top: offsetTop,
          behavior: 'smooth'
        });
        
        // Close mobile menu if open
        const navMenu = document.getElementById('navMenu');
        if (navMenu.classList.contains('active')) {
          navMenu.classList.remove('active');
        }
      }
    });
  });
}

// ========== Scroll to Top Button ==========
function initScrollTop() {
  const scrollTopBtn = document.getElementById('scrollTop');
  
  window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
      scrollTopBtn.classList.add('visible');
    } else {
      scrollTopBtn.classList.remove('visible');
    }
  });
  
  scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });
}

// ========== Mobile Menu Toggle ==========
function initMobileMenu() {
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');
  
  navToggle.addEventListener('click', () => {
    navMenu.classList.toggle('active');
    navToggle.classList.toggle('active');
  });
  
  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
      navMenu.classList.remove('active');
      navToggle.classList.remove('active');
    }
  });
}

// ========== Counter Animation ==========
function initCounterAnimation() {
  const counters = document.querySelectorAll('.stat-number');
  const options = {
    threshold: 0.5,
    rootMargin: '0px'
  };
  
  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const counter = entry.target;
        const target = counter.textContent;
        
        // Only animate if it's a number
        if (!isNaN(parseInt(target))) {
          animateCounter(counter, parseInt(target));
        }
        
        observer.unobserve(counter);
      }
    });
  }, options);
  
  counters.forEach(counter => observer.observe(counter));
}

function animateCounter(element, target) {
  let current = 0;
  const increment = target / 50; // 50 steps
  const duration = 1500; // 1.5 seconds
  const stepTime = duration / 50;
  
  const timer = setInterval(() => {
    current += increment;
    
    if (current >= target) {
      element.textContent = target;
      clearInterval(timer);
    } else {
      element.textContent = Math.floor(current);
    }
  }, stepTime);
}

// ========== Parallax Effect for Hero ==========
function initParallax() {
  const heroBackground = document.querySelector('.hero-background');
  const floatingCards = document.querySelectorAll('.floating-card');
  
  if (!heroBackground) return;
  
  window.addEventListener('scroll', () => {
    const scrolled = window.scrollY;
    const parallaxSpeed = 0.5;
    
    // Parallax background
    if (scrolled < window.innerHeight) {
      heroBackground.style.transform = `translateY(${scrolled * parallaxSpeed}px)`;
    }
    
    // Parallax floating cards (reverse direction)
    floatingCards.forEach((card, index) => {
      const speed = 0.3 + (index * 0.1);
      card.style.transform = `translateY(${-scrolled * speed}px)`;
    });
  });
}

// ========== Image Lazy Loading Enhancement ==========
if ('loading' in HTMLImageElement.prototype) {
  const images = document.querySelectorAll('img[loading="lazy"]');
  images.forEach(img => {
    img.src = img.dataset.src;
  });
} else {
  // Fallback for browsers that don't support lazy loading
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/lazysizes/5.3.2/lazysizes.min.js';
  document.body.appendChild(script);
}

// ========== Gallery Lightbox Effect ==========
function initGalleryLightbox() {
  const galleryItems = document.querySelectorAll('.gallery-item');
  
  galleryItems.forEach(item => {
    item.addEventListener('click', function() {
      const img = this.querySelector('img');
      const imgSrc = img.src;
      const imgAlt = img.alt;
      
      // Create lightbox
      const lightbox = document.createElement('div');
      lightbox.className = 'lightbox';
      lightbox.innerHTML = `
        <div class="lightbox-content">
          <button class="lightbox-close">&times;</button>
          <img src="${imgSrc}" alt="${imgAlt}">
          <div class="lightbox-caption">${imgAlt}</div>
        </div>
      `;
      
      document.body.appendChild(lightbox);
      document.body.style.overflow = 'hidden';
      
      // Fade in
      setTimeout(() => {
        lightbox.style.opacity = '1';
      }, 10);
      
      // Close lightbox
      const closeBtn = lightbox.querySelector('.lightbox-close');
      closeBtn.addEventListener('click', closeLightbox);
      lightbox.addEventListener('click', function(e) {
        if (e.target === lightbox) {
          closeLightbox();
        }
      });
      
      function closeLightbox() {
        lightbox.style.opacity = '0';
        setTimeout(() => {
          document.body.removeChild(lightbox);
          document.body.style.overflow = '';
        }, 300);
      }
      
      // Close on escape key
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          closeLightbox();
        }
      });
    });
  });
}

// Initialize gallery lightbox
document.addEventListener('DOMContentLoaded', initGalleryLightbox);

// ========== Add Lightbox Styles Dynamically ==========
const lightboxStyles = `
  .lightbox {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.95);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  
  .lightbox-content {
    position: relative;
    max-width: 90%;
    max-height: 90%;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  
  .lightbox-content img {
    max-width: 100%;
    max-height: 80vh;
    object-fit: contain;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }
  
  .lightbox-close {
    position: absolute;
    top: -40px;
    right: 0;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: white;
    font-size: 2rem;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    cursor: pointer;
    transition: background 0.3s ease;
  }
  
  .lightbox-close:hover {
    background: rgba(255, 255, 255, 0.2);
  }
  
  .lightbox-caption {
    color: white;
    margin-top: 20px;
    font-size: 1.125rem;
    text-align: center;
  }
`;

const styleSheet = document.createElement('style');
styleSheet.textContent = lightboxStyles;
document.head.appendChild(styleSheet);

// ========== Intersection Observer for Fade-in Effects ==========
function initIntersectionObserver() {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('fade-in');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);
  
  // Observe elements with fade-in-on-scroll class
  const elements = document.querySelectorAll('.fade-in-on-scroll');
  elements.forEach(el => observer.observe(el));
}

// Initialize intersection observer
document.addEventListener('DOMContentLoaded', initIntersectionObserver);

// ========== Typing Effect for Hero Title ==========
function initTypingEffect() {
  const typingElement = document.querySelector('.hero-title .highlight');
  if (!typingElement) return;
  
  const text = typingElement.textContent;
  typingElement.textContent = '';
  
  let index = 0;
  const speed = 100;
  
  function type() {
    if (index < text.length) {
      typingElement.textContent += text.charAt(index);
      index++;
      setTimeout(type, speed);
    }
  }
  
  // Start typing after a short delay
  setTimeout(type, 500);
}

// Uncomment to enable typing effect
// document.addEventListener('DOMContentLoaded', initTypingEffect);

// ========== Button Ripple Effect ==========
function initRippleEffect() {
  const buttons = document.querySelectorAll('.btn, .btn-nav, .social-link');
  
  buttons.forEach(button => {
    button.addEventListener('click', function(e) {
      const ripple = document.createElement('span');
      ripple.classList.add('ripple');
      
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = x + 'px';
      ripple.style.top = y + 'px';
      
      this.appendChild(ripple);
      
      setTimeout(() => {
        ripple.remove();
      }, 600);
    });
  });
}

// Add ripple styles
const rippleStyles = `
  .btn, .btn-nav, .social-link {
    position: relative;
    overflow: hidden;
  }
  
  .ripple {
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.5);
    transform: scale(0);
    animation: ripple-animation 0.6s ease-out;
    pointer-events: none;
  }
  
  @keyframes ripple-animation {
    to {
      transform: scale(4);
      opacity: 0;
    }
  }
`;

const rippleStyleSheet = document.createElement('style');
rippleStyleSheet.textContent = rippleStyles;
document.head.appendChild(rippleStyleSheet);

// Initialize ripple effect
document.addEventListener('DOMContentLoaded', initRippleEffect);

// ========== Performance Optimization ==========
// Debounce function for scroll events
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Throttle function for scroll events
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// ========== Console Welcome Message ==========
console.log('%c🎓 CDTE System', 'color: #7c3aed; font-size: 24px; font-weight: bold;');
console.log('%cระบบจัดการฝึกประสบการณ์วิชาชีพครู', 'color: #666; font-size: 14px;');
console.log('%cพัฒนาโดยนักศึกษาสาขาเทคโนโลยีดิจิทัลเพื่อการศึกษา', 'color: #999; font-size: 12px;');

// ========== Export functions for external use ==========
window.CDTELanding = {
  initNavbar,
  initSmoothScroll,
  initScrollTop,
  initMobileMenu,
  initCounterAnimation,
  initParallax,
  initGalleryLightbox,
  debounce,
  throttle
};
